import { useState } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUrl';

/**
 * รูปโปรไฟล์ผู้ใช้ — ไม่มีรูปก็ขึ้นอักษรตัวแรกของ "ชื่อจริง" แทน
 *
 * รูปมาจากสองทาง:
 *   user.avatar    — data URL ที่ server ฝังมาให้ตอนล็อกอิน (รูปบัญชีจาก SchoolOS)
 *                    endpoint รูปของ SchoolOS ต้องใช้ API key ซึ่งห้ามหลุดมาฝั่งนี้
 *                    จึงส่งมาเป็น base64 แทน URL
 *   user.photo_url — รูปที่อัปโหลดไว้ในระบบนี้เอง (ของนักเรียน) มาก่อนรูปจาก SchoolOS
 *                    เพราะเป็นรูปที่เจ้าตัวตั้งใจเลือกเอง
 */

// คำนำหน้าที่ SchoolOS ต่อติดมากับชื่อเต็มโดยไม่มีช่องว่าง ("นายชรินทร์ รีนับถือ")
// ถ้าไม่ตัดออก ครูทั้งโรงเรียนจะได้อักษรย่อ "น" เหมือนกันหมด
// เรียงตัวยาวไว้ก่อนตัวสั้น เพื่อให้ "นางสาว" ถูกตัดก่อน "นาง"
const NAME_PREFIXES = [
  'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'ว่าที่ ร.ต.',
  'เด็กชาย', 'เด็กหญิง', 'นางสาว', 'นาง', 'นาย',
  'ด.ช.', 'ด.ญ.', 'น.ส.',
  'ดร.', 'ผศ.', 'รศ.', 'ศ.',
  'Mr.', 'Mrs.', 'Miss', 'Ms.',
];

function stripPrefix(name) {
  const s = String(name || '').trim();
  for (const p of NAME_PREFIXES) {
    if (s.startsWith(p)) return s.slice(p.length).trim();
  }
  return s;
}

/** อักษรตัวแรกของชื่อจริง — ใช้ first_name ถ้ามี ไม่งั้นตัดคำนำหน้าออกจากชื่อเต็ม */
function userInitial(user) {
  const name = String(user?.first_name || '').trim() || stripPrefix(user?.name);
  const source = name || String(user?.username || '').trim();
  // [...s] ไม่ใช่ s[0] — กันตัวอักษรที่กิน 2 code unit โดนตัดครึ่ง
  return source ? [...source][0].toUpperCase() : '?';
}

function userPhoto(user) {
  if (user?.avatar) return user.avatar; // data URL — ไม่ต้องผ่าน resolveMediaUrl (มันกัน data: ไว้)
  return user?.photo_url ? resolveMediaUrl(user.photo_url) : null;
}

/** className กำหนดขนาด/สีพื้นหลังของวงกลม (เช่น "size-9 bg-primary text-primary-content") */
export default function Avatar({ user, className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null);

  const photo = userPhoto(user);
  // รูปโหลดไม่ขึ้น (ไฟล์หาย/data URL เพี้ยน) → ตกไปใช้อักษรย่อ ไม่ปล่อยให้เป็นกรอบว่าง
  const src = photo && photo !== failedSrc ? photo : null;
  const label = user?.name || user?.username || '';

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`}
      title={label || undefined}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedSrc(photo)}
        />
      ) : (
        userInitial(user)
      )}
    </span>
  );
}
