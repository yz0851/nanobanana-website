export default async function handler(req, res) {
  return res.status(410).json({ success: false, error: '投稿审核功能已关闭。' });
}
