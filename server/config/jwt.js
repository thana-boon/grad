const jwt = require('jsonwebtoken');

// ─── อายุ token ──────────────────────────────────────────────────────────────
// เพดานแข็งของ session: ครบเมื่อไรก็หลุด ต่อให้ยังนั่งใช้งานอยู่
//
// 8h = ครบหนึ่งวันทำงานพอดี ครูล็อกอินตอนเช้าแล้วใช้ได้ทั้งวันโดยไม่ต้องกรอกซ้ำ
// แต่เครื่องที่ลืมล็อกเอาต์ไว้ในห้องพักครูจะไม่ค้างข้ามคืน
//
// อีกชั้นคือ idle timeout 30 นาทีฝั่ง client (client/src/utils/session.js)
// ซึ่งเป็นแค่การล็อกหน้าจอ — ตัวที่บังคับจริงคือค่านี้ เพราะ server เป็นคนตรวจ
//
// รูปแบบค่าตาม zeit/ms เช่น '30m' · '8h' · '7d' (ตัวเลขเปล่า = วินาที)
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

module.exports = { signToken, EXPIRES_IN };
