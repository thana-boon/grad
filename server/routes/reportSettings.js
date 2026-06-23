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
  ]) {
    await db.query(col).catch(() => {});
  }
}
ensureTable();

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
  const { congrats_text, show_quote, school_name, text_color, show_photo_frame } = req.body;
  try {
    await db.query(
      'UPDATE report_settings SET congrats_text = ?, show_quote = ?, school_name = ?, text_color = ?, show_photo_frame = ? WHERE id = 1',
      [congrats_text ?? '', show_quote ? 1 : 0, school_name ?? '', text_color ?? '#ffffff', show_photo_frame ? 1 : 0]
    );
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
