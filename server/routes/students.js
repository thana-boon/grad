const express = require('express');
const router = express.Router();
const studentApi = require('../config/studentApi');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// ม.6 ทุกรูปแบบการเขียน (ม.6 / ม6 / ม. 6)
const isM6 = (level) => /^ม\.?\s?6/.test(String(level || '').trim());

// GET  /api/students?year_id=X
// ดึงนักเรียน ม.6 จาก Student API (students_db) ตาม year_id
// หมายเหตุ: list ของ API ไม่คืน citizen_id (กันรั่วแบบ bulk) → จะไม่มี field นี้
router.get('/', verifyToken, async (req, res) => {
  const { year_id } = req.query;
  if (!year_id) return res.status(400).json({ message: 'year_id required' });

  try {
    const { data } = await studentApi.listAllStudents({ year_id, class_level: 'ม.6' });
    const rows = (data || [])
      .filter((s) => isM6(s.class_level))
      .sort((a, b) =>
        (a.class_room - b.class_room) ||
        (a.number_in_room - b.number_in_room) ||
        String(a.student_code).localeCompare(String(b.student_code))
      )
      .map((s) => ({
        student_code: s.student_code,
        title_prefix: s.title_prefix,
        first_name: s.first_name,
        last_name: s.last_name,
        class_level: s.class_level,
        class_room: s.class_room,
        number_in_room: s.number_in_room,
      }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'โหลดรายชื่อนักเรียนไม่สำเร็จ', error: err.message });
  }
});

// GET  /api/students/:student_code/citizen-id  (admin only)
// ดึง citizen_id รายคนแบบ on-demand (API list ไม่คืน citizen_id)
// แยก endpoint นี้เพื่อเลี่ยง rate limit และให้ access log บันทึกรายคน
router.get('/:student_code/citizen-id', verifyToken, adminOnly, async (req, res) => {
  try {
    const student = await studentApi.getStudentByCode(req.params.student_code);
    if (!student) return res.status(404).json({ message: 'ไม่พบนักเรียนรหัสนี้' });
    res.json({
      student_code: student.student_code,
      citizen_id: student.citizen_id ?? null,
      birth_date: student.birth_date ?? null,
    });
  } catch (err) {
    res.status(500).json({ message: 'โหลดเลขประชาชนไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
