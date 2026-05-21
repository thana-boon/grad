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

module.exports = { loginLimiter };
