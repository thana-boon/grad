const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// จำกัด login: 5 ครั้ง ต่อ 15 นาที ต่อ IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = Math.ceil(req.rateLimit.resetTime / 1000 - Date.now() / 1000);
    const minutes = Math.ceil(retryAfter / 60);

    logger.warn('Rate limit exceeded on login', {
      ip: req.ip,
      username: req.body?.username || 'unknown',
    });

    res.status(429).json({
      message: `พยายามเข้าสู่ระบบเกินกำหนด กรุณารอ ${minutes} นาทีแล้วลองใหม่`,
      retryAfterSeconds: retryAfter,
    });
  },
});

// จำกัด silent SSO: 20 ครั้ง ต่อ 5 นาที ต่อ IP
//
// ต้องแยกถังจาก loginLimiter เด็ดขาด — หน้า login ยิงตัวนี้เองอัตโนมัติทุกครั้งที่เปิด
// ถ้าใช้ถังเดียวกัน แค่รีเฟรชหน้าไม่กี่ครั้งก็ล็อกการล็อกอินด้วยรหัสผ่านของตัวเองไป 15 นาที
//
// เดารหัสไม่ได้อยู่แล้ว (โค้ด handoff อายุ 60 วิ ใช้ครั้งเดียว และต้องมี API key ของเราคู่กัน)
// เพดานนี้จึงมีไว้กันการยิงรัวจนเปลืองโควตา SchoolOS (600 req/ชม.) เป็นหลัก
const ssoLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded on silent SSO', { ip: req.ip });
    res.status(429).json({ message: 'ตรวจสอบสิทธิ์ถี่เกินไป กรุณารอสักครู่' });
  },
});

module.exports = { loginLimiter, ssoLimiter };
