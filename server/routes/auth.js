const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { signToken } = require('../config/jwt');
const db = require('../config/db');
const schoolos = require('../config/schoolos');
const logger = require('../config/logger');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { ROLES } = require('../middlewares/authMiddleware');
const { logActivity } = require('./activityLogs');
const { resolveAccess } = require('./staff');

/**
 * ข้อมูลไว้ "แสดงผล" ของครูจาก SchoolOS — ชื่อจริง (ไว้ทำอักษรย่อ) + รูปโปรไฟล์
 *
 * /auth/verify ให้มาแค่ชื่อเต็มซึ่งมีคำนำหน้าติดมาด้วย ("นายชรินทร์ รีนับถือ")
 * ถ้าเอาตัวอักษรแรกไปทำ avatar ตรง ๆ ครูทั้งโรงเรียนจะได้ "น" ของ "นาย" เหมือนกันหมด
 * จึงต้องดึงระเบียนครูที่แยกฟิลด์ชื่อไว้แล้วมาอีกที
 *
 * ล้มเหลวเมื่อไหร่ก็แค่ไม่มีรูป/ไม่มีชื่อจริง — ห้ามทำให้ล็อกอินพัง
 *
 * ทาง silent SSO ดึงระเบียนครูไปแล้วตั้งแต่ตอนตรวจสถานะ จึงส่งต่อมาให้ตรงนี้ได้เลย
 * (teacher) ไม่ต้องยิง SchoolOS ซ้ำอีกรอบ
 */
async function loadStaffProfile(sosUser, teacher) {
  const code = String(sosUser?.code || '').trim();
  if (!code) return {};

  try {
    const record = teacher || (await schoolos.findTeacher(code));
    if (!record) return {};

    return {
      first_name: record.first_name || '',
      avatar: await schoolos.fetchPhotoDataUrl(record.photo_path),
    };
  } catch (err) {
    logger.warn('Load SchoolOS staff profile failed', { code, error: err.message });
    return {};
  }
}

/**
 * ออก session ของครู/ผู้ดูแลจากตัวตนที่ SchoolOS ยืนยันมาแล้ว
 * ใช้ร่วมกันระหว่างล็อกอินด้วยรหัสผ่าน (/login) กับ silent SSO (/sso)
 *
 * @param sosUser  { id, code, name, role, active, status } — โครงเดียวกับที่ /auth/verify ตอบ
 * @param teacher  ระเบียนครูที่ดึงมาแล้ว (ถ้ามี) ไว้ประหยัดโควตา API
 * @param expiresIn อายุ token ที่อยากจำกัด (วินาที) — ไม่ส่ง = ใช้ JWT_EXPIRES_IN
 * @returns { token, user, access } · หรือ { denied: { status, reason, message } } เมื่อไม่ให้เข้า
 */
async function issueStaffSession(sosUser, { teacher = null, expiresIn } = {}) {
  // SchoolOS ตอบ valid:true ให้ครูที่ลาออกแล้วด้วย (พร้อม active:false)
  // ระบบผู้เรียกต้องตรวจเอง — GradTrack ไม่ให้เข้า
  if (!sosUser.active) {
    return {
      denied: {
        status: 403,
        reason: 'inactive',
        message: 'บัญชีนี้ถูกปิดใช้งานแล้ว กรุณาติดต่อผู้ดูแลระบบ',
      },
    };
  }

  // ต้องอยู่ในรายชื่อที่ผู้ดูแลเพิ่มไว้ (หน้า "จัดการผู้ใช้งาน")
  // ยกเว้นตอนรายชื่อยังว่าง = ยังไม่เปิดใช้ allowlist → เข้าได้แบบเดิม
  const access = await resolveAccess(sosUser);
  if (!access) {
    return {
      denied: {
        status: 403,
        reason: 'not_allowlisted',
        message: 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้ระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มรายชื่อ',
      },
    };
  }

  const role = access.role;
  const profile = await loadStaffProfile(sosUser, teacher);
  const token = signToken(
    {
      id: sosUser.id,
      username: sosUser.code,
      name: sosUser.name,
      role,
      source: 'schoolos',
    },
    { expiresIn }
  );

  return {
    access,
    token,
    user: {
      id: sosUser.id,
      username: sosUser.code,
      name: sosUser.name,
      // ไว้ทำอักษรย่อบน avatar เมื่อไม่มีรูป — ตัดปัญหาคำนำหน้าปนมากับ name
      first_name: profile.first_name || '',
      // data URL หรือ null (ไม่มีรูปใน SchoolOS / ดึงไม่สำเร็จ)
      avatar: profile.avatar || null,
      role,
      source: 'schoolos',
      // ให้ฝั่ง client ซ่อนปุ่มแก้ไขได้เลยโดยไม่ต้องเดาจาก role string
      readOnly: role === ROLES.TEACHER,
    },
  };
}

// POST /api/auth/login  — ล็อกอินฝั่งครู/ผู้ดูแล
// ลำดับ: บัญชี local ก่อน → ถ้าไม่ผ่านค่อยถาม SchoolOS
// (บัญชี local มีไว้เป็นทางเข้าสำรองตอน SchoolOS ล่ม จึงต้องมาก่อน)
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'กรุณากรอก username และ password' });
  }

  const uname = String(username).trim();

  try {
    // ── 1) บัญชี local ในตาราง users ──────────────────────────────────────────
    const [rows] = await db.query('SELECT * FROM users WHERE username = ? LIMIT 1', [uname]);

    if (rows.length > 0) {
      const user = rows[0];
      if (await bcrypt.compare(password, user.password)) {
        const token = signToken({
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          source: 'local',
        });

        logger.info('Login success (local)', { username: uname, role: user.role, ip: req.ip });
        logActivity({ username: user.username, name: user.name, role: user.role, action: 'login', target: 'local' });

        return res.json({
          token,
          user: { id: user.id, username: user.username, name: user.name, role: user.role, source: 'local' },
        });
      }
      // รหัสผ่านของบัญชี local ผิด → ยังลอง SchoolOS ต่อ เผื่อครูใช้ชื่อซ้ำกับบัญชี local
    }

    // ── 2) ครูจาก SchoolOS ────────────────────────────────────────────────────
    const sosUser = await schoolos.verify('teacher', uname, password);

    if (!sosUser) {
      logger.warn('Login failed', { username: uname, ip: req.ip });
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── 3) สถานะ + รายชื่อที่ผู้ดูแลเพิ่มไว้ ───────────────────────────────────
    const { denied, access, token, user } = await issueStaffSession(sosUser);
    if (denied) {
      logger.warn(`Login blocked: ${denied.reason}`, {
        username: uname,
        status: sosUser.status,
        sosRole: sosUser.role,
      });
      return res.status(denied.status).json({ message: denied.message });
    }

    logger.info('Login success (schoolos)', {
      username: uname,
      sosRole: sosUser.role,
      role: user.role,
      // ผ่านด่านมาทางไหน: allowlist | schoolos-admin | open (ดู resolveAccess)
      access: access.via,
      ip: req.ip,
    });
    logActivity({
      username: sosUser.code,
      name: sosUser.name,
      role: user.role,
      action: 'login',
      target: 'schoolos',
    });

    return res.json({ token, user });
  } catch (err) {
    // key ของ GradTrack เองมีปัญหา — ห้ามกลืนเป็น 401 เด็ดขาด ไม่งั้นอาการจะไปโผล่
    // หน้า login ว่า "รหัสผ่านไม่ถูกต้อง" ทั้งที่ผู้ใช้กรอกถูก แล้วไล่หาสาเหตุไม่เจอ
    if (err instanceof schoolos.SosKeyError) {
      logger.error('SchoolOS API key ใช้ไม่ได้', { code: err.code });
      return res.status(503).json({
        message: 'ระบบเชื่อมต่อ SchoolOS ไม่ได้ (API key มีปัญหา) กรุณาแจ้งผู้ดูแลระบบ',
      });
    }
    if (err instanceof schoolos.SosRateLimitError) {
      return res.status(429).json({
        message: 'พยายามเข้าสู่ระบบเกินกำหนด กรุณารอสักครู่แล้วลองใหม่',
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }

    logger.error('Login error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

module.exports = router;
// silent SSO ออก session ให้ครูด้วยกติกาเดียวกับล็อกอินด้วยรหัสผ่าน (ดู routes/sso.js)
module.exports.issueStaffSession = issueStaffSession;
