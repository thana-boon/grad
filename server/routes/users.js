// ─── บัญชี local ─────────────────────────────────────────────────────────────
// ทางเข้าสำรองตอน SchoolOS ล่ม — ไม่มีทางสร้างจากหน้าเว็บโดยตั้งใจ
// ผู้ใช้จริงทั้งหมดมาจาก SchoolOS แล้วให้สิทธิ์ผ่าน /api/staff (allowlist)
//
// สร้างบัญชีสำรองใหม่ทำได้ทางเดียวคือสั่งจากเครื่อง server:
//   docker compose --profile seed run --rm seed
// (จงใจไม่เปิดเป็น endpoint เพราะบัญชีที่มีรหัสผ่านของตัวเองคือทางเข้าที่
//  ไม่ผ่าน SchoolOS เลย — ยิ่งสร้างง่ายยิ่งเป็นช่องโหว่ที่ไม่มีใครตามดู)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const logger = require('../config/logger');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const { logActivity } = require('./activityLogs');

// ทุก route ต้อง login และเป็น admin
router.use(verifyToken, adminOnly);

// ─── GET /api/users ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, name, role, email, created_at FROM users ORDER BY id ASC'
    );
    res.json(rows);
  } catch (err) {
    logger.error('Get users error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── DELETE /api/users/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // ห้ามลบตัวเอง — เช็คเฉพาะคนที่ล็อกอินด้วยบัญชี local เท่านั้น
  // (ผู้ดูแลที่มาจาก SchoolOS ถือ id ของฝั่ง SchoolOS ซึ่งอาจไปชนกับ users.id ของคนอื่นพอดี)
  if (req.user.source === 'local' && parseInt(id) === req.user.id) {
    return res.status(400).json({ message: 'ไม่สามารถลบ account ตัวเองได้' });
  }

  try {
    const [rows] = await db.query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบ account นี้' });
    }

    // ลบบัญชีสำรองตัวสุดท้ายทิ้ง = ถ้าวันหนึ่ง SchoolOS ล่ม จะไม่เหลือทางเข้าเลย
    // และสร้างคืนได้เฉพาะจากเครื่อง server เท่านั้น จึงกันไว้ก่อน
    if (rows[0].role === 'admin') {
      const [[{ total }]] = await db.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'"
      );
      if (total <= 1) {
        return res.status(400).json({
          message: 'นี่คือบัญชีสำรองตัวสุดท้าย ลบไม่ได้ — เป็นทางเข้าเดียวที่เหลือตอน SchoolOS ล่ม',
        });
      }
    }

    await db.query('DELETE FROM users WHERE id = ?', [id]);
    logger.info('User deleted', { targetId: id, by: req.user.id });
    logActivity({ username: req.user.username || String(req.user.id), name: '', role: 'admin', action: 'delete_account', target: String(id), detail: null });
    res.json({ message: 'ลบ account สำเร็จ' });
  } catch (err) {
    logger.error('Delete user error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

module.exports = router;
