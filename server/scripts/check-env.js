#!/usr/bin/env node
/**
 * ตรวจ environment ก่อนสตาร์ท — ให้ log บอกตรง ๆ ว่าลืมตั้งตัวไหน
 * ดีกว่าปล่อยไปพังตอน query แรกด้วย error ที่อ่านไม่รู้เรื่อง
 *
 * รันเอง:  npm run env:check   (ที่โฟลเดอร์ server)
 * entrypoint เรียกตัวนี้เป็นขั้นแรกสุดก่อนรอ postgres
 */
require('../config/env');

// ── ต้องมี ไม่งั้นไม่สตาร์ต ────────────────────────────────────────────────────
const REQUIRED = [
  ['DATABASE_URL', 'สตริงต่อ Postgres เช่น postgres://graduate:xxx@postgres-core:5432/graduate'],
  ['JWT_SECRET', 'ความลับสำหรับเซ็น token (สุ่มยาว ๆ เช่น openssl rand -hex 32)'],
  ['SCHOOLOS_API_BASE', 'base URL ของ SchoolOS เช่น http://192.168.200.56:3002'],
  ['SCHOOLOS_API_KEY', 'API key ของ SchoolOS (sk_live_...) — ครู/นักเรียนล็อกอินผ่านตัวนี้'],
];

// ── เปลี่ยนแล้วมีผลย้อนหลัง — เตือนเป็นพิเศษ ─────────────────────────────────
//
// FIELD_ENCRYPTION_KEY: GradTrack **ไม่ได้** เข้ารหัสข้อมูลระดับฟิลด์ จึงไม่ใช่ตัวแปรที่
// ระบบนี้ต้องมี ใส่ไว้ในรายการเพราะเป็นค่ามาตรฐานของสแตกโรงเรียน — ถ้าวันหนึ่งมีการตั้งไว้
// (เช่น copy .env มาจากระบบอื่น หรือมีการเพิ่มฟีเจอร์เข้ารหัสทีหลัง) การเปลี่ยนค่าจะทำให้
// ข้อมูลที่เข้ารหัสด้วยคีย์เดิม "ถอดกลับไม่ได้อีกเลย" — กู้ไม่ได้แม้จะมี backup ของ DB
//
// JWT_SECRET: ตัวที่มีผลจริงกับระบบนี้ — เปลี่ยนแล้ว token ที่ออกไปแล้วใช้ไม่ได้ทั้งหมด
// (ทุกคนหลุดจากระบบพร้อมกัน) ไม่ได้ทำข้อมูลหาย แค่ต้องล็อกอินใหม่
const DO_NOT_CHANGE = [
  ['FIELD_ENCRYPTION_KEY', 'ถ้ามีข้อมูลที่เข้ารหัสด้วยคีย์นี้อยู่แล้ว เปลี่ยนแล้วถอดกลับไม่ได้อีกเลย (กู้ไม่ได้)'],
  ['JWT_SECRET', 'เปลี่ยนแล้วทุกคนหลุดจากระบบและต้องล็อกอินใหม่ (ข้อมูลไม่หาย)'],
];

const problems = [];
const notes = [];

for (const [key, why] of REQUIRED) {
  const v = process.env[key];
  if (!v || !String(v).trim()) problems.push(`    ❌ ไม่ได้ตั้ง ${key} — ${why}`);
}

// JWT_SECRET สั้นเกินไปเดาได้ — ปล่อยผ่านไม่ได้
const secret = process.env.JWT_SECRET || '';
if (secret && secret.length < 24) {
  problems.push(`    ❌ JWT_SECRET สั้นเกินไป (${secret.length} ตัว) — ควรอย่างน้อย 32 ตัว`);
}
if (/change_?me|your_?super_?secret|secret_?key/i.test(secret)) {
  problems.push('    ❌ JWT_SECRET ยังเป็นค่าตัวอย่าง — ต้องสุ่มค่าจริงก่อนขึ้น production');
}

// SCHOOLOS_API_KEY ต้องขึ้นต้น sk_live_ ตามรูปแบบของ SchoolOS
const apiKey = process.env.SCHOOLOS_API_KEY || '';
if (apiKey && !apiKey.startsWith('sk_live_')) {
  problems.push('    ❌ SCHOOLOS_API_KEY ไม่ได้ขึ้นต้นด้วย sk_live_ — น่าจะคัดลอกมาไม่ครบ');
}

for (const [key, why] of DO_NOT_CHANGE) {
  if (process.env[key]) notes.push(`    ⚠️  ${key} ถูกตั้งไว้ — ห้ามเปลี่ยนค่า: ${why}`);
}

// BASE_PATH ต้องตรงกับที่ใช้ตอน build ฝั่ง client — เตือนให้เห็นค่าจริงในล็อก
notes.push(`    ℹ️  BASE_PATH = ${process.env.BASE_PATH || '(ว่าง = เสิร์ฟที่ root)'}`);
notes.push(`    ℹ️  PORT = ${process.env.PORT || 3003}`);

for (const n of notes) console.log(n);

if (problems.length) {
  console.error('');
  for (const p of problems) console.error(p);
  console.error('\n    ตั้งค่าเหล่านี้ใน .env (dev) หรือ stack env ของ Portainer (prod)');
  console.error('    ห้ามใส่รหัสผ่าน/คีย์ลงในโค้ดหรือ docker-compose.yml ที่ commit ขึ้น git\n');
  process.exit(1);
}

console.log('    environment ครบถ้วน');
