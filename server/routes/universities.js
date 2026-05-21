const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// ─── สร้าง uploads/logos directory ────────────────────────────────────────
const LOGO_DIR = path.join(__dirname, '../uploads/logos');
fs.mkdirSync(LOGO_DIR, { recursive: true });

// ─── Multer (disk storage สำหรับ logo) ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const logoUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  },
}).single('logo');

// ─── Helper: สร้าง table ถ้ายังไม่มี ──────────────────────────────────────
const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`universities\` (
      \`id\`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      \`name\`       VARCHAR(255) NOT NULL,
      \`short_name\` VARCHAR(50)  DEFAULT NULL,
      \`logo_url\`   TEXT         DEFAULT NULL,
      \`created_at\` TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// ─── ข้อมูล built-in (fallback ถ้า scrape ไม่ได้) ────────────────────────
const BUILTIN_UNIVERSITIES = [
  // มหาวิทยาลัยรัฐ (เก่า)
  { name: 'จุฬาลงกรณ์มหาวิทยาลัย', short_name: 'จุฬาฯ' },
  { name: 'มหาวิทยาลัยเกษตรศาสตร์', short_name: 'มก.' },
  { name: 'มหาวิทยาลัยเชียงใหม่', short_name: 'มช.' },
  { name: 'มหาวิทยาลัยธรรมศาสตร์', short_name: 'มธ.' },
  { name: 'มหาวิทยาลัยมหิดล', short_name: 'มม.' },
  { name: 'มหาวิทยาลัยศิลปากร', short_name: 'มศก.' },
  { name: 'มหาวิทยาลัยสงขลานครินทร์', short_name: 'มอ.' },
  { name: 'มหาวิทยาลัยขอนแก่น', short_name: 'มข.' },
  { name: 'มหาวิทยาลัยบูรพา', short_name: 'มบ.' },
  { name: 'มหาวิทยาลัยนเรศวร', short_name: 'มน.' },
  { name: 'มหาวิทยาลัยศรีนครินทรวิโรฒ', short_name: 'มศว' },
  { name: 'มหาวิทยาลัยรามคำแหง', short_name: 'มร.' },
  { name: 'มหาวิทยาลัยสุโขทัยธรรมาธิราช', short_name: 'มสธ.' },
  { name: 'มหาวิทยาลัยแม่ฟ้าหลวง', short_name: 'มฟล.' },
  { name: 'มหาวิทยาลัยวลัยลักษณ์', short_name: 'มวล.' },
  { name: 'มหาวิทยาลัยแม่โจ้', short_name: 'มจ.' },
  { name: 'มหาวิทยาลัยอุบลราชธานี', short_name: 'มอบ.' },
  { name: 'มหาวิทยาลัยมหาสารคาม', short_name: 'มมส.' },
  { name: 'มหาวิทยาลัยทักษิณ', short_name: 'มทษ.' },
  { name: 'มหาวิทยาลัยพะเยา', short_name: 'มพ.' },
  { name: 'มหาวิทยาลัยนครพนม', short_name: 'มนพ.' },
  { name: 'มหาวิทยาลัยกาฬสินธุ์', short_name: 'มกส.' },
  { name: 'มหาวิทยาลัยนราธิวาสราชนครินทร์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏกรุงเทพ', short_name: 'มรก.' },
  // มจพ. / มจธ. / สจล.
  { name: 'มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี', short_name: 'มจธ.' },
  { name: 'มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ', short_name: 'มจพ.' },
  { name: 'สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง', short_name: 'สจล.' },
  { name: 'มหาวิทยาลัยเทคโนโลยีสุรนารี', short_name: 'มทส.' },
  { name: 'สถาบันเทคโนโลยีปทุมวัน', short_name: 'สทป.' },
  // มหาวิทยาลัยราชภัฏ
  { name: 'มหาวิทยาลัยราชภัฏเชียงใหม่', short_name: 'มรชม.' },
  { name: 'มหาวิทยาลัยราชภัฏเชียงราย', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏลำปาง', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏอุตรดิตถ์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏพิบูลสงคราม', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏนครสวรรค์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏวไลยอลงกรณ์ ในพระบรมราชูปถัมภ์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏเทพสตรี', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏจันทรเกษม', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏสวนสุนันทา', short_name: 'มรสส.' },
  { name: 'มหาวิทยาลัยราชภัฏบ้านสมเด็จเจ้าพระยา', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏพระนคร', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏราชนครินทร์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏรำไพพรรณี', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏนครราชสีมา', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏบุรีรัมย์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏสุรินทร์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏศรีสะเกษ', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏอุดรธานี', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏเลย', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏสกลนคร', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏมหาสารคาม', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏร้อยเอ็ด', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏกาฬสินธุ์', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏอุบลราชธานี', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏชัยภูมิ', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏสุราษฎร์ธานี', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏนครศรีธรรมราช', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏภูเก็ต', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏสงขลา', short_name: null },
  { name: 'มหาวิทยาลัยราชภัฏยะลา', short_name: null },
  // มหาวิทยาลัยราชมงคล
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี', short_name: 'มทร.ธัญบุรี' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลกรุงเทพ', short_name: 'มทร.กรุงเทพ' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลตะวันออก', short_name: 'มทร.ตะวันออก' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลพระนคร', short_name: 'มทร.พระนคร' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลรัตนโกสินทร์', short_name: 'มทร.รัตนโกสินทร์' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา', short_name: 'มทร.ล้านนา' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลศรีวิชัย', short_name: 'มทร.ศรีวิชัย' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลสุวรรณภูมิ', short_name: 'มทร.สุวรรณภูมิ' },
  { name: 'มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน', short_name: 'มทร.อีสาน' },
  // เอกชน
  { name: 'มหาวิทยาลัยรังสิต', short_name: 'มรส.' },
  { name: 'มหาวิทยาลัยอัสสัมชัญ', short_name: 'ABAC' },
  { name: 'มหาวิทยาลัยกรุงเทพ', short_name: 'มกท.' },
  { name: 'มหาวิทยาลัยหอการค้าไทย', short_name: 'มหอการค้า' },
  { name: 'มหาวิทยาลัยธุรกิจบัณฑิตย์', short_name: 'มธบ.' },
  { name: 'มหาวิทยาลัยเกษมบัณฑิต', short_name: null },
  { name: 'มหาวิทยาลัยสยาม', short_name: null },
  { name: 'มหาวิทยาลัยนานาชาติเอเชีย-แปซิฟิก', short_name: 'AIU' },
  { name: 'มหาวิทยาลัยพายัพ', short_name: null },
  { name: 'มหาวิทยาลัยนอร์ท-เชียงใหม่', short_name: null },
  { name: 'มหาวิทยาลัยภาคกลาง', short_name: null },
  { name: 'มหาวิทยาลัยอีสเทิร์นเอเชีย', short_name: 'EAU' },
  { name: 'มหาวิทยาลัยเวสเทิร์น', short_name: null },
  { name: 'มหาวิทยาลัยนานาชาติแสตมฟอร์ด', short_name: 'SIU' },
  { name: 'มหาวิทยาลัยกรุงเทพธนบุรี', short_name: null },
  { name: 'มหาวิทยาลัยราชพฤกษ์', short_name: null },
  { name: 'มหาวิทยาลัยเจ้าพระยา', short_name: null },
  { name: 'มหาวิทยาลัยศรีปทุม', short_name: 'มศป.' },
  // สถาบัน
  { name: 'สถาบันบัณฑิตพัฒนบริหารศาสตร์', short_name: 'นิด้า' },
  { name: 'สถาบันเทคโนโลยีไทย-ญี่ปุ่น', short_name: 'TNI' },
  { name: 'สถาบันการพยาบาลศรีสวรินทิรา สภากาชาดไทย', short_name: null },
  { name: 'วิทยาลัยแพทยศาสตร์พระมงกุฎเกล้า', short_name: 'วพม.' },
];

// ─── Helper: parse HTML จาก Wikipedia ────────────────────────────────────
const isUniName = (t) =>
  (t.startsWith('มหาวิทยาลัย') || t.startsWith('สถาบัน') || t.startsWith('วิทยาลัย')) &&
  t.length > 5;

const parseWikipediaHTML = (html) => {
  const $ = cheerio.load(html);
  const results = new Map();

  $('table.wikitable').each((_ti, table) => {
    $(table)
      .find('tr')
      .each((ri, row) => {
        if (ri === 0) return;
        const cells = $(row).find('td');
        if (!cells.length) return;

        let uniName = '';
        let uniAbbr = '';

        // หาชื่อมหาวิทยาลัยในทุก cell
        cells.each((_ci, cell) => {
          const t = $(cell).text().replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
          if (!uniName && isUniName(t)) uniName = t;
        });

        // หาชื่อย่อ (text สั้น ไม่ใช่ชื่อเต็ม ไม่ใช่ link)
        if (uniName) {
          cells.each((_ci, cell) => {
            const t = $(cell).text().replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
            if (!uniAbbr && t !== uniName && t.length > 0 && t.length <= 20 && !isUniName(t) && !/^https?/.test(t)) {
              uniAbbr = t;
            }
          });
        }

        if (uniName && !results.has(uniName)) results.set(uniName, uniAbbr || null);
      });
  });

  return [...results.entries()].map(([name, short_name]) => ({ name, short_name }));
};

// ─── Source 1: Wikipedia JSON API ─────────────────────────────────────────
const scrapeWikipediaAPI = async () => {
  const params = new URLSearchParams({
    action: 'parse',
    page: 'รายชื่อมหาวิทยาลัยในประเทศไทย',
    format: 'json',
    prop: 'text',
    disablelimitreport: '1',
    redirects: '1',
  });
  const { data } = await axios.get(
    `https://th.wikipedia.org/w/api.php?${params.toString()}`,
    {
      timeout: 25000,
      headers: {
        'User-Agent': 'GradTrack/1.0 (Educational; school management system)',
        Accept: 'application/json',
      },
    }
  );
  if (data.error) throw new Error(`Wikipedia API error: ${data.error.info}`);
  const html = data?.parse?.text?.['*'];
  if (!html) throw new Error('ไม่ได้รับ HTML จาก Wikipedia API');
  return parseWikipediaHTML(html);
};

// ─── Source 2: Wikipedia direct URL ───────────────────────────────────────
const scrapeWikipediaDirect = async () => {
  const { data: html } = await axios.get(
    'https://th.wikipedia.org/wiki/รายชื่อมหาวิทยาลัยในประเทศไทย',
    {
      timeout: 25000,
      headers: {
        'User-Agent': 'GradTrack/1.0 (Educational; school management system)',
        'Accept-Language': 'th,en;q=0.9',
        Accept: 'text/html',
      },
    }
  );
  return parseWikipediaHTML(html);
};

// ─── Helper: ลอง scrape หลายแหล่ง ────────────────────────────────────────
const scrapeThaiUniversities = async () => {
  const errors = [];

  // Source 1: Wikipedia JSON API
  try {
    const results = await scrapeWikipediaAPI();
    if (results.length >= 10) return { results, source: 'Wikipedia (JSON API)' };
    errors.push(`Wikipedia JSON API: พบเพียง ${results.length} รายการ`);
  } catch (e) {
    errors.push(`Wikipedia JSON API: ${e.message}`);
  }

  // Source 2: Wikipedia direct
  try {
    const results = await scrapeWikipediaDirect();
    if (results.length >= 10) return { results, source: 'Wikipedia (direct)' };
    errors.push(`Wikipedia direct: พบเพียง ${results.length} รายการ`);
  } catch (e) {
    errors.push(`Wikipedia direct: ${e.message}`);
  }

  // Source 3: Built-in list
  console.warn('[universities] ใช้ built-in list เนื่องจาก scraping ล้มเหลว:', errors);
  return { results: BUILTIN_UNIVERSITIES, source: 'built-in list', warnings: errors };
};

// ─── Routes ───────────────────────────────────────────────────────────────

// GET  /api/universities
router.get('/', verifyToken, async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await db.query('SELECT * FROM `universities` ORDER BY `name` ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'โหลดข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// POST /api/universities/sync  ← ต้องอยู่ก่อน /:id
router.post('/sync', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTable();
    const { results: scraped, source, warnings } = await scrapeThaiUniversities();

    let added = 0;
    let skipped = 0;
    for (const u of scraped) {
      const [existing] = await db.query(
        'SELECT id FROM `universities` WHERE `name` = ?',
        [u.name]
      );
      if (existing.length === 0) {
        await db.query(
          'INSERT INTO `universities` (`name`, `short_name`) VALUES (?, ?)',
          [u.name, u.short_name || null]
        );
        added++;
      } else {
        skipped++;
      }
    }

    res.json({
      message: `Sync สำเร็จ (แหล่งข้อมูล: ${source})`,
      total: scraped.length,
      added,
      skipped,
      source,
      warnings: warnings || [],
    });
  } catch (err) {
    res.status(500).json({ message: `Sync ไม่สำเร็จ: ${err.message}` });
  }
});

// POST /api/universities  (สร้างใหม่)
router.post('/', verifyToken, adminOnly, (req, res) => {
  logoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    const { name, short_name, logo_url } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'กรุณากรอกชื่อมหาวิทยาลัย' });

    const finalLogo = req.file ? `/uploads/logos/${req.file.filename}` : (logo_url || null);
    try {
      await ensureTable();
      const [result] = await db.query(
        'INSERT INTO `universities` (`name`, `short_name`, `logo_url`) VALUES (?, ?, ?)',
        [name.trim(), short_name?.trim() || null, finalLogo]
      );
      const [rows] = await db.query('SELECT * FROM `universities` WHERE id = ?', [result.insertId]);
      res.status(201).json(rows[0]);
    } catch (err) {
      res.status(500).json({ message: 'สร้างไม่สำเร็จ', error: err.message });
    }
  });
});

// PUT /api/universities/:id
router.put('/:id', verifyToken, adminOnly, (req, res) => {
  logoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    const { id } = req.params;
    const { name, short_name, logo_url } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'กรุณากรอกชื่อมหาวิทยาลัย' });

    try {
      // ลบไฟล์เก่าถ้ามีการ upload ใหม่
      if (req.file) {
        const [existing] = await db.query(
          'SELECT logo_url FROM `universities` WHERE id = ?',
          [id]
        );
        const oldLogo = existing[0]?.logo_url;
        if (oldLogo?.startsWith('/uploads/')) {
          const oldPath = path.join(__dirname, '..', oldLogo);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }

      const finalLogo = req.file
        ? `/uploads/logos/${req.file.filename}`
        : logo_url !== undefined
        ? logo_url || null
        : undefined;

      const fields = ['`name` = ?', '`short_name` = ?'];
      const values = [name.trim(), short_name?.trim() || null];
      if (finalLogo !== undefined) {
        fields.push('`logo_url` = ?');
        values.push(finalLogo);
      }
      values.push(id);

      await db.query(`UPDATE \`universities\` SET ${fields.join(', ')} WHERE id = ?`, values);
      const [rows] = await db.query('SELECT * FROM `universities` WHERE id = ?', [id]);
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ message: 'แก้ไขไม่สำเร็จ', error: err.message });
    }
  });
});

// DELETE /api/universities/:id
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const [existing] = await db.query(
      'SELECT logo_url FROM `universities` WHERE id = ?',
      [req.params.id]
    );
    const logo = existing[0]?.logo_url;
    if (logo?.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', logo);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.query('DELETE FROM `universities` WHERE id = ?', [req.params.id]);
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: 'ลบไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
