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
  const [activeSectionId, setActiveSectionId] = useState('');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [viewingItem, setViewingItem] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [uploadTarget, setUploadTarget] = useState('images');
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
        setActiveSectionId(normalized.sections[0]?.id || '');
      })
      .catch(() => {
        fetch('/data.json')
          .then((res) => res.json())
          .then((json) => {
            const normalized = normalizeData(json);
            setData(normalized);
            setActiveSectionId(normalized.sections[0]?.id || '');
          })
          .catch(() => {
            setData(EMPTY_DATA);
            setActiveSectionId(EMPTY_DATA.sections[0].id);
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

  const activeSection = data.sections.find((section) => section.id === activeSectionId) || data.sections[0];
  const filteredItems = useMemo(() => {
    const text = query.trim().toLowerCase();
    const items = activeSection?.items || [];
    return items.filter((item) => {
      const matchesText = !text || [item.title, item.prompt, item.notes, item.sourceUrl, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(text);
      const matchesTag = !selectedTag || item.tags.includes(selectedTag);
      return matchesText && matchesTag;
    });
  }, [activeSection, query, selectedTag]);
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
    for (const file of files) {
      const image = await compressImage(file);
      const res = await fetch('/api/catbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const json = await res.json();
      if (!json.success) {
        setStatus(json.error || '图片上传失败');
        return;
      }
      uploadedUrls.push(json.url);
    }
    setDraft((current) => ({
      ...current,
      [target]: [...(current?.[target] || []), ...uploadedUrls],
    }));
    setStatus(`已上传 ${uploadedUrls.length} 张图片`);
  };

  const addImageUrls = (urls, target = uploadTarget) => {
    if (!urls.length) return;
    setDraft((current) => ({
      ...current,
      [target]: Array.from(new Set([...(current?.[target] || []), ...urls])),
    }));
    setUploadTarget(target);
    setStatus(`已粘贴 ${urls.length} 个图片链接`);
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

  const saveDraft = () => {
    const tags = draft.tagsText
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const now = new Date().toISOString();
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

    setData((current) => ({
      ...current,
      commonTags: Array.from(new Set([...(current.commonTags || []), ...tags])),
      sections: current.sections.map((section) => {
        if (section.id !== draft.sectionId) {
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
    }));
    setActiveSectionId(draft.sectionId);
    setDraft(null);
    setStatus('已保存到当前页面，记得点右上角“同步到 GitHub”');
  };

  const deleteItem = (itemId) => {
    if (!window.confirm('确认删除这个案例？删除后还要点击“同步到 GitHub”才会永久保存。')) return;
    setData((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== itemId),
      })),
    }));
    setViewingItem(null);
    setStatus('已从当前页面删除，记得同步到 GitHub');
  };

  const addSection = () => {
    const title = window.prompt('新分区名称，例如：产品图 / 网站设计 / Banner');
    if (!title) return;
    const section = { id: uid(), title, description: '', items: [] };
    setData((current) => ({ ...current, sections: [...current.sections, section] }));
    setActiveSectionId(section.id);
  };

  const renameSection = () => {
    if (!activeSection) return;
    const title = window.prompt('修改分区名称', activeSection.title);
    if (!title) return;
    setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === activeSection.id ? { ...section, title } : section),
    }));
  };

  const syncToGitHub = async () => {
    setStatus('正在同步到 GitHub...');
    const payload = {
      ...data,
      lastUpdated: new Date().toISOString(),
    };
    const res = await fetch('/api/sync-github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setStatus(json.success ? '同步成功，刷新网页后会读取 GitHub 最新数据' : (json.error || '同步失败'));
  };

  const copyPrompt = async (prompt) => {
    await navigator.clipboard.writeText(prompt || '');
    setStatus('提示词已复制');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 relative overflow-x-hidden">
      <div className="static-gradient fixed inset-0 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.75),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(244,114,182,0.16),transparent_24%),radial-gradient(circle_at_35%_86%,rgba(99,102,241,0.14),transparent_30%)]" />

      <header className="sticky top-0 z-30 border-b border-white/50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-yellow-300 to-orange-400 shadow-lg shadow-orange-200/60 flex items-center justify-center text-2xl">
              🍌
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-slate-900 via-indigo-700 to-purple-700 bg-clip-text text-transparent">
                {data.site.title}
              </h1>
              <p className="text-sm text-slate-500">{data.site.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white/70 border border-white/60 px-3 py-2 text-xs font-bold text-slate-500 shadow-sm">
              <Archive size={14} /> {totalItems} 个收藏
            </span>
            {isAdmin ? (
              <>
                <button onClick={openNewDraft} className="btn-primary"><Plus size={16} /> 新增案例</button>
                <button onClick={syncToGitHub} className="btn-secondary"><Save size={16} /> 同步到 GitHub</button>
                <button onClick={logout} className="btn-ghost"><LogOut size={16} /> 退出</button>
              </>
            ) : (
              <button onClick={() => setIsLoginOpen(true)} className="btn-secondary"><Lock size={16} /> 管理员登录</button>
            )}
          </div>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-4 py-8">
        <section className="glass-panel p-6 md:p-8 mb-6 animate-fade-in-up">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-100 bg-indigo-50/70 text-xs font-bold text-indigo-600 mb-4">
                <Archive size={14} /> Personal design & prompt vault
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900">把好看的图和提示词，都收进一个地方</h2>
              <p className="text-slate-500 mt-3 max-w-2xl leading-7">像原版一样用卡片浏览灵感；你登录后可以粘贴图片上传、添加参考图、写提示词，再同步保存到 GitHub。</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center min-w-[260px]">
              <div className="rounded-2xl bg-white/70 border border-white/60 px-3 py-4 shadow-sm">
                <div className="text-2xl font-black text-indigo-600">{data.sections.length}</div>
                <div className="text-xs font-bold text-slate-400 mt-1">分区</div>
              </div>
              <div className="rounded-2xl bg-white/70 border border-white/60 px-3 py-4 shadow-sm">
                <div className="text-2xl font-black text-purple-600">{totalItems}</div>
                <div className="text-xs font-bold text-slate-400 mt-1">案例</div>
              </div>
              <div className="rounded-2xl bg-white/70 border border-white/60 px-3 py-4 shadow-sm">
                <div className="text-2xl font-black text-pink-500">{allTags.length}</div>
                <div className="text-xs font-bold text-slate-400 mt-1">标签</div>
              </div>
            </div>
          </div>
        </section>

        {status && <div className="mb-5 rounded-2xl border border-indigo-100 bg-white/75 backdrop-blur-md px-4 py-3 text-sm font-medium text-indigo-700 shadow-sm">{status}</div>}

        <section className="grid gap-5 md:grid-cols-[270px_1fr]">
          <aside className="glass-panel p-4 h-fit sticky top-24">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-slate-800">灵感分区</h2>
              {isAdmin && <button onClick={addSection} className="text-xs font-bold text-indigo-600 hover:text-purple-600">+ 添加</button>}
            </div>
            <div className="space-y-2">
              {data.sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`w-full text-left rounded-2xl px-4 py-3 transition shadow-sm ${activeSectionId === section.id ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-200' : 'bg-white/60 hover:bg-white/90 text-slate-600 border border-white/60'}`}
                >
                  <div className="font-black">{section.title}</div>
                  <div className={`text-xs mt-1 ${activeSectionId === section.id ? 'text-indigo-100' : 'text-slate-400'}`}>{section.items.length} 个案例</div>
                </button>
              ))}
            </div>
            {isAdmin && activeSection && (
              <button onClick={renameSection} className="mt-3 w-full rounded-2xl border border-indigo-100 bg-white/60 px-4 py-2.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition">
                编辑当前分区名
              </button>
            )}
          </aside>

          <main>
            <div className="glass-panel p-4 mb-5">
              <div className="flex flex-col gap-3 md:flex-row">
                <label className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索标题、提示词、备注、标签..."
                    className="field pl-11"
                  />
                </label>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="field md:w-48"
                >
                  <option value="">全部标签</option>
                  {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </div>
              {allTags.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  <button onClick={() => setSelectedTag('')} className={`chip shrink-0 ${!selectedTag ? 'chip-active' : ''}`}>全部</button>
                  {allTags.slice(0, 18).map((tag) => (
                    <button key={tag} onClick={() => setSelectedTag(tag)} className={`chip shrink-0 ${selectedTag === tag ? 'chip-active' : ''}`}>{tag}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">{activeSection?.title || '案例'}</h2>
                {activeSection?.description && <p className="text-sm text-slate-500 mt-1">{activeSection.description}</p>}
              </div>
              <span className="rounded-full bg-white/70 border border-white/60 px-3 py-1 text-sm font-bold text-slate-500 shadow-sm">{filteredItems.length} 条</span>
            </div>

            {filteredItems.length === 0 ? (
              <div className="glass-panel border-dashed border-indigo-100 p-12 text-center text-slate-500">
                <div className="mx-auto mb-4 h-16 w-16 rounded-3xl bg-indigo-50 flex items-center justify-center text-indigo-300">
                  <ImageIcon size={38} />
                </div>
                <p className="font-bold text-slate-600">这里还没有案例</p>
                <p className="text-sm mt-1">{isAdmin ? '点击“新增案例”开始收藏，或者直接粘贴图片。' : '管理员登录后可以添加内容。'}</p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <article key={item.id} className="group overflow-hidden rounded-3xl border border-white/60 bg-white/70 backdrop-blur-md shadow-sm hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-100/70 transition duration-300">
                    <button onClick={() => setViewingItem(item)} className="block w-full text-left">
                      <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-indigo-50 overflow-hidden">
                        {item.images?.[0] ? (
                          <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-indigo-200"><ImageIcon size={44} /></div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-black text-lg text-slate-900 line-clamp-1">{item.title}</h3>
                        <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-6">{item.prompt || item.notes || '暂无提示词'}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {(item.tags || []).slice(0, 4).map((tag) => <span key={tag} className="chip">{tag}</span>)}
                        </div>
                      </div>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </main>
        </section>
      </div>

      {isLoginOpen && (
        <Modal onClose={() => setIsLoginOpen(false)}>
          <h3 className="text-xl font-black mb-2">管理员登录</h3>
          <p className="text-sm text-slate-500 mb-4">输入你在 Vercel 环境变量里设置的 ADMIN_PASSWORD。</p>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            placeholder="管理员密码"
            className="field"
          />
          <button onClick={login} className="btn-primary w-full mt-4">登录</button>
        </Modal>
      )}

      {viewingItem && (
        <Modal onClose={() => setViewingItem(null)} wide>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-2xl font-black">{viewingItem.title}</h3>
              <div className="flex flex-wrap gap-2 mt-3">{viewingItem.tags?.map((tag) => <span key={tag} className="chip"><Tag size={12} /> {tag}</span>)}</div>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button onClick={() => openEditDraft(viewingItem, activeSectionId)} className="btn-secondary"><Edit3 size={15} /> 编辑</button>
                <button onClick={() => deleteItem(viewingItem.id)} className="btn-danger"><Trash2 size={15} /> 删除</button>
              </div>
            )}
          </div>

          <ImageGallery title="案例图 / 目标图" images={viewingItem.images} />
          <ImageGallery title="参考图（可选）" images={viewingItem.referenceImages} />

          {viewingItem.sourceUrl && (
            <a href={viewingItem.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-purple-600 mb-4">
              <LinkIcon size={15} /> 来源链接
            </a>
          )}

          <section className="rounded-2xl bg-white/70 border border-white/60 p-4 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-black text-slate-800">提示词</h4>
              <button onClick={() => copyPrompt(viewingItem.prompt)} className="text-sm font-bold text-indigo-600 hover:text-purple-600 flex items-center gap-1"><Copy size={14} /> 复制</button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{viewingItem.prompt || '暂无提示词'}</p>
          </section>

          {viewingItem.notes && (
            <section className="rounded-2xl bg-indigo-50/50 border border-indigo-100 p-4">
              <h4 className="font-black text-slate-800 mb-2">备注</h4>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{viewingItem.notes}</p>
            </section>
          )}
        </Modal>
      )}

      {draft && (
        <Modal onClose={() => setDraft(null)} wide>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-2xl font-black">{draft.id ? '编辑案例' : '新增案例'}</h3>
              <p className="text-sm text-slate-500 mt-1">复制图片、图片链接或提示词后，点 Paste 就能自动放到合适的位置。</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => pasteFromClipboard({ mode: 'smart', target: uploadTarget })} className="btn-secondary"><Clipboard size={16} /> Paste 智能粘贴</button>
              <button onClick={saveDraft} className="btn-primary"><Check size={16} /> 保存到页面</button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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

          <div className="grid gap-4 md:grid-cols-2 mt-4">
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
            <span className="label flex items-center justify-between gap-3">
              提示词
              <button type="button" onClick={() => pasteFromClipboard({ mode: 'text' })} className="text-xs font-black text-indigo-600 hover:text-purple-600 flex items-center gap-1">
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
    <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-md p-4 overflow-y-auto">
      <div className={`relative mx-auto my-8 rounded-[2rem] border border-white/70 bg-white/90 backdrop-blur-xl shadow-2xl shadow-indigo-200/60 p-5 text-slate-800 ${wide ? 'max-w-5xl' : 'max-w-md'}`}>
        <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition"><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

function ImageGallery({ title, images = [] }) {
  if (!images.length) return null;
  return (
    <section className="mb-5">
      <h4 className="font-black text-slate-800 mb-3 flex items-center gap-2"><Eye size={16} className="text-indigo-500" /> {title}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm hover:shadow-lg hover:shadow-indigo-100 transition">
            <img src={url} alt="" className="w-full aspect-[4/3] object-cover hover:scale-105 transition duration-500" />
          </a>
        ))}
      </div>
    </section>
  );
}

function UploadBox({ title, images, active, onFocus, onUpload, onPaste, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div onClick={onFocus} className={`rounded-3xl border p-4 transition ${active ? 'border-indigo-300 bg-indigo-50/70 shadow-lg shadow-indigo-100' : 'border-white/60 bg-white/70 hover:bg-white/90'}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-black text-slate-800">{title}</h4>
        {active && <span className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Clipboard size={13} /> 粘贴到这里</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-2xl border border-dashed border-indigo-200 bg-white/60 py-7 text-slate-500 hover:bg-indigo-50/70 transition">
          <UploadCloud className="mx-auto mb-2 text-indigo-400" />
          <span className="font-bold text-slate-600">点击上传</span>
          <span className="block text-xs mt-1">选择本地图片</span>
        </button>
        <button type="button" onClick={onPaste} className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/80 py-7 text-slate-500 hover:from-indigo-50 hover:to-purple-50 transition shadow-sm">
          <Clipboard className="mx-auto mb-2 text-indigo-500" />
          <span className="font-bold text-slate-700">Paste 图片</span>
          <span className="block text-xs mt-1">读取剪贴板图片/链接</span>
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
        <div className="grid grid-cols-3 gap-2 mt-3">
          {images.map((url) => (
            <div key={url} className="relative overflow-hidden rounded-xl bg-slate-100 shadow-sm">
              <img src={url} alt="" className="aspect-square w-full object-cover" />
              <button onClick={() => onRemove(url)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-500 shadow hover:bg-rose-50"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
