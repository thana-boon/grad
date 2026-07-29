// ─── รายชื่อครูที่เข้าใช้ระบบได้ (allowlist) ──────────────────────────────────
// ครูมาจาก SchoolOS ทั้งหมด — ที่นี่ไม่ได้ "สร้างบัญชี" ให้ใคร แค่เลือกว่า
// ครูคนไหนในโรงเรียนเข้า GradTrack ได้บ้าง และเข้ามาแล้วมีสิทธิ์แค่ไหน
// รหัสผ่านยังเป็นของ SchoolOS เสมอ (GradTrack ไม่เคยเก็บ)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const schoolos = require('../config/schoolos');
const logger = require('../config/logger');
const { verifyToken, adminOnly, ROLES } = require('../middlewares/authMiddleware');
const { logActivity } = require('./activityLogs');

const ALLOWED_ROLES = [ROLES.ADMIN, ROLES.TEACHER];
const normCode = (c) => String(c ?? '').trim();
const normRole = (r) => (r === ROLES.ADMIN ? ROLES.ADMIN : ROLES.TEACHER);

// role ที่ SchoolOS ให้มา — ใช้เฉพาะตอน allowlist ยังว่าง (ยังไม่เปิดใช้งาน)
const roleFromSchoolOS = (sosRole) =>
  String(sosRole || '').toLowerCase() === 'teacher-admin' ? ROLES.ADMIN : ROLES.TEACHER;

async function countMembers() {
  const [[{ total }]] = await db.query('SELECT COUNT(*)::int AS total FROM staff_access');
  return total;
}

async function countAdmins() {
  const [[{ total }]] = await db.query(
    'SELECT COUNT(*)::int AS total FROM staff_access WHERE role = ?',
    [ROLES.ADMIN]
  );
  return total;
}

/**
 * ตัดสินว่าครูคนนี้เข้าระบบได้ไหม และได้ role อะไร — เรียกจาก /api/auth/login
 *
 * @param sosUser ที่ /auth/verify ตอบกลับ { id, code, name, role, active, status }
 * @returns { role, gated } · null = ไม่อยู่ในรายชื่อ (ห้ามเข้า)
 *          gated=false แปลว่ายังไม่เปิดใช้ allowlist (ตารางว่าง) จึงปล่อยผ่านแบบเดิม
 */
async function resolveAccess(sosUser) {
  const code = normCode(sosUser?.code);
  const sosId = sosUser?.id == null ? null : String(sosUser.id);

  // เทียบ teacher_code เป็นหลัก และเผื่อ sos_id ไว้กรณีโรงเรียนแก้รหัสครูภายหลัง
  const wheres = ['teacher_code = ?'];
  const params = [code];
  if (sosId) {
    wheres.push('sos_id = ?');
    params.push(sosId);
  }

  const [rows] = await db.query(
    `SELECT role FROM staff_access WHERE ${wheres.join(' OR ')} LIMIT 1`,
    params
  );
  if (rows.length > 0) return { role: normRole(rows[0].role), gated: true };

  // ยังไม่มีใครในรายชื่อ = ยังไม่ได้ตั้งค่า → ทำงานแบบเดิมไปก่อน
  // (ถ้าปิดตายตั้งแต่ตารางว่าง จะไม่มีใครล็อกอินเข้ามาเพิ่มรายชื่อได้เลย)
  if ((await countMembers()) === 0) {
    return { role: roleFromSchoolOS(sosUser?.role), gated: false };
  }

  return null;
}

// ── ทุก route ด้านล่างนี้ต้องเป็น admin ที่ล็อกอินแล้ว ──────────────────────
router.use(verifyToken, adminOnly);

// ─── GET /api/staff ─────────────────────────────────────────────────────────
// รายชื่อที่ให้สิทธิ์ไว้แล้ว
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT teacher_code, sos_id, name, email, subject_group, role, added_by, created_at
         FROM staff_access
        ORDER BY role ASC, name ASC`
    );
    // gateActive=false → หน้าเว็บต้องขึ้นเตือนว่าตอนนี้ครูทุกคนยังเข้าได้อยู่
    res.json({ gateActive: rows.length > 0, members: rows });
  } catch (err) {
    logger.error('List staff access error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── GET /api/staff/available ───────────────────────────────────────────────
// ครูทั้งหมดจาก SchoolOS พร้อมธง added — ใช้เป็นตัวเลือกในหน้าต่าง "เพิ่มครู"
// query: q (ค้นชื่อ/รหัส) · include_added=1 เพื่อเอาคนที่เพิ่มแล้วมาด้วย
router.get('/available', async (req, res) => {
  try {
    const teachers = await schoolos.listAllTeachers({ q: req.query.q || undefined });

    const [rows] = await db.query('SELECT teacher_code FROM staff_access');
    const added = new Set(rows.map((r) => normCode(r.teacher_code)));

    const list = teachers
      .map((t) => ({
        teacher_code: t.teacher_code,
        name: t.full_name,
        email: t.email,
        subject_group: t.subject_group,
        sos_role: t.role,
        added: added.has(normCode(t.teacher_code)),
      }))
      // คนที่ยังไม่ได้เพิ่มขึ้นก่อน — เป็นคนที่ผู้ใช้กำลังจะเลือก
      .sort((a, b) => Number(a.added) - Number(b.added) || a.name.localeCompare(b.name, 'th'));

    res.json({ teachers: list });
  } catch (err) {
    // key มีปัญหา / SchoolOS ล่ม ≠ bug ของ GradTrack — บอกให้ตรงสาเหตุ
    if (err instanceof schoolos.SosKeyError) {
      logger.error('SchoolOS API key ใช้ไม่ได้ (list teachers)', { code: err.code });
      return res.status(503).json({
        message: 'ดึงรายชื่อครูจาก SchoolOS ไม่ได้ (API key มีปัญหา) กรุณาแจ้งผู้ดูแลระบบ',
      });
    }
    logger.error('List available teachers error', { error: err.message });
    res.status(502).json({ message: `ดึงรายชื่อครูจาก SchoolOS ไม่ได้: ${err.message}` });
  }
});

// ─── POST /api/staff ────────────────────────────────────────────────────────
// เพิ่มครูเข้ารายชื่อ (ทีละหลายคนได้) body: { members: [{ teacher_code, role }] }
//
// ชื่อ/อีเมลดึงจาก SchoolOS ฝั่ง server ไม่รับจาก client — ไม่งั้นใครยิง API ตรง
// ก็ใส่ชื่อมั่วเข้ามาได้ และรายชื่อจะเพี้ยนจากต้นทางทันที
router.post('/', async (req, res) => {
  const input = Array.isArray(req.body?.members)
    ? req.body.members
    : req.body?.teacher_code
      ? [req.body]
      : [];

  if (input.length === 0) {
    return res.status(400).json({ message: 'กรุณาเลือกครูอย่างน้อย 1 คน' });
  }
  if (input.some((m) => m.role && !ALLOWED_ROLES.includes(m.role))) {
    return res.status(400).json({ message: 'role ไม่ถูกต้อง' });
  }

  try {
    const teachers = await schoolos.listAllTeachers();
    const byCode = new Map(teachers.map((t) => [normCode(t.teacher_code), t]));

    const added = [];
    const errors = [];

    for (const item of input) {
      const code = normCode(item.teacher_code);
      if (!code) continue;

      const teacher = byCode.get(code);
      if (!teacher) {
        errors.push({ teacher_code: code, reason: 'ไม่พบครูรหัสนี้ใน SchoolOS' });
        continue;
      }

      const role = normRole(item.role);
      await db.query(
        `INSERT INTO staff_access (teacher_code, sos_id, name, email, subject_group, role, added_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (teacher_code) DO UPDATE
           SET sos_id = EXCLUDED.sos_id,
               name = EXCLUDED.name,
               email = EXCLUDED.email,
               subject_group = EXCLUDED.subject_group,
               role = EXCLUDED.role`,
        [
          code,
          teacher.id == null ? null : String(teacher.id),
          teacher.full_name || '',
          teacher.email || null,
          teacher.subject_group || null,
          role,
          req.user.username || String(req.user.id),
        ]
      );
      added.push({ teacher_code: code, name: teacher.full_name, role });
    }

    if (added.length > 0) {
      logger.info('Staff access granted', { count: added.length, by: req.user.username });
      logActivity({
        username: req.user.username || String(req.user.id),
        name: req.user.name || '',
        role: 'admin',
        action: 'grant_staff_access',
        target: added.map((a) => a.teacher_code).join(', '),
        detail: { added },
      });
    }

    res.status(201).json({
      message: `เพิ่มครูเข้าระบบแล้ว ${added.length} คน`,
      added,
      errors,
    });
  } catch (err) {
    if (err instanceof schoolos.SosKeyError) {
      return res.status(503).json({ message: 'เชื่อมต่อ SchoolOS ไม่ได้ (API key มีปัญหา)' });
    }
    logger.error('Grant staff access error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── PATCH /api/staff/:teacher_code ─────────────────────────────────────────
// เปลี่ยน role  body: { role }
router.patch('/:teacher_code', async (req, res) => {
  const code = normCode(req.params.teacher_code);
  const { role } = req.body;

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'role ไม่ถูกต้อง' });
  }

  try {
    const [[current]] = await db.query(
      'SELECT teacher_code, name, role FROM staff_access WHERE teacher_code = ?',
      [code]
    );
    if (!current) return res.status(404).json({ message: 'ไม่พบครูคนนี้ในรายชื่อ' });
    if (current.role === role) return res.json({ message: 'ไม่มีอะไรเปลี่ยน' });

    // ลดสิทธิ์ตัวเอง = กดปุ่มเดียวแล้วหมดสิทธิ์แก้ไขทันที รวมถึงแก้กลับคืน
    if (isSelf(req.user, code) && role !== ROLES.ADMIN) {
      return res.status(400).json({ message: 'ลดสิทธิ์ของตัวเองไม่ได้ ให้ผู้ดูแลคนอื่นทำแทน' });
    }
    // เหลือ admin คนสุดท้ายแล้วลดสิทธิ์ = ไม่มีใครแก้รายชื่อได้อีก
    if (current.role === ROLES.ADMIN && role !== ROLES.ADMIN && (await countAdmins()) <= 1) {
      return res.status(400).json({
        message: 'ต้องมีผู้ดูแลอย่างน้อย 1 คนในรายชื่อ — เพิ่มผู้ดูแลคนใหม่ก่อนแล้วค่อยลดสิทธิ์คนนี้',
      });
    }

    await db.query('UPDATE staff_access SET role = ? WHERE teacher_code = ?', [role, code]);
    logger.info('Staff role changed', { teacher_code: code, role, by: req.user.username });
    logActivity({
      username: req.user.username || String(req.user.id),
      name: req.user.name || '',
      role: 'admin',
      action: 'change_staff_role',
      target: `${current.name || code}`,
      detail: { teacher_code: code, from: current.role, to: role },
    });
    res.json({ message: 'เปลี่ยนสิทธิ์เรียบร้อย' });
  } catch (err) {
    logger.error('Change staff role error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// ─── DELETE /api/staff/:teacher_code ────────────────────────────────────────
// ถอดสิทธิ์ — ครูคนนั้นจะล็อกอินเข้า GradTrack ไม่ได้อีก (บัญชี SchoolOS ไม่กระทบ)
router.delete('/:teacher_code', async (req, res) => {
  const code = normCode(req.params.teacher_code);

  try {
    const [[current]] = await db.query(
      'SELECT teacher_code, name, role FROM staff_access WHERE teacher_code = ?',
      [code]
    );
    if (!current) return res.status(404).json({ message: 'ไม่พบครูคนนี้ในรายชื่อ' });

    if (isSelf(req.user, code)) {
      return res.status(400).json({ message: 'ถอดสิทธิ์ตัวเองไม่ได้' });
    }
    if (current.role === ROLES.ADMIN && (await countAdmins()) <= 1) {
      return res.status(400).json({
        message: 'ต้องมีผู้ดูแลอย่างน้อย 1 คนในรายชื่อ — เพิ่มผู้ดูแลคนใหม่ก่อนแล้วค่อยถอดคนนี้',
      });
    }

    await db.query('DELETE FROM staff_access WHERE teacher_code = ?', [code]);
    logger.info('Staff access revoked', { teacher_code: code, by: req.user.username });
    logActivity({
      username: req.user.username || String(req.user.id),
      name: req.user.name || '',
      role: 'admin',
      action: 'revoke_staff_access',
      target: current.name || code,
      detail: { teacher_code: code, role: current.role },
    });
    res.json({ message: 'ถอดสิทธิ์เรียบร้อย' });
  } catch (err) {
    logger.error('Revoke staff access error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

// คนที่ล็อกอินอยู่คือคนเดียวกับแถวนี้หรือเปล่า
// เทียบเฉพาะคนที่มาจาก SchoolOS — บัญชี local ใช้ username คนละชุดกับรหัสครู
// ถ้าไม่แยก บัญชี local ที่บังเอิญตั้งชื่อตรงกับรหัสครูจะโดนกันไปด้วย
function isSelf(user, teacherCode) {
  return user?.source === 'schoolos' && normCode(user.username) === normCode(teacherCode);
}

module.exports = router;
module.exports.resolveAccess = resolveAccess;
