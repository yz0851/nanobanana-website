const getRepoConfig = () => ({
  repo: process.env.GITHUB_REPO || (
    process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : 'yz0851/nanobanana-website'
  ),
  branch: process.env.GITHUB_BRANCH || 'main',
  filePath: process.env.GITHUB_FILE_PATH || 'public/data.json',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { repo, branch, filePath } = getRepoConfig();
    const url = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'product-prompt-vault',
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: '读取 GitHub 数据失败' });
    }

    const file = await response.json();
    const text = Buffer.from(file.content || '', 'base64').toString('utf8');
    const data = JSON.parse(text);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Read data error:', error);
    return res.status(500).json({ success: false, error: '读取数据失败' });
  }
}
