const jwt = require('jsonwebtoken');

// role ในระบบนี้มี 3 แบบ
//   admin   — ครูที่ SchoolOS กำหนดเป็น "teacher-admin" (หรือบัญชี local ที่ตั้ง role=admin)
//   teacher — ครูทั่วไปจาก SchoolOS: เข้าดูได้อย่างเดียว แก้ไขอะไรไม่ได้เลย
//   student — นักเรียน
const ROLES = { ADMIN: 'admin', TEACHER: 'teacher', STUDENT: 'student' };

// ตรวจสอบ JWT token
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ message: 'ไม่พบ token กรุณาเข้าสู่ระบบ', code: 'NO_TOKEN' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id?, student_code?, username, role }
    next();
  } catch (err) {
    // แยก "หมดอายุ" ออกจาก "ไม่ถูกต้อง" — อย่างแรกคือเรื่องปกติของ session ที่ครบเวลา
    // อย่างหลังแปลว่า token ถูกแก้ หรือ JWT_SECRET เปลี่ยน ซึ่งควรตามดูใน log
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({ message: 'Token ไม่ถูกต้อง', code: 'TOKEN_INVALID' });
  }
}

// เขียน/แก้/ลบ — admin เท่านั้น
function adminOnly(req, res, next) {
  if (req.user?.role !== ROLES.ADMIN) {
    // ข้อความแยกให้ครู read-only รู้ว่าตัวเองล็อกอินถูกแล้ว แค่ไม่มีสิทธิ์แก้
    if (req.user?.role === ROLES.TEACHER) {
      return res.status(403).json({ message: 'บัญชีครูเข้าดูได้อย่างเดียว ไม่มีสิทธิ์แก้ไขข้อมูล' });
    }
    return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
}

// อ่านอย่างเดียว — admin หรือครูทั่วไป
function staffRead(req, res, next) {
  if (req.user?.role !== ROLES.ADMIN && req.user?.role !== ROLES.TEACHER) {
    return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
}

module.exports = { verifyToken, adminOnly, staffRead, ROLES };
