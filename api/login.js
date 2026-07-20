import { createSessionCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '只支持 POST 请求' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ success: false, error: '还没有配置 ADMIN_PASSWORD 环境变量' });
  }

  const { password } = req.body || {};
  if (password !== adminPassword) {
    return res.status(401).json({ success: false, error: '管理员密码不正确' });
  }

  res.setHeader('Set-Cookie', createSessionCookie());
  return res.status(200).json({ success: true });
}
