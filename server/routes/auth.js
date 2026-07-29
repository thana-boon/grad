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

    // SchoolOS ตอบ valid:true ให้ครูที่ลาออกแล้วด้วย (พร้อม active:false)
    // ระบบผู้เรียกต้องตรวจเอง — GradTrack ไม่ให้เข้า
    if (!sosUser.active) {
      logger.warn('Login blocked: inactive SchoolOS account', { username: uname, status: sosUser.status });
      return res.status(403).json({ message: 'บัญชีนี้ถูกปิดใช้งานแล้ว กรุณาติดต่อผู้ดูแลระบบ' });
    }

    // ── 3) ต้องอยู่ในรายชื่อที่ผู้ดูแลเพิ่มไว้ (หน้า "จัดการผู้ใช้งาน") ─────────
    // ยกเว้นตอนรายชื่อยังว่าง = ยังไม่เปิดใช้ allowlist → เข้าได้แบบเดิม
    const access = await resolveAccess(sosUser);
    if (!access) {
      logger.warn('Login blocked: not in staff allowlist', { username: uname, sosRole: sosUser.role });
      return res.status(403).json({
        message: 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้ระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มรายชื่อ',
      });
    }

    const role = access.role;
    const token = signToken({
      id: sosUser.id,
      username: sosUser.code,
      name: sosUser.name,
      role,
      source: 'schoolos',
    });

    logger.info('Login success (schoolos)', {
      username: uname,
      sosRole: sosUser.role,
      role,
      // false = ยังไม่มีใครในรายชื่อเลย ระบบยังเปิดให้ครูทุกคนเข้า
      allowlisted: access.gated,
      ip: req.ip,
    });
    logActivity({ username: sosUser.code, name: sosUser.name, role, action: 'login', target: 'schoolos' });

    return res.json({
      token,
      user: {
        id: sosUser.id,
        username: sosUser.code,
        name: sosUser.name,
        role,
        source: 'schoolos',
        // ให้ฝั่ง client ซ่อนปุ่มแก้ไขได้เลยโดยไม่ต้องเดาจาก role string
        readOnly: role === ROLES.TEACHER,
      },
    });
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
