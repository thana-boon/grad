const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const studentApi = require('../config/studentApi');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const { loginLimiter } = require('../middlewares/rateLimiter');
const logger = require('../config/logger');
const { logActivity } = require('./activityLogs');

// รหัสนักเรียน: ตัด 0 นำหน้าเพื่อใช้เทียบข้ามแหล่งข้อมูล
// (Student API ส่งรหัสแบบ pad 0 เช่น "02809" แต่ข้อมูลเก่าใน DB เก็บแบบ "2809")
const normCode = (c) => {
  const n = parseInt(c, 10);
  return Number.isNaN(n) ? String(c ?? '') : String(n);
};

// ─── Auto-create tables ───────────────────────────────────────────────────────
const ensureProfileTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`student_profiles\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`student_code\` VARCHAR(20) NOT NULL UNIQUE,
      \`year_id\` INT NOT NULL,
      \`quote\` TEXT,
      \`photo_url\` VARCHAR(500),
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const ensureAdmissionTable = async () => {
  // สร้าง table ถ้ายังไม่มี
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`student_admissions\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`student_code\` VARCHAR(20) NOT NULL,
      \`university_id\` INT NOT NULL,
      \`program_id\` INT NOT NULL,
      \`confirmed\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uq_student_program\` (\`student_code\`, \`program_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Migration: เพิ่ม/ปรับ columns
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_admissions'
  `);
  const colNames = cols.map(c => c.COLUMN_NAME);
  if (colNames.includes('faculty_id')) {
    // ลบ unique key เก่าที่มี faculty_id
    try { await db.query(`ALTER TABLE student_admissions DROP INDEX uq_student_program`); } catch {}
    try { await db.query(`ALTER TABLE student_admissions DROP INDEX uq_student_admission`); } catch {}
    try { await db.query(`ALTER TABLE student_admissions DROP COLUMN faculty_id`); } catch {}
    try { await db.query(`ALTER TABLE student_admissions ADD UNIQUE KEY uq_student_program (student_code, program_id)`); } catch {}
  }
};

// ─── Multer: Excel import (memory storage) ──────────────────────────────────
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname) ||
        file.mimetype.includes('spreadsheet') ||
        file.mimetype.includes('excel')) {
      cb(null, true);
    } else {
      cb(new Error('ไฟล์ต้องเป็น Excel (.xlsx, .xls) เท่านั้น'));
    }
  },
}).single('file');

// ─── Multer: อัปโหลดรูปนักเรียน ──────────────────────────────────────────────
const PHOTO_DIR = path.join(__dirname, '..', 'uploads', 'student-photos');
if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: PHOTO_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `student-${req.user.student_code}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('ไฟล์ต้องเป็นรูปภาพเท่านั้น'));
  },
}).single('photo');

const adminPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: PHOTO_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const code = String(req.params.student_code || 'student').replace(/[^0-9A-Za-z_-]/g, '');
      cb(null, `student-${code}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('ไฟล์ต้องเป็นรูปภาพเท่านั้น'));
  },
}).single('photo');

// ─── Middleware: ตรวจว่าเป็น student role ────────────────────────────────────
function studentOnly(req, res, next) {
  if (req.user?.role !== 'student') {
    return res.status(403).json({ message: 'เฉพาะนักเรียนเท่านั้น' });
  }
  next();
}

// ─── GET /api/student/admin/admission-overview ────────────────────────────────
// สรุปสถานะ admission ของนักเรียนทั้งหมด (admin only)
// query: year_id (required)
router.get('/admin/admission-overview', verifyToken, adminOnly, async (req, res) => {
  const { year_id } = req.query;
  if (!year_id) return res.status(400).json({ message: 'year_id required' });

  try {
    await ensureAdmissionTable();
    await ensureProfileTable(); // ป้องกัน JOIN พัง ถ้าตารางยังไม่ถูกสร้าง

    // ดึงนักเรียน ม.6 ทั้งหมดในปีนั้นจาก Student API (กรองชั้นฝั่ง API)
    const { data: apiStudents } = await studentApi.listAllStudents({ year_id, class_level: 'ม.6' });
    const m6 = (apiStudents || [])
      .filter((s) => /^ม\.?\s?6/.test(String(s.class_level || '').trim()))
      .sort((a, b) => (a.class_room - b.class_room) || (a.number_in_room - b.number_in_room));

    // ดึง photo_url / quote จาก student_profiles (local) แล้ว merge (เทียบแบบตัด 0 นำหน้า)
    const [profileRows] = await db.query('SELECT student_code, photo_url, quote FROM student_profiles');
    const profileMap = {};
    for (const p of profileRows) profileMap[normCode(p.student_code)] = p;

    const students = m6.map((s) => ({
      student_code: s.student_code,
      title_prefix: s.title_prefix,
      first_name: s.first_name,
      last_name: s.last_name,
      class_level: s.class_level,
      class_room: s.class_room,
      number_in_room: s.number_in_room,
      photo_url: profileMap[normCode(s.student_code)]?.photo_url || null,
      quote: profileMap[normCode(s.student_code)]?.quote || null,
    }));

    // ดึง admissions ทั้งหมดของนักเรียนเหล่านี้ พร้อมชื่อ มหาลัย/คณะ/สาขา
    // ใส่ทั้งรหัสแบบ pad และแบบตัด 0 ใน IN() เพื่อให้ match ข้อมูลเก่าที่ไม่ได้ pad
    const codeSet = new Set();
    for (const s of students) { codeSet.add(s.student_code); codeSet.add(normCode(s.student_code)); }
    const codes = [...codeSet];
    let admissionMap = {};
    if (codes.length > 0) {
      const [admissions] = await db.query(
        `SELECT sa.student_code, sa.id, sa.university_id, sa.program_id, sa.confirmed, sa.created_at,
                u.name_th AS university_name, u.logo_url,
                p.campus, p.faculty_name, p.group_field,
                p.program_name_th AS program_name
         FROM student_admissions sa
         JOIN universities u ON u.id = sa.university_id
         JOIN programs p ON p.id = sa.program_id
         WHERE sa.student_code IN (?)
         ORDER BY sa.confirmed DESC, sa.created_at ASC`,
        [codes]
      );
      for (const row of admissions) {
        const key = normCode(row.student_code);
        if (!admissionMap[key]) admissionMap[key] = [];
        admissionMap[key].push(row);
      }
    }

    // รวมข้อมูล + จัดกลุ่มสถานะ
    const result = students.map(s => {
      const list = admissionMap[normCode(s.student_code)] || [];
      const hasConfirmed = list.some(a => a.confirmed);
      const status = list.length === 0 ? 'none' : hasConfirmed ? 'confirmed' : 'pending';
      return { ...s, admissions: list, status };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/student/login ──────────────────────────────────────────────────
// username = student_code padded to 5 digits
// password = "Skdw" + citizen_id
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'กรุณากรอก username และ password' });
  }

  try {
    // ค้นหาจาก Student API (getStudentByCode รองรับทั้งรหัส pad และตัดศูนย์นำหน้า)
    const paddedCode = username.trim();
    const student = await studentApi.getStudentByCode(paddedCode);

    if (!student) {
      logger.warn('Student login failed: not found', { username, ip: req.ip });
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const expectedPassword = student.citizen_id ? `Skdw${student.citizen_id}` : 'Skdw';

    if (password !== expectedPassword) {
      logger.warn('Student login failed: wrong password', { username, ip: req.ip });
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    await ensureProfileTable();

    // หรือสร้าง profile ถ้ายังไม่มี
    const [profileRows] = await db.query(
      'SELECT * FROM student_profiles WHERE student_code = ?',
      [student.student_code]
    );
    let profile = profileRows[0] || null;
    if (!profile) {
      await db.query(
        'INSERT INTO student_profiles (student_code, year_id) VALUES (?, 0)',
        [student.student_code]
      );
      const [newProfile] = await db.query(
        'SELECT * FROM student_profiles WHERE student_code = ?',
        [student.student_code]
      );
      profile = newProfile[0];
    }

    const token = jwt.sign(
      { student_code: student.student_code, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    logger.info('Student login success', { student_code: student.student_code, ip: req.ip });
    logActivity({ username: paddedCode, name: `${student.first_name} ${student.last_name}`, role: 'student', action: 'login', target: '', detail: null });

    res.json({
      token,
      user: {
        student_code: student.student_code,
        username: paddedCode,
        title_prefix: student.title_prefix,
        first_name: student.first_name,
        last_name: student.last_name,
        class_level: student.class_level,
        class_room: student.class_room,
        role: 'student',
        quote: profile?.quote || '',
        photo_url: profile?.photo_url || null,
      },
    });
  } catch (err) {
    logger.error('Student login error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── GET /api/student/profile ─────────────────────────────────────────────────
router.get('/profile', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureProfileTable();
    const code = req.user.student_code;

    const student = await studentApi.getStudentByCode(code);
    if (!student) return res.status(404).json({ message: 'ไม่พบข้อมูลนักเรียน' });

    const [[profile]] = await db.query(
      'SELECT quote, photo_url FROM student_profiles WHERE student_code = ?',
      [code]
    );

    res.json({
      student_code: student.student_code,
      title_prefix: student.title_prefix,
      first_name: student.first_name,
      last_name: student.last_name,
      class_level: student.class_level,
      class_room: student.class_room,
      number_in_room: student.number_in_room,
      quote: profile?.quote || '',
      photo_url: profile?.photo_url || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/student/profile/quote ──────────────────────────────────────────
router.put('/profile/quote', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureProfileTable();
    const { quote } = req.body;
    const code = req.user.student_code;
    await db.query(
      'INSERT INTO student_profiles (student_code, year_id, quote) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE quote = ?',
      [code, quote || '', quote || '']
    );
    res.json({ quote: quote || '' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/student/profile/photo ─────────────────────────────────────────
router.post('/profile/photo', verifyToken, studentOnly, (req, res) => {
  photoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'ไม่พบไฟล์รูปภาพ' });

    try {
      await ensureProfileTable();
      const code = req.user.student_code;
      const photoUrl = `/uploads/student-photos/${req.file.filename}`;

      // ลบรูปเก่า
      const [[old]] = await db.query(
        'SELECT photo_url FROM student_profiles WHERE student_code = ?', [code]
      );
      if (old?.photo_url?.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', old.photo_url);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      await db.query(
        'INSERT INTO student_profiles (student_code, year_id, photo_url) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE photo_url = ?',
        [code, photoUrl, photoUrl]
      );
      res.json({ photo_url: photoUrl });
    } catch (err2) {
      res.status(500).json({ message: err2.message });
    }
  });
});

// ─── POST /api/student/admin/students/:student_code/photo ───────────────────
// Admin: อัปโหลดรูปให้นักเรียน
router.post('/admin/students/:student_code/photo', verifyToken, adminOnly, (req, res) => {
  adminPhotoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'ไม่พบไฟล์รูปภาพ' });

    try {
      await ensureProfileTable();
      const code = String(req.params.student_code || '').trim();
      if (!code) return res.status(400).json({ message: 'ไม่พบรหัสนักเรียน' });

      let yearId = Number(req.body.year_id || 0) || 0;
      if (!yearId) {
        // Student API ไม่คืน year_id ราย student → ใช้ปี active ของ GradTrack แทน
        const [[setting]] = await db.query(
          "SELECT `value` FROM `settings` WHERE `key` = 'active_year_id'"
        ).catch(() => [[null]]);
        yearId = Number(setting?.value || 0) || 0;
      }

      const photoUrl = `/uploads/student-photos/${req.file.filename}`;
      const [[old]] = await db.query(
        'SELECT photo_url FROM student_profiles WHERE student_code = ?', [code]
      );
      if (old?.photo_url?.startsWith('/uploads/student-photos/')) {
        const oldPath = path.join(__dirname, '..', old.photo_url.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      await db.query(
        `INSERT INTO student_profiles (student_code, year_id, photo_url)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE year_id = VALUES(year_id), photo_url = VALUES(photo_url), updated_at = NOW()`,
        [code, yearId, photoUrl]
      );

      res.json({ photo_url: photoUrl, message: 'อัปโหลดรูปสำเร็จ' });
    } catch (err2) {
      res.status(500).json({ message: err2.message });
    }
  });
});

// ─── GET /api/student/admissions ─────────────────────────────────────────────
// ดึงรายการสอบติดทั้งหมดของนักเรียน
router.get('/admissions', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureAdmissionTable();
    const code = req.user.student_code;
    // เทียบทั้งรหัสแบบ pad และแบบตัด 0 เพื่อให้เห็นข้อมูลเก่าที่เก็บแบบไม่ pad
    const [rows] = await db.query(
      `SELECT sa.id, sa.confirmed,
              u.id AS university_id, u.name_th AS university_name, u.logo_url,
              p.id AS program_id,
              p.campus, p.faculty_name, p.group_field,
              p.field_name_th, p.program_name_th, p.program_type
       FROM student_admissions sa
       JOIN universities u ON u.id = sa.university_id
       JOIN programs p ON p.id = sa.program_id
       WHERE sa.student_code IN (?, ?)
       ORDER BY sa.confirmed DESC, sa.created_at ASC`,
      [code, normCode(code)]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/student/admissions ────────────────────────────────────────────
// เพิ่มมหาวิทยาลัยที่สอบติด
router.post('/admissions', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureAdmissionTable();
    const code = req.user.student_code;
    const { program_id } = req.body;
    if (!program_id) {
      return res.status(400).json({ message: 'กรุณาเลือกหลักสูตรให้ครบ' });
    }
    // ดึง university_id จาก program
    const [[prog]] = await db.query('SELECT university_id FROM programs WHERE id = ? LIMIT 1', [program_id]);
    if (!prog) return res.status(404).json({ message: 'ไม่พบหลักสูตรนี้' });
    const university_id = prog.university_id;

    // ถ้ายืนยันสิทธิ์แล้ว ห้ามเพิ่ม (เช็กทั้งรหัสแบบ pad และไม่ pad)
    const [[confirmed]] = await db.query(
      'SELECT id FROM student_admissions WHERE student_code IN (?, ?) AND confirmed = 1 LIMIT 1', [code, normCode(code)]
    );
    if (confirmed) return res.status(400).json({ message: 'ยืนยันสิทธิ์แล้ว ไม่สามารถเพิ่มได้' });

    await db.query(
      `INSERT INTO student_admissions (student_code, university_id, program_id)
       VALUES (?, ?, ?)`,
      [code, university_id, program_id]
    );
    // log
    const [[uniRow]] = await db.query('SELECT name_th AS name FROM universities WHERE id = ? LIMIT 1', [university_id]).catch(() => [[null]]);
    logActivity({ username: code, name: '', role: 'student', action: 'add_admission', target: uniRow?.name || String(university_id), detail: { university_id, program_id } });
    res.json({ message: 'เพิ่มแล้ว' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'มีรายการนี้อยู่แล้ว' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/student/admissions/:id ──────────────────────────────────────
// ลบรายการสอบติด (ยังไม่ได้ยืนยันเท่านั้น)
router.delete('/admissions/:id', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureAdmissionTable();
    const code = req.user.student_code;
    const { id } = req.params;
    const [[row]] = await db.query(
      'SELECT id, confirmed FROM student_admissions WHERE id = ? AND student_code = ?', [id, code]
    );
    if (!row) return res.status(404).json({ message: 'ไม่พบรายการ' });
    if (row.confirmed) return res.status(400).json({ message: 'ยืนยันสิทธิ์แล้ว ไม่สามารถลบได้' });

    await db.query('DELETE FROM student_admissions WHERE id = ?', [id]);
    res.json({ message: 'ลบแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/student/admissions/:id/confirm ─────────────────────────────────
// ยืนยันสิทธิ์รายการนี้
router.post('/admissions/:id/confirm', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureAdmissionTable();
    const code = req.user.student_code;
    const { id } = req.params;
    const [[row]] = await db.query(
      'SELECT id, confirmed FROM student_admissions WHERE id = ? AND student_code = ?', [id, code]
    );
    if (!row) return res.status(404).json({ message: 'ไม่พบรายการ' });
    if (row.confirmed) return res.status(400).json({ message: 'ยืนยันสิทธิ์แล้ว' });

    await db.query('UPDATE student_admissions SET confirmed = 1 WHERE id = ?', [id]);
    logActivity({ username: code, name: '', role: 'student', action: 'confirm_admission', target: `admission#${id}`, detail: null });
    res.json({ message: 'ยืนยันสิทธิ์เรียบร้อยแล้ว 🎉' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/student/admissions/:id/unconfirm ───────────────────────────────
// ยกเลิกการยืนยันสิทธิ์
router.post('/admissions/:id/unconfirm', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureAdmissionTable();
    const code = req.user.student_code;
    const { id } = req.params;
    const [[row]] = await db.query(
      'SELECT id, confirmed FROM student_admissions WHERE id = ? AND student_code = ?', [id, code]
    );
    if (!row) return res.status(404).json({ message: 'ไม่พบรายการ' });
    if (!row.confirmed) return res.status(400).json({ message: 'ยังไม่ได้ยืนยัน' });

    await db.query('UPDATE student_admissions SET confirmed = 0 WHERE id = ?', [id]);
    logActivity({ username: code, name: '', role: 'student', action: 'unconfirm_admission', target: `admission#${id}`, detail: null });
    res.json({ message: 'ยกเลิกการยืนยันแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/student/admin/students-by-university ───────────────────────────
// แสดงรายชื่อนักเรียนที่บันทึกผลสอบติดในมหาวิทยาลัยนี้ (กรองตามคณะได้)
// query: university_id (required), faculty (optional), year_id (optional — ใช้ resolve ชื่อ)
router.get('/admin/students-by-university', verifyToken, adminOnly, async (req, res) => {
  const { university_id, faculty, year_id } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });

  try {
    await ensureAdmissionTable();

    const params = [Number(university_id)];
    let facClause = '';
    if (faculty !== undefined && faculty !== '') {
      facClause = ' AND p.faculty_name = ?';
      params.push(faculty);
    }

    const [rows] = await db.query(
      `SELECT sa.id, sa.student_code, sa.confirmed, sa.created_at,
              u.name_th AS university_name, u.logo_url,
              p.campus, p.faculty_name, p.group_field, p.field_name_th,
              p.program_name_th, p.program_type
       FROM student_admissions sa
       JOIN universities u ON u.id = sa.university_id
       JOIN programs p ON p.id = sa.program_id
       WHERE sa.university_id = ?${facClause}
       ORDER BY p.faculty_name, p.program_name_th, sa.confirmed DESC, sa.created_at ASC`,
      params
    );

    // ── resolve ชื่อนักเรียนจาก Student API ──
    // 1) ปีที่ระบุ → fallback ปี active ของ GradTrack → ดึงทั้งปีมาทำ map
    let activeYearId = Number(year_id) || null;
    if (!activeYearId) {
      const [[setting]] = await db.query(
        "SELECT `value` FROM `settings` WHERE `key` = 'active_year_id'"
      ).catch(() => [[null]]);
      activeYearId = Number(setting?.value || 0) || null;
    }

    const nameMap = new Map();
    const setInfo = (s) => {
      const info = {
        title_prefix: s.title_prefix,
        first_name: s.first_name,
        last_name: s.last_name,
        class_level: s.class_level,
        class_room: s.class_room,
        number_in_room: s.number_in_room,
      };
      nameMap.set(String(s.student_code), info);
      nameMap.set(normCode(s.student_code), info);
    };

    if (activeYearId) {
      try {
        const { data } = await studentApi.listAllStudents({ year_id: activeYearId });
        for (const s of (data || [])) setInfo(s);
      } catch { /* API ล่ม → แสดงเฉพาะรหัส */ }
    }

    const result = rows.map(r => ({
      ...r,
      student: nameMap.get(String(r.student_code)) || nameMap.get(normCode(r.student_code)) || null,
    }));

    // 2) รหัสที่ยังหาชื่อไม่เจอ (นักเรียนเก่า/คนละปี) → ดึงรายคน (จำกัด concurrency)
    const missing = [...new Set(result.filter(r => !r.student).map(r => r.student_code))];
    if (missing.length) {
      const CONCURRENCY = 5;
      for (let i = 0; i < missing.length; i += CONCURRENCY) {
        await Promise.all(missing.slice(i, i + CONCURRENCY).map(async (code) => {
          try {
            const s = await studentApi.getStudentByCode(code);
            if (s) setInfo(s);
          } catch { /* ข้าม */ }
        }));
      }
      for (const r of result) {
        if (!r.student) r.student = nameMap.get(normCode(r.student_code)) || null;
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/student/admin/import-admissions ───────────────────────────────
// Import admission data from Excel (admin only)
router.post('/admin/import-admissions', verifyToken, adminOnly, (req, res) => {
  excelUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'ไม่พบไฟล์ Excel' });

    try {
      await ensureAdmissionTable();

      // Get active year from settings first, fallback to ปี current ของ Student API
      let activeYearId = null;
      const [[setting]] = await db.query(
        "SELECT `value` FROM `settings` WHERE `key` = 'active_year_id'"
      );
      if (setting?.value) activeYearId = Number(setting.value);
      if (!activeYearId) {
        const { current } = await studentApi.getAcademicYears();
        if (current) activeYearId = Number(current.id);
      }
      if (!activeYearId) {
        return res.status(400).json({ message: 'ยังไม่ได้ตั้งปีการศึกษา active' });
      }

      // ดึงนักเรียนทั้งปีจาก Student API ครั้งเดียว แล้วทำ Map ไว้ตรวจสอบ (เลี่ยงยิง API รายแถว)
      const { data: yearStudents } = await studentApi.listAllStudents({ year_id: activeYearId });
      const studentMap = new Map();
      for (const s of (yearStudents || [])) {
        studentMap.set(String(s.student_code), s);
        studentMap.set(String(parseInt(s.student_code, 10)), s);
      }

      // Parse Excel
      const XLSX = require('xlsx');
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      let imported = 0;
      let skipped = 0;
      const errors = [];
      const warnings = [];

      const pick = (obj, keys) => {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== '') {
            return obj[key];
          }
        }
        return null;
      };

      const parseConfirmed = (value) => {
        if (value === true || value === 1) return 1;
        const s = String(value || '').trim().toLowerCase();
        return ['true', 'yes', 'y', '1', 'ยืนยัน', 'confirmed'].includes(s) ? 1 : 0;
      };

      const parseExcelDateTime = (value, XLSXRef) => {
        if (value == null || value === '') return null;
        if (typeof value === 'number') {
          const dt = XLSXRef.SSF.parse_date_code(value);
          if (!dt) return null;
          const yyyy = String(dt.y).padStart(4, '0');
          const mm = String(dt.m).padStart(2, '0');
          const dd = String(dt.d).padStart(2, '0');
          const hh = String(dt.H || 0).padStart(2, '0');
          const mi = String(dt.M || 0).padStart(2, '0');
          const ss = String(Math.floor(dt.S || 0)).padStart(2, '0');
          return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
        }
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 19).replace('T', ' ');
        }
        return null;
      };

      for (const row of rows) {
        try {
          // student code - supports many column aliases
          const rawCode = String(
            pick(row, ['stu_id', 'student_id', 'student_code', 'เลขประจำตัว', 'รหัสนักเรียน']) || ''
          ).trim();
          if (!rawCode) { skipped++; continue; }
          const paddedCode = rawCode.padStart(5, '0');

          // Verify student exists in active year (จาก Map ที่ดึงจาก Student API)
          const matched = studentMap.get(paddedCode) || studentMap.get(rawCode);
          if (!matched) {
            skipped++;
            errors.push(`ไม่พบนักเรียนรหัส ${rawCode}`);
            continue;
          }
          const studentCode = matched.student_code;
          const displayName = `${matched.first_name || ''} ${matched.last_name || ''}`.trim();

          // Extract all row fields early (needed for warnings too)
          const uniName = String(
            pick(row, ['university_name_th', 'university_name', 'university', 'มหาวิทยาลัย']) || ''
          ).trim();
          const facName = String(
            pick(row, ['faculty_name_th', 'faculty_name', 'faculty', 'คณะ']) || ''
          ).trim();
          const progName = String(
            pick(row, ['program_name_th', 'program_name', 'program', 'สาขา']) || ''
          ).trim();
          const campusName = String(
            pick(row, ['campus_name_th', 'campus', 'วิทยาเขต']) || ''
          ).trim();
          const groupField = String(
            pick(row, ['group_field_th', 'group_field', 'สาขา/กลุ่มวิชา', 'กลุ่มวิชา']) || ''
          ).trim();
          const fieldName = String(
            pick(row, ['field_name_th', 'field_name', 'วิชาเอก']) || ''
          ).trim();

          // confirmed flag
          const confirmed = parseConfirmed(
            pick(row, ['confirmation', 'confirmed', 'ยืนยันสิทธิ์', 'ยืนยัน'])
          );

          // created_at from Excel 'Created' column
          const createdAt = parseExcelDateTime(
            pick(row, ['Created', 'created_at', 'created', 'วันที่บันทึก']),
            XLSX
          );

          if (!uniName) { skipped++; continue; }
          if (!progName) { skipped++; continue; }

          // Find university
          const [unis] = await db.query(
            'SELECT id FROM universities WHERE name_th = ? LIMIT 1',
            [uniName]
          );
          if (!unis.length) {
            skipped++;
            warnings.push({
              student_code: studentCode,
              display_name: displayName,
              university_name: uniName,
              faculty_name: facName || null,
              program_name: progName,
              confirmed,
              created_at: createdAt,
              reason: `ไม่พบมหาวิทยาลัย "${uniName}" ในระบบ`,
            });
            continue;
          }
          const universityId = unis[0].id;

          // Find program — try progressively less specific until found
          let progs;
          if (campusName && facName && groupField) {
            [progs] = await db.query(
              'SELECT id FROM programs WHERE university_id=? AND program_name_th=? AND campus=? AND faculty_name=? AND group_field=? LIMIT 1',
              [universityId, progName, campusName, facName, groupField]
            );
          }
          if (!progs?.length && campusName && facName) {
            [progs] = await db.query(
              'SELECT id FROM programs WHERE university_id=? AND program_name_th=? AND campus=? AND faculty_name=? LIMIT 1',
              [universityId, progName, campusName, facName]
            );
          }
          if (!progs?.length && campusName) {
            [progs] = await db.query(
              'SELECT id FROM programs WHERE university_id=? AND program_name_th=? AND campus=? LIMIT 1',
              [universityId, progName, campusName]
            );
          }
          if (!progs?.length) {
            [progs] = await db.query(
              'SELECT id FROM programs WHERE university_id=? AND program_name_th=? LIMIT 1',
              [universityId, progName]
            );
          }
          // ถ้าพบ program แต่ยังไม่มี group_field ให้ update จากข้อมูล Excel
          if (progs?.length && groupField) {
            await db.query(
              'UPDATE programs SET group_field=? WHERE id=? AND (group_field IS NULL OR group_field="")',
              [groupField, progs[0].id]
            );
          }
          if (!progs?.length) {
            skipped++;
            warnings.push({
              student_code: studentCode,
              display_name: displayName,
              university_name: uniName,
              faculty_name: facName || null,
              program_name: progName,
              confirmed,
              created_at: createdAt,
              reason: `ไม่พบหลักสูตร "${progName}" ของ "${uniName}" ในระบบ`,
            });
            continue;
          }
          const programId = progs[0].id;

          // Upsert
          if (createdAt) {
            await db.query(
              `INSERT INTO student_admissions (student_code, university_id, program_id, confirmed, created_at)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE confirmed = VALUES(confirmed), updated_at = CURRENT_TIMESTAMP`,
              [studentCode, universityId, programId, confirmed, createdAt]
            );
          } else {
            await db.query(
              `INSERT INTO student_admissions (student_code, university_id, program_id, confirmed)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE confirmed = VALUES(confirmed), updated_at = CURRENT_TIMESTAMP`,
              [studentCode, universityId, programId, confirmed]
            );
          }

          imported++;
        } catch (rowErr) {
          skipped++;
          const fallbackCode = pick(row, ['stu_id', 'student_id', 'student_code', 'เลขประจำตัว', 'รหัสนักเรียน']) || '-';
          errors.push(`รหัส ${fallbackCode}: ${rowErr.message}`);
        }
      }

      logger.info('Import admissions', { total: rows.length, imported, skipped, warnings: warnings.length });
      res.json({ ok: true, total: rows.length, imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 100) });
    } catch (err) {
      logger.error('Import admissions error', { error: err.message });
      res.status(500).json({ message: err.message });
    }
  });
});

// ─── POST /api/student/admin/force-import-admissions ─────────────────────────
// Admin: force-save rows ที่ไม่พบ university/program — auto-create ถ้าจำเป็น
router.post('/admin/force-import-admissions', verifyToken, adminOnly, async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'ไม่มีรายการให้บันทึก' });
  }
  try {
    await ensureAdmissionTable();
    let saved = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const { student_code, university_name, faculty_name, program_name, confirmed, created_at } = row;
        if (!student_code || !university_name || !program_name) {
          errors.push(`ข้อมูลไม่ครบ: ${student_code || '-'}`);
          continue;
        }

        // Find or create university
        let [[uni]] = await db.query('SELECT id FROM universities WHERE name_th = ? LIMIT 1', [university_name]);
        let universityId;
        if (uni) {
          universityId = uni.id;
        } else {
          const [result] = await db.query('INSERT INTO universities (name_th) VALUES (?)', [university_name]);
          universityId = result.insertId;
        }

        // Find or create program
        let [[prog]] = await db.query(
          'SELECT id FROM programs WHERE university_id = ? AND program_name_th = ? LIMIT 1',
          [universityId, program_name]
        );
        let programId;
        if (prog) {
          programId = prog.id;
        } else {
          const [result] = await db.query(
            'INSERT INTO `programs` (university_id, faculty_name, program_name_th) VALUES (?, ?, ?)',
            [universityId, faculty_name || null, program_name]
          );
          programId = result.insertId;
        }

        // Upsert admission
        if (created_at) {
          await db.query(
            `INSERT INTO student_admissions (student_code, university_id, program_id, confirmed, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE confirmed = VALUES(confirmed), updated_at = CURRENT_TIMESTAMP`,
            [student_code, universityId, programId, confirmed ? 1 : 0, created_at]
          );
        } else {
          await db.query(
            `INSERT INTO student_admissions (student_code, university_id, program_id, confirmed)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE confirmed = VALUES(confirmed), updated_at = CURRENT_TIMESTAMP`,
            [student_code, universityId, programId, confirmed ? 1 : 0]
          );
        }
        saved++;
      } catch (rowErr) {
        errors.push(`รหัส ${row.student_code || '-'}: ${rowErr.message}`);
      }
    }

    res.json({ ok: true, saved, errors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/student/admin/admissions ──────────────────────────────────────
// Admin: เพิ่ม admission ให้นักเรียน
router.post('/admin/admissions', verifyToken, adminOnly, async (req, res) => {
  const { student_code, program_id, confirmed = 0 } = req.body;
  if (!student_code || !program_id) {
    return res.status(400).json({ message: 'ต้องระบุ student_code และ program_id' });
  }
  try {
    await ensureAdmissionTable();
    const [progs] = await db.query('SELECT id, university_id FROM `programs` WHERE id = ?', [Number(program_id)]);
    if (!progs.length) return res.status(404).json({ message: 'ไม่พบหลักสูตรนี้' });
    const university_id = progs[0].university_id;
    const [result] = await db.query(
      `INSERT INTO student_admissions (student_code, university_id, program_id, confirmed)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE confirmed = VALUES(confirmed), updated_at = NOW()`,
      [student_code, university_id, Number(program_id), confirmed ? 1 : 0]
    );
    res.json({ id: result.insertId || null, message: 'เพิ่มข้อมูลสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/student/admin/admissions/:id/confirm ─────────────────────────
// Admin: อัปเดตสถานะยืนยัน
router.patch('/admin/admissions/:id/confirm', verifyToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { confirmed } = req.body;
  try {
    await db.query('UPDATE student_admissions SET confirmed = ?, updated_at = NOW() WHERE id = ?', [confirmed ? 1 : 0, Number(id)]);
    res.json({ message: 'อัปเดตสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/student/admin/admissions/:id ─────────────────────────────────
// Admin: ลบ admission
router.delete('/admin/admissions/:id', verifyToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM student_admissions WHERE id = ?', [Number(id)]);
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
