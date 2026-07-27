/**
 * Seed — สร้างบัญชี admin แบบ local (ทางเข้าสำรองตอน SchoolOS ล่ม)
 *
 * ปกติ "ไม่ต้องรัน": ผู้ดูแลของ GradTrack มาจาก role teacher-admin ของ SchoolOS โดยตรง
 * ครูที่ SchoolOS ตั้งเป็น teacher-admin ล็อกอินเข้ามาเป็น admin ได้ทันที
 *
 * สคริปต์นี้จึงไม่ถูกเรียกจาก entrypoint และผูกไว้กับ compose profile "seed"
 * (docker compose --profile seed run --rm seed) เพื่อไม่ให้รันเองตอน deploy
 *
 * รหัสผ่านมาจาก env เท่านั้น — ไม่มีค่า default ในไฟล์นี้ ตั้งใจให้ล้มถ้าไม่ได้ตั้ง
 *   SEED_ADMIN_USERNAME (ไม่ตั้ง = "admin")
 *   SEED_ADMIN_PASSWORD (บังคับ)
 */
require('./config/env');
const db = require('./config/db');
const bcrypt = require('bcryptjs');

async function seed() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'ผู้ดูแลระบบ (local)';

  if (!password) {
    console.error('❌ ต้องตั้ง SEED_ADMIN_PASSWORD ก่อน — สคริปต์นี้ไม่มีรหัสผ่านสำรองให้');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ SEED_ADMIN_PASSWORD สั้นเกินไป (อย่างน้อย 8 ตัวอักษร)');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  // idempotent: มีอยู่แล้ว = อัปเดตรหัสผ่าน, ยังไม่มี = สร้างใหม่
  await db.query(
    `INSERT INTO users (username, password, name, role)
     VALUES (?, ?, ?, 'admin')
     ON CONFLICT (username) DO UPDATE
       SET password = EXCLUDED.password, name = EXCLUDED.name, role = 'admin'`,
    [username, hash, name]
  );

  console.log(`✅ ตั้งบัญชี admin local "${username}" เรียบร้อย`);
  console.log('   (รหัสผ่านมาจาก SEED_ADMIN_PASSWORD — ไม่แสดงในล็อก)');
}

seed()
  .then(() => db.pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed ล้มเหลว:', err.message);
    process.exit(1);
  });
