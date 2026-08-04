const express = require('express');
const router = express.Router();
const db = require('../config/db');
const schoolos = require('../config/schoolos');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// GET  /api/academic-years
// syncAcademicYears() ไล่เก็บปีทั้งหมดจาก SchoolOS (หน่วงเองทุก 6 ชม.) แล้ว
// getAcademicYears() อ่านปีปัจจุบันจาก /students + คืนรายการจากตาราง academic_years
//
// ปีที่ผู้ดูแล SchoolOS เพิ่งเพิ่มจึงโผล่มาเองภายในไม่กี่ชั่วโมง ไม่ต้องรีสตาร์ท
// (อยากได้เดี๋ยวนี้ให้กดปุ่มที่หน้าปีการศึกษา → POST /sync)
router.get('/', verifyToken, async (req, res) => {
  try {
    // ซิงก์ล้มไม่ควรทำให้ทั้งหน้าพัง — ยังมีปีที่เคยเก็บไว้ให้ใช้งานต่อได้
    await schoolos.syncAcademicYears().catch(() => {});
    const { years } = await schoolos.getAcademicYears();
    res.json(years || []);
  } catch (err) {
    res.status(500).json({ message: 'โหลดปีการศึกษาไม่สำเร็จ', error: err.message });
  }
});

// POST /api/academic-years/sync
// บังคับซิงก์ทันที (admin only) — ใช้ตอนผู้ดูแล SchoolOS เพิ่งเพิ่มปีแล้วอยากเห็นเลย
router.post('/sync', verifyToken, adminOnly, async (req, res) => {
  try {
    const { synced } = await schoolos.syncAcademicYears({ force: true });
    const { years } = await schoolos.getAcademicYears();
    res.json({ synced, years: years || [] });
  } catch (err) {
    res.status(500).json({ message: 'ซิงก์ปีการศึกษาไม่สำเร็จ', error: err.message });
  }
});

// GET  /api/academic-years/active
// ดึงปีการศึกษาที่ GradTrack ใช้งานอยู่ (จาก settings → fallback ปี current ของ SchoolOS)
router.get('/active', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT "value" FROM settings WHERE "key" = 'active_year_id'`
    );
    if (rows.length > 0 && rows[0].value) {
      const yearId = rows[0].value;
      const year = await schoolos.getAcademicYearById(yearId);
      if (year) {
        return res.json({ active_year_id: Number(yearId), year });
      }
    }

    // fallback → ปี current ของ SchoolOS
    const { current } = await schoolos.getAcademicYears();
    if (current) {
      return res.json({ active_year_id: Number(current.id), year: current });
    }

    res.json({ active_year_id: null, year: null });
  } catch {
    // SchoolOS ล่ม / ยังไม่เคยตั้งค่า → คืน null แทนที่จะให้ทั้งหน้าพัง
    res.json({ active_year_id: null, year: null });
  }
});

// PUT  /api/academic-years/active
// ตั้งปีการศึกษาที่ GradTrack ใช้งาน (admin only)
// SchoolOS เป็น read-only สำหรับเรา → GradTrack เก็บ active year ของตัวเองใน settings
router.put('/active', verifyToken, adminOnly, async (req, res) => {
  const { year_id } = req.body;
  if (!year_id) return res.status(400).json({ message: 'year_id required' });
  try {
    // ตรวจว่าปีนี้มีอยู่จริง (ปีปัจจุบันของ SchoolOS หรือปีที่เคยเห็น)
    const year = await schoolos.getAcademicYearById(year_id);
    if (!year) return res.status(404).json({ message: 'ไม่พบปีการศึกษานี้' });

    await db.query(
      `INSERT INTO settings ("key", "value") VALUES ('active_year_id', ?)
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`,
      [String(year_id)]
    );
    res.json({ active_year_id: Number(year_id), year });
  } catch (err) {
    res.status(500).json({ message: 'ตั้งปีการศึกษาไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
