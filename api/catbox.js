import { requireAdmin } from './_auth.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRepoConfig = () => ({
  repo: process.env.GITHUB_REPO || (
    process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : 'yz0851/nanobanana-website'
  ),
  branch: process.env.GITHUB_BRANCH || 'main',
});

const getImageParts = (image) => {
  const dataUrlMatch = String(image).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  const mime = dataUrlMatch?.[1] || 'image/jpeg';
  const base64Data = dataUrlMatch?.[2] || String(image);
  const buffer = Buffer.from(base64Data, 'base64');
  const ext = mime.includes('png')
    ? 'png'
    : mime.includes('webp')
      ? 'webp'
      : mime.includes('gif')
        ? 'gif'
        : 'jpg';

  return { buffer, mime, ext };
};

const verifyImageUrl = async (url, attempts = 3) => {
  let lastError = '';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(900 * attempt);
    }

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'ProductPromptVault/1.0',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
      const contentType = response.headers.get('content-type') || '';
      const buffer = Buffer.from(await response.arrayBuffer());
      if (response.ok && buffer.length > 0 && contentType.toLowerCase().includes('image')) {
        return { ok: true, bytes: buffer.length };
      }
      lastError = `HTTP ${response.status}, ${buffer.length} bytes`;
    } catch (error) {
      lastError = error.message || 'verify failed';
    }
  }

  return { ok: false, error: lastError };
};

const uploadToCatbox = async ({ buffer, mime, ext, userhash }) => {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('userhash', userhash);
  formData.append('fileToUpload', new Blob([buffer], { type: mime }), `vault-${Date.now()}.${ext}`);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData,
  });

  const text = (await response.text()).trim();
  if (!response.ok || !text.startsWith('https://')) {
    throw new Error(text || 'Catbox upload failed');
  }

  return text;
};

const uploadToGitHub = async ({ buffer, ext }) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GitHub token not configured');
  }

  const { repo, branch } = getRepoConfig();
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const fileName = `vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `public/uploads/${yyyy}-${mm}/${fileName}`;
  const uploadUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'product-prompt-vault',
    },
    body: JSON.stringify({
      message: `上传图片 - ${fileName}`,
      content: buffer.toString('base64'),
      branch,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || 'GitHub image upload failed');
  }

  return `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`;
};

// Vercel Serverless Function - Catbox 图床上传
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!requireAdmin(req, res)) return;

    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    const { buffer, mime, ext } = getImageParts(image);
    if (!buffer.length) {
      return res.status(400).json({ success: false, error: '图片数据为空，请重新复制或重新选择图片' });
    }

    const userhash = process.env.CATBOX_USERHASH;
    let catboxError = '';

    if (userhash) {
      try {
        const url = await uploadToCatbox({ buffer, mime, ext, userhash });
        const verifyResult = await verifyImageUrl(url);
        if (verifyResult.ok) {
          return res.status(200).json({ success: true, url, provider: 'catbox' });
        }
        catboxError = `Catbox 返回了不可读取的图片：${verifyResult.error}`;
      } catch (error) {
        catboxError = error.message || 'Catbox upload failed';
      }
    } else {
      catboxError = '还没有配置 CATBOX_USERHASH 环境变量';
    }

    try {
      const url = await uploadToGitHub({ buffer, ext });
      return res.status(200).json({
        success: true,
        url,
        provider: 'github',
        warning: `Catbox 暂时不可用，已自动改存到 GitHub。${catboxError}`,
      });
    } catch (githubError) {
      return res.status(502).json({
        success: false,
        error: '图片上传失败：Catbox 不可用，GitHub 备用上传也失败',
        details: `Catbox: ${catboxError}; GitHub: ${githubError.message || 'unknown error'}`,
      });
    }

  } catch (error) {
    console.error('Catbox upload error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
