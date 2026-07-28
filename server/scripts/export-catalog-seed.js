#!/usr/bin/env node
/**
 * ดึงคลังมหาวิทยาลัยจาก DB ปัจจุบัน ออกมาเป็นไฟล์ seed ที่ commit ขึ้น git ได้
 *
 * รัน (ต้องรันที่ที่เห็นทั้ง DB และโฟลเดอร์ uploads — ปกติคือในคอนเทนเนอร์):
 *   docker exec -w /app/server gradtrack-app node scripts/export-catalog-seed.js
 *   docker cp gradtrack-app:/app/server/database/seeds ./server/database/
 *
 * ได้ออกมา:
 *   database/seeds/catalog.json.gz   มหาวิทยาลัย + คณะ + หลักสูตร (ซ้อนกันเป็นชั้น
 *                                    ไม่ต้องเก็บ id — ตอน seed ค่อยแจก id ใหม่)
 *   database/seeds/logos/*.png       ไฟล์โลโก้ที่ logo_url ชี้ไปที่ /uploads/
 *
 * ไฟล์เหล่านี้ถูก seed เข้าอัตโนมัติตอนคอนเทนเนอร์สตาร์ท (ดู database/seed-catalog.js)
 * ⚠️ uploads/ อยู่ใน .gitignore + .dockerignore — โลโก้จึงต้องถูกก๊อปมาไว้ใต้ database/seeds/
 *    ถึงจะติดไปกับ git และ image ด้วย
 */
require('../config/env');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require('../config/db');

const SEED_DIR = path.join(__dirname, '..', 'database', 'seeds');
const LOGO_OUT_DIR = path.join(SEED_DIR, 'logos');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

(async () => {
  fs.mkdirSync(LOGO_OUT_DIR, { recursive: true });

  const [unis] = await db.query(
    `SELECT id, name_th, name_en, short_name, university_type, logo_url
     FROM "universities" ORDER BY id`
  );
  const [faculties] = await db.query(
    `SELECT university_id, name_th, name_en FROM "faculties" ORDER BY university_id, name_th`
  );
  const [programs] = await db.query(
    `SELECT university_id, campus, faculty_name, group_field,
            field_name_th, field_name_en, program_name_th, program_name_en, program_type
     FROM "programs"
     ORDER BY university_id, campus, faculty_name, field_name_th, program_name_th`
  );

  const facByUni = new Map();
  for (const f of faculties) {
    if (!facByUni.has(f.university_id)) facByUni.set(f.university_id, []);
    facByUni.get(f.university_id).push({ name_th: f.name_th, name_en: f.name_en });
  }

  const progByUni = new Map();
  for (const p of programs) {
    if (!progByUni.has(p.university_id)) progByUni.set(p.university_id, []);
    const { university_id, ...rest } = p;
    // ตัดฟิลด์ที่เป็น null ทิ้ง — ไฟล์เล็กลงมากเมื่อมีหลักสูตรหลักหมื่นแถว
    progByUni.get(university_id).push(Object.fromEntries(Object.entries(rest).filter(([, v]) => v != null)));
  }

  let logoCount = 0;
  const missingLogos = [];

  const universities = unis.map((u) => {
    let logo = null;
    if (u.logo_url && /^https?:\/\//i.test(u.logo_url)) {
      logo = u.logo_url; // ลิงก์ภายนอก — เก็บ URL ไว้ตรง ๆ ไม่มีไฟล์ให้ก๊อป
    } else if (u.logo_url) {
      const filename = path.basename(u.logo_url);
      const src = path.join(UPLOADS_DIR, u.logo_url.replace(/^\/uploads\//, ''));
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(LOGO_OUT_DIR, filename));
        logo = filename;
        logoCount++;
      } else {
        missingLogos.push(`${u.name_th} → ${u.logo_url}`);
      }
    }

    return {
      name_th: u.name_th,
      name_en: u.name_en,
      short_name: u.short_name,
      university_type: u.university_type,
      logo,
      faculties: facByUni.get(u.id) || [],
      programs: progByUni.get(u.id) || [],
    };
  });

  const catalog = {
    generatedAt: new Date().toISOString(),
    counts: { universities: unis.length, faculties: faculties.length, programs: programs.length },
    universities,
  };

  const json = JSON.stringify(catalog);
  const gzPath = path.join(SEED_DIR, 'catalog.json.gz');
  fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }));

  // ถ้าเคยมี catalog.json แบบไม่บีบอัดค้างอยู่ ต้องรู้ตัว — seeder อ่านไฟล์นั้นก่อน
  const plainPath = path.join(SEED_DIR, 'catalog.json');
  if (fs.existsSync(plainPath)) {
    console.log(`    ⚠️  มี ${plainPath} อยู่ด้วย — seeder จะอ่านไฟล์นั้นแทน .gz (ลบทิ้งถ้าไม่ได้ตั้งใจ)`);
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
  console.log('');
  console.log(`    มหาวิทยาลัย ${unis.length} / คณะ ${faculties.length} / หลักสูตร ${programs.length}`);
  console.log(`    catalog.json.gz  ${mb(fs.statSync(gzPath).size)}  (ก่อนบีบอัด ${mb(Buffer.byteLength(json))})`);
  console.log(`    logos/           ${logoCount} ไฟล์`);
  if (missingLogos.length) {
    console.log(`    ⚠️  หาไฟล์โลโก้ไม่เจอ ${missingLogos.length} รายการ:`);
    for (const m of missingLogos.slice(0, 10)) console.log(`        ${m}`);
  }
  console.log('');

  await db.pool.end();
})().catch(async (err) => {
  console.error(`\n    ❌ export ล้มเหลว: ${err.message}\n`);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
