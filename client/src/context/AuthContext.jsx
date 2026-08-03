import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import {
  IDLE_TIMEOUT_MS,
  LOGOUT_REASONS,
  TOKEN_KEY,
  USER_KEY,
  clearActivity,
  clearStoredSession,
  getTokenExpiry,
  isIdleExpired,
  isTokenExpired,
  markActivity,
  msSinceActivity,
  saveSession,
  setLogoutReason,
  setSessionExpiredHandler,
} from '../utils/session';
import {
  blockSilentLogin,
  clearSilentLoginBlock,
  leaveToPortal,
  refreshSchoolOSSession,
} from '../utils/sso';

const AuthContext = createContext(null);

// รอบตรวจว่าหมดเวลาหรือยัง — ไม่ต้องถี่ เพราะ timeout เป็นหลักสิบนาที
// (setTimeout ยาว ๆ ตัวเดียวไม่พอ: เครื่องที่ sleep แล้วตื่นมา timer จะเพี้ยน
//  แต่การเทียบ timestamp ทุกรอบแบบนี้ให้ผลถูกเสมอ)
const CHECK_INTERVAL_MS = 15 * 1000;

// รอบต่ออายุ session ฝั่ง SchoolOS ระหว่างที่ยังนั่งใช้งาน GradTrack อยู่
// ต้องถี่กว่า idle window ของ SchoolOS (SESSION_IDLE_MINUTES) พอสมควร ไม่งั้นต่อไม่ทัน
const SOS_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// เริ่มขอต่ออายุ token ของเราเองเมื่อเหลืออายุน้อยกว่านี้
// เผื่อเวลาไว้เยอะกว่ารอบตรวจมาก ๆ เพราะเน็ตอาจสะดุดแล้วต้องมีโอกาสลองใหม่หลายรอบ
const RENEW_BEFORE_MS = 15 * 60 * 1000;

// "ยังทำงานอยู่" = ขยับจริงภายในเวลานี้ · ต้องสั้นกว่า idle timeout เสมอ
// ไม่งั้นแท็บที่เปิดค้างไว้จะถูกต่ออายุไปเรื่อย ๆ ทั้งที่ไม่มีคนอยู่หน้าเครื่อง
const RENEW_ACTIVE_WITHIN_MS = 5 * 60 * 1000;

// เหตุการณ์ที่นับว่า "ยังใช้งานอยู่" — ต้องเป็นการกระทำจริงของผู้ใช้
// ไม่นับ mousemove เปล่า ๆ เพราะเมาส์สะเทือนบนโต๊ะก็ต่ออายุ session ได้
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'focus'];

const readStoredUser = () => {
  const saved = localStorage.getItem(USER_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

// เคลียร์ session ตอนเปิดแอป: token หมดอายุ หรือทิ้งไว้ไม่ได้แตะเกิน IDLE_TIMEOUT_MS
// ทำนอก component เพราะ useState initializer ต้องได้ผลลัพธ์ที่นิ่งแล้ว
function loadSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = readStoredUser();
  if (!token || !user) {
    // มีอย่างใดอย่างหนึ่งค้างอยู่ครึ่ง ๆ กลาง ๆ → ล้างให้หมด ไม่ต้องแจ้งผู้ใช้
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    clearActivity();
    return { user: null, token: null };
  }

  const reason = isTokenExpired(token)
    ? LOGOUT_REASONS.EXPIRED
    : isIdleExpired()
      ? LOGOUT_REASONS.IDLE
      : null;

  if (reason) {
    setLogoutReason(reason);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    clearActivity();
    return { user: null, token: null };
  }

  return { user, token };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  const { user, token } = session;
  const renewing = useRef(false); // กันขอต่ออายุซ้อนกันตอน interval มาชนกับ request ที่ยังค้าง

  // session จบระหว่างใช้งาน → ล้างของเราแล้วส่งผู้ใช้กลับไปหน้า portal ของ SchoolOS
  //
  // ส่งออกเฉพาะ "จังหวะที่เพิ่งจบ" เท่านั้น ไม่ใช่ทุกครั้งที่ไม่มี session —
  // ถ้าหน้า login เด้งออกเองด้วยจะวนไม่รู้จบระหว่าง portal กับ GradTrack และบัญชี
  // local (ทางเข้าสำรองตอน SchoolOS ล่ม) จะไม่มีทางเข้าถึงฟอร์มได้เลย
  const clearSession = useCallback((reason, { toPortal = true } = {}) => {
    clearStoredSession(reason);
    setSession({ user: null, token: null });
    if (toPortal) leaveToPortal();
  }, []);

  // ต่ออายุแล้วได้ token ใบใหม่ — เปลี่ยนเฉพาะ token ห้ามใช้ login() แทน
  // เพราะ login() จะไปล้างธงกัน silent SSO และเหตุผลที่หลุดรอบก่อนทิ้งด้วย
  const replaceToken = useCallback((jwtToken) => {
    localStorage.setItem(TOKEN_KEY, jwtToken);
    setSession((s) => ({ ...s, token: jwtToken }));
  }, []);

  const login = useCallback((userData, jwtToken) => {
    clearSilentLoginBlock();
    saveSession(userData, jwtToken);
    setSession({ user: userData, token: jwtToken });
  }, []);

  // กดออกเอง — ไม่ต้องขึ้นข้อความ "หมดเวลา" ที่หน้า login
  //
  // ออกจาก SchoolOS ด้วย ไม่งั้นกดออกแล้ว silent SSO ที่หน้า login จะพากลับเข้ามาเอง
  // (cookie ยังอยู่) — เครื่องส่วนกลางจะกลายเป็นล็อกเอาต์ไม่ได้จริง
  // จบด้วยการพาไป portal ของ SchoolOS ในการ navigate ครั้งเดียวกัน
  const logout = useCallback(() => {
    blockSilentLogin();
    clearSession(null, { toPortal: false });
    leaveToPortal({ logoutFirst: true });
  }, [clearSession]);

  // ── ให้ axios interceptor เรียกได้ตอน server ตอบ 401 ───────────────────────
  useEffect(() => {
    setSessionExpiredHandler((reason) => clearSession(reason));
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  // ── นาฬิกา idle + วันหมดอายุ token ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    markActivity({ force: true });

    const onActivity = () => markActivity();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true, capture: true });
    }

    // effect นี้ผูกกับ token อยู่แล้ว (อยู่ใน deps) → closure เห็นค่าล่าสุดเสมอ
    // คืน true = ยังใช้งานต่อได้
    const check = () => {
      if (isTokenExpired(token)) {
        clearSession(LOGOUT_REASONS.EXPIRED);
        return false;
      }
      if (isIdleExpired()) {
        clearSession(LOGOUT_REASONS.IDLE);
        return false;
      }
      return true;
    };

    // ── ต่ออายุ token ของเราเองก่อนถึงเส้นตาย ถ้าคนยังนั่งทำงานอยู่ ─────────────
    //
    // เดิม token มีเพดานแข็ง (JWT_EXPIRES_IN) ครบเมื่อไรก็หลุดต่อให้กำลังพิมพ์อยู่
    // ครูที่กรอกข้อมูลค้างไว้จึงถูกเตะออกกลางคันแล้วข้อมูลที่ยังไม่บันทึกหายไป
    //
    // "ยังทำงานอยู่" = ขยับจริงภายในช่วงเวลาที่กำหนด ไม่ใช่แค่เปิดแท็บค้างไว้ —
    // แท็บที่เปิดทิ้งไว้เฉย ๆ ต้องปล่อยให้หมดอายุตามปกติ ไม่งั้นเท่ากับไม่มีเพดานเลย
    const renewIfWorking = async () => {
      if (renewing.current) return;
      if (msSinceActivity() >= RENEW_ACTIVE_WITHIN_MS) return;

      const msLeft = getTokenExpiry(token) - Date.now();
      if (msLeft <= 0 || msLeft > RENEW_BEFORE_MS) return;

      renewing.current = true;
      try {
        const res = await api.post('/auth/refresh');
        if (res.data?.token) replaceToken(res.data.token);
      } catch {
        // ต่อไม่สำเร็จ → ปล่อยให้ check() เตะออกตามกำหนดเดิม ดีกว่าวนขอซ้ำ
      } finally {
        renewing.current = false;
      }
    };

    const timer = setInterval(() => {
      if (check()) renewIfWorking();
    }, CHECK_INTERVAL_MS);

    // ต่ออายุ session ของ SchoolOS ตามการใช้งานจริงในระบบนี้
    //
    // เงื่อนไขต้องครบสองข้อ: session ยังไม่หมดอายุ (check) **และ** ผู้ใช้เพิ่งขยับจริง
    // ภายในรอบที่ผ่านมา — ถ้าดูแค่ check() แท็บที่เปิดค้างไว้เฉย ๆ จะได้รับการต่ออายุ
    // ไปเรื่อย ๆ จนกว่าจะโดนเตะ กลายเป็นยืด session ของทั้งแพลตฟอร์มให้คนที่ลุกจาก
    // เครื่องไปแล้ว ซึ่งสวนทางกับเหตุผลที่ลด idle timeout ลงมาตั้งแต่แรก
    const sosTimer = setInterval(() => {
      if (check() && msSinceActivity() < SOS_REFRESH_INTERVAL_MS) refreshSchoolOSSession();
    }, SOS_REFRESH_INTERVAL_MS);

    // กลับมาที่แท็บ/ปลุกเครื่องจาก sleep → ตรวจทันที ไม่ต้องรอครบรอบ
    // ต่ออายุเฉพาะตอนที่ยังไม่หมดเวลา ไม่งั้นจะไปเขียน lastActivity ทับหลัง
    // clearSession() เพิ่งล้างทิ้ง — เหลือขยะค้างไว้ให้รอบหน้าสับสน
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (check()) markActivity();
    };
    document.addEventListener('visibilitychange', onVisible);

    // อีกแท็บล็อกเอาต์/หมดเวลา → แท็บนี้หลุดตาม (ไม่งั้นแท็บที่เหลือยังใช้ได้ต่อ)
    // แล้วออกไป portal เหมือนกัน — แท็บที่ค้างหน้า dashboard ไว้เฉย ๆ ทั้งที่หมด
    // สิทธิ์แล้วคือสิ่งที่เรากำลังพยายามกำจัดบนเครื่องส่วนกลาง
    const onStorage = (e) => {
      if (e.key === TOKEN_KEY && !e.newValue) {
        setSession({ user: null, token: null });
        leaveToPortal();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity, { capture: true });
      }
      clearInterval(timer);
      clearInterval(sosTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [token, clearSession, replaceToken]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, idleTimeoutMs: IDLE_TIMEOUT_MS }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
