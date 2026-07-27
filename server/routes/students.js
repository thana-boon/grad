const express = require('express');
const router = express.Router();
const schoolos = require('../config/schoolos');
const logger = require('../config/logger');
const { verifyToken, adminOnly, staffRead } = require('../middlewares/authMiddleware');
const { logActivity } = require('./activityLogs');

// ม.6 ทุกรูปแบบการเขียน (ม.6 / ม6 / ม. 6)
const isM6 = (level) => /^ม\.?\s?6/.test(String(level || '').trim());

// GET  /api/students?year_id=X
// ดึงนักเรียน ม.6 จาก SchoolOS ตาม year_id
// เป็นรายชื่อทั้งชั้น → ครู read-only ดูได้ แต่นักเรียนไม่ควรเห็นรายชื่อคนอื่นทั้งหมด
router.get('/', verifyToken, staffRead, async (req, res) => {
  const { year_id } = req.query;
  if (!year_id) return res.status(400).json({ message: 'year_id required' });

  try {
    const { data } = await schoolos.listAllStudents({ year_id, class_level: 'ม.6' });
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
// ดึงเลขบัตรประชาชนรายคนแบบ on-demand — ต้องให้ API key มี scope students:pii
// แยกเป็น endpoint ของตัวเองเพื่อให้บันทึก audit ได้เป็นรายคน ไม่ปนกับการโหลดรายชื่อ
router.get('/:student_code/citizen-id', verifyToken, adminOnly, async (req, res) => {
  try {
    const student = await schoolos.getStudentByCode(req.params.student_code);
    if (!student) return res.status(404).json({ message: 'ไม่พบนักเรียนรหัสนี้' });

    if (student.citizen_id === undefined) {
      // key ไม่มี scope students:pii — บอกให้ตรงสาเหตุ ดีกว่าคืน null เฉย ๆ แล้วงงว่าทำไมว่าง
      return res.status(403).json({
        message: 'API key ไม่มีสิทธิ์ students:pii — เปิด scope นี้ที่ SchoolOS ก่อน',
      });
    }

    // การเปิดดูเลขบัตร ปชช. ต้องมีร่องรอยเสมอว่าใครดูของใครเมื่อไหร่
    logger.info('citizen_id accessed', { by: req.user.username, student: student.student_code });
    logActivity({
      username: req.user.username || String(req.user.id),
      name: req.user.name || '',
      role: req.user.role,
      action: 'view_citizen_id',
      target: student.student_code,
    });

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
