// =============================================================================
// /api/backups — สำรองข้อมูลลงเครื่อง server, ดาวน์โหลด, อัปโหลดกลับ, กู้คืน
// =============================================================================
// admin เท่านั้นทุก endpoint — ไฟล์สำรองมีข้อมูลทุกตารางรวมกันอยู่ในไฟล์เดียว
// ครูที่เป็น read-only จึงไม่ควรเห็นแม้แต่รายการไฟล์
const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');

const logger = require('../config/logger');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const { logActivity } = require('./activityLogs');
const backup = require('../services/backup');

const MAX_UPLOAD_MB = Math.max(1, Number(process.env.BACKUP_MAX_UPLOAD_MB || 1024));

// กู้คืนพร้อมกันสองคน = แข่งกันเขียนตารางเดียวกัน — กันไว้ทั้งโปรเซส
// (ระบบนี้รันคอนเทนเนอร์เดียว ล็อกในหน่วยความจำจึงพอ)
let restoring = false;

const actorOf = (req) => ({
  username: req.user?.username || String(req.user?.id || ''),
  name: req.user?.name || '',
  role: req.user?.role || '',
});

// ─── Multer: รับไฟล์สำรองที่อัปโหลดกลับเข้ามา ────────────────────────────────
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await backup.ensureDir();
      cb(null, backup.BACKUP_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    // ชื่อเดิมของผู้ใช้เก็บไว้พอให้จำได้ว่าไฟล์ไหนคือไฟล์ไหน แต่ต้องผ่านตัวกรอง
    // ให้เหลือเฉพาะอักขระที่ resolveBackupPath ยอมรับ
    const base = path
      .basename(file.originalname || '')
      .replace(/\.tar\.gz$/i, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    cb(null, `${backup.PREFIX.UPLOADED}${backup.stamp()}${base ? `-${base}` : ''}.tar.gz`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/\.tar\.gz$/i.test(file.originalname || '')) {
      return cb(new Error('รับเฉพาะไฟล์ .tar.gz ที่ได้จากปุ่มดาวน์โหลดของระบบนี้'));
    }
    cb(null, true);
  },
});

// ─── GET /api/backups — รายการไฟล์ที่เก็บอยู่บน server ───────────────────────
router.get('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const backups = await backup.listBackups();
    res.json({
      backups,
      keep: backup.KEEP,
      dir: backup.BACKUP_DIR,
      maxUploadMb: MAX_UPLOAD_MB,
      tables: backup.TABLES,
      totalBytes: backups.reduce((sum, b) => sum + b.size, 0),
    });
  } catch (err) {
    logger.error('อ่านรายการไฟล์สำรองไม่สำเร็จ', { error: err.message });
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/backups — สร้างไฟล์สำรองใหม่ ─────────────────────────────────
router.post('/', verifyToken, adminOnly, async (req, res) => {
  const includeUploads = req.body?.includeUploads !== false;
  const note = req.body?.note || '';
  const actor = actorOf(req);

  try {
    const result = await backup.createBackup({ includeUploads, note, actor: actor.username });
    logActivity({
      ...actor,
      action: 'create_backup',
      target: result.name,
      detail: { size: result.size, includeUploads, pruned: result.pruned },
    });
    logger.info(`สร้างไฟล์สำรอง ${result.name} (${result.size} bytes) โดย ${actor.username}`);
    res.status(201).json(result);
  } catch (err) {
    logger.error('สร้างไฟล์สำรองไม่สำเร็จ', { error: err.message });
    res.status(500).json({ message: `สร้างไฟล์สำรองไม่สำเร็จ: ${err.message}` });
  }
});

// ─── POST /api/backups/upload — อัปโหลดไฟล์สำรองจากเครื่องผู้ใช้ ────────────
router.post('/upload', verifyToken, adminOnly, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        message: tooBig ? `ไฟล์ใหญ่เกิน ${MAX_UPLOAD_MB} MB` : err.message,
      });
    }
    if (!req.file) return res.status(400).json({ message: 'ไม่พบไฟล์ที่อัปโหลด' });

    // ไฟล์ลงดิสก์ไปแล้ว → ตรวจว่าเป็นไฟล์สำรองของ GradTrack จริงไหม ถ้าไม่ใช่ลบทิ้ง
    // ไม่ปล่อยให้ค้างในโฟลเดอร์จนคนเข้าใจผิดว่ากู้คืนได้
    try {
      const manifest = await backup.inspectFile(req.file.path);
      if (!manifest) {
        await fsp.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          message: 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของ GradTrack (อ่าน manifest.json ไม่ได้)',
        });
      }

      const actor = actorOf(req);
      logActivity({
        ...actor,
        action: 'upload_backup',
        target: req.file.filename,
        detail: { size: req.file.size, createdAt: manifest.createdAt },
      });
      logger.info(`อัปโหลดไฟล์สำรอง ${req.file.filename} โดย ${actor.username}`);

      res.status(201).json({ name: req.file.filename, size: req.file.size, manifest });
    } catch (e) {
      await fsp.unlink(req.file.path).catch(() => {});
      res.status(400).json({ message: `อ่านไฟล์ไม่สำเร็จ: ${e.message}` });
    }
  });
});

// ─── GET /api/backups/:name/download ────────────────────────────────────────
router.get('/:name/download', verifyToken, adminOnly, async (req, res) => {
  const full = backup.resolveBackupPath(req.params.name);
  if (!full || !fs.existsSync(full)) {
    return res.status(404).json({ message: 'ไม่พบไฟล์สำรองที่เลือก' });
  }

  logActivity({ ...actorOf(req), action: 'download_backup', target: req.params.name });
  res.type('application/gzip');
  res.download(full, req.params.name, (err) => {
    // ผู้ใช้กดยกเลิกกลางคัน = เรื่องปกติ ไม่ต้องตอบอะไรซ้ำ (header ส่งไปแล้ว)
    if (err && !res.headersSent) res.status(500).json({ message: err.message });
  });
});

// ─── POST /api/backups/:name/restore ────────────────────────────────────────
router.post('/:name/restore', verifyToken, adminOnly, async (req, res) => {
  if (restoring) {
    return res.status(409).json({ message: 'มีการกู้คืนกำลังทำงานอยู่ กรุณารอให้เสร็จก่อน' });
  }

  const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
  const includeUploads = req.body?.includeUploads !== false;
  const actor = actorOf(req);

  restoring = true;
  try {
    const result = await backup.restoreBackup(req.params.name, {
      mode,
      includeUploads,
      actor: actor.username,
    });

    logActivity({
      ...actor,
      action: 'restore_backup',
      target: req.params.name,
      detail: {
        mode,
        includeUploads,
        restored: result.restored,
        uploads: result.uploads,
        safetyBackup: result.safetyBackup,
      },
    });
    logger.warn(
      `กู้คืนข้อมูลจาก ${req.params.name} (โหมด ${mode}) โดย ${actor.username} — ` +
        `ไฟล์สำรองก่อนกู้คืน: ${result.safetyBackup}`
    );

    res.json(result);
  } catch (err) {
    logger.error('กู้คืนข้อมูลไม่สำเร็จ', { error: err.message, file: req.params.name });
    res.status(err.status || 500).json({ message: err.message });
  } finally {
    restoring = false;
  }
});

// ─── DELETE /api/backups/:name ──────────────────────────────────────────────
router.delete('/:name', verifyToken, adminOnly, async (req, res) => {
  const full = backup.resolveBackupPath(req.params.name);
  if (!full || !fs.existsSync(full)) {
    return res.status(404).json({ message: 'ไม่พบไฟล์สำรองที่เลือก' });
  }

  try {
    await fsp.unlink(full);
    const actor = actorOf(req);
    logActivity({ ...actor, action: 'delete_backup', target: req.params.name });
    logger.info(`ลบไฟล์สำรอง ${req.params.name} โดย ${actor.username}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
