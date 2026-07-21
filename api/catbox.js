import { requireAdmin } from './_auth.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mimeToExtension = (mime = '') => {
  const normalized = mime.toLowerCase().split(';')[0].trim();
  const known = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/apng': 'apng',
    'image/bmp': 'bmp',
    'image/x-ms-bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
    'image/tiff': 'tiff',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/jxl': 'jxl',
  };

  if (known[normalized]) return known[normalized];
  if (normalized.startsWith('image/')) {
    const subtype = normalized.slice('image/'.length).replace(/^x-/, '').replace(/\+xml$/, '');
    const safeSubtype = subtype.replace(/[^a-z0-9-]/g, '').slice(0, 12);
    if (safeSubtype) return safeSubtype;
  }

  return 'img';
};

const getImageParts = (image) => {
  const dataUrlMatch = String(image).match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  const mime = dataUrlMatch?.[1]?.toLowerCase() || 'image/jpeg';
  const base64Data = dataUrlMatch?.[2] || String(image);
  const buffer = Buffer.from(base64Data, 'base64');
  const ext = mimeToExtension(mime);

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
    if (!mime.startsWith('image/')) {
      return res.status(400).json({ success: false, error: '只支持图片文件，请重新复制或选择图片' });
    }
    if (!buffer.length) {
      return res.status(400).json({ success: false, error: '图片数据为空，请重新复制或重新选择图片' });
    }

    const userhash = process.env.CATBOX_USERHASH;
    if (!userhash) {
      return res.status(500).json({ success: false, error: '还没有配置 CATBOX_USERHASH 环境变量' });
    }

    try {
      const url = await uploadToCatbox({ buffer, mime, ext, userhash });
      const verifyResult = await verifyImageUrl(url);
      if (verifyResult.ok) {
        return res.status(200).json({ success: true, url, provider: 'catbox' });
      }

      return res.status(502).json({
        success: false,
        error: 'Catbox 返回了图片地址，但文件暂时不可读取。已重试 3 次，请重新上传一次',
        details: verifyResult.error,
        url,
      });
    } catch (catboxError) {
      return res.status(502).json({
        success: false,
        error: 'Catbox 上传失败',
        details: catboxError.message || 'unknown error',
      });
    }

  } catch (error) {
    console.error('Catbox upload error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
