const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Auto-create table ─────────────────────────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS report_settings (
      id INT NOT NULL DEFAULT 1,
      congrats_text TEXT,
      show_quote TINYINT(1) NOT NULL DEFAULT 1,
      background_image_url VARCHAR(500) DEFAULT NULL,
      school_name VARCHAR(255) DEFAULT NULL,
      school_logo_url VARCHAR(500) DEFAULT NULL,
      PRIMARY KEY (id)
    )
  `);
  await db.query(`
    INSERT IGNORE INTO report_settings (id, congrats_text, show_quote)
    VALUES (1, 'ขอแสดงความยินดีกับความสำเร็จของน้องๆ ทุกคน', 1)
  `);
  // migrate existing table
  for (const col of [
    "ALTER TABLE report_settings ADD COLUMN school_name VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE report_settings ADD COLUMN school_logo_url VARCHAR(500) DEFAULT NULL",
    "ALTER TABLE report_settings ADD COLUMN text_color VARCHAR(20) DEFAULT '#ffffff'",
    "ALTER TABLE report_settings ADD COLUMN show_photo_frame TINYINT(1) NOT NULL DEFAULT 1",
    "ALTER TABLE report_settings ADD COLUMN photo_scale INT NOT NULL DEFAULT 100",
    "ALTER TABLE report_settings ADD COLUMN photo_overflow TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE report_settings ADD COLUMN photo_offset_y INT NOT NULL DEFAULT 0",
    "ALTER TABLE report_settings ADD COLUMN name_bg_color VARCHAR(20) DEFAULT '#000000'",
    "ALTER TABLE report_settings ADD COLUMN name_bg_opacity INT NOT NULL DEFAULT 0",
    "ALTER TABLE report_settings ADD COLUMN info_offset_y INT NOT NULL DEFAULT 0",
    "ALTER TABLE report_settings ADD COLUMN confirm_color VARCHAR(20) DEFAULT '#22c55e'",
    "ALTER TABLE report_settings ADD COLUMN confirm_opacity INT NOT NULL DEFAULT 22",
  ]) {
    await db.query(col).catch(() => {});
  }
}
ensureTable();

// ─── Auto-create per-student override table ───────────────────────────────────
// คอลัมน์เป็น NULL ได้ = ให้ใช้ค่ากลางจาก report_settings
async function ensureStudentTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS report_student_settings (
      student_code VARCHAR(50) NOT NULL,
      photo_scale INT DEFAULT NULL,
      photo_offset_y INT DEFAULT NULL,
      photo_overflow TINYINT(1) DEFAULT NULL,
      info_offset_y INT DEFAULT NULL,
      PRIMARY KEY (student_code)
    )
  `);
}
ensureStudentTable();

// รหัสนักเรียนบางที่ pad 0 นำหน้า บางที่ไม่ pad — normalize ให้ตรงกันเสมอ
const normCode = (c) => {
  const n = parseInt(c, 10);
  return Number.isNaN(n) ? String(c ?? '') : String(n);
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// null/'' = ล้างค่า (กลับไปใช้ค่ากลาง), ตัวเลข = override
const nullableInt = (v, min, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, min, max) : null;
};
const nullableBool = (v) => (v === null || v === undefined || v === '' ? null : (v ? 1 : 0));

// ─── Multer: background image upload ──────────────────────────────────────────
const makeStorage = (subdir, prefix) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, `../uploads/${subdir}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${prefix}-${Date.now()}${ext}`);
  },
});
const imageFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
  cb(null, true);
};
const uploadBgMW  = multer({ storage: makeStorage('report-bg',   'bg'),   limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: imageFilter });
const uploadLogoMW = multer({ storage: makeStorage('report-logo', 'logo'), limits: { fileSize: 5  * 1024 * 1024 }, fileFilter: imageFilter });

// ─── GET /api/report-settings ──────────────────────────────────────────────────
router.get('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM report_settings WHERE id = 1');
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/report-settings ─────────────────────────────────────────────────
router.put('/', verifyToken, adminOnly, async (req, res) => {
  const { congrats_text, show_quote, school_name, text_color, show_photo_frame, photo_scale, photo_overflow, photo_offset_y, name_bg_color, name_bg_opacity, info_offset_y, confirm_color, confirm_opacity } = req.body;
  // จำกัดช่วงค่ากันเพี้ยน
  const scale     = Math.min(300, Math.max(50, Number(photo_scale) || 100));
  const offsetY   = Math.min(300, Math.max(-300, Number(photo_offset_y) || 0));
  const nameOp    = Math.min(100, Math.max(0, Number(name_bg_opacity) || 0));
  const infoY     = Math.min(300, Math.max(-300, Number(info_offset_y) || 0));
  const _co       = Number(confirm_opacity);
  const confirmOp = Math.min(100, Math.max(0, Number.isFinite(_co) ? _co : 22));
  try {
    await db.query(
      'UPDATE report_settings SET congrats_text = ?, show_quote = ?, school_name = ?, text_color = ?, show_photo_frame = ?, photo_scale = ?, photo_overflow = ?, photo_offset_y = ?, name_bg_color = ?, name_bg_opacity = ?, info_offset_y = ?, confirm_color = ?, confirm_opacity = ? WHERE id = 1',
      [congrats_text ?? '', show_quote ? 1 : 0, school_name ?? '', text_color ?? '#ffffff', show_photo_frame ? 1 : 0, scale, photo_overflow ? 1 : 0, offsetY, name_bg_color ?? '#000000', nameOp, infoY, confirm_color ?? '#22c55e', confirmOp]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/report-settings/students ────────────────────────────────────────
// คืน object: { [student_code]: { photo_scale, photo_offset_y, ... } }
router.get('/students', verifyToken, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM report_student_settings');
    const map = {};
    for (const r of rows) {
      const { student_code, ...rest } = r;
      map[student_code] = rest;
    }
    res.json(map);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/report-settings/students/:code ──────────────────────────────────
router.put('/students/:code', verifyToken, adminOnly, async (req, res) => {
  const code = normCode(req.params.code);
  if (!code) return res.status(400).json({ message: 'student_code required' });

  const scale   = nullableInt(req.body.photo_scale, 50, 300);
  const offsetY = nullableInt(req.body.photo_offset_y, -300, 300);
  const infoY   = nullableInt(req.body.info_offset_y, -300, 300);
  const overflow = nullableBool(req.body.photo_overflow);

  try {
    await db.query(
      `INSERT INTO report_student_settings (student_code, photo_scale, photo_offset_y, photo_overflow, info_offset_y)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE photo_scale = VALUES(photo_scale), photo_offset_y = VALUES(photo_offset_y),
                               photo_overflow = VALUES(photo_overflow), info_offset_y = VALUES(info_offset_y)`,
      [code, scale, offsetY, overflow, infoY]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/report-settings/students/:code ───────────────────────────────
// ลบ override → นักเรียนคนนี้กลับไปใช้ค่ากลาง
router.delete('/students/:code', verifyToken, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM report_student_settings WHERE student_code = ?', [normCode(req.params.code)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/report-settings/background ─────────────────────────────────────
router.post('/background', verifyToken, adminOnly, uploadBgMW.single('bg'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = `/uploads/report-bg/${req.file.filename}`;
  try {
    await db.query('UPDATE report_settings SET background_image_url = ? WHERE id = 1', [url]);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/report-settings/background ───────────────────────────────────
router.delete('/background', verifyToken, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT background_image_url FROM report_settings WHERE id = 1');
    const oldUrl = rows[0]?.background_image_url;
    if (oldUrl) {
      const filePath = path.join(__dirname, '../uploads', oldUrl.replace('/uploads/', ''));
      fs.unlink(filePath, () => {});
    }
    await db.query('UPDATE report_settings SET background_image_url = NULL WHERE id = 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/report-settings/school-logo ────────────────────────────────────
router.post('/school-logo', verifyToken, adminOnly, uploadLogoMW.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = `/uploads/report-logo/${req.file.filename}`;
  try {
    await db.query('UPDATE report_settings SET school_logo_url = ? WHERE id = 1', [url]);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/report-settings/school-logo ──────────────────────────────────
router.delete('/school-logo', verifyToken, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT school_logo_url FROM report_settings WHERE id = 1');
    const oldUrl = rows[0]?.school_logo_url;
    if (oldUrl) {
      const filePath = path.join(__dirname, '../uploads', oldUrl.replace('/uploads/', ''));
      fs.unlink(filePath, () => {});
    }
    await db.query('UPDATE report_settings SET school_logo_url = NULL WHERE id = 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
