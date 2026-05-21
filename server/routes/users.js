const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse');
const db = require('../config/db');
const logger = require('../config/logger');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// multer เก็บไฟล์ใน memory (ไม่บันทึกลง disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('รองรับเฉพาะไฟล์ .csv เท่านั้น'));
    }
  },
});

// ทุก route ต้อง login และเป็น admin
router.use(verifyToken, adminOnly);

// ─── GET /api/users ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, name, role, email, created_at FROM users ORDER BY id ASC'
    );
    res.json(rows);
  } catch (err) {
    logger.error('Get users error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── POST /api/users ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { username, password, name, role, email } = req.body;

  if (!username || !password || !name || !role) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (!['admin', 'student'].includes(role)) {
    return res.status(400).json({ message: 'role ไม่ถูกต้อง' });
  }

  try {
    const [exist] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (exist.length > 0) {
      return res.status(409).json({ message: `username "${username}" มีอยู่แล้ว` });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, password, name, role, email) VALUES (?, ?, ?, ?, ?)',
      [username, hashed, name, role, email || null]
    );

    logger.info('User created', { username, role, by: req.user.id });
    res.status(201).json({ message: 'สร้าง account สำเร็จ', id: result.insertId });
  } catch (err) {
    logger.error('Create user error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── PUT /api/users/:id ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, name, role, email } = req.body;

  if (!username || !name || !role) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  if (!['admin', 'student'].includes(role)) {
    return res.status(400).json({ message: 'role ไม่ถูกต้อง' });
  }

  try {
    // ตรวจว่า username ซ้ำกับ user อื่น
    const [exist] = await db.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username, id]
    );
    if (exist.length > 0) {
      return res.status(409).json({ message: `username "${username}" มีอยู่แล้ว` });
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE users SET username=?, password=?, name=?, role=?, email=? WHERE id=?',
        [username, hashed, name, role, email || null, id]
      );
    } else {
      await db.query(
        'UPDATE users SET username=?, name=?, role=?, email=? WHERE id=?',
        [username, name, role, email || null, id]
      );
    }

    logger.info('User updated', { targetId: id, by: req.user.id });
    res.json({ message: 'อัปเดต account สำเร็จ' });
  } catch (err) {
    logger.error('Update user error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── DELETE /api/users/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // ห้ามลบตัวเอง
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ message: 'ไม่สามารถลบ account ตัวเองได้' });
  }

  try {
    const [rows] = await db.query('SELECT id FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบ account นี้' });
    }

    await db.query('DELETE FROM users WHERE id = ?', [id]);
    logger.info('User deleted', { targetId: id, by: req.user.id });
    res.json({ message: 'ลบ account สำเร็จ' });
  } catch (err) {
    logger.error('Delete user error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── POST /api/users/import ──────────────────────────────────────
// รูปแบบ CSV: username,password,name,role,email(optional)
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'กรุณาแนบไฟล์ CSV' });
  }

  const results = { success: 0, skipped: 0, errors: [] };

  try {
    const records = await new Promise((resolve, reject) => {
      const rows = [];
      parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
    });

    for (const row of records) {
      const { username, password, name, role, email } = row;

      if (!username || !password || !name || !['admin', 'student'].includes(role)) {
        results.errors.push({ username: username || '?', reason: 'ข้อมูลไม่ครบหรือ role ไม่ถูกต้อง' });
        continue;
      }

      const [exist] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
      if (exist.length > 0) {
        results.skipped++;
        results.errors.push({ username, reason: 'username ซ้ำ ข้ามไป' });
        continue;
      }

      const hashed = await bcrypt.hash(password, 10);
      await db.query(
        'INSERT INTO users (username, password, name, role, email) VALUES (?, ?, ?, ?, ?)',
        [username, hashed, name, role, email || null]
      );
      results.success++;
    }

    logger.info('Users imported via CSV', { ...results, by: req.user.id });
    res.json({ message: `นำเข้าสำเร็จ ${results.success} account`, ...results });
  } catch (err) {
    logger.error('Import users error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอ่านไฟล์ CSV' });
  }
});

module.exports = router;
