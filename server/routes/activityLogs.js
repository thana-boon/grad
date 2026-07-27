const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, staffRead } = require('../middlewares/authMiddleware');

// ตาราง activity_logs ถูกสร้างโดย migration ตอนสตาร์ท (database/postgres/001_init.sql)
// ไม่มี ensureTable() แล้ว — การ CREATE TABLE จาก request path ทำให้ schema
// กระจายอยู่หลายที่จนไล่ไม่ถูกว่าโครงจริงคืออะไร

// ─── Helper: บันทึก log (ใช้ใน routes อื่นด้วยได้) ──────────────────────────
const logActivity = async ({ username, name = '', role = '', action, target = '', detail = null }) => {
  try {
    await db.query(
      'INSERT INTO activity_logs (actor_username, actor_name, actor_role, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [username, name, role, action, target, detail ? JSON.stringify(detail) : null]
    );
  } catch {
    // log ไม่ได้ → ไม่ crash app
  }
};

// ─── GET /api/activity-logs ───────────────────────────────────────────────────
// ครู (read-only) ดูได้ด้วย — เป็นหน้าอ่านอย่างเดียวอยู่แล้ว
router.get('/', verifyToken, staffRead, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search || '';
  const role = req.query.role || '';

  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    // ILIKE ไม่ใช่ LIKE: MySQL ค้นแบบไม่สนตัวพิมพ์ให้อยู่แล้ว แต่ Postgres สนตัวพิมพ์
    where += ' AND (actor_username ILIKE ? OR actor_name ILIKE ? OR action ILIKE ? OR target ILIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (role) {
    where += ' AND actor_role = ?';
    params.push(role);
  }

  try {
    const [rows] = await db.query(
      `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    // COUNT(*) ของ Postgres เป็น bigint ซึ่ง driver คืนมาเป็น string → cast เป็น int
    // ไม่งั้นฝั่ง client เอาไปคำนวณหน้าถัดไปแล้วได้ผลเพี้ยน
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*)::int AS total FROM activity_logs ${where}`,
      params
    );

    res.json({ logs: rows, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.logActivity = logActivity;
