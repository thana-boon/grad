const jwt = require('jsonwebtoken');

// ─── อายุ token ──────────────────────────────────────────────────────────────
// 8h = ครบหนึ่งวันทำงานพอดี ครูล็อกอินตอนเช้าแล้วใช้ได้ทั้งวันโดยไม่ต้องกรอกซ้ำ
//
// ⚠️ ไม่ใช่ "เพดานแข็ง" อีกต่อไป — POST /api/auth/refresh ต่ออายุให้คนที่ยังนั่ง
// ทำงานอยู่จริง (ไม่งั้นครูที่กรอกข้อมูลค้างอยู่จะถูกเตะออกกลางคันแล้วข้อมูลหาย)
// ตัวที่คุมว่าเครื่องที่ลืมล็อกเอาต์จะไม่ค้างข้ามคืนคือ idle timeout ฝั่ง client
// ซึ่งกันเคสนั้นได้ตรงกว่าอยู่แล้ว
//
// อีกชั้นคือ idle timeout 15 นาทีฝั่ง client (client/src/utils/session.js)
// ซึ่งเป็นแค่การล็อกหน้าจอ — ตัวที่บังคับจริงคือค่านี้ เพราะ server เป็นคนตรวจ
//
// รูปแบบค่าตาม zeit/ms เช่น '30m' · '8h' · '7d' (ตัวเลขเปล่า = วินาที)
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * @param expiresIn ทับอายุเริ่มต้นได้ — ใช้ตอนรับช่วง session มาจาก SchoolOS (silent SSO)
 *   ซึ่ง token ของเราต้องไม่มีอายุยาวเกิน session ต้นทาง ไม่งั้นผู้ใช้จะ "ยังอยู่ใน
 *   GradTrack" ทั้งที่ SchoolOS หมดอายุไปแล้ว (ดู routes/sso.js)
 */
function signToken(payload, { expiresIn } = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: expiresIn || EXPIRES_IN });
}

module.exports = { signToken, EXPIRES_IN };
