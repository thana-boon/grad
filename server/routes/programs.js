const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// ─── Helper: build WHERE clause from query params ─────────────────────────
// Returns { sql, params } for chained cascade filters
const buildWhere = (q) => {
  const parts = [];
  const params = [];

  if (q.university_id) { parts.push('university_id = ?'); params.push(Number(q.university_id)); }
  if (q.campus        !== undefined) { parts.push('campus = ?');       params.push(q.campus       || null); }
  if (q.faculty       !== undefined) { parts.push('faculty_name = ?'); params.push(q.faculty      || null); }
  if (q.group_field   !== undefined) { parts.push('group_field = ?');  params.push(q.group_field  || null); }
  if (q.field_name    !== undefined) { parts.push('field_name_th = ?');params.push(q.field_name   || null); }
  if (q.program_name  !== undefined) { parts.push('program_name_th = ?'); params.push(q.program_name || null); }
  if (q.program_type  !== undefined) { parts.push('program_type = ?'); params.push(q.program_type || null); }

  return {
    sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '',
    params,
  };
};

// ─── GET /api/programs/campuses?university_id=X ───────────────────────────
// คืน list วิทยาเขตของมหาวิทยาลัยนั้น
router.get('/campuses', verifyToken, async (req, res) => {
  const { university_id } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT campus FROM \`programs\`
       WHERE university_id = ? AND campus IS NOT NULL AND campus != ''
       ORDER BY campus`,
      [Number(university_id)]
    );
    res.json(rows.map(r => r.campus));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/programs/faculties?university_id=X&campus=Y ─────────────────
// คืน list คณะ (DISTINCT) ของ uni+campus
router.get('/faculties', verifyToken, async (req, res) => {
  const { university_id, campus } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });
  try {
    const { sql, params } = buildWhere({ university_id, campus });
    const [rows] = await db.query(
      `SELECT DISTINCT faculty_name FROM \`programs\`
       ${sql} AND faculty_name IS NOT NULL AND faculty_name != ''
       ORDER BY faculty_name`,
      params
    );
    res.json(rows.map(r => r.faculty_name));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/programs/group-fields?university_id=X&campus=Y&faculty=Z ────
// คืน list กลุ่มสาขา (สาขา) ที่มีใน campus+คณะนั้น
router.get('/group-fields', verifyToken, async (req, res) => {
  const { university_id, campus, faculty } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });
  try {
    const { sql, params } = buildWhere({ university_id, campus, faculty });
    const [rows] = await db.query(
      `SELECT DISTINCT group_field FROM \`programs\`
       ${sql} AND group_field IS NOT NULL AND group_field != ''
       ORDER BY group_field`,
      params
    );
    res.json(rows.map(r => r.group_field));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/programs/fields?...&group_field=W ───────────────────────────
// คืน list วิชาเอก (DISTINCT field_name_th)
router.get('/fields', verifyToken, async (req, res) => {
  const { university_id, campus, faculty, group_field } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });
  try {
    const { sql, params } = buildWhere({ university_id, campus, faculty, group_field });
    const [rows] = await db.query(
      `SELECT DISTINCT field_name_th FROM \`programs\`
       ${sql} AND field_name_th IS NOT NULL AND field_name_th != ''
       ORDER BY field_name_th`,
      params
    );
    res.json(rows.map(r => r.field_name_th));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/programs/names?...&field_name=V ─────────────────────────────
// คืน list ชื่อหลักสูตร (DISTINCT program_name_th)
router.get('/names', verifyToken, async (req, res) => {
  const { university_id, campus, faculty, group_field, field_name } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });
  try {
    const { sql, params } = buildWhere({ university_id, campus, faculty, group_field, field_name });
    const [rows] = await db.query(
      `SELECT DISTINCT program_name_th FROM \`programs\`
       ${sql} AND program_name_th IS NOT NULL
       ORDER BY program_name_th`,
      params
    );
    res.json(rows.map(r => r.program_name_th));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/programs/types?...&program_name=U ───────────────────────────
// คืน list ประเภทโปรแกรม (program_type)
router.get('/types', verifyToken, async (req, res) => {
  const { university_id, campus, faculty, group_field, field_name, program_name } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });
  try {
    const { sql, params } = buildWhere({ university_id, campus, faculty, group_field, field_name, program_name });
    const [rows] = await db.query(
      `SELECT DISTINCT program_type FROM \`programs\`
       ${sql} AND program_type IS NOT NULL AND program_type != ''
       ORDER BY program_type`,
      params
    );
    res.json(rows.map(r => r.program_type));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/programs/find?...&program_type=T ────────────────────────────
// คืน { id } ของ program ที่ตรงกับ 7 เงื่อนไข
router.get('/find', verifyToken, async (req, res) => {
  const { university_id, campus, faculty, group_field, field_name, program_name, program_type } = req.query;
  if (!university_id || !program_name) {
    return res.status(400).json({ message: 'ต้องระบุ university_id และ program_name' });
  }
  try {
    const { sql, params } = buildWhere({ university_id, campus, faculty, group_field, field_name, program_name, program_type });
    const [rows] = await db.query(
      `SELECT id, university_id, campus, faculty_name, group_field, field_name_th, program_name_th, program_type
       FROM \`programs\` ${sql} LIMIT 1`,
      params
    );
    if (!rows.length) return res.status(404).json({ message: 'ไม่พบหลักสูตรที่ตรงกัน' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/programs/list?university_id=X ───────────────────────────────
// คืนรายการทั้งหมดของ university นั้น (ใช้ใน FacultiesPage admin)
router.get('/list', verifyToken, async (req, res) => {
  const { university_id } = req.query;
  if (!university_id) return res.status(400).json({ message: 'ต้องระบุ university_id' });
  try {
    const [rows] = await db.query(
      `SELECT id, campus, faculty_name, group_field, field_name_th, program_name_th, program_type
       FROM \`programs\`
       WHERE university_id = ?
       ORDER BY campus, faculty_name, group_field, field_name_th, program_name_th`,
      [Number(university_id)]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/programs — เพิ่มหลักสูตรใหม่ ─────────────────────────────
router.post('/', verifyToken, adminOnly, async (req, res) => {
  const { university_id, campus, faculty_name, group_field, field_name_th, program_name_th, program_type } = req.body;
  if (!university_id || !program_name_th?.trim()) {
    return res.status(400).json({ message: 'ต้องระบุ university_id และ program_name_th' });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO \`programs\` (university_id, campus, faculty_name, group_field, field_name_th, program_name_th, program_type)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [Number(university_id), campus?.trim() || null, faculty_name?.trim() || null,
       group_field?.trim() || null, field_name_th?.trim() || null,
       program_name_th.trim(), program_type?.trim() || null]
    );
    res.json({ id: result.insertId, message: 'เพิ่มหลักสูตรสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/programs/:id — แก้ไขหลักสูตร ──────────────────────────
router.put('/:id', verifyToken, adminOnly, async (req, res) => {
  const { campus, faculty_name, group_field, field_name_th, program_name_th, program_type } = req.body;
  if (!program_name_th?.trim()) {
    return res.status(400).json({ message: 'ต้องระบุ program_name_th' });
  }
  try {
    const [result] = await db.query(
      `UPDATE \`programs\` SET campus=?, faculty_name=?, group_field=?, field_name_th=?, program_name_th=?, program_type=?
       WHERE id=?`,
      [campus?.trim() || null, faculty_name?.trim() || null,
       group_field?.trim() || null, field_name_th?.trim() || null,
       program_name_th.trim(), program_type?.trim() || null,
       Number(req.params.id)]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบหลักสูตร' });
    res.json({ message: 'แก้ไขสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/programs/:id — ลบหลักสูตร ────────────────────────────
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM `programs` WHERE id = ?', [Number(req.params.id)]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'ไม่พบหลักสูตร' });
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
