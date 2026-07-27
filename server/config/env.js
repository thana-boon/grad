// ─── โหลด .env ที่เดียว ───────────────────────────────────────────────────────
// ทุก entry point (index.js, seed.js, database/migrate.js, scripts/check-env.js)
// ต้อง require ไฟล์นี้เป็นบรรทัดแรก ๆ ก่อนแตะ process.env
//
// เดิมแต่ละไฟล์เรียก dotenv.config() เองจาก cwd ซึ่งได้ผลต่างกันตามว่ารันจากโฟลเดอร์ไหน
// (รัน `node seed.js` จาก server/ แล้วไม่เห็น .env ที่ root → ต่อ DB ไม่ได้)
//
// ลำดับ: .env ที่ root ของ repo (ไฟล์เดียวกับที่ docker compose ใช้)
//        แล้วทับด้วย server/.env ถ้ามี (เผื่ออยากตั้งค่าเฉพาะ server ตอน dev)
//
// ใน container ไม่มีไฟล์ .env เลย — ค่าทั้งหมดมาจาก compose environment
// dotenv จะไม่ทับค่าที่ตั้งไว้แล้วใน process.env (ไม่ได้ใส่ override) จึงปลอดภัย
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

module.exports = {};
