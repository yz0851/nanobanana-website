import { requireAdmin } from './_auth.js';

// Vercel Serverless Function - Catbox 图床上传
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!requireAdmin(req, res)) return;

    const userhash = process.env.CATBOX_USERHASH;
    if (!userhash) {
      return res.status(500).json({ success: false, error: '还没有配置 CATBOX_USERHASH 环境变量' });
    }

    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    // 将 base64 转换为 Blob
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('userhash', userhash);

    // 从 base64 创建文件
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('fileToUpload', blob, `vault-${Date.now()}.jpg`);

    const response = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData
    });

    const text = await response.text();
    
    if (text.startsWith('https://')) {
      return res.status(200).json({ success: true, url: text.trim() });
    } else {
      return res.status(500).json({ success: false, error: 'Catbox upload failed', details: text });
    }

  } catch (error) {
    console.error('Catbox upload error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
