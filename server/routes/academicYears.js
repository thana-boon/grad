const express = require('express');
const router = express.Router();
const db = require('../config/db');
const studentApi = require('../config/studentApi');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// GET  /api/academic-years
// ดึงปีการศึกษาทั้งหมดจาก Student API (students_db)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { years } = await studentApi.getAcademicYears();
    res.json(years || []);
  } catch (err) {
    res.status(500).json({ message: 'โหลดปีการศึกษาไม่สำเร็จ', error: err.message });
  }
});

// GET  /api/academic-years/active
// ดึงปีการศึกษาที่ GradTrack ใช้งานอยู่ (จาก gradtrack.settings → fallback ปี current ของ API)
router.get('/active', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT `value` FROM `settings` WHERE `key` = 'active_year_id'"
    );
    if (rows.length > 0 && rows[0].value) {
      const yearId = rows[0].value;
      const year = await studentApi.getAcademicYearById(yearId);
      if (year) {
        return res.json({ active_year_id: Number(yearId), year });
      }
    }

    // fallback → ปี current ของ Student API
    const { current } = await studentApi.getAcademicYears();
    if (current) {
      return res.json({ active_year_id: Number(current.id), year: current });
    }

    res.json({ active_year_id: null, year: null });
  } catch (err) {
    // ถ้า settings table ยังไม่ได้สร้าง หรือ error อื่น → return null แทน crash
    res.json({ active_year_id: null, year: null });
  }
});

// PUT  /api/academic-years/active
// ตั้งปีการศึกษาที่ GradTrack ใช้งาน (admin only)
// หมายเหตุ: Student API เป็น read-only → GradTrack เก็บ active year ของตัวเองใน settings
router.put('/active', verifyToken, adminOnly, async (req, res) => {
  const { year_id } = req.body;
  if (!year_id) return res.status(400).json({ message: 'year_id required' });
  try {
    // ตรวจว่าปีนี้มีอยู่จริงใน Student API
    const year = await studentApi.getAcademicYearById(year_id);
    if (!year) return res.status(404).json({ message: 'ไม่พบปีการศึกษานี้' });

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
    res.json({ active_year_id: Number(year_id), year });
  } catch (err) {
    res.status(500).json({ message: 'ตั้งปีการศึกษาไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
