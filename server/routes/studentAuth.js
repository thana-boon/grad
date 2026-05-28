const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const { loginLimiter } = require('../middlewares/rateLimiter');
const logger = require('../config/logger');

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
  // สร้าง table ถ้ายังไม่มี (UNIQUE per combination ไม่ใช่ per student_code)
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`student_admissions\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`student_code\` VARCHAR(20) NOT NULL,
      \`university_id\` INT NOT NULL,
      \`faculty_id\` INT NOT NULL,
      \`program_id\` INT NOT NULL,
      \`confirmed\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uq_student_program\` (\`student_code\`, \`university_id\`, \`faculty_id\`, \`program_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Migration: ถ้ามี index เก่าที่ unique บน student_code อย่างเดียว ให้ลบออก
  try { await db.query(`ALTER TABLE student_admissions DROP INDEX uq_student_admission`); } catch {}
  try {
    await db.query(`ALTER TABLE student_admissions ADD UNIQUE KEY uq_student_program (student_code, university_id, faculty_id, program_id)`);
  } catch {}
};

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

    // ดึงนักเรียน ม.6 ทั้งหมดในปีนั้น พร้อม photo_url และ quote จาก student_profiles
    const [students] = await db.query(
      `SELECT s.student_code, s.first_name, s.last_name, s.class_level, s.class_room, s.number_in_room,
              sp.photo_url, sp.quote
       FROM school_app.students s
       LEFT JOIN student_profiles sp ON sp.student_code COLLATE utf8mb4_general_ci = s.student_code
       WHERE s.year_id = ? AND s.class_level LIKE 'ม.6%'
       ORDER BY s.class_room, s.number_in_room`,
      [year_id]
    );

    // ดึง admissions ทั้งหมดของนักเรียนเหล่านี้ พร้อมชื่อ มหาลัย/คณะ/สาขา
    const codes = students.map(s => s.student_code);
    let admissionMap = {};
    if (codes.length > 0) {
      const [admissions] = await db.query(
        `SELECT sa.student_code, sa.id, sa.university_id, sa.faculty_id, sa.program_id, sa.confirmed,
                u.name AS university_name, u.logo_url,
                f.name AS faculty_name,
                p.name AS program_name
         FROM student_admissions sa
         JOIN universities u ON u.id = sa.university_id
         JOIN faculties f ON f.id = sa.faculty_id
         JOIN programs p ON p.id = sa.program_id
         WHERE sa.student_code IN (?)
         ORDER BY sa.confirmed DESC, sa.created_at ASC`,
        [codes]
      );
      for (const row of admissions) {
        if (!admissionMap[row.student_code]) admissionMap[row.student_code] = [];
        admissionMap[row.student_code].push(row);
      }
    }

    // รวมข้อมูล + จัดกลุ่มสถานะ
    const result = students.map(s => {
      const list = admissionMap[s.student_code] || [];
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
    // ค้นหาโดย student_code ที่ pad แล้ว (เทียบทั้ง exact และ int)
    const paddedCode = username.trim();
    const numericCode = parseInt(paddedCode, 10);

    const [rows] = await db.query(
      `SELECT student_code, first_name, last_name, citizen_id, class_level, class_room
       FROM school_app.students
       WHERE (student_code = ? OR student_code = ?)
         AND citizen_id IS NOT NULL
       ORDER BY year_id DESC
       LIMIT 1`,
      [paddedCode, String(numericCode)]
    );

    if (!rows.length) {
      logger.warn('Student login failed: not found', { username, ip: req.ip });
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const student = rows[0];
    const expectedPassword = `Skdw${student.citizen_id}`;

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

    res.json({
      token,
      user: {
        student_code: student.student_code,
        username: paddedCode,
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

    const [[student]] = await db.query(
      `SELECT student_code, first_name, last_name, class_level, class_room, number_in_room
       FROM school_app.students WHERE student_code = ? LIMIT 1`,
      [code]
    );
    if (!student) return res.status(404).json({ message: 'ไม่พบข้อมูลนักเรียน' });

    const [[profile]] = await db.query(
      'SELECT quote, photo_url FROM student_profiles WHERE student_code = ?',
      [code]
    );

    res.json({ ...student, quote: profile?.quote || '', photo_url: profile?.photo_url || null });
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

// ─── GET /api/student/admissions ─────────────────────────────────────────────
// ดึงรายการสอบติดทั้งหมดของนักเรียน
router.get('/admissions', verifyToken, studentOnly, async (req, res) => {
  try {
    await ensureAdmissionTable();
    const code = req.user.student_code;
    const [rows] = await db.query(
      `SELECT sa.id, sa.university_id, sa.faculty_id, sa.program_id, sa.confirmed,
              u.name AS university_name, u.logo_url,
              f.name AS faculty_name,
              p.name AS program_name
       FROM student_admissions sa
       JOIN universities u ON u.id = sa.university_id
       JOIN faculties f ON f.id = sa.faculty_id
       JOIN programs p ON p.id = sa.program_id
       WHERE sa.student_code = ?
       ORDER BY sa.confirmed DESC, sa.created_at ASC`,
      [code]
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
    const { university_id, faculty_id, program_id } = req.body;
    if (!university_id || !faculty_id || !program_id) {
      return res.status(400).json({ message: 'กรุณาเลือกมหาวิทยาลัย คณะ และสาขาให้ครบ' });
    }
    // ถ้ายืนยันสิทธิ์แล้ว ห้ามเพิ่ม
    const [[confirmed]] = await db.query(
      'SELECT id FROM student_admissions WHERE student_code = ? AND confirmed = 1 LIMIT 1', [code]
    );
    if (confirmed) return res.status(400).json({ message: 'ยืนยันสิทธิ์แล้ว ไม่สามารถเพิ่มได้' });

    await db.query(
      `INSERT INTO student_admissions (student_code, university_id, faculty_id, program_id)
       VALUES (?, ?, ?, ?)`,
      [code, university_id, faculty_id, program_id]
    );
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
    res.json({ message: 'ยกเลิกการยืนยันแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
