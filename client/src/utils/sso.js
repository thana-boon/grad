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
import { SCHOOLOS_HOME_KEY, markSilentLogin } from './session';

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
      .then((res) => {
        // เก็บที่อยู่ SchoolOS ไว้ให้ utils/session.js อ่านแบบ sync — ตอน session จบ
        // เราต้องเด้งออกไปทันทีจากที่ที่รอ await ไม่ได้ (axios interceptor)
        // ค่านี้ไม่ใช่ความลับ และเปลี่ยนเมื่อไหร่ก็ถูกทับตอนโหลดหน้าถัดไปเอง
        if (res.data?.portalUrl) localStorage.setItem(SCHOOLOS_HOME_KEY, res.data.portalUrl);
        return res.data;
      })
      // server ตอบไม่ได้ = ถือว่าไม่มี SSO ไปหน้า login ปกติ
      .catch(() => ({ enabled: false }));
  }
  return configPromise;
}

/** ต่อ base ของ SchoolOS เข้ากับ path — base เป็น path ล้วน ("/users") หรือ URL เต็มก็ได้ */
const usersUrl = (base, path) => `${base || ''}${path}`;

/**
 * ที่อยู่ที่จะส่งคนที่ไม่มี session ไปเข้าระบบ (= SCHOOLOS_PORTAL_URL)
 *
 * null = ไม่มีที่ให้ไป — ปิด silent SSO ไว้ หรืออ่านคอนฟิกจาก server ไม่ได้ ซึ่งทั้งคู่
 * แปลว่าฟอร์มของเราคือทางเข้าเดียวที่เหลืออยู่ ห้ามพาออกไปไหน
 *
 * ต่างจาก schoolosHome() ใน utils/session.js ตรงที่ตัวนั้นอ่านค่าที่ cache ไว้แบบ sync
 * (ใช้จาก axios interceptor ที่ await ไม่ได้) และ fallback เป็น "/" เสมอ ตัวนี้ใช้ตอน
 * ตัดสินใจว่า "จะพาออกไปไหม" จึงต้องแยก "ไม่มีที่ให้ไป" ออกจาก "ไปหน้าแรกของโดเมนนี้"
 */
export async function portalTarget() {
  const config = await loadConfig();
  if (!config?.enabled) return null;
  return String(config.portalUrl || '').trim() || null;
}

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

// ─── เส้นตายของ session ฝั่ง SchoolOS ────────────────────────────────────────
//
// AuthContext ต่ออายุ session แพลตฟอร์มโดยยึดค่านี้ ไม่ใช่ยึดนาฬิกาของตัวเอง และนั่นคือ
// บั๊กทั้งก้อนที่มันถูกเขียนมาแก้: cadence คงที่ ("ทุก 10 นาที") นับจากตอน component mount
// ซึ่งไม่มีความสัมพันธ์อะไรเลยกับนาฬิกาที่ฆ่า session จริง ๆ — มาถึงด้วย handoff ไม่ได้แปลว่า
// เพิ่งเริ่มนับ 15 นาที (ทั้ง handoff และ GET /api/auth/session จงใจไม่เลื่อน idle window)
// session จึงอาจเหลืออีกสองนาทีตอนหน้าเราโหลดเสร็จ แล้วการต่ออายุครั้งแรกไปตกตอนมันตายแล้ว
// แถมทุกการโหลดหน้าใหม่รีเซ็ตตัวนับนั้น คนที่คลิกไปมาทุก ๆ 9 นาทีจึงไม่เคยต่ออายุเลยสักครั้ง
// แล้วถูกเด้งออกคามือที่นาทีที่ 15
//
// เก็บใน localStorage เพราะสิ่งที่กำลังอธิบายคือ cookie ใบเดียวของทั้งเบราว์เซอร์ ค่านี้จึงต้อง
// รอดข้ามการโหลดหน้าและเหมือนกันทุกแท็บ · มันเป็นคำตอบที่แคชไว้ ไม่ใช่ credential — ถือไว้แล้ว
// ไม่ได้สิทธิ์อะไรเพิ่ม server ตัดสินใหม่ทุกครั้งอยู่ดี และเบราว์เซอร์ที่เก็บไม่ได้ก็แค่ตกไปใช้
// ทางสำรองที่ถามถี่กว่า
const PLATFORM_EXP_KEY = 'schoolosExpiresAt';

/** จดเส้นตายไว้ · null = SchoolOS บอกว่าไม่มี session แล้ว ให้ลบทิ้ง */
export function rememberPlatformExpiry(at) {
  try {
    if (at === null || !Number.isFinite(at)) localStorage.removeItem(PLATFORM_EXP_KEY);
    else localStorage.setItem(PLATFORM_EXP_KEY, String(at));
  } catch {
    /* storage ปิดอยู่ก็ไม่เป็นไร — platformExpiry() จะคืน null แล้วตกไปใช้ทางสำรอง */
  }
}

/**
 * เส้นตาย หรือ null เมื่อยังไม่รู้ (เบราว์เซอร์ที่เก็บไม่ได้ / โหลดแรกหลังแพตช์นี้ขึ้น)
 * null ต้องแปลว่า "ไปถามมา" ห้ามแปลว่า "ยังเหลือเวลาอีกเยอะ" — ผู้เรียกที่เข้าใจแบบหลัง
 * คือผู้เรียกที่ปล่อยให้ session แพลตฟอร์มตายคามือ
 */
export function platformExpiry() {
  try {
    const at = Number(localStorage.getItem(PLATFORM_EXP_KEY));
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

/**
 * ถาม SchoolOS สด ๆ ว่า "ตอนนี้เบราว์เซอร์นี้เป็นใคร"
 *
 * หัวใจของการกันเคส "ล็อกอินคนใหม่ที่ portal แล้วระบบยังโหลดคนเก่า": session ของเรา
 * กับของ SchoolOS เป็นคนละใบ handoff แค่ "คัดลอกตัวตน" มาตอนหนึ่งเท่านั้น ไม่ได้ผูก
 * สองใบเข้าด้วยกัน การผูกจึงเป็นสิ่งที่เราต้องถามซ้ำเอง
 *
 * @returns { valid, sub, code } · null = **ถามไม่ได้** (เน็ต/CORS/service ล่ม/SSO ปิด)
 *
 * ⚠️ null ห้ามตีความว่า "ไม่มีใครล็อกอิน" เด็ดขาด — ถ้าเหมารวมกัน เน็ตกระตุกทีเดียว
 * จะเตะทั้งโรงเรียนออกจากระบบพร้อมกัน ผู้เรียกต้องไม่ทำอะไรเลยเมื่อได้ null
 * "ไม่มีใครล็อกอิน" คือ HTTP 200 พร้อม valid:false ซึ่งต้องอ่านจาก field ไม่ใช่ status
 *
 * endpoint นี้เป็น cookie-based ล้วน (ห้ามยิงจาก server ด้วย X-API-Key เพราะ cookie
 * sso_session เป็น httpOnly อยู่ที่เบราว์เซอร์เท่านั้น) · ตอบจาก claim ใน token ไม่แตะ
 * ฐานข้อมูล และ **ไม่** ต่ออายุ idle window ของ SchoolOS จึงยิงบ่อยได้โดยไม่มีผลข้างเคียง
 */
export async function fetchLiveSession() {
  const config = await loadConfig();
  if (!config?.enabled) return null;

  try {
    const res = await fetch(usersUrl(config.usersBase, '/api/auth/session'), {
      credentials: 'include', // ขาดบรรทัดนี้ = ได้ valid:false ตลอดโดยไม่มี error ให้เห็น
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const valid = Boolean(data?.valid && data.user);
    const expiresAt = valid && typeof data?.expiresAt === 'number' ? data.expiresAt : null;
    // จดตรงนี้ ไม่ใช่ที่ผู้เรียกแต่ละคน เพราะมันต้องไม่ขึ้นกับว่าใครจำได้ · probe ตัวนี้วิ่งทุกครั้ง
    // ที่โหลดหน้าและทุกนาทีหลังจากนั้น (SessionGuard) จึงเป็นตัวที่ทำให้เส้นตายที่ AuthContext
    // ใช้ต่ออายุยังตรงอยู่เสมอข้ามการโหลดหน้าและข้ามแท็บ — และคนเดียวที่อาจลืมจด ก็คือคนที่
    // การลืมของเขาทำให้ผู้ใช้หลุด · valid:false = ลบทิ้ง เพราะไม่มี session ให้บรรยายแล้ว
    rememberPlatformExpiry(expiresAt);
    return {
      valid,
      sub: data?.user?.sub ?? null,
      code: data?.user?.code ?? null,
      expiresAt,
    };
  } catch {
    // ถามไม่ได้ ≠ ไม่มี session · เส้นตายที่จดไว้เดิมยังเป็นข้อมูลที่ดีที่สุดที่มี ห้ามลบ
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
  // ประทับเวลาไว้ให้ตัวจับลูป — เข้าด้วยทางนี้แล้วหลุดซ้ำภายในไม่ถึงนาที
  // แปลว่าพาเข้าไปก็หลุดอยู่ดี รอบหน้าต้องให้กรอกเอง (ดู mustLoginManually)
  if (res.data?.token) markSilentLogin();
  return res.data;
}

/**
 * ออกจาก SchoolOS แล้วไปจบที่หน้า portal — ใช้กับปุ่ม "ออกจากระบบ" **เท่านั้น**
 *
 * ⚠️ ห้ามใช้กับ session ที่จบเอง (หมดเวลา / token หมดอายุ / 401) — พวกนั้นก็ออกไปที่
 * SchoolOS เหมือนกัน แต่ต้องไปด้วย leaveToSchoolOS() ใน utils/session.js ซึ่ง
 * **ไม่** เรียก /api/auth/logout · ต่างกันตรงนี้: หมดเวลาใน GradTrack ไม่ควรไปเตะ
 * ครูออกจาก SchoolOS ทั้งแพลตฟอร์มด้วย เขาอาจกำลังทำงานในระบบอื่นอยู่แท้ ๆ
 * และตัวนั้นมีธงกันลูปคุมอยู่ (bouncedToSchoolOSRecently) ตัวนี้ไม่มี
 *
 * ออกจาก SchoolOS ด้วยการ navigate ไป /api/auth/logout?next= ครั้งเดียว เชื่อถือได้กว่า
 * ยิง POST ทิ้งไว้แล้วรีบเปลี่ยนหน้า ซึ่งเบราว์เซอร์อาจตัดทิ้งกลางคันจนออกไม่สำเร็จ
 */
export async function leaveToPortal() {
  let target = '/';
  try {
    const config = await loadConfig();
    const portal = config?.portalUrl || '/';
    target = config?.enabled
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
 *
 * คำตอบพกเส้นตายใหม่มาด้วย และผู้เรียกต้องใช้มัน: การต่ออายุที่ทิ้งคำตอบไปเฉย ๆ ทำให้ครั้ง
 * ถัดไปต้องเดาเอาว่าควรเป็นเมื่อไร · `ok` กับ `status` แยกกันด้วยเหตุผลเดียวกับที่ fetchLiveSession
 * คืน null แทน valid:false — ครั้งที่ล้มเพราะเน็ตกระตุกต้องได้ลองใหม่ ส่วนครั้งที่ได้ 401 ต้องไม่
 * เพราะ session ที่มันจะไปต่อนั้นจบไปแล้ว
 *
 * @returns {Promise<{ ok: boolean, status: number, expiresAt: number | null }>} status 0 = ยิงไม่ถึงเลย
 */
export async function refreshSchoolOSSession() {
  try {
    const config = await loadConfig();
    if (!config?.enabled) return { ok: false, status: 0, expiresAt: null };
    const res = await fetch(usersUrl(config.usersBase, '/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 401 คือแพลตฟอร์มบอกว่า session จบไปแล้ว — ทิ้งเส้นตายที่จดไว้ จะได้ไม่มีอะไรนับถอยหลัง
      // ไปหาเวลาที่ผ่านไปแล้ว · คนที่ลงมือกับข้อเท็จจริงนี้คือ SessionGuard ไม่ใช่ที่นี่
      if (res.status === 401) rememberPlatformExpiry(null);
      return { ok: false, status: res.status, expiresAt: null };
    }
    const data = await res.json().catch(() => ({}));
    const expiresAt = typeof data?.expiresAt === 'number' ? data.expiresAt : null;
    rememberPlatformExpiry(expiresAt);
    return { ok: true, status: res.status, expiresAt };
  } catch {
    /* ต่อไม่ได้ก็ปล่อย — รอบหน้าลองใหม่ตอนที่ยังมีเวลาเหลือ */
    return { ok: false, status: 0, expiresAt: null };
  }
}

// การออกจากระบบที่ SchoolOS ย้ายไปทำใน leaveToPortal() ด้วยการ navigate ไป
// /api/auth/logout?next= ครั้งเดียว — เชื่อถือได้กว่ายิง POST ทิ้งไว้แล้วรีบเปลี่ยนหน้า
// ซึ่งเบราว์เซอร์ยกเลิก request กลางคันได้
