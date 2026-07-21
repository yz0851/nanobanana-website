import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Clipboard,
  Copy,
  Edit3,
  Eye,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Lock,
  LogOut,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

const EMPTY_DATA = {
  site: {
    title: 'Product Prompt Vault',
    subtitle: '收藏优秀产品图、网页设计图、参考图与提示词。',
  },
  sections: [
    {
      id: 'website-design',
      title: '网站设计',
      description: '官网、落地页、SaaS 页面、版式与交互灵感。',
      items: [],
    },
    {
      id: 'product-image',
      title: '产品图',
      description: '产品渲染、场景图、详情页配图与视觉表达。',
      items: [],
    },
    {
      id: 'ad-creative',
      title: '广告创意',
      description: '海报、Banner、社媒图和营销视觉参考。',
      items: [],
    },
  ],
  commonTags: ['网站设计', '产品图', '科技感', 'B2B', '极简', '高级感'],
};

const uid = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const IMAGE_URL_REGEX = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?[^\s"'<>]*)?/gi;

const extractImageUrls = (text = '') => Array.from(new Set(text.match(IMAGE_URL_REGEX) || []));
const getDisplayImageSrc = (url = '') => (
  url.includes('files.catbox.moe')
    ? `/api/image?url=${encodeURIComponent(url)}`
    : url
);

const extensionFromMime = (mime = '') => {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('avif')) return 'avif';
  return 'jpg';
};

const normalizeData = (raw) => {
  if (!raw || typeof raw !== 'object') return EMPTY_DATA;
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  return {
    site: {
      ...EMPTY_DATA.site,
      ...(raw.site || {}),
    },
    commonTags: Array.isArray(raw.commonTags) ? raw.commonTags : EMPTY_DATA.commonTags,
    sections: sections.map((section) => {
      const sourceItems = Array.isArray(section.items) ? section.items : (section.prompts || []);
      return {
        id: section.id || uid(),
        title: section.title || '未命名分区',
        description: section.description || '',
        items: sourceItems.map((item) => ({
          id: item.id || uid(),
          title: item.title || '未命名案例',
          prompt: item.prompt || item.content || '',
          images: Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []),
          referenceImages: Array.isArray(item.referenceImages) ? item.referenceImages : [],
          tags: Array.isArray(item.tags) ? item.tags : [],
          sourceUrl: item.sourceUrl || '',
          notes: item.notes || '',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        })),
      };
    }),
  };
};

const emptyDraft = (sectionId = '') => ({
  id: '',
  sectionId,
  title: '',
  prompt: '',
  images: [],
  referenceImages: [],
  tagsText: '',
  sourceUrl: '',
  notes: '',
});

async function compressImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const maxWidth = 1800;
  const scale = Math.min(1, maxWidth / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function App() {
  const [data, setData] = useState(EMPTY_DATA);
  const [activeSectionId, setActiveSectionId] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [viewingItem, setViewingItem] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [uploadTarget, setUploadTarget] = useState('images');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/data')
      .then((res) => {
        if (!res.ok) throw new Error('api data failed');
        return res.json();
      })
      .then((json) => {
        const normalized = normalizeData(json);
        setData(normalized);
        setActiveSectionId('all');
      })
      .catch(() => {
        fetch('/data.json')
          .then((res) => res.json())
          .then((json) => {
            const normalized = normalizeData(json);
            setData(normalized);
            setActiveSectionId('all');
          })
          .catch(() => {
            setData(EMPTY_DATA);
            setActiveSectionId('all');
          });
      });

    fetch('/api/auth-status')
      .then((res) => res.json())
      .then((json) => setIsAdmin(Boolean(json.authenticated)))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    const onPaste = async (event) => {
      if (!draft || !isAdmin) return;
      const files = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (files.length) {
        event.preventDefault();
        await uploadFiles(files, uploadTarget);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [draft, isAdmin, uploadTarget]);

  const allTags = useMemo(() => {
    const tags = new Set(data.commonTags || []);
    data.sections.forEach((section) => section.items.forEach((item) => item.tags.forEach((tag) => tags.add(tag))));
    return Array.from(tags).filter(Boolean);
  }, [data]);

  const isAllSections = activeSectionId === 'all';
  const activeSection = isAllSections ? null : (data.sections.find((section) => section.id === activeSectionId) || data.sections[0]);
  const galleryItems = useMemo(() => (
    data.sections.flatMap((section) => section.items.map((item) => ({
      ...item,
      sectionId: section.id,
      sectionTitle: section.title,
    })))
  ), [data.sections]);
  const filteredItems = useMemo(() => {
    const text = query.trim().toLowerCase();
    const items = isAllSections
      ? galleryItems
      : (activeSection?.items || []).map((item) => ({
        ...item,
        sectionId: activeSection.id,
        sectionTitle: activeSection.title,
      }));
    return items.filter((item) => {
      const matchesText = !text || [item.title, item.prompt, item.notes, item.sourceUrl, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(text);
      const matchesTag = !selectedTag || item.tags.includes(selectedTag);
      return matchesText && matchesTag;
    });
  }, [activeSection, galleryItems, isAllSections, query, selectedTag]);
  const totalItems = useMemo(
    () => data.sections.reduce((sum, section) => sum + section.items.length, 0),
    [data.sections],
  );

  const login = async () => {
    setStatus('正在登录...');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: loginPassword }),
    });
    const json = await res.json();
    if (json.success) {
      setIsAdmin(true);
      setIsLoginOpen(false);
      setLoginPassword('');
      setStatus('已进入管理员模式');
    } else {
      setStatus(json.error || '登录失败');
    }
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setIsAdmin(false);
    setDraft(null);
    setStatus('已退出管理员模式');
  };

  const uploadFiles = async (files, target = uploadTarget) => {
    if (!files.length) return;
    setStatus(`正在上传 ${files.length} 张图片到 Catbox...`);
    const uploadedUrls = [];
    try {
      for (const file of files) {
        const image = await compressImage(file);
        const res = await fetch('/api/catbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          setStatus(json.details || json.error || '图片上传失败');
          return false;
        }
        uploadedUrls.push(json.url);
      }
      setDraft((current) => ({
        ...current,
        [target]: [...(current?.[target] || []), ...uploadedUrls],
      }));
      setStatus(`已上传 ${uploadedUrls.length} 张图片，可以继续编辑或保存并同步`);
      return true;
    } catch (error) {
      setStatus(`图片上传失败：${error.message || '请稍后重试'}`);
      return false;
    }
  };

  const addImageUrls = (urls, target = uploadTarget) => {
    if (!urls.length) return;
    setDraft((current) => ({
      ...current,
      [target]: Array.from(new Set([...(current?.[target] || []), ...urls])),
    }));
    setUploadTarget(target);
    setStatus(`已粘贴 ${urls.length} 个图片链接，可以继续编辑或保存并同步`);
  };

  const appendPromptText = (text) => {
    const cleanText = text.trim();
    if (!cleanText) return false;
    setDraft((current) => ({
      ...current,
      prompt: current?.prompt?.trim()
        ? `${current.prompt.trimEnd()}\n\n${cleanText}`
        : cleanText,
    }));
    setStatus('已粘贴到提示词');
    return true;
  };

  const pasteFromClipboard = async ({ mode = 'smart', target = uploadTarget } = {}) => {
    if (!draft || !isAdmin) return;
    if (!navigator.clipboard) {
      setStatus('当前浏览器不支持按钮读取剪贴板，请用 Ctrl+V 粘贴');
      return;
    }

    try {
      let text = '';
      const imageFiles = [];

      if (navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find((type) => type.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            imageFiles.push(new File([blob], `clipboard-${Date.now()}.${extensionFromMime(imageType)}`, { type: imageType }));
          }
          if (!text && item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            text = await blob.text();
          }
        }
      } else if (navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }

      if (imageFiles.length && mode !== 'text') {
        setUploadTarget(target);
        await uploadFiles(imageFiles, target);
        return;
      }

      if (text.trim()) {
        const imageUrls = mode !== 'text' ? extractImageUrls(text) : [];
        if (imageUrls.length) {
          addImageUrls(imageUrls, target);
          return;
        }
        if (mode !== 'image') {
          appendPromptText(text);
          return;
        }
      }

      setStatus(mode === 'image' ? '剪贴板里没有图片或图片链接' : '剪贴板里没有可用的图片或文字');
    } catch (error) {
      setStatus('读取剪贴板失败：请允许浏览器剪贴板权限，或用 Ctrl+V 粘贴');
    }
  };

  const openNewDraft = () => {
    setViewingItem(null);
    setDraft(emptyDraft(activeSection?.id || data.sections[0]?.id || ''));
  };

  const openEditDraft = (item, sectionId) => {
    setViewingItem(null);
    setDraft({
      id: item.id,
      sectionId,
      title: item.title,
      prompt: item.prompt,
      images: item.images || [],
      referenceImages: item.referenceImages || [],
      tagsText: (item.tags || []).join('，'),
      sourceUrl: item.sourceUrl || '',
      notes: item.notes || '',
    });
  };

  const syncDataToGitHub = async (sourceData = data, {
    startMessage = '正在同步到 GitHub...',
    successMessage = '同步成功，刷新网页后会读取 GitHub 最新数据',
  } = {}) => {
    setStatus(startMessage);
    const payload = {
      ...sourceData,
      lastUpdated: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/sync-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.details || json.error || '同步失败');
      }
      setData(payload);
      setStatus(successMessage);
      return true;
    } catch (error) {
      setStatus(`同步失败：${error.message || '请稍后重试'}。当前页面暂时保留，刷新前请再点“同步”。`);
      return false;
    }
  };

  const saveDraft = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const tags = draft.tagsText
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const now = new Date().toISOString();
    const targetSectionId = draft.sectionId || data.sections[0]?.id || '';
    const item = {
      id: draft.id || uid(),
      title: draft.title || '未命名案例',
      prompt: draft.prompt,
      images: draft.images || [],
      referenceImages: draft.referenceImages || [],
      tags,
      sourceUrl: draft.sourceUrl,
      notes: draft.notes,
      createdAt: draft.id ? undefined : now,
      updatedAt: now,
    };

    const nextData = {
      ...data,
      commonTags: Array.from(new Set([...(data.commonTags || []), ...tags])),
      sections: data.sections.map((section) => {
        if (section.id !== targetSectionId) {
          return {
            ...section,
            items: section.items.filter((existing) => existing.id !== item.id),
          };
        }
        const exists = section.items.some((existing) => existing.id === item.id);
        const nextItems = exists
          ? section.items.map((existing) => existing.id === item.id ? { ...existing, ...item, createdAt: existing.createdAt } : existing)
          : [{ ...item, createdAt: now }, ...section.items];
        return { ...section, items: nextItems };
      }),
    };

    setData(nextData);
    setActiveSectionId(targetSectionId);
    setDraft(null);
    await syncDataToGitHub(nextData, {
      startMessage: '正在保存并同步到 GitHub...',
      successMessage: '保存并同步成功，刷新后也不会丢',
    });
    setIsSaving(false);
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm('确认删除这个案例？删除后还要点击“同步到 GitHub”才会永久保存。')) return;
    const nextData = {
      ...data,
      sections: data.sections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== itemId),
      })),
    };
    setData(nextData);
    setViewingItem(null);
    await syncDataToGitHub(nextData, {
      startMessage: '正在删除并同步到 GitHub...',
      successMessage: '删除并同步成功',
    });
  };

  const addSection = async () => {
    const title = window.prompt('新分区名称，例如：产品图 / 网站设计 / Banner');
    if (!title) return;
    const section = { id: uid(), title, description: '', items: [] };
    const nextData = { ...data, sections: [...data.sections, section] };
    setData(nextData);
    setActiveSectionId(section.id);
    await syncDataToGitHub(nextData, {
      startMessage: '正在添加分区并同步到 GitHub...',
      successMessage: '分区已添加并同步成功',
    });
  };

  const renameSection = async () => {
    if (!activeSection) return;
    const title = window.prompt('修改分区名称', activeSection.title);
    if (!title) return;
    const nextData = {
      ...data,
      sections: data.sections.map((section) => section.id === activeSection.id ? { ...section, title } : section),
    };
    setData(nextData);
    await syncDataToGitHub(nextData, {
      startMessage: '正在重命名分区并同步到 GitHub...',
      successMessage: '分区已重命名并同步成功',
    });
  };

  const syncToGitHub = async () => {
    await syncDataToGitHub(data);
  };

  const copyPrompt = async (prompt) => {
    await navigator.clipboard.writeText(prompt || '');
    setStatus('提示词已复制');
  };

  return (
    <div className="app-page">
      <header className="site-header">
        <div className="site-shell site-header-inner">
          <button className="brand" onClick={() => setActiveSectionId('all')} aria-label="回到全部收藏">
            <span className="brand-mark" aria-hidden="true">
              <span className="brand-sun" />
              <span className="brand-cloud" />
            </span>
            <span className="brand-text">{data.site.title}</span>
          </button>

          <nav className="section-tabs header-tabs" aria-label="分区导航">
            <button onClick={() => setActiveSectionId('all')} className={`section-tab ${isAllSections ? 'is-active' : ''}`}>
              全部 <span>{totalItems}</span>
            </button>
            {data.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSectionId(section.id)}
                className={`section-tab ${activeSectionId === section.id ? 'is-active' : ''}`}
              >
                {section.title} <span>{section.items.length}</span>
              </button>
            ))}
          </nav>

          <div className="header-actions">
            {isAdmin ? (
              <>
                <button onClick={openNewDraft} className="btn-primary"><Plus size={16} /> 新增</button>
                <button onClick={syncToGitHub} className="btn-secondary"><Save size={16} /> 同步</button>
                <button onClick={logout} className="btn-ghost"><LogOut size={16} /> 退出</button>
              </>
            ) : (
              <button onClick={() => setIsLoginOpen(true)} className="btn-secondary"><Lock size={16} /> 管理员登录</button>
            )}
          </div>
        </div>
      </header>

      <main className="site-shell page-main">
        <section className="intro-card">
          <div className="intro-copy">
            <p className="eyebrow">Summer archive · {totalItems} items</p>
            <h1>收藏喜欢的画面<br />也保存创作它们的方法</h1>
            <p>整理产品图、网页设计、视觉参考和创作提示词。</p>
          </div>
          <div className="intro-art" aria-hidden="true">
            <img src="/illustrations/summer-header.webp" alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            <div className="css-summer-scene">
              <span className="scene-sun" />
              <span className="scene-cloud scene-cloud-a" />
              <span className="scene-cloud scene-cloud-b" />
              <span className="scene-hill" />
              <span className="scene-leaf scene-leaf-a" />
              <span className="scene-leaf scene-leaf-b" />
            </div>
          </div>
        </section>

        {status && <div className="status-note">{status}</div>}

        <section className="gallery-toolbar">
          <div className="toolbar-top">
            <div>
              <h2>{isAllSections ? '全部收藏' : activeSection?.title}</h2>
              <p>{isAllSections ? '按时间与灵感自然铺开。' : (activeSection?.description || '这个分区里的收藏。')}</p>
            </div>
            <div className="toolbar-admin">
              {isAdmin && <button onClick={addSection} className="text-action">+ 添加分区</button>}
              {isAdmin && activeSection && <button onClick={renameSection} className="text-action">重命名当前分区</button>}
            </div>
          </div>

          <div className="filter-row">
            <label className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题、提示词、备注、标签..."
              />
            </label>
            <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="select-field">
              <option value="">全部标签</option>
              {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </div>

          {allTags.length > 0 && (
            <div className="tag-strip no-scrollbar">
              <button onClick={() => setSelectedTag('')} className={`mini-tag ${!selectedTag ? 'is-active' : ''}`}>全部</button>
              {allTags.slice(0, 24).map((tag) => (
                <button key={tag} onClick={() => setSelectedTag(tag)} className={`mini-tag ${selectedTag === tag ? 'is-active' : ''}`}>{tag}</button>
              ))}
            </div>
          )}
        </section>

        {filteredItems.length === 0 ? (
          <section className="empty-state">
            <img src="/illustrations/summer-empty.webp" alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            <div className="empty-fallback" aria-hidden="true">
              <span className="empty-sun" />
              <span className="empty-cloud" />
              <span className="empty-window" />
            </div>
            <h3>这里还没有收藏</h3>
            <p>遇到喜欢的画面，就把它留在这里吧。</p>
            {isAdmin && <button onClick={openNewDraft} className="btn-primary"><Plus size={16} /> 点击开始收藏</button>}
          </section>
        ) : (
          <section className="gallery-columns" aria-label="图片画廊">
            {filteredItems.map((item) => (
              <article key={`${item.sectionId}-${item.id}`} className="gallery-card">
                <button onClick={() => setViewingItem(item)} className="gallery-card-button">
                  <div className="gallery-image-wrap">
                    {item.images?.[0] ? (
                      <SmartImage src={item.images[0]} alt={item.title} className="gallery-card-image" fallbackClassName="gallery-placeholder" />
                    ) : (
                      <div className="gallery-placeholder"><ImageIcon size={34} /></div>
                    )}
                  </div>
                  <div className="gallery-card-body">
                    <h3>{item.title}</h3>
                    <div className="card-meta">
                      {(item.tags || []).slice(0, 3).map((tag) => <span key={tag} className="chip">{tag}</span>)}
                    </div>
                  </div>
                </button>
              </article>
            ))}
          </section>
        )}
      </main>

      {isLoginOpen && (
        <Modal onClose={() => setIsLoginOpen(false)}>
          <h3 className="modal-title">管理员登录</h3>
          <p className="modal-subtitle">输入你在 Vercel 环境变量里设置的 ADMIN_PASSWORD。</p>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="管理员密码"
            className="field"
          />
          {status && <div className="modal-status">{status}</div>}
          <button onClick={login} className="btn-primary w-full mt-4">登录</button>
        </Modal>
      )}

      {viewingItem && (
        <Modal onClose={() => setViewingItem(null)} wide>
          <div className="detail-layout">
            <div className="detail-media">
              <ImageGallery title="案例图 / 目标图" images={viewingItem.images} primary />
              <ImageGallery title="参考图（可选）" images={viewingItem.referenceImages} compact />
            </div>

            <aside className="detail-info">
              <p className="detail-section-name">{viewingItem.sectionTitle || activeSection?.title || '收藏'}</p>
              <h3>{viewingItem.title}</h3>
              <div className="detail-tags">{viewingItem.tags?.map((tag) => <span key={tag} className="chip"><Tag size={12} /> {tag}</span>)}</div>

              <section className="prompt-paper">
                <div className="prompt-head">
                  <h4>提示词</h4>
                  <button onClick={() => copyPrompt(viewingItem.prompt)} className="text-action"><Copy size={14} /> 复制</button>
                </div>
                <p>{viewingItem.prompt || '暂无提示词'}</p>
              </section>

              {viewingItem.notes && (
                <section className="note-paper">
                  <h4>备注</h4>
                  <p>{viewingItem.notes}</p>
                </section>
              )}

              {viewingItem.sourceUrl && (
                <a href={viewingItem.sourceUrl} target="_blank" rel="noreferrer" className="source-link">
                  <LinkIcon size={15} /> 来源链接
                </a>
              )}

              {isAdmin && (
                <div className="detail-actions">
                  <button onClick={() => openEditDraft(viewingItem, viewingItem.sectionId || activeSectionId)} className="btn-secondary"><Edit3 size={15} /> 编辑</button>
                  <button onClick={() => deleteItem(viewingItem.id)} className="btn-danger"><Trash2 size={15} /> 删除</button>
                </div>
              )}
            </aside>
          </div>
        </Modal>
      )}

      {draft && (
        <Modal onClose={() => setDraft(null)} wide>
          <div className="editor-head">
            <div>
              <h3 className="modal-title">{draft.id ? '编辑案例' : '新增案例'}</h3>
              <p className="modal-subtitle">复制图片、图片链接或提示词后，点 Paste 就能自动放到合适的位置。</p>
            </div>
            <div className="editor-actions">
              <button type="button" onClick={() => pasteFromClipboard({ mode: 'smart', target: uploadTarget })} className="btn-secondary" disabled={isSaving}><Clipboard size={16} /> Paste 智能粘贴</button>
              <button type="button" onClick={saveDraft} className="btn-primary" disabled={isSaving}><Check size={16} /> {isSaving ? '保存中...' : '保存并同步'}</button>
            </div>
          </div>
          {status && <div className="modal-status">{status}</div>}

          <div className="editor-grid">
            <label className="block">
              <span className="label">标题</span>
              <input className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：科技感产品 Hero 图" />
            </label>
            <label className="block">
              <span className="label">所属分区</span>
              <select className="field" value={draft.sectionId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })}>
                {data.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
              </select>
            </label>
          </div>

          <label className="block mt-4">
            <span className="label">标签，用逗号隔开</span>
            <input className="field" value={draft.tagsText} onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })} placeholder="网站设计，B2B，科技感" />
          </label>

          <label className="block mt-4">
            <span className="label">来源链接（可选）</span>
            <input className="field" value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} placeholder="https://..." />
          </label>

          <div className="upload-grid">
            <UploadBox
              title="案例图 / 目标图"
              images={draft.images}
              active={uploadTarget === 'images'}
              onFocus={() => setUploadTarget('images')}
              onUpload={(files) => uploadFiles(files, 'images')}
              onPaste={() => pasteFromClipboard({ mode: 'image', target: 'images' })}
              onRemove={(url) => setDraft({ ...draft, images: draft.images.filter((item) => item !== url) })}
              fileInputRef={fileInputRef}
            />
            <UploadBox
              title="参考图（可选）"
              images={draft.referenceImages}
              active={uploadTarget === 'referenceImages'}
              onFocus={() => setUploadTarget('referenceImages')}
              onUpload={(files) => uploadFiles(files, 'referenceImages')}
              onPaste={() => pasteFromClipboard({ mode: 'image', target: 'referenceImages' })}
              onRemove={(url) => setDraft({ ...draft, referenceImages: draft.referenceImages.filter((item) => item !== url) })}
            />
          </div>

          <label className="block mt-4">
            <span className="label label-row">
              提示词
              <button type="button" onClick={() => pasteFromClipboard({ mode: 'text' })} className="text-action">
                <Clipboard size={13} /> Paste 提示词
              </button>
            </span>
            <textarea className="field min-h-[180px]" value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} placeholder="描述如何根据参考图生成目标图..." />
          </label>

          <label className="block mt-4">
            <span className="label">备注</span>
            <textarea className="field min-h-[90px]" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="使用心得、适用场景、注意点..." />
          </label>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop">
      <div className={`modal-card ${wide ? 'modal-wide' : 'modal-small'}`}>
        <button onClick={onClose} className="modal-close" aria-label="关闭"><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

function ImageGallery({ title, images = [], primary = false, compact = false }) {
  if (!images.length) return null;
  return (
    <section className={`image-gallery ${primary ? 'image-gallery-primary' : ''} ${compact ? 'image-gallery-compact' : ''}`}>
      <h4><Eye size={16} /> {title}</h4>
      <div className="image-gallery-grid">
        {images.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="image-gallery-link">
            <SmartImage src={url} alt="" fallbackClassName="image-gallery-fallback" />
          </a>
        ))}
      </div>
    </section>
  );
}

function UploadBox({ title, images, active, onFocus, onUpload, onPaste, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div onClick={onFocus} className={`upload-box ${active ? 'is-active' : ''}`}>
      <div className="upload-box-head">
        <h4>{title}</h4>
        {active && <span><Clipboard size={13} /> 粘贴到这里</span>}
      </div>
      <div className="upload-actions">
        <button type="button" onClick={() => inputRef.current?.click()} className="upload-action">
          <UploadCloud />
          <strong>点击上传</strong>
          <span>选择本地图片</span>
        </button>
        <button type="button" onClick={onPaste} className="upload-action paste-action">
          <Clipboard />
          <strong>Paste 图片</strong>
          <span>读取剪贴板图片/链接</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => onUpload(Array.from(e.target.files || []))}
      />
      {images.length > 0 && (
        <div className="upload-preview-grid">
          {images.map((url) => (
            <div key={url} className="upload-preview">
              <SmartImage src={url} alt="" fallbackClassName="upload-preview-fallback" />
              <button onClick={() => onRemove(url)} aria-label="移除图片"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmartImage({ src, alt = '', className = '', fallbackClassName = 'image-fallback' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={fallbackClassName}>
        <ImageIcon size={28} />
        <span>图片加载失败</span>
      </div>
    );
  }

  return (
    <img
      src={getDisplayImageSrc(src)}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default App;
