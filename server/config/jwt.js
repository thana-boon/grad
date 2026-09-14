const jwt = require('jsonwebtoken');
const { identityOf } = require('./identity');

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

// ─── อายุ token ของแอปที่ติดตั้งบนมือถือ ──────────────────────────────────────
//
// 8 ชั่วโมงคือ "หนึ่งวันทำงาน" ซึ่งเป็นหน่วยที่ถูกสำหรับเครื่องในห้องพักครู แต่ผิดสนิท
// สำหรับมือถือของเจ้าตัว: เครื่องมีล็อกหน้าจอของตัวเอง และแอปถูกเปิด-ปิดวันละสามสิบครั้ง
// ครูที่ติดตั้งแอปไว้จึงต้องล็อกอินใหม่แทบทุกเช้า ทั้งที่ SchoolOS ยังจำเขาได้เป็นเดือน
//
// เพดานเดียวกับฝั่ง Users (SESSION_PWA_IDLE_DAYS) และ clamp มีไว้กันทางเดียว: ของเรา
// ต้องไม่อยู่ยาวกว่าแพลตฟอร์ม · การตั้งให้ "สั้นกว่า" เป็นบั๊กของตัวเอง เพราะมือถือจะหลุด
// ทั้งที่ SchoolOS ยังล็อกอินอยู่ แล้วไม่มีใครฝั่งไหนอธิบายได้ว่าทำไม
const PWA_MAX_DAYS = 30;
const PWA_EXPIRES_IN = (() => {
  const n = Number(process.env.JWT_PWA_EXPIRES_DAYS);
  const days = Number.isFinite(n) && n > 0 ? Math.min(n, PWA_MAX_DAYS) : PWA_MAX_DAYS;
  return `${Math.round(days)}d`;
})();

/**
 * อายุที่จะเขียนลงใบนี้ — หน้าต่างของ client ชนิดนั้น แล้วตัดด้วยเพดานของแพลตฟอร์ม
 *
 * ⚠️ คำนวณตรงนี้ ไม่ใช่ที่ผู้เรียก เพราะ /auth/refresh ออกใบใหม่จาก claim ของใบเก่าและ
 * ไม่มีทางรู้ค่าที่ route ตอนล็อกอินเคยส่งมา · เดิมเพดานจาก SSO ถูกส่งเป็น expiresIn
 * ตอนล็อกอินเท่านั้น แล้วหายไปตั้งแต่การต่ออายุครั้งแรก — token ใบที่สองจึงกลับไปเป็น
 * 8 ชั่วโมงเต็มเสมอ ไม่ว่า session ต้นทางจะเหลือเวลาเท่าไร
 *
 * @param claims ตัวตนที่ผ่าน identityOf() มาแล้ว (มี client / capAt ถ้ามี)
 * @param override อายุที่ผู้เรียกบังคับมาเอง (วินาที หรือรูปแบบ zeit/ms)
 */
function expiryFor(claims, override) {
  const window = override || (claims.client === 'pwa' ? PWA_EXPIRES_IN : EXPIRES_IN);

  // undefined = โทเคน/แพลตฟอร์มไม่ได้ตอบเรื่องเพดานเลย · null = ตอบว่า "ไม่มีเพดาน"
  // สองอย่างนี้ต้องไม่ถูกรวบ ไม่งั้นความเงียบจะกลายเป็น session ที่ไม่มีวันหมดอายุ
  if (claims.capAt === undefined || claims.capAt === null) return window;

  const left = Math.floor((Number(claims.capAt) - Date.now()) / 1000);
  if (!Number.isFinite(left)) return window;
  // เพดานผ่านไปแล้ว: ออกใบที่ตายทันที ดีกว่าออกใบที่ไม่มีวันหมดอายุ — request ถัดไป 401
  // แล้วผู้ใช้ไปล็อกอินใหม่ ซึ่งเป็นสิ่งที่เพดานสัมบูรณ์มีไว้บังคับพอดี
  if (left <= 0) return 1;

  const windowSeconds = typeof window === 'number' ? window : null;
  // เทียบได้เฉพาะเมื่อ window เป็นตัวเลข — รูปแบบ '8h' ปล่อยให้ jsonwebtoken ตีความ
  // แล้วเราส่งค่าที่เล็กกว่าไปแทนเมื่อเพดานใกล้กว่าหน้าต่างปกติ
  if (windowSeconds !== null) return Math.min(windowSeconds, left);
  return Math.min(left, windowToSeconds(window));
}

/** แปลงรูปแบบ zeit/ms ที่เราใช้จริง ('8h' · '30d' · '900') เป็นวินาที */
function windowToSeconds(window) {
  const m = /^(\d+(?:\.\d+)?)\s*(s|m|h|d)?$/i.exec(String(window).trim());
  if (!m) return Number.MAX_SAFE_INTEGER; // อ่านไม่ออก = อย่าไปตัดให้สั้นโดยไม่ตั้งใจ
  const unit = (m[2] || 's').toLowerCase();
  const per = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  return Math.round(Number(m[1]) * per);
}

/**
 * ทางเดียวในระบบที่ออก token — payload ถูกกรองผ่าน identityOf() เสมอ
 *
 * ที่บังคับผ่านตัวกรองตรงนี้ (แทนที่จะขอความร่วมมือให้ผู้เรียกส่งครบ) เพราะจุดที่ออก
 * token มีหลายที่ (ล็อกอินครู · ล็อกอินนักเรียน · silent SSO · ต่ออายุ) ลืมที่เดียว
 * claim ก็หายเงียบ ๆ — ดูเหตุผลเต็มใน config/identity.js
 * ผลพลอยได้: /auth/refresh ส่ง req.user เข้ามาทั้งก้อนได้เลย iat/exp ถูกตัดให้ในตัว
 *
 * @param expiresIn ทับอายุเริ่มต้นได้ — ใช้ตอนรับช่วง session มาจาก SchoolOS (silent SSO)
 *   ซึ่ง token ของเราต้องไม่มีอายุยาวเกิน session ต้นทาง ไม่งั้นผู้ใช้จะ "ยังอยู่ใน
 *   GradTrack" ทั้งที่ SchoolOS หมดอายุไปแล้ว (ดู routes/sso.js)
 */
function signToken(payload, { expiresIn } = {}) {
  const identity = identityOf(payload);
  return jwt.sign(identity, process.env.JWT_SECRET, {
    expiresIn: expiryFor(identity, expiresIn),
  });
}

module.exports = { signToken, EXPIRES_IN, PWA_EXPIRES_IN };
