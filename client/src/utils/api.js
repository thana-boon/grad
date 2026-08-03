import axios from 'axios';
import { withBase } from './withBase';
import { LOGOUT_REASONS, TOKEN_KEY, markActivity, notifySessionExpired } from './session';

// prod: client กับ server เป็นโปรเซสเดียวกันและอยู่ใต้ base เดียวกัน (same-origin เสมอ)
// → baseURL คือ "<base>api" เช่น /grad/api ซึ่ง withBase() ประกอบให้ตาม BASE_PATH ตอน build
// dev: BASE_URL เป็น "/" อยู่แล้ว → ได้ "/api" ซึ่ง vite dev server proxy ไปหา express ให้
const api = axios.create({
  baseURL: withBase('/api'),
});

// แนบ JWT token อัตโนมัติทุก request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    // ยิง request = ยังใช้งานอยู่ (เช่นหน้าที่ auto-refresh ข้อมูลเป็นระยะ
    // ก็ยังไม่ควรถูกนับว่า idle ถ้าผู้ใช้เพิ่งสั่งโหลด)
    markActivity();
  }
  return config;
});

// 401 = token หมดอายุ/ไม่ถูกต้อง → เตะออกทันที
// ก่อนหน้านี้ไม่มีตัวนี้ หน้าเว็บจึงยัง "ดูเหมือนล็อกอินอยู่" ทั้งที่ทุก request พัง
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    // ยกเว้นตอนกำลังเข้าสู่ระบบเอง — 401 ตรงนั้นแปลว่ากรอกรหัสผิด (หรือโค้ด SSO
    // หมดอายุ) ไม่ใช่ session หมดอายุ ถ้าไม่กันไว้หน้า login จะขึ้นข้อความ
    // "เซสชันหมดอายุ" ให้คนที่เพิ่งเปิดหน้าเว็บมาเฉย ๆ
    const isLoginRequest = /\/(login|auth\/sso)$/.test(url);

    // ไม่มี token เหลืออยู่แล้ว = เพิ่งกดออกจากระบบ (หรือถูกเคลียร์ไปก่อนหน้านี้)
    // 401 ที่ตามมาทีหลังจาก request ที่ค้างอยู่จึงไม่ได้บอกอะไรใหม่ — ถ้าปล่อยให้
    // ตั้งธง "เซสชันหมดอายุ" หน้า login จะขึ้นข้อความผิดบริบททั้งที่ผู้ใช้กดออกเอง
    // และ silent SSO จะถูกกันไว้อีกหนึ่งช่วง idle timeout (ดู wasRecentlyLoggedOut)
    const hadSession = !!localStorage.getItem(TOKEN_KEY);

    if (status === 401 && !isLoginRequest && hadSession) {
      notifySessionExpired(LOGOUT_REASONS.EXPIRED);
    }
    return Promise.reject(err);
  }
);

export default api;
