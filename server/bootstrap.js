// ─── Bootstrap — งานเตรียมข้อมูลตอนคอนเทนเนอร์สตาร์ท ─────────────────────────
//
// กฎของไฟล์นี้: **ห้าม fatal**
// ทุกอย่างในนี้เป็นความสะดวก ไม่ใช่เงื่อนไขให้ระบบทำงาน ถ้า SchoolOS ล่มตอนสตาร์ท
// แอปต้องขึ้นได้ตามปกติแล้วค่อยไปดึงข้อมูลตอนมีคนใช้งาน — ไม่ใช่ crash loop
// (index.js เรียกด้วย .catch() อีกชั้นไว้แล้ว ที่นี่กันซ้ำอีกที)
//
// หมายเหตุ: ไม่มีการสร้างบัญชี admin ที่นี่
// ผู้ดูแลของ GradTrack มาจาก role "teacher-admin" ของ SchoolOS โดยตรง —
// ครูที่ SchoolOS ตั้งเป็น teacher-admin ล็อกอินเข้ามาเป็น admin ได้ทันที ไม่ต้อง seed
const logger = require('./config/logger');
const db = require('./config/db');
const schoolos = require('./config/schoolos');

// ปีการศึกษาจาก SchoolOS → เก็บลงตาราง academic_years
// ทำให้หน้า "ปีการศึกษา" มีตัวเลือกตั้งแต่เปิดระบบครั้งแรก ไม่ใช่ dropdown ว่าง
async function cacheCurrentAcademicYear() {
  // force: ตอนสตาร์ทควรได้ของสดเสมอ ไม่ต้องรอหน้าต่างหน่วง 6 ชม.
  // ล้มก็ข้ามไป — ยังอ่านปีปัจจุบันได้จาก getAcademicYears() ข้างล่างอยู่ดี
  await schoolos.syncAcademicYears({ force: true }).catch((err) =>
    logger.warn('Bootstrap: ซิงก์รายการปีการศึกษาไม่สำเร็จ (ข้ามไป)', { error: err.message })
  );

  const { current } = await schoolos.getAcademicYears();
  if (!current) {
    logger.warn('Bootstrap: SchoolOS ไม่ได้คืนปีการศึกษาปัจจุบัน');
    return;
  }
  logger.info(`Bootstrap: ปีการศึกษาปัจจุบัน ${current.year_be} (id=${current.id})`);

  // ถ้ายังไม่เคยตั้งปี active ให้ตั้งเป็นปีปัจจุบัน — ตั้งครั้งเดียว ไม่ทับของที่ admin เลือกไว้
  await db.query(
    `INSERT INTO settings ("key", "value") VALUES ('active_year_id', ?)
     ON CONFLICT ("key") DO NOTHING`,
    [String(current.id)]
  );
}

async function bootstrap() {
  if (process.env.SKIP_BOOTSTRAP === '1') {
    logger.info('ข้าม bootstrap (SKIP_BOOTSTRAP=1)');
    return;
  }

  const tasks = [['cacheCurrentAcademicYear', cacheCurrentAcademicYear]];

  for (const [name, fn] of tasks) {
    try {
      await fn();
    } catch (err) {
      // งานหนึ่งล้ม ไม่ลากงานอื่นตาย และไม่ลากทั้งแอปตาย
      logger.warn(`Bootstrap: ${name} ล้มเหลว (ข้ามไป)`, { error: err.message });
    }
  }
}

module.exports = { bootstrap };
