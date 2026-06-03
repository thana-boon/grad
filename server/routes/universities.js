const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// ─── uploads/logos directory ──────────────────────────────────────────────
const LOGO_DIR = path.join(__dirname, '../uploads/logos');
fs.mkdirSync(LOGO_DIR, { recursive: true });

// ─── Multer: logo upload (disk) ───────────────────────────────────────────
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LOGO_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `logo-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  },
}).single('logo');

// ─── Multer: Excel import (memory) ───────────────────────────────────────
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์ Excel (.xlsx, .xls)'));
  },
}).single('file');

// ─── ensureTables ─────────────────────────────────────────────────────────
const ensureTables = async () => {
  // Check if universities table has old schema (column 'name' instead of 'name_th')
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'universities'
  `);
  const colNames = cols.map(c => c.COLUMN_NAME);

  if (colNames.length > 0 && colNames.includes('name') && !colNames.includes('name_th')) {
    // Old schema — migrate columns
    await db.query('ALTER TABLE `universities` CHANGE COLUMN `name` `name_th` VARCHAR(255) NOT NULL');
    if (!colNames.includes('name_en'))         await db.query('ALTER TABLE `universities` ADD COLUMN `name_en` VARCHAR(255) DEFAULT NULL AFTER `name_th`');
    if (!colNames.includes('short_name'))       await db.query('ALTER TABLE `universities` ADD COLUMN `short_name` VARCHAR(50) DEFAULT NULL AFTER `name_en`');
    if (!colNames.includes('university_type'))  await db.query('ALTER TABLE `universities` ADD COLUMN `university_type` VARCHAR(50) DEFAULT NULL AFTER `short_name`');
    if (!colNames.includes('updated_at'))       await db.query('ALTER TABLE `universities` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    // Add unique key if missing
    const [keys] = await db.query(`SHOW INDEX FROM \`universities\` WHERE Key_name = 'uk_name_th'`);
    if (!keys.length) {
      await db.query('ALTER TABLE `universities` ADD UNIQUE KEY `uk_name_th` (`name_th`)').catch(() => {});
    }
  }

  // Migrate faculties if old schema
  const [fcols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'faculties'
  `);
  const fColNames = fcols.map(c => c.COLUMN_NAME);
  if (fColNames.length > 0 && fColNames.includes('name') && !fColNames.includes('name_th')) {
    await db.query('ALTER TABLE `faculties` CHANGE COLUMN `name` `name_th` VARCHAR(255) NOT NULL');
    if (!fColNames.includes('name_en')) await db.query('ALTER TABLE `faculties` ADD COLUMN `name_en` VARCHAR(255) DEFAULT NULL AFTER `name_th`');
    const [fkeys] = await db.query(`SHOW INDEX FROM \`faculties\` WHERE Key_name = 'uk_uni_fac'`);
    if (!fkeys.length) {
      await db.query('ALTER TABLE `faculties` ADD UNIQUE KEY `uk_uni_fac` (`university_id`, `name_th`)').catch(() => {});
    }
  }

  // Create tables if not exist (new schema)
  if (colNames.length === 0) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`universities\` (
        \`id\`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`name_th\`         VARCHAR(255) NOT NULL,
        \`name_en\`         VARCHAR(255) DEFAULT NULL,
        \`short_name\`      VARCHAR(50)  DEFAULT NULL,
        \`university_type\` VARCHAR(50)  DEFAULT NULL,
        \`logo_url\`        TEXT         DEFAULT NULL,
        \`created_at\`      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uk_name_th\` (\`name_th\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
  if (fColNames.length === 0) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`faculties\` (
        \`id\`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`university_id\` INT UNSIGNED NOT NULL,
        \`name_th\`       VARCHAR(255) NOT NULL,
        \`name_en\`       VARCHAR(255) DEFAULT NULL,
        \`created_at\`    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uk_uni_fac\` (\`university_id\`, \`name_th\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // Programs table — check and create/migrate
  const [pcols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'programs'
  `);
  const pColNames = pcols.map(c => c.COLUMN_NAME);
  if (pColNames.length > 0 && pColNames.includes('name') && !pColNames.includes('program_name_th')) {
    await db.query('ALTER TABLE `programs` CHANGE COLUMN `name` `program_name_th` VARCHAR(500) NOT NULL');
    if (!pColNames.includes('program_name_en')) await db.query('ALTER TABLE `programs` ADD COLUMN `program_name_en` VARCHAR(500) DEFAULT NULL AFTER `program_name_th`');
    if (!pColNames.includes('campus'))          await db.query('ALTER TABLE `programs` ADD COLUMN `campus` VARCHAR(100) DEFAULT NULL AFTER `faculty_id`');
    if (!pColNames.includes('group_field'))     await db.query('ALTER TABLE `programs` ADD COLUMN `group_field` VARCHAR(100) DEFAULT NULL AFTER `campus`');
    if (!pColNames.includes('field_name_th'))   await db.query('ALTER TABLE `programs` ADD COLUMN `field_name_th` VARCHAR(255) DEFAULT NULL AFTER `group_field`');
    if (!pColNames.includes('field_name_en'))   await db.query('ALTER TABLE `programs` ADD COLUMN `field_name_en` VARCHAR(255) DEFAULT NULL AFTER `field_name_th`');
    if (!pColNames.includes('program_type'))    await db.query('ALTER TABLE `programs` ADD COLUMN `program_type` VARCHAR(50) DEFAULT NULL AFTER `program_name_en`');
  }
  // Drop any old unique key on programs (uk_faculty_program) — programs can have same name with diff campus/type
  if (pColNames.length > 0) {
    const [pkeys] = await db.query(`SHOW INDEX FROM \`programs\` WHERE Key_name = 'uk_faculty_program'`);
    if (pkeys.length) await db.query('ALTER TABLE `programs` DROP INDEX `uk_faculty_program`');
    // Ensure program_type column exists (even on already-migrated tables)
    if (!pColNames.includes('program_type')) {
      await db.query('ALTER TABLE `programs` ADD COLUMN `program_type` VARCHAR(50) DEFAULT NULL');
    }
  }
  if (pColNames.length === 0) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`programs\` (
        \`id\`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`university_id\`   INT UNSIGNED NOT NULL,
        \`faculty_id\`      INT UNSIGNED DEFAULT NULL,
        \`campus\`          VARCHAR(255) DEFAULT NULL,
        \`faculty_name\`    VARCHAR(255) DEFAULT NULL,
        \`group_field\`     VARCHAR(255) DEFAULT NULL,
        \`field_name_th\`   VARCHAR(255) DEFAULT NULL,
        \`program_name_th\` VARCHAR(500) NOT NULL,
        \`program_type\`    VARCHAR(100) DEFAULT NULL,
        \`created_at\`      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } else {
    // Migration: add new columns if missing, make faculty_id nullable
    const [latestCols] = await db.query(`
      SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'programs'
    `);
    const latestColMap = Object.fromEntries(latestCols.map(c => [c.COLUMN_NAME, c]));

    // Make faculty_id nullable (required for new import that doesn't use faculties FK)
    if (latestColMap['faculty_id'] && latestColMap['faculty_id'].IS_NULLABLE === 'NO') {
      await db.query('ALTER TABLE `programs` MODIFY COLUMN `faculty_id` INT UNSIGNED DEFAULT NULL').catch(() => {});
    }
    if (!latestColMap['university_id']) {
      await db.query('ALTER TABLE `programs` ADD COLUMN `university_id` INT UNSIGNED DEFAULT NULL AFTER `id`');
      await db.query(`UPDATE \`programs\` p JOIN \`faculties\` f ON f.id = p.faculty_id SET p.university_id = f.university_id`).catch(() => {});
    }
    if (!latestColMap['faculty_name']) {
      await db.query('ALTER TABLE `programs` ADD COLUMN `faculty_name` VARCHAR(255) DEFAULT NULL AFTER `university_id`');
      await db.query(`UPDATE \`programs\` p JOIN \`faculties\` f ON f.id = p.faculty_id SET p.faculty_name = f.name_th`).catch(() => {});
    }
  }
};

// ─── GET /api/universities ────────────────────────────────────────────────
// เรียงตามประเภท (ทปอ. → ราชภัฏ → ราชมงคล → เอกชน → อื่นๆ) แล้วตามชื่อ
const TYPE_ORDER = `CASE university_type WHEN 'ทปอ.' THEN 1 WHEN 'ราชภัฏ' THEN 2 WHEN 'ราชมงคล' THEN 3 WHEN 'เอกชน' THEN 4 ELSE 5 END, name_th`;

router.get('/', async (req, res) => {
  try {
    await ensureTables();
    const { search } = req.query;
    let rows;
    if (search) {
      const q = `%${search}%`;
      [rows] = await db.query(
        `SELECT id, name_th AS name, name_en, short_name, university_type, logo_url
         FROM \`universities\`
         WHERE name_th LIKE ? OR name_en LIKE ? OR short_name LIKE ?
         ORDER BY ${TYPE_ORDER}`,
        [q, q, q]
      );
    } else {
      [rows] = await db.query(
        `SELECT id, name_th AS name, name_en, short_name, university_type, logo_url
         FROM \`universities\`
         ORDER BY ${TYPE_ORDER}`
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/universities (manual add) ──────────────────────────────────
router.post('/', verifyToken, adminOnly, (req, res) => {
  logoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    const { name, short_name, name_en, university_type } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'กรุณากรอกชื่อมหาวิทยาลัย' });
    try {
      await ensureTables();
      let logo_url = req.body.logo_url?.trim() || null;
      if (req.file) logo_url = `/uploads/logos/${req.file.filename}`;
      await db.query(
        'INSERT INTO `universities` (name_th, name_en, short_name, university_type, logo_url) VALUES (?, ?, ?, ?, ?)',
        [name.trim(), name_en?.trim() || null, short_name?.trim() || null, university_type?.trim() || null, logo_url]
      );
      res.status(201).json({ message: 'เพิ่มมหาวิทยาลัยสำเร็จ' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'มีชื่อนี้อยู่แล้ว' });
      res.status(500).json({ message: err.message });
    }
  });
});

// ─── PUT /api/universities/:id ────────────────────────────────────────────
router.put('/:id', verifyToken, adminOnly, (req, res) => {
  logoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    const { id } = req.params;
    const { name, short_name, name_en, university_type } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'กรุณากรอกชื่อมหาวิทยาลัย' });
    try {
      let logo_url = req.body.logo_url?.trim() || null;
      if (req.file) logo_url = `/uploads/logos/${req.file.filename}`;
      if (logo_url !== null) {
        await db.query(
          'UPDATE `universities` SET name_th=?, name_en=?, short_name=?, university_type=?, logo_url=? WHERE id=?',
          [name.trim(), name_en?.trim() || null, short_name?.trim() || null, university_type?.trim() || null, logo_url, id]
        );
      } else {
        await db.query(
          'UPDATE `universities` SET name_th=?, name_en=?, short_name=?, university_type=? WHERE id=?',
          [name.trim(), name_en?.trim() || null, short_name?.trim() || null, university_type?.trim() || null, id]
        );
      }
      res.json({ message: 'อัปเดตสำเร็จ' });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
});

// ─── DELETE /api/universities/clear-all ─────────────────────────────────
// ล้างข้อมูลทั้งหมด (universities, faculties, programs) + logo files
router.delete('/clear-all', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    // ลบ logo files ทั้งหมด
    if (fs.existsSync(LOGO_DIR)) {
      for (const f of fs.readdirSync(LOGO_DIR)) {
        try { fs.unlinkSync(path.join(LOGO_DIR, f)); } catch {}
      }
    }
    // ลบข้อมูลทั้งหมด (order matters: programs → faculties → universities)
    await db.query('DELETE FROM `programs`');
    await db.query('DELETE FROM `faculties`');
    await db.query('DELETE FROM `universities`');
    // Reset auto-increment
    await db.query('ALTER TABLE `programs` AUTO_INCREMENT = 1');
    await db.query('ALTER TABLE `faculties` AUTO_INCREMENT = 1');
    await db.query('ALTER TABLE `universities` AUTO_INCREMENT = 1');
    res.json({ message: 'ล้างข้อมูลทั้งหมดสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/universities/:id ─────────────────────────────────────────
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT logo_url FROM `universities` WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
    if (rows[0].logo_url?.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', rows[0].logo_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.query('DELETE FROM `universities` WHERE id = ?', [req.params.id]);
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/universities/sample-excel ──────────────────────────────────
// ดาวน์โหลดไฟล์ตัวอย่างสำหรับ Import Excel
router.get('/sample-excel', verifyToken, adminOnly, (req, res) => {
  try {
    const sampleData = [
      {
        university_type_name_th: 'ทปอ.',
        university_name_th:      'มหาวิทยาลัยตัวอย่าง',
        campus_name_th:          'วิทยาเขตหลัก',
        faculty_name_th:         'คณะวิศวกรรมศาสตร์',
        group_field_th:          'วิศวกรรมศาสตร์',
        field_name_th:           'วิศวกรรมคอมพิวเตอร์',
        program_name_th:         'หลักสูตรวิศวกรรมศาสตรบัณฑิต สาขาวิชาวิศวกรรมคอมพิวเตอร์',
        program_type_name_th:    'ภาษาไทย ปกติ',
      },
      {
        university_type_name_th: 'ทปอ.',
        university_name_th:      'มหาวิทยาลัยตัวอย่าง',
        campus_name_th:          'วิทยาเขตหลัก',
        faculty_name_th:         'คณะวิศวกรรมศาสตร์',
        group_field_th:          'วิศวกรรมศาสตร์',
        field_name_th:           'วิศวกรรมคอมพิวเตอร์',
        program_name_th:         'หลักสูตรวิศวกรรมศาสตรบัณฑิต สาขาวิชาวิศวกรรมคอมพิวเตอร์',
        program_type_name_th:    'นานาชาติ',
      },
      {
        university_type_name_th: 'ทปอ.',
        university_name_th:      'มหาวิทยาลัยตัวอย่าง',
        campus_name_th:          'วิทยาเขตหลัก',
        faculty_name_th:         'คณะวิทยาศาสตร์',
        group_field_th:          'วิทยาศาสตร์',
        field_name_th:           'ฟิสิกส์',
        program_name_th:         'หลักสูตรวิทยาศาสตรบัณฑิต สาขาวิชาฟิสิกส์',
        program_type_name_th:    'ภาษาไทย ปกติ',
      },
      {
        university_type_name_th: 'ราชภัฏ',
        university_name_th:      'มหาวิทยาลัยราชภัฏตัวอย่าง',
        campus_name_th:          'วิทยาเขตหลัก',
        faculty_name_th:         'คณะครุศาสตร์',
        group_field_th:          'ครุศาสตร์/ศึกษาศาสตร์',
        field_name_th:           'การศึกษาปฐมวัย',
        program_name_th:         'หลักสูตรครุศาสตรบัณฑิต สาขาวิชาการศึกษาปฐมวัย',
        program_type_name_th:    'ภาษาไทย ปกติ',
      },
      {
        university_type_name_th: 'เอกชน',
        university_name_th:      'มหาวิทยาลัยเอกชนตัวอย่าง',
        campus_name_th:          'วิทยาเขตหลัก',
        faculty_name_th:         'คณะบริหารธุรกิจ',
        group_field_th:          'บริหารธุรกิจ',
        field_name_th:           'การตลาด',
        program_name_th:         'หลักสูตรบริหารธุรกิจบัณฑิต สาขาวิชาการตลาด',
        program_type_name_th:    'ภาษาไทย ปกติ',
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData, {
      header: [
        'university_type_name_th',
        'university_name_th',
        'campus_name_th',
        'faculty_name_th',
        'group_field_th',
        'field_name_th',
        'program_name_th',
        'program_type_name_th',
      ],
    });
    // Column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 30 },
      { wch: 25 }, { wch: 30 }, { wch: 70 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'courses');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="university_import_sample.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/universities/import-excel ─────────────────────────────────
// ล้างข้อมูลเดิมทั้งหมด แล้ว import จาก Excel
// columns: university_type_name_th, university_name_th, campus_name_th,
//          faculty_name_th, group_field_th, field_name_th,
//          program_name_th, program_type_name_th
router.post('/import-excel', verifyToken, adminOnly, (req, res) => {
  excelUpload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ message: uploadErr.message });
    if (!req.file) return res.status(400).json({ message: 'กรุณาอัปโหลดไฟล์ Excel' });

    try {
      await ensureTables();

      // Parse Excel
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws);

      if (rawRows.length === 0) return res.status(400).json({ message: 'ไฟล์ว่างเปล่า' });

      const requiredCols = ['university_name_th', 'faculty_name_th', 'program_name_th'];
      for (const col of requiredCols) {
        if (!(col in rawRows[0])) return res.status(400).json({ message: `ไม่พบคอลัมน์ "${col}" ในไฟล์` });
      }

      const totalRaw = rawRows.length;
      const rows = rawRows;

      // ── กำจัดแถวซ้ำใน Excel ก่อน import (dedup แทน block) ──────────
      {
        const seen = new Set();
        const deduped = [];
        for (const r of rows) {
          const uniName  = (r.university_name_th  || '').trim();
          const facName  = (r.faculty_name_th      || '').trim();
          const campus   = (r.campus_name_th       || '').trim();
          const field    = (r.field_name_th        || '').trim();
          const progName = (r.program_name_th      || '').trim();
          const progType = (r.program_type_name_th || '').trim();
          if (!uniName || !facName || !progName) continue;
          const key = `${uniName}::${campus}::${facName}::${field}::${progName}::${progType}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(r);
          }
        }
        // replace rows with deduped list
        rows.splice(0, rows.length, ...deduped);
      }

      // ล้าง logo files เดิม
      if (fs.existsSync(LOGO_DIR)) {
        for (const f of fs.readdirSync(LOGO_DIR)) {
          fs.unlinkSync(path.join(LOGO_DIR, f));
        }
      }

      // ล้าง DB (ลำดับ FK: programs → faculties → universities)
      await db.query('DELETE FROM `programs`');
      await db.query('DELETE FROM `faculties`');
      await db.query('DELETE FROM `universities`');
      await db.query('ALTER TABLE `programs` AUTO_INCREMENT = 1');
      await db.query('ALTER TABLE `faculties` AUTO_INCREMENT = 1');
      await db.query('ALTER TABLE `universities` AUTO_INCREMENT = 1');

      // ── Build university list (deduplicate) ───────────────────────────
      const uniMap = new Map(); // name_th → id
      const uniOrder = [];
      for (const r of rows) {
        const name_th = (r.university_name_th || '').trim();
        if (!name_th || uniMap.has(name_th)) continue;
        uniMap.set(name_th, null);
        uniOrder.push({
          name_th,
          university_type: (r.university_type_name_th || '').trim() || null,
        });
      }

      for (const u of uniOrder) {
        const [result] = await db.query(
          'INSERT INTO `universities` (name_th, university_type) VALUES (?, ?)',
          [u.name_th, u.university_type]
        );
        uniMap.set(u.name_th, result.insertId);
      }

      // ── Insert programs (flat, university_id stored directly) ─────────
      let programCount = 0;
      const progInserts = [];
      for (const r of rows) {
        const uniName  = (r.university_name_th      || '').trim();
        const facName  = (r.faculty_name_th          || '').trim();
        const progName = (r.program_name_th          || '').trim();
        if (!uniName || !facName || !progName) continue;
        const uniId = uniMap.get(uniName);
        if (!uniId) continue;
        progInserts.push([
          uniId,
          (r.campus_name_th      || '').trim() || null,
          facName,
          (r.group_field_th      || '').trim() || null,
          (r.field_name_th       || '').trim() || null,
          progName,
          (r.program_type_name_th || '').trim() || null,
        ]);
      }

      // Batch insert programs (chunks of 200)
      const CHUNK = 200;
      for (let i = 0; i < progInserts.length; i += CHUNK) {
        const chunk = progInserts.slice(i, i + CHUNK);
        const [result] = await db.query(
          `INSERT INTO \`programs\`
           (university_id, campus, faculty_name, group_field, field_name_th, program_name_th, program_type)
           VALUES ?`,
          [chunk]
        );
        programCount += result.affectedRows;
      }

      res.json({
        message: `Import Excel สำเร็จ`,
        universities: uniOrder.length,
        faculties: 0,
        programs: programCount,
        skippedDuplicates: totalRaw - rows.length,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
});

// ─── POST /api/universities/sync-wiki-list ────────────────────────────────
// ดึงรายชื่อมหาวิทยาลัยจาก Wikipedia Category API (ไม่ขึ้นกับ structure ของหน้า)
router.post('/sync-wiki-list', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

    // categories ที่พิสูจน์แล้วว่ามีในวิกิพีเดียไทย
    const CATEGORIES = [
      { cat: 'หมวดหมู่:สถาบันอุดมศึกษาในกำกับของรัฐ', type: 'ทปอ.' },
      { cat: 'หมวดหมู่:มหาวิทยาลัยราชภัฏ',             type: 'ราชภัฏ' },
      { cat: 'หมวดหมู่:มหาวิทยาลัยเทคโนโลยีราชมงคล',   type: 'ราชมงคล' },
      { cat: 'หมวดหมู่:สถาบันอุดมศึกษาเอกชนในประเทศไทย', type: 'เอกชน' },
    ];

    // helper: ดึงสมาชิก category ทั้งหมด (pagination)
    const getCategoryMembers = async (catTitle) => {
      const members = [];
      let cmcontinue = null;
      do {
        const url = `https://th.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(catTitle)}&cmlimit=50&cmtype=page&format=json${cmcontinue ? '&cmcontinue=' + encodeURIComponent(cmcontinue) : ''}`;
        const r = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(12000) });
        if (!r.ok) break;
        const d = await r.json();
        const pages = d?.query?.categorymembers || [];
        members.push(...pages);
        cmcontinue = d?.continue?.cmcontinue || null;
      } while (cmcontinue);
      return members;
    };

    // 1. ดึงรายชื่อทุก category
    const uniList = []; // { wiki_title, type }
    for (const { cat, type } of CATEGORIES) {
      const members = await getCategoryMembers(cat);
      for (const m of members) {
        const title = m.title;
        // กรอง: ต้องมีคำสำคัญ ไม่ใช่บทความทั่วไป
        if (
          (title.includes('มหาวิทยาลัย') || title.includes('สถาบัน') || title.includes('วิทยาลัย')) &&
          !title.startsWith('หมวดหมู่:') && !title.startsWith('รายนาม') &&
          !title.startsWith('กีฬา') && !title.startsWith('วัน')
        ) {
          if (!uniList.find(u => u.wiki_title === title)) {
            uniList.push({ wiki_title: title, name_th: title, type });
          }
        }
      }
    }

    if (uniList.length === 0) {
      return res.status(422).json({ message: 'ไม่สามารถดึงข้อมูลจาก Wikipedia ได้ กรุณาลองใหม่' });
    }

    // 2. เทียบกับ DB ที่มีอยู่
    const [existing] = await db.query('SELECT name_th FROM `universities`');
    const existingSet = new Set(existing.map(u => u.name_th));
    const toAdd = uniList.filter(u => !existingSet.has(u.name_th));

    // 3. ดึงรายละเอียด + โลโก้แล้ว INSERT
    let added = 0;
    const CONCURRENCY = 3;

    const processNew = async (uni) => {
      try {
        const url = `https://th.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(uni.wiki_title)}&prop=revisions|pageimages&rvprop=content&pithumbsize=400&format=json&redirects=1`;
        const r2 = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(12000) });
        let name_en = null, short_name = null, logoUrl = null, displayName = uni.name_th;

        if (r2.ok) {
          const d2 = await r2.json();
          const page = Object.values(d2?.query?.pages || {})[0];
          if (!page || page.missing !== undefined) return;
          // ถ้า redirect ให้ใช้ชื่อหน้าจริง
          if (d2?.query?.redirects?.[0]?.to) displayName = d2.query.redirects[0].to;
          logoUrl = page?.thumbnail?.source || null;
          const wikitext = page?.revisions?.[0]?.['*'] || '';
          const enM = wikitext.match(/\|\s*ชื่ออังกฤษ\s*=\s*([^\n|{}[\]<]+)/);
          if (enM) name_en = enM[1].trim() || null;
          const shortM = wikitext.match(/\|\s*ชื่อย่อ\s*=\s*([^\n|{}[\]<]+)/);
          if (shortM) short_name = shortM[1].replace(/\[\[.*?\]\]/g, '').trim() || null;
        }

        const [ins] = await db.query(
          'INSERT IGNORE INTO `universities` (name_th, name_en, short_name, university_type) VALUES (?, ?, ?, ?)',
          [displayName, name_en, short_name, uni.type]
        );

        if (ins.affectedRows && ins.insertId && logoUrl) {
          try {
            const imgRes = await fetch(logoUrl, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(15000) });
            if (imgRes.ok) {
              const ct = imgRes.headers.get('content-type') || '';
              if (!ct.includes('svg') && !ct.includes('text')) {
                const ext = ct.includes('png') ? '.png' : '.jpg';
                const filename = `logo-wiki-${ins.insertId}-${Date.now()}${ext}`;
                fs.writeFileSync(path.join(LOGO_DIR, filename), Buffer.from(await imgRes.arrayBuffer()));
                await db.query('UPDATE `universities` SET logo_url = ? WHERE id = ?', [`/uploads/logos/${filename}`, ins.insertId]);
              }
            }
          } catch {}
        }

        if (ins.affectedRows) added++;
      } catch {}
    };

    for (let i = 0; i < toAdd.length; i += CONCURRENCY) {
      await Promise.all(toAdd.slice(i, i + CONCURRENCY).map(processNew));
    }

    res.json({
      message: `เพิ่มมหาวิทยาลัยจาก Wikipedia สำเร็จ ${added} แห่ง (พบทั้งหมด ${uniList.length} แห่ง มีในระบบแล้ว ${uniList.length - toAdd.length})`,
      added,
      skipped: uniList.length - toAdd.length,
      total: uniList.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/universities/sync-logos ───────────────────────────────────
// ค้นหาโลโก้จาก Wikipedia (ภาษาไทย) ตามชื่อมหาวิทยาลัย
router.post('/sync-logos', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    const { force } = req.body;

    const [unis] = await db.query(
      force
        ? 'SELECT id, name_th, name_en, short_name FROM `universities` ORDER BY id'
        : 'SELECT id, name_th, name_en, short_name FROM `universities` WHERE (logo_url IS NULL OR logo_url = "") ORDER BY id'
    );

    if (unis.length === 0) {
      return res.json({ message: 'ทุกมหาวิทยาลัยมีโลโก้แล้ว', found: 0, total: 0 });
    }

    let found = 0;
    const CONCURRENCY = 3;

    // ── helper: ดึง thumbnail URL จาก Wikipedia page object ────────────────
    const getImgFromWikiPage = (pages) => {
      const page = Object.values(pages)[0];
      if (!page || page.missing !== undefined) return null;
      return page?.thumbnail?.source || null;
    };

    // ── helper: ดึง URL จริงของ File: ผ่าน imageinfo (400px thumb) ──────────
    const getFileUrl = async (lang, filename) => {
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json`;
        const r = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const data = await r.json();
        const p = Object.values(data?.query?.pages || {})[0];
        return p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url || null;
      } catch { return null; }
    };

    // ── helper: ไฟล์ที่ไม่ใช่โลโก้ (generic icons) ────────────────────────
    const GENERIC = /^(flag of|commons-logo|wiki letter|information icon|diploma|edit-|sound-|question|yes icon|no icon|ambox|nuvola|crystal|ไฟล์:flag|speaker|loudspeaker|thai.*provinces|amphoe)/i;
    // keywords ที่บ่งบอกว่าเป็นโลโก้/ตรา
    const LOGO_KW  = /logo|emblem|crest|coat|ตรา|ตราสัญลักษณ์|badge|monogram/i;
    // keywords ที่บ่งบอกว่าเป็นของมหาวิทยาลัย
    const UNI_KW   = /university|rajabhat|rajamangala|kmutt|kmitl|rmutt|rmut|walailak|burapha|ubon|silpakorn|dusit|stamford|rangsit|siam|kku|cmu|cru|crru|kmutnb|snru|psru|skru|nru|pkru|ssru|vru|mcru|nsru|cpru|udru|ybru|nkrafa|yru/i;

    // ── helper: เลือกโลโก้ที่ดีที่สุดจาก images list ──────────────────────
    const pickBestLogoFile = (images = []) => {
      const scored = images
        .map(img => {
          const name = img.replace(/^(?:ไฟล์:|File:|Image:)/i, '').trim();
          if (GENERIC.test(name)) return null;
          // ตัดนามสกุลมาตรวจ
          const isSvg = /\.svg$/i.test(name);
          const isPng = /\.png$/i.test(name);
          const hasLogo = LOGO_KW.test(name);
          const hasUni  = UNI_KW.test(name);
          const hasSeal = /seal/i.test(name);

          let score = 0;
          if (hasLogo && hasUni) score += 12; // ดีสุด: logo + ชื่อมหาลัย
          else if (hasLogo)      score += 8;  // logo keyword แต่ไม่รู้ว่าของมหาลัย
          else if (hasUni)       score += 6;  // มีชื่อมหาลัยในไฟล์ → น่าจะโลโก้
          else if (hasSeal)      score += 3;  // seal ล้วนๆ → อาจเป็นตราจังหวัด
          if (score === 0) return null;        // ไม่มี keyword เลย ข้าม
          if (isSvg) score += 2;
          if (isPng) score += 1;
          return { name, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      return scored[0] ? scored[0].name : null;
    };

    // ── helper: ดึงโลโก้จาก Wikipedia page (pageimages → infobox image → images list) ─
    const getLogoFromPage = async (lang, title) => {
      try {
        // ดึง pageimages + images + revisions ในคำขอเดียว
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages|images|revisions&pithumbsize=400&imlimit=30&rvprop=content&rvslots=main&format=json&redirects=1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(12000) });
        if (!r.ok) return null;
        const data = await r.json();
        const page = Object.values(data?.query?.pages || {})[0];
        if (!page || page.missing !== undefined) return null;

        // 1. pageimages thumbnail (ถ้ามี)
        const thumb = page?.thumbnail?.source;
        if (thumb) return thumb;

        // 2. infobox: อ่าน field image/ตรา/logo จาก wikitext
        const wikitext = page?.revisions?.[0]?.slots?.main?.['*'] || page?.revisions?.[0]?.['*'] || '';
        if (wikitext) {
          const m = wikitext.match(/\|\s*(?:image|ตรา|ตราสัญลักษณ์|logo_university|logo|image_name|รูปภาพ)\s*=\s*([^\n|{}<>]+)/i);
          if (m) {
            let f = m[1].trim()
              .replace(/^\[\[(?:ไฟล์:|File:|Image:)?/i, '')
              .replace(/\]\].*$/, '').replace(/\|.*$/, '')
              .replace(/\.(svg|png|jpg|jpeg)\s.*/i, (_, ext) => '.' + ext)
              .trim();
            if (f && /\.(svg|png|jpg|jpeg)$/i.test(f)) {
              const fileUrl = await getFileUrl(lang, f);
              if (fileUrl) return fileUrl;
            }
          }
        }

        // 3. images list: เลือกไฟล์ที่ score สูงสุด
        const imgTitles = (page?.images || []).map(i => i.title || '');
        const best = pickBestLogoFile(imgTitles);
        if (best) {
          const fileUrl = await getFileUrl(lang, best);
          if (fileUrl) return fileUrl;
        }

        return null;
      } catch { return null; }
    };

    // ── helper: หา Wikipedia page title (direct → search) ─────────────────
    const findTitle = async (lang, query) => {
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=info&format=json&redirects=1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(6000) });
        if (r.ok) {
          const data = await r.json();
          const page = Object.values(data?.query?.pages || {})[0];
          if (page && page.missing === undefined) {
            return data?.query?.redirects?.slice(-1)[0]?.to || query;
          }
        }
      } catch {}
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=0&srlimit=1&format=json`;
        const r = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          return data?.query?.search?.[0]?.title || null;
        }
      } catch {}
      return null;
    };

    // ── helper: ค้นหา Wikipedia ด้วย Search API แล้วเอา pageimages ────────
    const searchWikiImg = async (lang, query) => {
      try {
        const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=0&srlimit=1&format=json`;
        const sr = await fetch(searchUrl, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(8000) });
        if (!sr.ok) return null;
        const srData = await sr.json();
        const title = srData?.query?.search?.[0]?.title;
        if (!title) return null;
        return await getLogoFromPage(lang, title);
      } catch { return null; }
    };

    // ── helper: direct lookup ด้วยชื่อแน่นอน ──────────────────────────────
    const directWikiImg = async (lang, title) => {
      return await getLogoFromPage(lang, title);
    };

    // ── helper: download & save image ─────────────────────────────────────
    const saveImg = async (imgUrl, uniId) => {
      const imgRes = await fetch(imgUrl, {
        headers: { 'User-Agent': 'GradTrackBot/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!imgRes.ok) return false;
      const ct = imgRes.headers.get('content-type') || '';
      if (ct.includes('text/html') || ct.includes('text/plain')) return false;

      let ext;
      if (ct.includes('svg'))  ext = '.svg';
      else if (ct.includes('png')) ext = '.png';
      else if (ct.includes('webp')) ext = '.webp';
      else ext = '.jpg';
      const filename = `logo-wiki-${uniId}-${Date.now()}${ext}`;
      const filepath = path.join(LOGO_DIR, filename);

      // ลบโลโก้เก่า
      const [ex] = await db.query('SELECT logo_url FROM `universities` WHERE id = ?', [uniId]);
      const oldUrl = ex[0]?.logo_url;
      if (oldUrl?.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', oldUrl);
        if (fs.existsSync(oldPath)) try { fs.unlinkSync(oldPath); } catch {}
      }

      fs.writeFileSync(filepath, Buffer.from(await imgRes.arrayBuffer()));
      await db.query('UPDATE `universities` SET logo_url = ? WHERE id = ?', [`/uploads/logos/${filename}`, uniId]);
      return true;
    };

    const processUni = async (uni) => {
      try {
        let imgUrl = null;

        // 1. Direct lookup ชื่อไทย
        imgUrl = await getLogoFromPage('th', uni.name_th);

        // 2. Search ชื่อไทย (ถ้าตรงๆ fail)
        if (!imgUrl) imgUrl = await searchWikiImg('th', uni.name_th);

        // 3. ตัดคำนำหน้า แล้วค้น
        if (!imgUrl) {
          const stripped = uni.name_th.replace(/^(มหาวิทยาลัย|สถาบัน|วิทยาลัย)\s*/u, '').trim();
          if (stripped !== uni.name_th) imgUrl = await searchWikiImg('th', stripped);
        }

        // 4. Fallback: Wikipedia ภาษาอังกฤษ
        if (!imgUrl && uni.name_en) {
          imgUrl = await getLogoFromPage('en', uni.name_en);
          if (!imgUrl) imgUrl = await searchWikiImg('en', uni.name_en);
        }

        if (!imgUrl) return;
        const saved = await saveImg(imgUrl, uni.id);
        if (saved) found++;
      } catch {
        // ข้าม
      }
    };

    for (let i = 0; i < unis.length; i += CONCURRENCY) {
      await Promise.all(unis.slice(i, i + CONCURRENCY).map(processUni));
    }

    res.json({
      message: `ซิงค์โลโก้สำเร็จ ${found} จาก ${unis.length} มหาวิทยาลัย`,
      found,
      total: unis.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
