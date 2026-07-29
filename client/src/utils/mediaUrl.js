import { withBase } from './withBase';

export function resolveMediaUrl(src) {
  if (!src || typeof src !== 'string') return src;
  // กัน data: URL ก้อนใหญ่ (เช่น base64 ที่เผลอ paste ลง DB) ที่ทำให้ browser แครชตอน decode
  if (src.startsWith('data:')) return '';
  // กันค่ายาวผิดปกติ (ไม่ใช่ path/URL รูปปกติ)
  if (src.length > 2048) return '';
  if (src.startsWith('blob:')) return src;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;

  if (src.startsWith('/uploads/')) {
    // ค่าที่เก็บใน DB เป็น "/uploads/..." เสมอ (ตัว DB ไม่รู้จัก base path)
    // แต่ express mount /uploads ไว้ใต้ BASE_PATH → ต้องเติม prefix ให้ที่นี่
    // ไม่งั้นรูปนักเรียน/โลโก้มหาวิทยาลัย 404 ทั้งหมดตอนเสิร์ฟใต้ /grad
    return withBase(src);
  }

  return src;
}
