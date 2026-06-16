// ─── Student API client ───────────────────────────────────────────────────────
// ห่อการเรียก Student API (อ่านข้อมูลนักเรียนหลักจาก students_db)
// ใช้แทนการ query ข้ามฐานข้อมูล school_app.* ที่เคยใช้
//
// ต้องตั้งค่าใน .env:
//   STUDENT_API_BASE_URL=http://192.168.200.9/students-api/v1   (ผ่าน proxy บน server จริง)
//   STUDENT_API_KEY=sk_xxxxxxxx...   (scope read:full)
// หมายเหตุ: ค่า default localhost:4000 ด้านล่างใช้เฉพาะตอน dev ที่ยิงตรงเข้า Node ไม่ผ่าน proxy
const axios = require('axios');
const logger = require('./logger');

const BASE_URL = (process.env.STUDENT_API_BASE_URL || 'http://localhost:4000/v1').replace(/\/$/, '');
const API_KEY = process.env.STUDENT_API_KEY || '';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'X-API-Key': API_KEY },
});

// แปลง error จาก API ให้มี message ที่อ่านง่าย
function wrapError(err, context) {
  const status = err.response?.status;
  const apiError = err.response?.data?.error;
  const apiMessage = err.response?.data?.message;
  const detail = apiError ? `${apiError}${apiMessage ? `: ${apiMessage}` : ''}` : err.message;
  logger.error(`Student API ${context} failed`, { status, error: detail });
  const e = new Error(`Student API ${context}: ${detail}`);
  e.status = status;
  e.apiError = apiError;
  return e;
}

// ─── GET /academic-years → { current, years: [...] } ──────────────────────────
async function getAcademicYears() {
  try {
    const { data } = await client.get('/academic-years');
    return data; // { current, years: [{ id, year_be, title, is_active }, ...] }
  } catch (err) {
    throw wrapError(err, 'getAcademicYears');
  }
}

// หา year object จาก id (จากรายการ academic-years)
async function getAcademicYearById(yearId) {
  const { years } = await getAcademicYears();
  return (years || []).find((y) => Number(y.id) === Number(yearId)) || null;
}

// ─── GET /students/:student_code → student เดี่ยว (มี citizen_id เมื่อ scope read:full) ──
// คืน null ถ้าไม่พบ (404). ลองทั้งรหัสตามที่ส่งมา และรูปแบบ pad 5 หลัก/ตัดศูนย์นำหน้า
async function getStudentByCode(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;

  const candidates = [...new Set([
    code,
    code.padStart(5, '0'),
    String(parseInt(code, 10)),
  ].filter((c) => c && c !== 'NaN'))];

  for (const candidate of candidates) {
    try {
      const { data } = await client.get(`/students/${encodeURIComponent(candidate)}`);
      return data;
    } catch (err) {
      if (err.response?.status === 404) continue; // ลองรูปแบบถัดไป
      throw wrapError(err, 'getStudentByCode');
    }
  }
  return null;
}

// ─── GET /students (1 หน้า) ───────────────────────────────────────────────────
async function listStudents(params = {}) {
  try {
    const { data } = await client.get('/students', { params });
    return data; // { data: [...], meta: { total, page, limit, academic_year } }
  } catch (err) {
    throw wrapError(err, 'listStudents');
  }
}

// ─── ดึงนักเรียนทุกหน้า (วนตาม pagination) ─────────────────────────────────────
// คืน { data: [...all], meta } โดย meta มาจากหน้าแรก
async function listAllStudents(params = {}) {
  const limit = Math.min(Number(params.limit) || 200, 200);
  let page = 1;
  let firstMeta = null;
  const all = [];

  while (true) {
    const { data, meta } = await listStudents({ ...params, page, limit });
    if (!firstMeta) firstMeta = meta;
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);

    const total = meta?.total ?? all.length;
    if (all.length >= total || data.length < limit) break;
    page += 1;
    if (page > 100) break; // กันลูปไม่รู้จบ
  }

  return { data: all, meta: firstMeta };
}

module.exports = {
  getAcademicYears,
  getAcademicYearById,
  getStudentByCode,
  listStudents,
  listAllStudents,
};
