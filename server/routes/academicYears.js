const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// GET  /api/academic-years
// ดึงปีการศึกษาทั้งหมดจาก school_app
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, year_be, title, is_active FROM school_app.academic_years ORDER BY year_be DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'โหลดปีการศึกษาไม่สำเร็จ', error: err.message });
  }
});

// GET  /api/academic-years/active
// ดึงปีการศึกษาที่ GradTrack ใช้งานอยู่ (จาก gradtrack.settings)
router.get('/active', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT `value` FROM `settings` WHERE `key` = 'active_year_id'"
    );
    if (rows.length > 0 && rows[0].value) {
      const yearId = rows[0].value;
      const [years] = await db.query(
        'SELECT id, year_be, title, is_active FROM school_app.academic_years WHERE id = ?',
        [yearId]
      );
      if (years.length > 0) {
        return res.json({ active_year_id: Number(yearId), year: years[0] });
      }
    }

    const [activeRows] = await db.query(
      'SELECT id, year_be, title, is_active FROM school_app.academic_years WHERE is_active = 1 ORDER BY id DESC LIMIT 1'
    );
    if (activeRows.length > 0) {
      return res.json({ active_year_id: Number(activeRows[0].id), year: activeRows[0] });
    }

    res.json({ active_year_id: null, year: null });
  } catch (err) {
    // ถ้า settings table ยังไม่ได้สร้าง หรือ error อื่น → return null แทน crash
    res.json({ active_year_id: null, year: null });
  }
});

// PUT  /api/academic-years/active
// ตั้งปีการศึกษาที่ GradTrack ใช้งาน (admin only)
router.put('/active', verifyToken, adminOnly, async (req, res) => {
  const { year_id } = req.body;
  if (!year_id) return res.status(400).json({ message: 'year_id required' });
  try {
    await db.query('UPDATE school_app.academic_years SET is_active = 0');
    await db.query('UPDATE school_app.academic_years SET is_active = 1 WHERE id = ?', [year_id]);

    // สร้าง settings table ถ้ายังไม่มี
    await db.query(
      `CREATE TABLE IF NOT EXISTS \`settings\` (
        \`key\`       VARCHAR(100) NOT NULL,
        \`value\`     TEXT,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await db.query(
      "INSERT INTO `settings` (`key`, `value`) VALUES ('active_year_id', ?) ON DUPLICATE KEY UPDATE `value` = ?",
      [String(year_id), String(year_id)]
    );
    const [years] = await db.query(
      'SELECT id, year_be, title, is_active FROM school_app.academic_years WHERE id = ?',
      [year_id]
    );
    res.json({ active_year_id: year_id, year: years[0] || null });
  } catch (err) {
    res.status(500).json({ message: 'ตั้งปีการศึกษาไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
