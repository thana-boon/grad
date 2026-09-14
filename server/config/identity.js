// ─── ตัวตนใน token ของ GradTrack ─────────────────────────────────────────────
//
// จุดเดียวในระบบที่รู้ว่า "claim ไหนคือตัวตน" — signToken() บังคับให้ทุกใบผ่านตัวนี้
// ไม่ว่าจะออกจากล็อกอินด้วยรหัสผ่าน · silent SSO · หรือการต่ออายุ (/auth/refresh)
//
// ทำไมต้องรวมไว้ที่เดียว: /auth/refresh ออกใบใหม่จาก claim ของใบเก่า ถ้าที่นั่น
// (หรือที่ไหนก็ตามที่ออก token) ลืมคัดลอก claim ไปสักตัว claim นั้นจะหายเงียบ ๆ
// ตอนต่ออายุครั้งแรก — อาการคือ "บั๊กหายไปพักหนึ่งแล้วกลับมาเอง" ซึ่งไล่หาสาเหตุยากมาก
// โดยเฉพาะ ssoSub: หายเมื่อไหร่ ตัวตรวจสลับคน (client/src/components/SessionGuard.jsx)
// ก็หยุดทำงานทันทีโดยไม่มีอะไรฟ้อง
//
// ⚠️ เพิ่ม claim ใหม่ต้องมาเติมชื่อในรายการนี้ด้วย ไม่งั้นมันจะไม่ถูกใส่ลง token เลย
//    (มีเทสคุมไว้ที่ server/tests/identity.test.js)

// ทางที่ session นี้เข้ามา — ไม่ใช่ค่าไว้แสดงผล แต่เป็นตัวตัดสินว่าจะเอา session ใบนี้
// ไปเทียบกับ session ของ SchoolOS หรือเปล่า
//   sso      — รับช่วงมาจาก session ของ SchoolOS (ผูกกับ ssoSub ที่ต้องเทียบสด)
//   password — กรอกรหัสผ่านของ SchoolOS เอง: ไม่มี session ฝั่งแพลตฟอร์มให้ผูก
//   local    — บัญชีในตาราง users (ทางเข้าสำรองตอน SchoolOS ล่ม) ยิ่งห้ามไปผูก
const VIA = { SSO: 'sso', PASSWORD: 'password', LOCAL: 'local' };

const FIELDS = [
  'id',            // ครู/ผู้ดูแล — id ใน SchoolOS หรือในตาราง users
  'student_code',  // นักเรียน — รหัสนักเรียน (ตัวระบุตัวตนหลักของฝั่งนักเรียน)
  'username',
  'name',
  'role',          // admin | teacher | student
  'source',        // schoolos | local — ทะเบียนที่บัญชีนี้อยู่
  'via',           // ดู VIA ข้างบน
  // sub ของ session ฝั่ง SchoolOS ที่รับช่วงมา (= รหัสครู/รหัสนักเรียน) เก็บดิบ ๆ
  // ไม่แปลง เพราะต้องเอาไปเทียบกับค่าที่ GET /api/auth/session ของ SchoolOS ตอบมา
  // ตรง ๆ — id ในฐานข้อมูลเราเองเทียบอะไรกับฝั่งโน้นไม่ได้เลย
  'ssoSub',
  // ─── นาฬิกาของ session ใบนี้ (มาจาก SchoolOS ตอน redeem handoff) ────────────
  // 'web' | 'pwa' — ชุดหน้าต่างเวลาที่แพลตฟอร์มจัดให้ session นี้
  //   web = แท็บบนเครื่องส่วนกลาง (สั้น) · pwa = แอปที่ติดตั้งบนมือถือของเจ้าตัว (ยาว)
  // ⚠️ คัดลอกอย่างเดียว ห้ามเดาจาก User-Agent หรือ display-mode ฝั่งเรา ไม่งั้นสองระบบ
  //    จะถือความเห็นคนละอย่างเรื่อง session เดียวกัน · ไม่มีค่า = อ่านเป็น web (สั้นกว่า)
  'client',
  // เพดานสัมบูรณ์ของ session ฝั่งแพลตฟอร์ม (epoch ms) — คัดลอกดิบ ๆ ไม่คำนวณเอง
  // ⚠️ null กับ undefined ความหมายตรงข้ามกัน (ดู NULLABLE ข้างล่าง)
  'capAt',
];

// claim ที่ `null` เป็น "คำตอบ" ไม่ใช่ "ไม่มีค่า" จึงต้องรอดข้ามการต่ออายุไปทั้งอย่างนั้น
//
// capAt: null = แพลตฟอร์มบอกว่า session นี้ไม่มีเพดานเลย (ค่าปกติของแอปที่ติดตั้ง)
// capAt: undefined = โทเคนรุ่นเก่าที่ไม่เคยมีฟิลด์นี้ → ตกไปใช้ JWT_EXPIRES_IN ตามเดิม
// ตัวกรองด้านล่างเคยทิ้ง null ทุกตัว ซึ่งจะยุบสองความหมายนี้เป็นอันเดียว แล้วมือถือที่
// ควรอยู่ได้เป็นเดือนก็หดเหลือ 8 ชั่วโมงตั้งแต่การต่ออายุครั้งแรก
const NULLABLE = new Set(['capAt']);

/** คัดเฉพาะ claim ที่เป็นตัวตน (ทิ้ง iat/exp ของใบเก่าไปในตัว) */
function identityOf(claims = {}) {
  const identity = {};
  for (const field of FIELDS) {
    const value = claims[field];
    if (value === undefined) continue;
    if (value === null && !NULLABLE.has(field)) continue;
    identity[field] = value;
  }
  return identity;
}

module.exports = { identityOf, IDENTITY_FIELDS: FIELDS, NULLABLE_FIELDS: NULLABLE, VIA };
