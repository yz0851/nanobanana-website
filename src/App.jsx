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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.24),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_30%)] pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-4 py-8">
        <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-sky-200 mb-4">
              <Archive size={14} /> Personal design & prompt vault
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight">{data.site.title}</h1>
            <p className="text-slate-300 mt-3 max-w-2xl">{data.site.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
        </header>

        {status && <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-sky-100">{status}</div>}

        <section className="grid gap-4 md:grid-cols-[260px_1fr]">
          <aside className="rounded-3xl border border-white/10 bg-white/5 p-4 h-fit sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-200">分区</h2>
              {isAdmin && <button onClick={addSection} className="text-xs text-sky-300 hover:text-sky-100">+ 添加</button>}
            </div>
            <div className="space-y-2">
              {data.sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`w-full text-left rounded-2xl px-4 py-3 transition ${activeSectionId === section.id ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}
                >
                  <div className="font-bold">{section.title}</div>
                  <div className="text-xs opacity-80">{section.items.length} 个案例</div>
                </button>
              ))}
            </div>
            {isAdmin && activeSection && (
              <button onClick={renameSection} className="mt-3 w-full rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
                编辑当前分区名
              </button>
            )}
          </aside>

          <main>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 mb-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <label className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索标题、提示词、备注、标签..."
                    className="w-full rounded-2xl bg-slate-900/80 border border-white/10 pl-11 pr-4 py-3 outline-none focus:border-sky-400"
                  />
                </label>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="rounded-2xl bg-slate-900/80 border border-white/10 px-4 py-3 outline-none focus:border-sky-400"
                >
                  <option value="">全部标签</option>
                  {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black">{activeSection?.title || '案例'}</h2>
                {activeSection?.description && <p className="text-sm text-slate-400 mt-1">{activeSection.description}</p>}
              </div>
              <span className="text-sm text-slate-400">{filteredItems.length} 条</span>
            </div>

            {filteredItems.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-12 text-center text-slate-400">
                <ImageIcon className="mx-auto mb-3 opacity-50" size={42} />
                <p>这里还没有案例。{isAdmin ? '点击“新增案例”开始收藏。' : ''}</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <article key={item.id} className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.09] transition">
                    <button onClick={() => setViewingItem(item)} className="block w-full text-left">
                      <div className="aspect-[4/3] bg-slate-900 overflow-hidden">
                        {item.images?.[0] ? (
                          <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon size={44} /></div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-black text-lg line-clamp-1">{item.title}</h3>
                        <p className="text-sm text-slate-400 mt-2 line-clamp-2">{item.prompt || item.notes || '暂无提示词'}</p>
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
          <p className="text-sm text-slate-400 mb-4">输入你在 Vercel 环境变量里设置的 ADMIN_PASSWORD。</p>
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
            <a href={viewingItem.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-sky-300 hover:text-sky-100 mb-4">
              <LinkIcon size={15} /> 来源链接
            </a>
          )}

          <section className="rounded-2xl bg-slate-900/80 border border-white/10 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold">提示词</h4>
              <button onClick={() => copyPrompt(viewingItem.prompt)} className="text-sm text-sky-300 hover:text-sky-100 flex items-center gap-1"><Copy size={14} /> 复制</button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{viewingItem.prompt || '暂无提示词'}</p>
          </section>

          {viewingItem.notes && (
            <section className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <h4 className="font-bold mb-2">备注</h4>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{viewingItem.notes}</p>
            </section>
          )}
        </Modal>
      )}

      {draft && (
        <Modal onClose={() => setDraft(null)} wide>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-2xl font-black">{draft.id ? '编辑案例' : '新增案例'}</h3>
              <p className="text-sm text-slate-400 mt-1">可以点击上传，也可以直接复制图片后 Ctrl+V 粘贴。</p>
            </div>
            <button onClick={saveDraft} className="btn-primary"><Check size={16} /> 保存到页面</button>
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
              onRemove={(url) => setDraft({ ...draft, images: draft.images.filter((item) => item !== url) })}
              fileInputRef={fileInputRef}
            />
            <UploadBox
              title="参考图（可选）"
              images={draft.referenceImages}
              active={uploadTarget === 'referenceImages'}
              onFocus={() => setUploadTarget('referenceImages')}
              onUpload={(files) => uploadFiles(files, 'referenceImages')}
              onRemove={(url) => setDraft({ ...draft, referenceImages: draft.referenceImages.filter((item) => item !== url) })}
            />
          </div>

          <label className="block mt-4">
            <span className="label">提示词</span>
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className={`relative mx-auto my-8 rounded-3xl border border-white/10 bg-slate-950 shadow-2xl p-5 ${wide ? 'max-w-5xl' : 'max-w-md'}`}>
        <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-full bg-white/5 hover:bg-white/10"><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

function ImageGallery({ title, images = [] }) {
  if (!images.length) return null;
  return (
    <section className="mb-5">
      <h4 className="font-bold mb-3 flex items-center gap-2"><Eye size={16} /> {title}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <img src={url} alt="" className="w-full aspect-[4/3] object-cover hover:scale-105 transition duration-500" />
          </a>
        ))}
      </div>
    </section>
  );
}

function UploadBox({ title, images, active, onFocus, onUpload, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div onClick={onFocus} className={`rounded-3xl border p-4 ${active ? 'border-sky-400 bg-sky-400/10' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold">{title}</h4>
        {active && <span className="text-xs text-sky-200 flex items-center gap-1"><Clipboard size={13} /> 粘贴到这里</span>}
      </div>
      <button onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border border-dashed border-white/20 py-6 text-slate-300 hover:bg-white/5">
        <UploadCloud className="mx-auto mb-2" />
        点击上传，或复制图片后 Ctrl+V
      </button>
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
            <div key={url} className="relative overflow-hidden rounded-xl bg-slate-900">
              <img src={url} alt="" className="aspect-square w-full object-cover" />
              <button onClick={() => onRemove(url)} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
