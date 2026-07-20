import crypto from 'node:crypto';

const COOKIE_NAME = 'vault_admin';

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || 'dev-secret-change-me';
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function createSessionCookie() {
  const payload = JSON.stringify({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 24 * 14 });
  const value = Buffer.from(payload).toString('base64url');
  const token = `${value}.${sign(value)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAdminRequest(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const [value, signature] = match[1].split('.');
  if (!value || !signature || sign(value) !== signature) return false;
  try {
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAdmin(req, res) {
  if (isAdminRequest(req)) return true;
  res.status(401).json({ success: false, error: '需要管理员登录' });
  return false;
}
