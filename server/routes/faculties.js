const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// ─── GET /api/faculties?university_id=X ──────────────────────────────────
// ส่งคืน list คณะของมหาวิทยาลัยที่ระบุ
router.get('/', verifyToken, async (req, res) => {
  try {
    const { university_id } = req.query;
    if (!university_id) return res.json([]);
    const [rows] = await db.query(
      `SELECT id, name_th AS name, name_en
       FROM \`faculties\`
       WHERE university_id = ?
       ORDER BY name_th ASC`,
      [university_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/faculties/programs?faculty_id=X ────────────────────────────
// ส่งคืน list หลักสูตรของคณะที่ระบุ
router.get('/programs', verifyToken, async (req, res) => {
  try {
    const { faculty_id } = req.query;
    if (!faculty_id) return res.json([]);
    const [rows] = await db.query(
      `SELECT id,
              program_name_th AS name,
              program_name_en,
              field_name_th,
              field_name_en,
              campus,
              group_field,
              program_type
       FROM \`programs\`
       WHERE faculty_id = ?
       ORDER BY field_name_th ASC, program_name_th ASC`,
      [faculty_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/faculties/sync-wiki ───────────────────────────────────────
// ดึงรายชื่อคณะจากวิกิพีเดียของแต่ละมหาวิทยาลัย
// วิธี: ดึง prop=links จากหน้ามหาวิทยาลัย แล้วกรองลิงก์ที่ลงท้ายด้วยชื่อมหาวิทยาลัย
router.post('/sync-wiki', verifyToken, adminOnly, async (req, res) => {
  try {
    const [unis] = await db.query('SELECT id, name_th FROM `universities` ORDER BY id');
    if (!unis.length) return res.json({ message: 'ไม่มีมหาวิทยาลัยในระบบ กรุณาซิงค์หรือ import มหาวิทยาลัยก่อน', added: 0 });

    const [existingFac] = await db.query('SELECT university_id, name_th FROM `faculties`');
    const existingSet = new Set(existingFac.map(f => `${f.university_id}::${f.name_th}`));

    let added = 0;
    let processed = 0;
    const CONCURRENCY = 2;
    const FAC_PREFIXES = ['คณะ', 'วิทยาลัย', 'สำนักวิชา', 'บัณฑิตวิทยาลัย', 'สำนักวิทยบริการ'];

    const processUni = async (uni) => {
      try {
        // ดึงเฉพาะ links (เร็วกว่า เล็กกว่า ไม่ต้องดาวน์โหลด wikitext)
        const url = `https://th.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(uni.name_th)}&prop=links&pllimit=500&plnamespace=0&format=json&redirects=1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) return;
        const d = await r.json();
        const page = Object.values(d?.query?.pages || {})[0];
        if (!page || page.missing !== undefined) return;

        const links = page?.links || [];
        const suffix = ' ' + uni.name_th; // เช่น ' จุฬาลงกรณ์มหาวิทยาลัย'
        const facNames = [];

        for (const l of links) {
          const t = l.title || '';
          // ลิงก์ต้องลงท้ายด้วยชื่อมหาวิทยาลัย และขึ้นต้นด้วยคำที่ระบุหน่วยงาน
          if (t.endsWith(suffix) && FAC_PREFIXES.some(p => t.startsWith(p))) {
            const shortName = t.slice(0, t.length - suffix.length).trim();
            if (shortName.length > 1 && !facNames.includes(shortName)) facNames.push(shortName);
          }
        }

        for (const name of facNames) {
          const key = `${uni.id}::${name}`;
          if (existingSet.has(key)) continue;
          existingSet.add(key);
          await db.query(
            'INSERT INTO `faculties` (university_id, name_th) VALUES (?, ?) ON CONFLICT (university_id, name_th) DO NOTHING',
            [uni.id, name]
          );
          added++;
        }
        processed++;
      } catch (e) {
        console.error('[sync-wiki-fac] error for', uni.name_th, ':', e.message);
      }
    };

    for (let i = 0; i < unis.length; i += CONCURRENCY) {
      await Promise.all(unis.slice(i, i + CONCURRENCY).map(processUni));
      if (i + CONCURRENCY < unis.length) await new Promise(r => setTimeout(r, 200));
    }

    res.json({
      message: `ซิงค์คณะจาก Wikipedia สำเร็จ เพิ่ม ${added} คณะ จาก ${processed}/${unis.length} มหาวิทยาลัย`,
      added,
      processed,
      total: unis.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/faculties/sync-programs ───────────────────────────────────
// ดึงรายชื่อสาขาวิชา/ภาควิชาจากหน้า Wikipedia ของแต่ละคณะ → เพิ่มใน programs
router.post('/sync-programs', verifyToken, adminOnly, async (req, res) => {
  try {
    // โหลดคณะทั้งหมดพร้อมชื่อมหาวิทยาลัย
    const [faculties] = await db.query(`
      SELECT f.id AS faculty_id, f.name_th AS faculty_name,
             u.name_th AS uni_name
      FROM \`faculties\` f
      JOIN \`universities\` u ON u.id = f.university_id
      ORDER BY f.university_id, f.id
    `);
    if (!faculties.length) return res.json({ message: 'ไม่มีคณะในระบบ กรุณาซิงค์คณะก่อน', added: 0 });

    // โหลด programs ที่มีอยู่แล้ว
    const [existing] = await db.query('SELECT faculty_id, program_name_th FROM `programs`');
    const existingSet = new Set(existing.map(p => `${p.faculty_id}::${p.program_name_th}`));

    let added = 0;
    let processed = 0;
    const CONCURRENCY = 2;

    // ดึงและ parse สาขา/ภาควิชาจาก wikitext ของหน้าคณะ
    const extractNames = (wikitext) => {
      const names = [];
      const SEC_KEYWORDS = ['ภาควิชา', 'สาขาวิชา', 'หลักสูตร'];
      const NAME_PREFIXES = ['ภาควิชา', 'สาขาวิชา'];

      // แบ่งตาม section headers (=== ขึ้นไป)
      const sections = wikitext.split(/\n(?===)/);
      for (const sec of sections) {
        const header = sec.match(/^=+\s*(.+?)\s*=+\s*\n/)?.[1] || '';
        if (!SEC_KEYWORDS.some(k => header.includes(k))) continue;

        for (const line of sec.split('\n')) {
          if (!line.trim().startsWith('*')) continue;
          // strip [url text] → text
          let name = line.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
          // strip [[page|display]] → display, [[page]] → page
          name = name.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
                     .replace(/\[\[([^\]]+)\]\]/g, '$1');
          // strip wiki markup
          name = name.replace(/[*{}'<>]/g, '').replace(/\[\[|\]\]/g, '').trim();
          if (NAME_PREFIXES.some(k => name.startsWith(k)) && name.length > 5) names.push(name);
        }
      }
      return [...new Set(names)];
    };

    const processFac = async (fac) => {
      try {
        const title = `${fac.faculty_name} ${fac.uni_name}`;
        const url = `https://th.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&redirects=1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'GradTrackBot/1.0' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) return;
        const d = await r.json();
        const page = Object.values(d?.query?.pages || {})[0];
        if (!page || page.missing !== undefined) return;

        const wikitext = page?.revisions?.[0]?.['*'] || page?.revisions?.[0]?.slots?.main?.['*'] || '';
        if (!wikitext) return;

        const names = extractNames(wikitext);
        for (const name of names) {
          const key = `${fac.faculty_id}::${name}`;
          if (existingSet.has(key)) continue;
          existingSet.add(key);
          // programs ไม่มี unique key บน (faculty_id, program_name_th) โดยตั้งใจ
          // (ชื่อหลักสูตรซ้ำได้ข้ามวิทยาเขต/ประเภท) — กันซ้ำด้วย existingSet ด้านบนแทน
          await db.query(
            'INSERT INTO `programs` (faculty_id, program_name_th) VALUES (?, ?)',
            [fac.faculty_id, name]
          );
          added++;
        }
        processed++;
      } catch (e) {
        console.error('[sync-programs] error for', fac.faculty_name, fac.uni_name, ':', e.message);
      }
    };

    for (let i = 0; i < faculties.length; i += CONCURRENCY) {
      await Promise.all(faculties.slice(i, i + CONCURRENCY).map(processFac));
      if (i + CONCURRENCY < faculties.length) await new Promise(r => setTimeout(r, 300));
    }

    res.json({
      message: `ซิงค์หลักสูตร/สาขาจาก Wikipedia สำเร็จ เพิ่ม ${added} สาขา จาก ${processed}/${faculties.length} คณะ`,
      added,
      processed,
      total: faculties.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
