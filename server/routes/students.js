const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middlewares/authMiddleware');

// GET  /api/students?year_id=X
// ดึงนักเรียน ม.6 จาก school_app.students ตาม year_id
router.get('/', verifyToken, async (req, res) => {
  const { year_id } = req.query;
  if (!year_id) return res.status(400).json({ message: 'year_id required' });

  try {
    const [rows] = await db.query(
      `SELECT
         student_code,
         first_name,
         last_name,
         class_level,
         class_room,
         number_in_room,
         citizen_id
       FROM school_app.students
       WHERE year_id = ?
         AND (
           class_level LIKE 'ม.6%'
           OR class_level LIKE 'ม6%'
           OR class_level LIKE 'ม. 6%'
         )
       ORDER BY class_room, number_in_room, student_code`,
      [year_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'โหลดรายชื่อนักเรียนไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
