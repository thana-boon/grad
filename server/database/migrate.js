// ─── Migration runner ─────────────────────────────────────────────────────────
// รันไฟล์ .sql ทุกไฟล์ใน database/postgres/ เรียงตามชื่อ ทุกครั้งที่สตาร์ท
//
// จงใจ "รันซ้ำทุกรอบ" ไม่มีตาราง schema_migrations คอยกันไว้ เพราะไฟล์เหล่านั้น
// ต้อง idempotent + additive อยู่แล้วตามกฎหัวไฟล์ — ผลพลอยได้คือเวลาเพิ่มคอลัมน์ใหม่
// ลงไฟล์เดิม deploy รอบหน้าจะได้คอลัมน์นั้นเลย ไม่ต้องจำว่าต้องตั้งชื่อไฟล์ใหม่
//
// รันเดี่ยว ๆ ได้ด้วย: node database/migrate.js
const fs = require('fs');
const path = require('path');

const SQL_DIR = path.join(__dirname, 'postgres');

// statement ที่ทำข้อมูลหาย — deploy ผ่าน Portainer เป็น push แบบไม่ถามใคร
// ถ้าหลุดเข้ามาในไฟล์ migration จะไม่มีใครทันเห็นก่อนข้อมูลหาย จึงกันตั้งแต่ตอนโหลด
const FORBIDDEN = /\b(DROP\s+(TABLE|COLUMN|DATABASE|SCHEMA|INDEX|CONSTRAINT)|TRUNCATE|DELETE\s+FROM)\b/i;

// ตัดคอมเมนต์ออกก่อนตรวจ ไม่งั้นคำว่า "DROP TABLE" ที่เขียนอธิบายในหัวไฟล์จะโดนจับ
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

async function migrate(db) {
  const files = fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) throw new Error('ไม่พบไฟล์ migration ใน database/postgres/');

  for (const file of files) {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), 'utf8');

    const offending = stripComments(sql).match(FORBIDDEN);
    if (offending) {
      throw new Error(
        `migration "${file}" มี statement ที่ทำข้อมูลหาย (${offending[0]}) — ` +
          'migration ต้อง additive เท่านั้น'
      );
    }

    // ใช้ pool.query ตรง ๆ ไม่ผ่าน db.query() เพราะไฟล์ SQL มี $$ ของ plpgsql
    // ซึ่ง translator จะไปนับเป็น placeholder $1/$2 (และ backtick ในคอมเมนต์ไทย)
    await db.pool.query(sql);
  }

  return files;
}

module.exports = { migrate };

// รันตรงจาก CLI: node database/migrate.js
if (require.main === module) {
  require('../config/env');
  const db = require('../config/db');
  migrate(db)
    .then((files) => {
      console.log(`✅ migration สำเร็จ (${files.length} ไฟล์: ${files.join(', ')})`);
      return db.pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ migration ล้มเหลว:', err.message);
      process.exit(1);
    });
}
