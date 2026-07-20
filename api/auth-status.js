import { isAdminRequest } from './_auth.js';

export default function handler(req, res) {
  res.status(200).json({ authenticated: isAdminRequest(req) });
}
