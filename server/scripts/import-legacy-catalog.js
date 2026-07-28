#!/usr/bin/env node
/**
 * ย้ายคลังข้อมูลมหาวิทยาลัย (ชื่อ/โลโก้/คณะ/สาขา/หลักสูตร) จาก GradTrack ตัวเก่า
 * มาลง Postgres ตัวใหม่ — อ่านผ่าน HTTP API ของระบบเก่า ไม่แตะ MySQL โดยตรง
 *
 * รัน:
 *   node scripts/import-legacy-catalog.js
 *   LEGACY_USER=admin LEGACY_PASS=xxx node scripts/import-legacy-catalog.js
 *
 * ไม่ส่ง LEGACY_USER/LEGACY_PASS = ได้เฉพาะมหาวิทยาลัย + โลโก้
 * (GET /api/universities ของระบบเก่าเปิดสาธารณะ แต่ /api/faculties กับ
 *  /api/programs/list ต้องมี token → คณะ/หลักสูตรต้องล็อกอินก่อน)
 *
 * รันซ้ำได้: มหาวิทยาลัยชนชื่อเดิมจะ UPDATE ทับ ส่วนหลักสูตรที่มีอยู่แล้วจะข้าม
 * ไม่มี DELETE ที่ไหนในไฟล์นี้ — ของเดิมในระบบใหม่จะไม่หายไม่ว่ากรณีใด
 */
require('../config/env');

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const BASE = (process.env.LEGACY_BASE || 'http://192.168.200.9:5000').replace(/\/+$/, '');
const USER = process.env.LEGACY_USER || '';
const PASS = process.env.LEGACY_PASS || '';

const LOGO_DIR = path.join(__dirname, '../uploads/logos');
fs.mkdirSync(LOGO_DIR, { recursive: true });

const log = (...a) => console.log(...a);

// ─── ประเภทมหาวิทยาลัย: ระบบเก่าใช้ตัวย่อ ระบบใหม่ใช้คำเต็ม ────────────────────
// ค่าที่ไม่ตรงกับตัวเลือกใน UniversitiesPage จะไม่ได้สี badge และ TYPE_ORDER
// ฝั่ง server จะจัดไปกองท้ายสุด (ELSE 5) → ต้องแปลงตอน import
const TYPE_MAP = { 'มรภ.': 'ราชภัฏ', 'มทร.': 'ราชมงคล' };
const normalizeType = (t) => {
  const v = (t || '').trim();
  return v ? TYPE_MAP[v] || v : null;
};

// ─── เรียก API ระบบเก่า ───────────────────────────────────────────────────────
async function api(pathname, token) {
  const res = await fetch(BASE + pathname, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GET ${pathname} → HTTP ${res.status}`);
  return res.json();
}

async function login() {
  if (!USER || !PASS) return null;
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ล็อกอินระบบเก่าไม่ผ่าน (HTTP ${res.status}) ${body}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error('ระบบเก่าไม่ได้คืน token');
  log(`    ล็อกอินระบบเก่าสำเร็จ: ${data.user?.username} (${data.user?.role})`);
  return data.token;
}

// ─── โลโก้: ดึงไฟล์จากระบบเก่ามาเก็บใน uploads/logos ของระบบใหม่ ──────────────
// ชื่อไฟล์ฝั่งเก่ามี timestamp อยู่แล้ว จึงใช้ชื่อเดิมได้โดยไม่ต้องกลัวชนกัน
// คืน path ที่จะเก็บลง logo_url หรือ null ถ้าดึงไม่สำเร็จ
async function fetchLogo(logoUrl) {
  if (!logoUrl) return null;
  // เก็บเป็น URL ภายนอกอยู่แล้ว (เช่น ลิงก์ตรงไปวิกิพีเดีย) → ใช้ค่าเดิมได้เลย
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;

  const filename = path.basename(logoUrl);
  const dest = path.join(LOGO_DIR, filename);
  if (fs.existsSync(dest)) return `/uploads/logos/${filename}`;

  try {
    const res = await fetch(BASE + logoUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return `/uploads/logos/${filename}`;
  } catch {
    return null;
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
(async () => {
  log(`\n    ── ย้ายคลังมหาวิทยาลัยจาก ${BASE} ──\n`);

  const token = await login();
  if (!token) {
    log('    ไม่ได้ตั้ง LEGACY_USER/LEGACY_PASS → ย้ายเฉพาะมหาวิทยาลัย + โลโก้');
  }

  const legacyUnis = await api('/api/universities');
  log(`    ระบบเก่ามีมหาวิทยาลัย ${legacyUnis.length} แห่ง\n`);

  const stat = { uniNew: 0, uniUpdated: 0, logos: 0, faculties: 0, programs: 0, programsSkipped: 0 };

  for (const u of legacyUnis) {
    const nameTh = (u.name || u.name_th || '').trim();
    if (!nameTh) continue;

    const logoUrl = await fetchLogo(u.logo_url);
    if (logoUrl?.startsWith('/uploads/')) stat.logos++;

    // ON CONFLICT DO UPDATE ทำให้รันซ้ำได้ และเติมค่าที่เคยว่างไว้ได้
    // COALESCE(EXCLUDED.x, x) = ค่าใหม่ที่เป็น NULL จะไม่ไปลบค่าเดิมทิ้ง
    const [ins] = await db.query(
      `INSERT INTO "universities" (name_th, name_en, short_name, university_type, logo_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (name_th) DO UPDATE SET
         name_en         = COALESCE(EXCLUDED.name_en,         "universities".name_en),
         short_name      = COALESCE(EXCLUDED.short_name,      "universities".short_name),
         university_type = COALESCE(EXCLUDED.university_type, "universities".university_type),
         logo_url        = COALESCE(EXCLUDED.logo_url,        "universities".logo_url)
       RETURNING id, (xmax = 0) AS inserted`,
      [nameTh, u.name_en || null, u.short_name || null, normalizeType(u.university_type), logoUrl]
    );
    const uniId = ins[0].id;
    if (ins[0].inserted) stat.uniNew++; else stat.uniUpdated++;

    if (!token) continue;

    // ── คณะ (ตาราง faculties — ใช้โดยหน้า sync คณะจากวิกิพีเดีย) ──────────────
    const facIdByName = new Map();
    let legacyFaculties = [];
    try {
      legacyFaculties = await api(`/api/faculties?university_id=${u.id}`, token);
    } catch (err) {
      log(`    ! ดึงคณะของ ${nameTh} ไม่ได้: ${err.message}`);
    }
    for (const f of legacyFaculties) {
      const fName = (f.name || f.name_th || '').trim();
      if (!fName) continue;
      const [fIns] = await db.query(
        `INSERT INTO "faculties" (university_id, name_th, name_en)
         VALUES (?, ?, ?)
         ON CONFLICT (university_id, name_th) DO UPDATE SET
           name_en = COALESCE(EXCLUDED.name_en, "faculties".name_en)
         RETURNING id, (xmax = 0) AS inserted`,
        [uniId, fName, f.name_en || null]
      );
      facIdByName.set(fName, fIns[0].id);
      if (fIns[0].inserted) stat.faculties++;
    }

    // ── หลักสูตร ────────────────────────────────────────────────────────────
    let legacyPrograms = [];
    try {
      legacyPrograms = await api(`/api/programs/list?university_id=${u.id}`, token);
    } catch (err) {
      log(`    ! ดึงหลักสูตรของ ${nameTh} ไม่ได้: ${err.message}`);
      continue;
    }

    // programs ไม่มี unique key (ตั้งใจ — ชื่อซ้ำได้หลายวิทยาเขต/ประเภท)
    // จึงกันซ้ำตอนรันซ้ำด้วยการเทียบ 6 ฟิลด์ที่แยกแถวจริงเอาเอง
    const key = (r) => [r.campus, r.faculty_name, r.group_field, r.field_name_th, r.program_name_th, r.program_type]
      .map((v) => (v || '').trim()).join('');

    const [existing] = await db.query(
      `SELECT campus, faculty_name, group_field, field_name_th, program_name_th, program_type
       FROM "programs" WHERE university_id = ?`,
      [uniId]
    );
    const seen = new Set(existing.map(key));

    const rows = [];
    for (const p of legacyPrograms) {
      const progName = (p.program_name_th || '').trim();
      if (!progName) continue;
      const k = key(p);
      if (seen.has(k)) { stat.programsSkipped++; continue; }
      seen.add(k);
      const facName = (p.faculty_name || '').trim() || null;
      rows.push([
        uniId,
        facName ? facIdByName.get(facName) ?? null : null,
        (p.campus || '').trim() || null,
        facName,
        (p.group_field || '').trim() || null,
        (p.field_name_th || '').trim() || null,
        progName,
        (p.program_type || '').trim() || null,
      ]);
    }

    // batch insert ทีละ 200 แถว — Postgres ไม่รับ `VALUES ?` แบบ MySQL
    // ต้องกาง placeholder เอง (ยังเป็น parameterized query ปกติ ไม่ต่อ SQL จากข้อมูล)
    const COLS = 8;
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const placeholders = chunk
        .map((_, r) => `(${Array.from({ length: COLS }, (_, c) => `$${r * COLS + c + 1}`).join(', ')})`)
        .join(', ');
      const [res] = await db.query(
        `INSERT INTO "programs"
         (university_id, faculty_id, campus, faculty_name, group_field, field_name_th, program_name_th, program_type)
         VALUES ${placeholders}`,
        chunk.flat()
      );
      stat.programs += res.affectedRows;
    }

    log(`    ${nameTh} — คณะ ${legacyFaculties.length} / หลักสูตร +${rows.length}`);
  }

  // SERIAL ของ Postgres ไม่ขยับตาม INSERT ที่ระบุ id เอง แต่ที่นี่ปล่อยให้ sequence
  // แจก id ทั้งหมด จึงไม่ต้อง setval ตาม — เช็คไว้เฉย ๆ กันกรณีเคยมีการ import แบบระบุ id
  await db.query(`SELECT setval(pg_get_serial_sequence('universities', 'id'), GREATEST((SELECT MAX(id) FROM universities), 1))`);
  await db.query(`SELECT setval(pg_get_serial_sequence('faculties', 'id'),    GREATEST((SELECT MAX(id) FROM faculties), 1))`);
  await db.query(`SELECT setval(pg_get_serial_sequence('programs', 'id'),     GREATEST((SELECT MAX(id) FROM programs), 1))`);

  log('\n    ── สรุป ──');
  log(`    มหาวิทยาลัย: เพิ่มใหม่ ${stat.uniNew} / อัปเดต ${stat.uniUpdated}`);
  log(`    โลโก้:       ${stat.logos} ไฟล์`);
  log(`    คณะ:         เพิ่มใหม่ ${stat.faculties}`);
  log(`    หลักสูตร:    เพิ่มใหม่ ${stat.programs} / ข้ามเพราะมีแล้ว ${stat.programsSkipped}`);
  if (!token) log('\n    * ยังไม่ได้ย้ายคณะ/หลักสูตร — รันซ้ำพร้อม LEGACY_USER + LEGACY_PASS');
  log('');

  await db.pool.end();
})().catch(async (err) => {
  console.error(`\n    ล้มเหลว: ${err.message}\n`);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
