const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// ─── Create table if not exists ───────────────────────────────────────────────
const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`activity_logs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`actor_username\` VARCHAR(100) NOT NULL,
      \`actor_name\` VARCHAR(200) DEFAULT '',
      \`actor_role\` VARCHAR(20) DEFAULT '',
      \`action\` VARCHAR(100) NOT NULL,
      \`target\` VARCHAR(200) DEFAULT '',
      \`detail\` TEXT DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};
ensureTable().catch(() => {});

// ─── Helper: บันทึก log (ใช้ใน routes อื่นด้วยได้) ──────────────────────────
const logActivity = async ({ username, name = '', role = '', action, target = '', detail = null }) => {
  try {
    await ensureTable();
    await db.query(
      'INSERT INTO activity_logs (actor_username, actor_name, actor_role, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [username, name, role, action, target, detail ? JSON.stringify(detail) : null]
    );
  } catch (e) {
    // log ไม่ได้ → ไม่ crash app
  }
};

// ─── GET /api/activity-logs ───────────────────────────────────────────────────
router.get('/', verifyToken, adminOnly, async (req, res) => {
  await ensureTable();
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search || '';
  const role = req.query.role || '';

  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    where += ' AND (actor_username LIKE ? OR actor_name LIKE ? OR action LIKE ? OR target LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (role) {
    where += ' AND actor_role = ?';
    params.push(role);
  }

  const [rows] = await db.query(
    `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) as total FROM activity_logs ${where}`,
    params
  );

  res.json({ logs: rows, total });
});

module.exports = router;
module.exports.logActivity = logActivity;
