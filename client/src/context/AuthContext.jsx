import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  IDLE_TIMEOUT_MS,
  LOGOUT_REASONS,
  TOKEN_KEY,
  USER_KEY,
  clearActivity,
  isIdleExpired,
  isTokenExpired,
  markActivity,
  setLogoutReason,
  setSessionExpiredHandler,
} from '../utils/session';
import {
  blockSilentLogin,
  clearSilentLoginBlock,
  logoutFromSchoolOS,
  refreshSchoolOSSession,
} from '../utils/sso';

const AuthContext = createContext(null);

// รอบตรวจว่าหมดเวลาหรือยัง — ไม่ต้องถี่ เพราะ timeout เป็นหลักสิบนาที
// (setTimeout ยาว ๆ ตัวเดียวไม่พอ: เครื่องที่ sleep แล้วตื่นมา timer จะเพี้ยน
//  แต่การเทียบ timestamp ทุกรอบแบบนี้ให้ผลถูกเสมอ)
const CHECK_INTERVAL_MS = 15 * 1000;

// รอบต่ออายุ session ฝั่ง SchoolOS ระหว่างที่ยังนั่งใช้งาน GradTrack อยู่
// ต้องถี่กว่า idle window ของ SchoolOS (30 นาที) พอสมควร ไม่งั้นต่อไม่ทัน
const SOS_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

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

// เคลียร์ session ตอนเปิดแอป: token หมดอายุ หรือทิ้งไว้ไม่ได้แตะเกิน 30 นาที
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

  const clearSession = useCallback((reason) => {
    setLogoutReason(reason);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    clearActivity();
    setSession({ user: null, token: null });
  }, []);

  const login = useCallback((userData, jwtToken) => {
    setLogoutReason(null); // ล็อกอินใหม่แล้ว — ข้อความ "หมดเวลา" รอบก่อนไม่ต้องค้าง
    clearSilentLoginBlock();
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    localStorage.setItem(TOKEN_KEY, jwtToken);
    markActivity({ force: true }); // เริ่มจับเวลา idle ตั้งแต่วินาทีที่ล็อกอิน
    setSession({ user: userData, token: jwtToken });
  }, []);

  // กดออกเอง — ไม่ต้องขึ้นข้อความ "หมดเวลา" ที่หน้า login
  //
  // ออกจาก SchoolOS ด้วย ไม่งั้นกดออกแล้ว silent SSO ที่หน้า login จะพากลับเข้ามาเอง
  // (cookie ยังอยู่) — เครื่องส่วนกลางจะกลายเป็นล็อกเอาต์ไม่ได้จริง
  // ไม่ await: ล้าง state ฝั่งเราต้องเกิดทันที ไม่ควรค้างรอเครือข่าย
  const logout = useCallback(() => {
    blockSilentLogin();
    logoutFromSchoolOS();
    clearSession(null);
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

    const timer = setInterval(check, CHECK_INTERVAL_MS);

    // ต่ออายุ session ของ SchoolOS ตามการใช้งานจริงในระบบนี้ — ต่อเฉพาะตอนที่
    // ผู้ใช้ยังอยู่จริง (check() ผ่าน) ไม่ใช่ต่อให้แท็บที่เปิดค้างไว้เฉย ๆ
    // ซึ่งจะทำให้ session ของทั้งแพลตฟอร์มไม่มีวันหมดอายุ
    const sosTimer = setInterval(() => {
      if (check()) refreshSchoolOSSession();
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
    const onStorage = (e) => {
      if (e.key === TOKEN_KEY && !e.newValue) {
        setSession({ user: null, token: null });
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
  }, [token, clearSession]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, idleTimeoutMs: IDLE_TIMEOUT_MS }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
