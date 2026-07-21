const ALLOWED_HOSTS = new Set(['files.catbox.moe']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (!rawUrl) {
      return res.status(400).send('Missing image url');
    }

    const imageUrl = new URL(rawUrl);
    if (imageUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(imageUrl.hostname)) {
      return res.status(400).send('Unsupported image host');
    }

    const upstream = await fetch(imageUrl.toString(), {
      headers: {
        'User-Agent': 'ProductPromptVault/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send('Image fetch failed');
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!buffer.length) {
      return res.status(502).send('Image file is empty');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).send(error.message || 'Image proxy failed');
  }
}
