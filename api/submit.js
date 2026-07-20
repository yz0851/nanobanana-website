export default async function handler(req, res) {
  return res.status(410).json({ success: false, error: '公开投稿功能已关闭。这个站点现在是个人案例库。' });
}
