// ─── withBase() — ตัวเดียวที่ควรใช้ประกอบ path ฝั่ง client ────────────────────
//
// แอปถูกเสิร์ฟใต้ subpath บน prod (schoolos.sukhon.ac.th/gradtrack/) โดย nginx
// "คง prefix ไว้" ไม่ตัดออก → path ที่เขียนตรง ๆ อย่าง "/favicon.svg" หรือ
// window.open('/admin/report/print') จะหลุดออกไปนอก /gradtrack แล้ว 404
//
// Vite เติม base ให้เฉพาะ asset ที่มัน "เห็น" ตอน build (import ... จาก JS/CSS
// และ href/src ใน index.html) — path ที่ประกอบตอน runtime มันไม่รู้จัก จึงต้องเติมเอง
//
// กฎ: โค้ดใหม่ที่ต้องได้ URL ของ "หน้าเว็บ" หรือ "ไฟล์ใน public/" ให้ผ่านฟังก์ชันนี้เสมอ
//     ห้ามอ่าน import.meta.env.BASE_URL ดิบ ๆ กระจายตามไฟล์
//
// หมายเหตุ: URL ของ API ไม่ต้องใช้ตัวนี้ — ใช้ `api` (axios instance) ที่ตั้ง
// baseURL จาก VITE_API_URL ไว้แล้ว ดู utils/api.js

// Vite รับประกันว่า BASE_URL ลงท้ายด้วย "/" เสมอ (เช่น "/" หรือ "/gradtrack/")
const BASE = import.meta.env.BASE_URL || '/';

/**
 * ต่อ path เข้ากับ base ของแอป
 *
 *   withBase('/admin/report/print')  →  '/gradtrack/admin/report/print'
 *   withBase('admin/report/print')   →  '/gradtrack/admin/report/print'
 *   withBase('/')                    →  '/gradtrack/'
 *
 * URL เต็ม (http://, https://, //, data:, blob:) คืนค่าเดิม ไม่แตะ
 */
export function withBase(path = '') {
  const p = String(path ?? '');
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(p)) return p;
  return BASE + p.replace(/^\/+/, '');
}

/** origin + base — ใช้ตอนต้องการ URL เต็ม เช่น <base href> ของหน้าต่างพิมพ์ */
export function absoluteBase() {
  return window.location.origin + BASE;
}

export default withBase;
