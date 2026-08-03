// ─── นโยบายหมดเวลาใช้งาน (ฝั่ง client) ──────────────────────────────────────
//
// มีสองชั้นซ้อนกัน:
//   1. ไม่ขยับ 15 นาที → หลุด            ← ไฟล์นี้
//   2. token หมดอายุตามจริง (JWT_EXPIRES_IN ฝั่ง server, ค่าเริ่มต้น 8h) → หลุด
//
// ⚠️  ชั้นที่ 1 เป็นแค่ "ล็อกหน้าจอที่เปิดค้างไว้" ไม่ใช่มาตรการความปลอดภัย —
//     ใครลบ lastActivity ใน localStorage ทิ้งก็ข้ามได้ ตัวที่บังคับจริงคือ
//     อายุ token ที่ server ตรวจใน verifyToken เสมอ
//
// นับเวลาผ่าน localStorage ไม่ใช่ตัวแปรในหน่วยความจำ เพื่อให้
//   · reload หน้าแล้วนาฬิกาไม่รีเซ็ต (ไม่งั้นเปิดค้างข้ามคืนแล้ว F5 ก็ยังอยู่)
//   · ขยับในแท็บหนึ่ง = แท็บอื่นไม่หลุดตาม (ครูเปิดหลายแท็บพร้อมกันเป็นเรื่องปกติ)

// ตั้งเป็นนาทีไว้ตัวเดียว แล้วให้ข้อความที่หน้า login อ้างอิงค่านี้ — เคยมีปัญหา
// แก้ตัวเลขที่นี่แล้วลืมแก้ข้อความ ผู้ใช้เลยอ่านเจอเวลาที่ไม่ตรงกับของจริง
//
// ต้องไม่ยาวกว่า idle window ของ SchoolOS (SESSION_IDLE_MINUTES) ไม่งั้นจะเจอ
// สภาพ "ยังอยู่ใน GradTrack แต่ SchoolOS ตายไปแล้ว" แล้วต้องกรอกรหัสใหม่ทั้งที่
// เพิ่งใช้งานอยู่แท้ ๆ
export const IDLE_TIMEOUT_MINUTES = 15;
export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

// เขียน lastActivity ถี่สุดทุก ๆ เท่านี้ — กัน mousemove ยิง localStorage รัวๆ
const ACTIVITY_WRITE_INTERVAL_MS = 30 * 1000;

const LAST_ACTIVITY_KEY = 'lastActivity';
const LOGOUT_REASON_KEY = 'logoutReason';
const LOGOUT_AT_KEY = 'logoutAt';

export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';

// เหตุผลที่หลุด — ใช้บอกผู้ใช้ที่หน้า login ว่าไม่ได้กดออกเอง
export const LOGOUT_REASONS = {
  IDLE: 'idle',       // ไม่ได้ใช้งานนานเกินกำหนด
  EXPIRED: 'expired', // token หมดอายุ / server ตอบ 401
};

// ─── บันทึกความเคลื่อนไหว ────────────────────────────────────────────────────

let lastWrite = 0;

export function markActivity({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) return;
  lastWrite = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
}

export function clearActivity() {
  lastWrite = 0;
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}

/**
 * ผ่านมากี่ ms ตั้งแต่ผู้ใช้ขยับล่าสุด · Infinity = ยังไม่เคยบันทึก
 * ใช้ตัดสินว่า "ยังทำงานอยู่จริง" ก่อนไปต่ออายุ session ของ SchoolOS ให้
 */
export function msSinceActivity() {
  const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  if (!Number.isFinite(last) || last <= 0) return Infinity;
  return Date.now() - last;
}

export function isIdleExpired() {
  const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  // ยังไม่เคยบันทึก = เพิ่งอัปเดตมาจากเวอร์ชันก่อนหน้าที่ยังไม่มีฟีเจอร์นี้
  // → ปล่อยให้อายุ token เป็นตัวตัดสินแทน ไม่เตะออกทันทีโดยไม่มีเหตุ
  if (!Number.isFinite(last) || last <= 0) return false;
  return Date.now() - last >= IDLE_TIMEOUT_MS;
}

// ─── อ่านวันหมดอายุจาก JWT ───────────────────────────────────────────────────
// decode เฉย ๆ ไม่ verify — ใช้เพื่อ "รู้ล่วงหน้า" ว่าหมดอายุแล้วจะได้ไม่ต้อง
// ยิง request ไปให้ server ตอบ 401 ก่อน ความถูกต้องจริงตรวจที่ server เสมอ

export function getTokenExpiry(token) {
  if (!token) return 0;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(base64));
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0; // token พัง → ให้ 401 จาก server จัดการ
  }
}

export function isTokenExpired(token) {
  const exp = getTokenExpiry(token);
  return exp > 0 && Date.now() >= exp;
}

// ─── เหตุผลที่หลุด (ส่งต่อไปหน้า login) ──────────────────────────────────────

// เขียนทุกครั้งที่ session จบ — ส่ง null เมื่อผู้ใช้กดออกเอง เพื่อล้างเหตุผลเก่าทิ้ง
// (ไม่งั้นกดออกเองแล้วยังเห็นข้อความ "หมดเวลา" จากรอบก่อนค้างอยู่)
//
// เก็บ "เมื่อไหร่" ไว้ด้วย เพราะเหตุผลนี้เป็นคำอธิบายของ *ตอนนี้* ไม่ใช่ตราประทับถาวร
// ดู wasRecentlyLoggedOut()
export function setLogoutReason(reason) {
  if (reason) {
    localStorage.setItem(LOGOUT_REASON_KEY, reason);
    localStorage.setItem(LOGOUT_AT_KEY, String(Date.now()));
  } else {
    localStorage.removeItem(LOGOUT_REASON_KEY);
    localStorage.removeItem(LOGOUT_AT_KEY);
  }
}

/**
 * เพิ่งถูกเตะออกไปหมาด ๆ หรือเปล่า (ไม่ใช่ "เคยถูกเตะเมื่อไหร่ก็ได้")
 *
 * ใช้ตัดสินสองอย่างที่ต้องไปด้วยกัน: จะโชว์ข้อความ "หมดเวลา" ไหม และจะข้าม
 * silent SSO ไหม — เพราะถ้าเพิ่งโดนเตะ ผู้ใช้ควรได้เห็นเหตุผลแล้วกรอกรหัสเอง
 *
 * ⚠️ ห้ามดูแค่ว่า "มี logoutReason ค้างอยู่ไหม" — ค่านั้นถูกล้างตอนล็อกอินสำเร็จ
 * เท่านั้น เบราว์เซอร์ที่เคยหมดเวลาสักครั้งจึงติดธงนี้ค้างข้ามวัน แล้ว silent SSO
 * จะไม่ทำงานอีกเลยจนกว่าจะกรอกรหัสด้วยมือ (อาการ "บางเครื่องเข้าเอง บางเครื่องไม่เข้า")
 *
 * ไม่มี logoutAt = ข้อมูลจากเวอร์ชันก่อนหน้า → ถือว่าเก่าแล้ว
 */
export function wasRecentlyLoggedOut(withinMs = IDLE_TIMEOUT_MS) {
  if (!localStorage.getItem(LOGOUT_REASON_KEY)) return false;
  const at = Number(localStorage.getItem(LOGOUT_AT_KEY));
  if (!Number.isFinite(at) || at <= 0) return false;
  return Date.now() - at < withinMs;
}

// อ่านเฉย ๆ ไม่ลบ — คนที่ล้างคือ setLogoutReason() ตอนจบ session รอบถัดไป
// และตอน login สำเร็จ จึงอ่านตอน render ได้โดยค่าไม่กระโดดระหว่างรีเรนเดอร์
export function getLogoutReason() {
  return localStorage.getItem(LOGOUT_REASON_KEY);
}

// ─── สะพานระหว่าง axios interceptor กับ AuthContext ──────────────────────────
// interceptor อยู่นอก React จึงเรียก logout() ของ context ตรง ๆ ไม่ได้
// AuthContext ฝากฟังก์ชันไว้ตอน mount แล้ว interceptor เรียกผ่านตัวนี้

let sessionExpiredHandler = null;

export function setSessionExpiredHandler(fn) {
  sessionExpiredHandler = fn;
}

export function notifySessionExpired(reason = LOGOUT_REASONS.EXPIRED) {
  if (sessionExpiredHandler) {
    sessionExpiredHandler(reason);
    return;
  }
  // ยังไม่มี AuthContext (เช่นหน้า print ที่อยู่นอกโครงแอป) → เคลียร์เองแบบดิบ ๆ
  setLogoutReason(reason);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearActivity();
}
