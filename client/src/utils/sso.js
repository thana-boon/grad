// ─── Silent SSO — เข้าระบบต่อจาก SchoolOS โดยไม่ต้องกรอกรหัสซ้ำ ───────────────
//
// ลำดับที่หน้า login ทำตอนเปิด:
//   1. ถามค่าคอนฟิกจาก server ของเรา (ที่อยู่ SchoolOS + ชื่อ audience)
//   2. ขอ "โค้ดใช้ครั้งเดียว" จาก SchoolOS ด้วย cookie ของผู้ใช้เอง
//      · ยังไม่ได้ล็อกอิน → ตอบ 200 พร้อม valid:false (ไม่ใช่ error) → แสดงฟอร์มตามปกติ
//   3. ส่งโค้ดให้ server ของเราไปแลกเป็นตัวตนด้วย API key แล้วออก token ของ GradTrack
//
// กติกาที่ห้ามพลาด:
//   · โค้ดคือ credential ชั่วคราว — ห้ามเก็บลง localStorage / ห้ามใส่ใน URL / ห้าม log
//   · ใช้ได้ครั้งเดียว ยิงซ้ำด้วยโค้ดเดิมจะได้ used_code → ต้องขอใหม่เสมอ
//   · ล้มเหลวเมื่อไหร่ก็แค่ "แสดงหน้า login ตามปกติ" ห้ามทำให้หน้าเว็บค้างหรือพัง
import api from './api';

// เพดานรอคำตอบจาก SchoolOS — เกินกว่านี้ให้ไปแสดงฟอร์มเลย ดีกว่าปล่อยจอค้าง
const PROBE_TIMEOUT_MS = 6000;

// ─── ปิด silent SSO ชั่วคราว ─────────────────────────────────────────────────
// ใช้ตอนกด "ออกจากระบบ": คำขอ logout ไปที่ SchoolOS เป็น async แต่หน้า login
// ถูก render ทันที ถ้าไม่กันไว้ probe อาจวิ่งชนะแล้วดึงผู้ใช้กลับเข้าระบบเอง
//
// ตั้งเวลาสั้น ๆ พอกันจังหวะนั้น ไม่ได้ปิดถาวร — พอ session ของ SchoolOS ถูกลบจริง
// probe ก็จะได้ valid:false เองอยู่แล้ว และถ้าผู้ใช้ไปล็อกอิน SchoolOS ใหม่
// ก็ควรกลับมาเข้า GradTrack ได้เลยโดยไม่ต้องรอ
const BLOCK_KEY = 'ssoBlockUntil';
const BLOCK_MS = 30 * 1000;

export function blockSilentLogin(ms = BLOCK_MS) {
  localStorage.setItem(BLOCK_KEY, String(Date.now() + ms));
}

export function clearSilentLoginBlock() {
  localStorage.removeItem(BLOCK_KEY);
}

export function isSilentLoginBlocked() {
  const until = Number(localStorage.getItem(BLOCK_KEY));
  return Number.isFinite(until) && until > 0 && Date.now() < until;
}

// ─── คอนฟิก (จาก server ของเรา) ──────────────────────────────────────────────
// อ่านครั้งเดียวต่อการโหลดหน้า — ค่าไม่เปลี่ยนระหว่างใช้งาน
let configPromise = null;

function loadConfig() {
  if (!configPromise) {
    configPromise = api
      .get('/auth/sso/config')
      .then((res) => res.data)
      // server ตอบไม่ได้ = ถือว่าไม่มี SSO ไปหน้า login ปกติ
      .catch(() => ({ enabled: false }));
  }
  return configPromise;
}

/** ต่อ base ของ SchoolOS เข้ากับ path — base เป็น path ล้วน ("/users") หรือ URL เต็มก็ได้ */
const usersUrl = (base, path) => `${base || ''}${path}`;

/**
 * ขอโค้ด handoff — คืน null เมื่อ "ยังไม่ได้ล็อกอิน SchoolOS" หรือขอไม่สำเร็จ
 * ทั้งสองกรณีจบเหมือนกันคือให้ผู้ใช้กรอกรหัสเอง จึงไม่ต้องแยก
 */
async function getHandoffCode({ usersBase, audience }) {
  try {
    const res = await fetch(
      usersUrl(usersBase, `/api/auth/handoff?audience=${encodeURIComponent(audience)}`),
      {
        credentials: 'include', // ขาดบรรทัดนี้ = ได้ valid:false ตลอด (cookie ไม่ถูกส่ง)
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      }
    );
    if (!res.ok) return null; // 400/403/429 = ตั้งค่าไม่ครบหรือขอถี่ไป → ไปหน้า login
    const data = await res.json();
    return data?.valid ? data.code : null;
  } catch {
    // ต่อไม่ได้ / หมดเวลา / ตอบไม่ใช่ JSON (เช่นตอน dev ที่ยังไม่ได้ชี้ base มาที่ SchoolOS)
    return null;
  }
}

/**
 * ลองเข้าระบบเงียบ ๆ
 * @returns { token, user } เมื่อสำเร็จ · null เมื่อยังไม่ได้ล็อกอิน SchoolOS หรือ SSO ปิดอยู่
 * @throws  error ของ axios เมื่อ server ปฏิเสธแบบมีเหตุผล (403 = ไม่มีสิทธิ์เข้าระบบนี้)
 */
export async function trySilentLogin() {
  const config = await loadConfig();
  if (!config?.enabled) return null;

  const code = await getHandoffCode(config);
  if (!code) return null;

  const res = await api.post('/auth/sso', { code });
  return res.data;
}

/**
 * พาออกไปหน้า portal ของ SchoolOS เมื่อ session ของเราจบ
 *
 * ⚠️ เรียกเฉพาะ "จังหวะที่ session เพิ่งจบ" เท่านั้น ห้ามเรียกตอน render หน้า login
 * ไม่งั้นจะวนไม่รู้จบ: portal → กดเข้า GradTrack → หน้า login → เด้งกลับ portal → ...
 * หน้า login ต้องยังเปิดดูได้เสมอ เพราะเป็นทางเข้าเดียวของบัญชี local ตอน SchoolOS ล่ม
 *
 * @param logoutFirst true = ออกจาก SchoolOS ระหว่างทางด้วย (ใช้ตอนกดปุ่มออกจากระบบ)
 *   ทำในการ navigate ครั้งเดียวผ่าน ?next= เชื่อถือได้กว่ายิง POST ทิ้งไว้แล้วรีบเปลี่ยนหน้า
 *   ซึ่งเบราว์เซอร์อาจตัดทิ้งกลางคันจนออกจากระบบไม่สำเร็จ
 */
export async function leaveToPortal({ logoutFirst = false } = {}) {
  let target = '/';
  try {
    const config = await loadConfig();
    const portal = config?.portalUrl || '/';
    target =
      logoutFirst && config?.enabled
        ? usersUrl(config.usersBase, `/api/auth/logout?next=${encodeURIComponent(portal)}`)
        : portal;
  } catch {
    /* อ่านค่าไม่ได้ → กลับหน้าแรกของโดเมนนี้ ดีกว่าค้างอยู่เฉย ๆ */
  }
  window.location.assign(target);
}

/**
 * ต่ออายุ session ของ SchoolOS
 *
 * จำเป็นเพราะ SchoolOS **ไม่นับ** การใช้งานในระบบเราเป็น activity ของ session
 * (API.md §4.10 จงใจให้เป็นแบบนี้ ไม่งั้นแท็บที่เปิดค้างไว้จะทำให้ session ไม่มีวันตาย)
 * ครูที่นั่งทำงานใน GradTrack จนเกิน idle window ของ SchoolOS โดยไม่แตะหน้านั้นเลย
 * จึงหลุดจาก SchoolOS เงียบ ๆ
 * แล้วรอบหน้าที่เปิด /grad ก็ต้องกรอกรหัสใหม่ทั้งที่เพิ่งใช้งานอยู่แท้ ๆ
 *
 * เงียบเสมอ: 401 = ไม่มี session ให้ต่อ (ล็อกอินด้วยรหัสผ่านมา ไม่ได้มาทาง SSO)
 * ซึ่งเป็นเรื่องปกติ ไม่ใช่ error
 */
export async function refreshSchoolOSSession() {
  try {
    const config = await loadConfig();
    if (!config?.enabled) return;
    await fetch(usersUrl(config.usersBase, '/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    /* ต่อไม่ได้ก็ปล่อย — ผลอย่างมากคือต้องล็อกอิน SchoolOS ใหม่รอบหน้า */
  }
}

// การออกจากระบบที่ SchoolOS ย้ายไปทำใน leaveToPortal({ logoutFirst: true })
// ด้วยการ navigate ไป /api/auth/logout?next= ครั้งเดียว — เชื่อถือได้กว่ายิง POST
// ทิ้งไว้แล้วรีบเปลี่ยนหน้า ซึ่งเบราว์เซอร์ยกเลิก request กลางคันได้
