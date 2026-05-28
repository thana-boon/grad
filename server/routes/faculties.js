const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');
const axios = require('axios');

// ─── Auto-create tables ───────────────────────────────────────────────────────
const ensureTables = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`faculties\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`university_id\` INT NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_uni_faculty\` (\`university_id\`, \`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`programs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`faculty_id\` INT NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_faculty_program\` (\`faculty_id\`, \`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

// ─── Built-in map: คณะ → สาขาที่พบบ่อย ──────────────────────────────────────
const PROGRAMS_BY_FACULTY = {
  'คณะแพทยศาสตร์': ['แพทยศาสตร์', 'วิทยาศาสตร์การแพทย์'],
  'คณะวิศวกรรมศาสตร์': [
    'วิศวกรรมไฟฟ้า', 'วิศวกรรมเครื่องกล', 'วิศวกรรมโยธา', 'วิศวกรรมอุตสาหการ',
    'วิศวกรรมคอมพิวเตอร์', 'วิศวกรรมเคมี', 'วิศวกรรมสิ่งแวดล้อม',
    'วิศวกรรมวัสดุ', 'วิศวกรรมชีวการแพทย์', 'วิศวกรรมไฟฟ้าสื่อสาร',
  ],
  'คณะวิทยาศาสตร์': [
    'คณิตศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีววิทยา', 'สถิติ',
    'จุลชีววิทยา', 'ชีวเคมี', 'วิทยาการคอมพิวเตอร์', 'วิทยาศาสตร์สิ่งแวดล้อม',
    'ธรณีวิทยา', 'วิทยาศาสตร์การอาหาร',
  ],
  'คณะวิทยาศาสตร์และเทคโนโลยี': [
    'คณิตศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีววิทยา', 'สถิติ',
    'วิทยาการคอมพิวเตอร์', 'เทคโนโลยีสารสนเทศ', 'วิทยาศาสตร์สิ่งแวดล้อม',
    'วิทยาศาสตร์การอาหาร', 'เทคโนโลยีชีวภาพ',
  ],
  'คณะอักษรศาสตร์': [
    'ภาษาไทย', 'ภาษาอังกฤษ', 'ภาษาฝรั่งเศส', 'ภาษาเยอรมัน',
    'ภาษาจีน', 'ภาษาญี่ปุ่น', 'ประวัติศาสตร์', 'ปรัชญา', 'ภูมิศาสตร์',
    'บรรณารักษศาสตร์และสารสนเทศศาสตร์',
  ],
  'คณะมนุษยศาสตร์': [
    'ภาษาไทย', 'ภาษาอังกฤษ', 'ภาษาจีน', 'ภาษาญี่ปุ่', 'ภาษาเกาหลี',
    'ประวัติศาสตร์', 'ปรัชญาและศาสนา', 'การท่องเที่ยว',
  ],
  'คณะมนุษยศาสตร์และสังคมศาสตร์': [
    'ภาษาไทย', 'ภาษาอังกฤษ', 'ภาษาจีน', 'ภาษาญี่ปุ่น',
    'ประวัติศาสตร์', 'ภูมิศาสตร์', 'สังคมวิทยาและมานุษยวิทยา',
    'บรรณารักษศาสตร์และสารสนเทศศาสตร์', 'การพัฒนาชุมชน',
  ],
  'คณะสังคมศาสตร์': [
    'สังคมวิทยาและมานุษยวิทยา', 'จิตวิทยา', 'ประชากรศาสตร์',
    'อาชญาวิทยาและการบริหารงานยุติธรรม', 'ภูมิศาสตร์และภูมิสารสนเทศ',
  ],
  'คณะรัฐศาสตร์': [
    'การเมืองการปกครอง', 'ความสัมพันธ์ระหว่างประเทศ', 'บริหารรัฐกิจ',
    'รัฐประศาสนศาสตร์', 'การปกครองท้องถิ่น',
  ],
  'คณะนิติศาสตร์': ['นิติศาสตร์'],
  'คณะเศรษฐศาสตร์': [
    'เศรษฐศาสตร์', 'เศรษฐศาสตร์ธุรกิจ', 'เศรษฐศาสตร์การเกษตร',
    'เศรษฐศาสตร์ระหว่างประเทศ', 'เศรษฐศาสตร์การเงิน',
  ],
  'คณะบริหารธุรกิจ': [
    'การบัญชี', 'การเงิน', 'การตลาด', 'การจัดการ', 'การจัดการทรัพยากรมนุษย์',
    'คอมพิวเตอร์ธุรกิจ', 'การจัดการธุรกิจระหว่างประเทศ', 'ธุรกิจดิจิทัล',
    'การจัดการโลจิสติกส์', 'ผู้ประกอบการ',
  ],
  'คณะพาณิชยศาสตร์และการบัญชี': [
    'การบัญชี', 'การเงิน', 'การตลาด', 'การจัดการ', 'สถิติ',
    'คอมพิวเตอร์ธุรกิจ', 'การจัดการธุรกิจระหว่างประเทศ', 'ประกันภัย',
  ],
  'คณะการจัดการ': [
    'การจัดการ', 'การตลาด', 'การเงิน', 'การจัดการโรงแรมและการท่องเที่ยว',
    'การจัดการธุรกิจ',
  ],
  'คณะครุศาสตร์': [
    'การศึกษาปฐมวัย', 'ประถมศึกษา', 'มัธยมศึกษา', 'การศึกษาพิเศษ',
    'พลศึกษา', 'คหกรรมศาสตร์', 'ศิลปศึกษา', 'ดนตรีศึกษา',
    'เทคโนโลยีและสื่อสารการศึกษา', 'จิตวิทยาการศึกษาและการแนะแนว',
  ],
  'คณะศึกษาศาสตร์': [
    'การศึกษาปฐมวัย', 'ประถมศึกษา', 'คณิตศาสตร์', 'วิทยาศาสตร์',
    'ภาษาไทย', 'ภาษาอังกฤษ', 'สังคมศึกษา', 'พลศึกษา',
    'เทคโนโลยีการศึกษา', 'การวัดและประเมินผลการศึกษา',
  ],
  'คณะสาธารณสุขศาสตร์': [
    'สาธารณสุขศาสตร์', 'อนามัยสิ่งแวดล้อม', 'อาชีวอนามัยและความปลอดภัย',
    'โภชนาการและการกำหนดอาหาร', 'บริหารสาธารณสุข',
  ],
  'คณะเภสัชศาสตร์': ['เภสัชศาสตร์', 'เภสัชกรรมอุตสาหการ', 'เภสัชกรรมคลินิก'],
  'คณะทันตแพทยศาสตร์': ['ทันตแพทยศาสตร์'],
  'คณะสัตวแพทยศาสตร์': ['สัตวแพทยศาสตร์'],
  'คณะพยาบาลศาสตร์': ['พยาบาลศาสตร์', 'การพยาบาลและการผดุงครรภ์'],
  'คณะเกษตรศาสตร์': [
    'เกษตรศาสตร์', 'พืชศาสตร์', 'สัตวศาสตร์', 'ปฐพีศาสตร์',
    'เศรษฐศาสตร์การเกษตร', 'ส่งเสริมการเกษตร', 'โรคพืช', 'กีฏวิทยา',
  ],
  'คณะสถาปัตยกรรมศาสตร์': [
    'สถาปัตยกรรม', 'สถาปัตยกรรมภายใน', 'ภูมิสถาปัตยกรรม',
    'การออกแบบชุมชนเมือง', 'การออกแบบอุตสาหกรรม',
  ],
  'คณะนิเทศศาสตร์': [
    'วารสารศาสตร์', 'การประชาสัมพันธ์', 'การโฆษณา',
    'ภาพยนตร์และภาพนิ่ง', 'สื่อดิจิทัล', 'วิทยุและโทรทัศน์',
  ],
  'คณะวารสารศาสตร์และสื่อสารมวลชน': [
    'วารสารศาสตร์', 'สื่อสารมวลชน', 'การโฆษณา', 'การประชาสัมพันธ์',
    'สื่อดิจิทัลและสื่อใหม่',
  ],
  'คณะศิลปกรรมศาสตร์': [
    'จิตรกรรม', 'ประติมากรรม', 'ภาพพิมพ์', 'ศิลปะไทย',
    'ออกแบบนิเทศศิลป์', 'ออกแบบผลิตภัณฑ์', 'ดุริยางคศาสตร์', 'นาฏศิลป์',
  ],
  'คณะศิลปศาสตร์': [
    'ภาษาอังกฤษ', 'ภาษาจีน', 'ภาษาญี่ปุ่น', 'ภาษาเกาหลี',
    'การท่องเที่ยว', 'การโรงแรม', 'ภาษาและวัฒนธรรมไทย',
  ],
  'คณะวิทยาการคอมพิวเตอร์': [
    'วิทยาการคอมพิวเตอร์', 'เทคโนโลยีสารสนเทศ', 'วิศวกรรมซอฟต์แวร์',
    'ปัญญาประดิษฐ์', 'ความมั่นคงปลอดภัยทางไซเบอร์', 'วิทยาการข้อมูล',
  ],
  'คณะเทคโนโลยีสารสนเทศ': [
    'เทคโนโลยีสารสนเทศ', 'วิทยาการคอมพิวเตอร์', 'วิศวกรรมซอฟต์แวร์',
    'ระบบสารสนเทศเพื่อธุรกิจ', 'ความมั่นคงปลอดภัยไซเบอร์',
  ],
  'คณะเทคโนโลยีสารสนเทศและการสื่อสาร': [
    'เทคโนโลยีสารสนเทศ', 'วิทยาการคอมพิวเตอร์', 'วิศวกรรมซอฟต์แวร์',
    'ระบบสารสนเทศเพื่อธุรกิจ', 'เทคโนโลยีดิจิทัลเพื่อธุรกิจ',
  ],
  'คณะสังคมสงเคราะห์ศาสตร์': ['สังคมสงเคราะห์ศาสตร์'],
  'คณะสหเวชศาสตร์': [
    'กายภาพบำบัด', 'เทคนิคการแพทย์', 'รังสีเทคนิค', 'โภชนาการและการกำหนดอาหาร',
  ],
  'คณะเทคนิคการแพทย์': ['เทคนิคการแพทย์', 'รังสีเทคนิค', 'กิจกรรมบำบัด'],
  'คณะกายภาพบำบัด': ['กายภาพบำบัด'],
  'คณะอุตสาหกรรมเกษตร': [
    'เทคโนโลยีอาหาร', 'วิทยาศาสตร์การอาหาร', 'เทคโนโลยีชีวภาพ',
    'บรรจุภัณฑ์', 'วิศวกรรมอาหาร',
  ],
  'คณะทรัพยากรธรรมชาติ': [
    'ทรัพยากรดินและสิ่งแวดล้อม', 'ปัจจัยการผลิต', 'พัฒนาการเกษตร',
    'ทรัพยากรน้ำ', 'ภูมิศาสตร์',
  ],
  'คณะเทคโนโลยีการเกษตร': [
    'เทคโนโลยีการผลิตพืช', 'เทคโนโลยีการผลิตสัตว์', 'เทคโนโลยีการอาหาร',
    'เกษตรศาสตร์', 'เทคโนโลยีชีวภาพทางการเกษตร',
  ],
  'คณะวิทยาศาสตร์การกีฬา': [
    'วิทยาศาสตร์การกีฬา', 'วิทยาศาสตร์การออกกำลังกายและกีฬา',
    'การจัดการกีฬา',
  ],
  'คณะศิลปะและการออกแบบ': [
    'ออกแบบนิเทศศิลป์', 'ออกแบบผลิตภัณฑ์', 'ออกแบบแฟชั่น',
    'ทัศนศิลป์', 'ดิจิทัลอาร์ต',
  ],
  'คณะดุริยางคศาสตร์': ['ดุริยางคศาสตร์สากล', 'ดุริยางคศาสตร์ไทย', 'ดนตรีแจ๊ส'],
  'คณะโบราณคดี': ['โบราณคดี', 'ประวัติศาสตร์ศิลปะ', 'มานุษยวิทยา'],
  'คณะวิทยาศาสตร์และวิศวกรรมศาสตร์': [
    'วิทยาศาสตร์', 'วิศวกรรมเครื่องกล', 'วิศวกรรมไฟฟ้า',
    'วิศวกรรมโยธา', 'วิทยาการคอมพิวเตอร์',
  ],
};

// ─── Built-in list of common Thai faculties ───────────────────────────────────
const COMMON_FACULTIES = [
  'คณะแพทยศาสตร์',
  'คณะวิศวกรรมศาสตร์',
  'คณะวิทยาศาสตร์',
  'คณะวิทยาศาสตร์และเทคโนโลยี',
  'คณะอักษรศาสตร์',
  'คณะมนุษยศาสตร์',
  'คณะมนุษยศาสตร์และสังคมศาสตร์',
  'คณะสังคมศาสตร์',
  'คณะรัฐศาสตร์',
  'คณะนิติศาสตร์',
  'คณะเศรษฐศาสตร์',
  'คณะบริหารธุรกิจ',
  'คณะพาณิชยศาสตร์และการบัญชี',
  'คณะการจัดการ',
  'คณะครุศาสตร์',
  'คณะศึกษาศาสตร์',
  'คณะสาธารณสุขศาสตร์',
  'คณะเภสัชศาสตร์',
  'คณะทันตแพทยศาสตร์',
  'คณะสัตวแพทยศาสตร์',
  'คณะพยาบาลศาสตร์',
  'คณะเกษตรศาสตร์',
  'คณะสถาปัตยกรรมศาสตร์',
  'คณะนิเทศศาสตร์',
  'คณะวารสารศาสตร์และสื่อสารมวลชน',
  'คณะศิลปกรรมศาสตร์',
  'คณะศิลปศาสตร์',
  'คณะวิทยาการคอมพิวเตอร์',
  'คณะเทคโนโลยีสารสนเทศ',
  'คณะเทคโนโลยีสารสนเทศและการสื่อสาร',
  'คณะสังคมสงเคราะห์ศาสตร์',
  'คณะสหเวชศาสตร์',
  'คณะเทคนิคการแพทย์',
  'คณะกายภาพบำบัด',
  'คณะอุตสาหกรรมเกษตร',
  'คณะทรัพยากรธรรมชาติ',
  'คณะเทคโนโลยีการเกษตร',
  'คณะวิทยาศาสตร์การกีฬา',
  'คณะศิลปะและการออกแบบ',
  'คณะดุริยางคศาสตร์',
  'คณะโบราณคดี',
  'คณะวิทยาศาสตร์และวิศวกรรมศาสตร์',
];

const WP_HEADERS = { 'User-Agent': 'GradTrack/1.0 (Educational)', Accept: 'application/json' };

// ─── Sync: ดึงชื่อคณะจาก Wikipedia ─────────────────────────────────────────
const syncFacultiesFromWikipedia = async (uniName) => {
  const { data: srData } = await axios.get('https://th.wikipedia.org/w/api.php', {
    params: { action: 'query', list: 'search', srsearch: uniName, srlimit: 1, format: 'json' },
    timeout: 10000,
    headers: WP_HEADERS,
  });
  const pageTitle = srData?.query?.search?.[0]?.title;
  if (!pageTitle) return [];

  const { data: extData } = await axios.get('https://th.wikipedia.org/w/api.php', {
    params: { action: 'query', titles: pageTitle, prop: 'extracts', explaintext: true, format: 'json' },
    timeout: 10000,
    headers: WP_HEADERS,
  });
  const extract = Object.values(extData?.query?.pages || {})[0]?.extract || '';

  const seen = new Set();
  const results = [];
  for (const line of extract.split('\n')) {
    const trimmed = line.trim().replace(/^[•\-*]\s*/, '');
    if (
      trimmed.startsWith('คณะ') &&
      trimmed.length < 80 &&
      !trimmed.includes('http') &&
      !seen.has(trimmed)
    ) {
      seen.add(trimmed);
      results.push(trimmed);
    }
  }
  return results;
};

// ═══════════════════════════════════════════════════════════════════════════
//  Programs routes — ต้องอยู่ก่อน /:id เพื่อไม่ให้ชนกัน
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/faculties/programs?faculty_id=X
router.get('/programs', verifyToken, async (req, res) => {
  try {
    await ensureTables();
    const { faculty_id } = req.query;
    if (!faculty_id) return res.json([]);
    const [rows] = await db.query(
      'SELECT * FROM `programs` WHERE faculty_id = ? ORDER BY name ASC',
      [faculty_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/faculties/programs
router.post('/programs', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    const { faculty_id, name } = req.body;
    if (!faculty_id || !name?.trim()) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    const [result] = await db.query(
      'INSERT INTO `programs` (`faculty_id`, `name`) VALUES (?, ?)',
      [faculty_id, name.trim()]
    );
    const [rows] = await db.query('SELECT * FROM `programs` WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'สาขานี้มีอยู่แล้ว' });
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/faculties/programs/:id
router.put('/programs/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'กรุณากรอกชื่อสาขา' });
    await db.query('UPDATE `programs` SET `name` = ? WHERE id = ?', [name.trim(), req.params.id]);
    const [rows] = await db.query('SELECT * FROM `programs` WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/faculties/programs/:id
router.delete('/programs/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM `programs` WHERE id = ?', [req.params.id]);
    res.json({ message: 'ลบสาขาสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Faculties sync — ต้องอยู่ก่อน /:id
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/faculties/sync-all  — sync ทุกมหาวิทยาลัยด้วย COMMON_FACULTIES
router.post('/sync-all', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    const [unis] = await db.query('SELECT id, name FROM `universities` ORDER BY id ASC');
    if (!unis.length) return res.json({ message: 'ยังไม่มีมหาวิทยาลัย', totalAdded: 0, uniCount: 0 });

    let totalAdded = 0;
    const results = [];

    for (const uni of unis) {
      const [existing] = await db.query('SELECT name FROM `faculties` WHERE university_id = ?', [uni.id]);
      const existingNames = new Set(existing.map((r) => r.name));

      let candidates = [];
      let source = 'builtin';
      try {
        candidates = await syncFacultiesFromWikipedia(uni.name);
        if (candidates.length >= 3) source = 'wikipedia';
      } catch { }
      if (candidates.length < 3) { candidates = COMMON_FACULTIES; source = 'builtin'; }

      let added = 0;
      for (const name of candidates) {
        if (!existingNames.has(name)) {
          try {
            await db.query('INSERT INTO `faculties` (`university_id`, `name`) VALUES (?, ?)', [uni.id, name]);
            added++;
          } catch { }
        }
      }
      totalAdded += added;
      results.push({ university_id: uni.id, name: uni.name, added, source });

      // หน่วงเล็กน้อยเพื่อไม่โดน rate-limit Wikipedia
      await new Promise((r) => setTimeout(r, 200));
    }

    res.json({
      message: `Sync ทุกมหาวิทยาลัยสำเร็จ — เพิ่มคณะรวม ${totalAdded} รายการ จาก ${unis.length} มหาวิทยาลัย`,
      totalAdded,
      uniCount: unis.length,
      results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/faculties/sync-programs-global  — sync สาขาทุกคณะ ทุกมหาลัย (สร้างคณะถ้ายังไม่มี)
router.post('/sync-programs-global', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    const [unis] = await db.query('SELECT id, name FROM `universities` ORDER BY id ASC');
    if (!unis.length) return res.json({ message: 'ยังไม่มีมหาวิทยาลัย', totalFacultiesCreated: 0, totalProgramsAdded: 0 });

    let totalFacultiesCreated = 0;
    let totalProgramsAdded = 0;

    for (const uni of unis) {
      // โหลดคณะที่มีอยู่แล้วของมหาลัยนี้
      const [existingFacs] = await db.query(
        'SELECT id, name FROM `faculties` WHERE university_id = ?', [uni.id]
      );
      const facMap = {}; // name → id
      for (const f of existingFacs) facMap[f.name] = f.id;

      for (const [facName, programList] of Object.entries(PROGRAMS_BY_FACULTY)) {
        // สร้างคณะถ้ายังไม่มี
        if (facMap[facName] === undefined) {
          try {
            const [ins] = await db.query(
              'INSERT INTO `faculties` (`university_id`, `name`) VALUES (?, ?)', [uni.id, facName]
            );
            facMap[facName] = ins.insertId;
            totalFacultiesCreated++;
          } catch { continue; }
        }

        const facId = facMap[facName];

        // โหลดสาขาที่มีอยู่แล้วของคณะนี้
        const [existingProgs] = await db.query(
          'SELECT name FROM `programs` WHERE faculty_id = ?', [facId]
        );
        const existingNames = new Set(existingProgs.map((r) => r.name));

        for (const pName of programList) {
          if (!existingNames.has(pName)) {
            try {
              await db.query(
                'INSERT INTO `programs` (`faculty_id`, `name`) VALUES (?, ?)', [facId, pName]
              );
              totalProgramsAdded++;
            } catch { }
          }
        }
      }
    }

    res.json({
      message: `Sync สาขาทุกมหาลัยสำเร็จ — สร้างคณะใหม่ ${totalFacultiesCreated} คณะ เพิ่มสาขา ${totalProgramsAdded} สาขา จาก ${unis.length} มหาวิทยาลัย`,
      totalFacultiesCreated,
      totalProgramsAdded,
      uniCount: unis.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/faculties/sync-programs-all  — sync สาขาทุกคณะของมหาวิทยาลัยที่ระบุ
router.post('/sync-programs-all', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    const { university_id } = req.body;
    if (!university_id) return res.status(400).json({ message: 'กรุณาระบุ university_id' });

    const [facRows] = await db.query(
      'SELECT id, name FROM `faculties` WHERE university_id = ? ORDER BY id ASC',
      [university_id]
    );
    if (!facRows.length) return res.status(400).json({ message: 'ยังไม่มีคณะ กรุณา Sync คณะก่อน' });

    let totalAdded = 0;
    for (const fac of facRows) {
      const candidates = PROGRAMS_BY_FACULTY[fac.name];
      if (!candidates?.length) continue;

      const [existing] = await db.query('SELECT name FROM `programs` WHERE faculty_id = ?', [fac.id]);
      const existingNames = new Set(existing.map((r) => r.name));

      for (const name of candidates) {
        if (!existingNames.has(name)) {
          try {
            await db.query('INSERT INTO `programs` (`faculty_id`, `name`) VALUES (?, ?)', [fac.id, name]);
            totalAdded++;
          } catch { }
        }
      }
    }

    res.json({
      message: `Sync สาขาสำเร็จ — เพิ่ม ${totalAdded} สาขา จาก ${facRows.length} คณะ`,
      totalAdded,
      facultyCount: facRows.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/faculties/sync
router.post('/sync', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    const { university_id } = req.body;
    if (!university_id) return res.status(400).json({ message: 'กรุณาระบุ university_id' });

    const [uniRows] = await db.query('SELECT name FROM `universities` WHERE id = ?', [university_id]);
    if (!uniRows.length) return res.status(404).json({ message: 'ไม่พบมหาวิทยาลัย' });
    const uniName = uniRows[0].name;

    const [existing] = await db.query('SELECT name FROM `faculties` WHERE university_id = ?', [university_id]);
    const existingNames = new Set(existing.map((r) => r.name));

    // ลองดึงจาก Wikipedia ก่อน
    let candidates = [];
    let source = 'builtin';
    try {
      candidates = await syncFacultiesFromWikipedia(uniName);
      if (candidates.length >= 3) source = 'wikipedia';
    } catch { }

    if (candidates.length < 3) candidates = COMMON_FACULTIES;

    let added = 0;
    for (const name of candidates) {
      if (!existingNames.has(name)) {
        try {
          await db.query('INSERT INTO `faculties` (`university_id`, `name`) VALUES (?, ?)', [university_id, name]);
          added++;
        } catch { }
      }
    }

    const [allRows] = await db.query(
      'SELECT * FROM `faculties` WHERE university_id = ? ORDER BY name ASC',
      [university_id]
    );
    res.json({ message: `Sync คณะสำเร็จ (${source}) เพิ่ม ${added} คณะ`, added, source, faculties: allRows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Faculties CRUD
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/faculties?university_id=X
router.get('/', verifyToken, async (req, res) => {
  try {
    await ensureTables();
    const { university_id } = req.query;
    if (!university_id) return res.json([]);
    const [rows] = await db.query(
      'SELECT * FROM `faculties` WHERE university_id = ? ORDER BY name ASC',
      [university_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/faculties
router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    await ensureTables();
    const { university_id, name } = req.body;
    if (!university_id || !name?.trim()) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    const [result] = await db.query(
      'INSERT INTO `faculties` (`university_id`, `name`) VALUES (?, ?)',
      [university_id, name.trim()]
    );
    const [rows] = await db.query('SELECT * FROM `faculties` WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'คณะนี้มีอยู่แล้ว' });
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/faculties/:id
router.put('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'กรุณากรอกชื่อคณะ' });
    await db.query('UPDATE `faculties` SET `name` = ? WHERE id = ?', [name.trim(), req.params.id]);
    const [rows] = await db.query('SELECT * FROM `faculties` WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/faculties/:id
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM `faculties` WHERE id = ?', [req.params.id]);
    res.json({ message: 'ลบคณะสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
