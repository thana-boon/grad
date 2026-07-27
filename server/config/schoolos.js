// ─── SchoolOS Public API client ───────────────────────────────────────────────
// เอกสาร: API-KEYS.md  ·  base = http://<host>:3002  ·  ทุก endpoint อยู่ใต้ /api/public/v1
// auth ด้วย header  X-API-Key: sk_live_...
//
// เรียกจากฝั่ง server เท่านั้น — key ห้ามหลุดไปถึง browser เด็ดขาด
//
// โมดูลนี้ทำหน้าที่ "แปลภาษา" ด้วย: SchoolOS ตอบ camelCase (studentCode, gradeLevel)
// แต่โค้ด GradTrack ทั้งโปรเจกต์ + ฝั่ง client ใช้ snake_case (student_code, class_level)
// จึง map ให้ตรง shape เดิมตั้งแต่ตรงนี้ ไม่ต้องไล่แก้ทุกหน้า
const logger = require('./logger');
const db = require('./db');

const V1 = '/api/public/v1';
const BASE = (process.env.SCHOOLOS_API_BASE || '').replace(/\/+$/, '');
const KEY = process.env.SCHOOLOS_API_KEY || '';

// เพดานรอคำตอบต่อ request — ถ้า SchoolOS ช้า/ค้าง ให้ตัดที่ 10 วิ
// (listAllStudents วนหลายหน้า ถ้าไม่มี timeout จะค้างคูณจำนวนรอบ)
const TIMEOUT_MS = 10_000;

// pageSize สูงสุดที่ API ยอมรับ
const MAX_PAGE_SIZE = 200;

/** key ของ GradTrack เองใช้ไม่ได้ (ไม่ได้ตั้ง / ผิด / หมดอายุ / ขาด scope) */
class SosKeyError extends Error {
  constructor(code) {
    super(`schoolos_key_${code}`);
    this.name = 'SosKeyError';
    this.code = code;
  }
}

/** /auth/verify ตอบ 429 — ลองรหัสผ่านถี่เกินไป */
class SosRateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('too_many_attempts');
    this.name = 'SosRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function sos(path, init) {
  if (!BASE) throw new SosKeyError('no_base_url');
  if (!KEY) throw new SosKeyError('no_key');

  return fetch(`${BASE}${V1}${path}`, {
    ...init,
    headers: {
      'X-API-Key': KEY,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// อ่าน error.code จาก body โดยไม่ทำให้ response พังถ้า body ไม่ใช่ JSON
async function errorCode(res) {
  try {
    const d = await res.clone().json();
    return d?.error?.code;
  } catch {
    return undefined;
  }
}

// GET ที่แปลง 401/403 เป็น SosKeyError เสมอ — endpoint พวกนี้ไม่มี credential ผู้ใช้
// เข้ามาเกี่ยว ถ้าโดนปฏิเสธแปลว่าเป็นปัญหาของ key เราเอง ไม่ใช่ของผู้ใช้
async function getJson(path, context) {
  let res;
  try {
    res = await sos(path);
  } catch (err) {
    if (err instanceof SosKeyError) throw err;
    logger.error(`SchoolOS ${context} unreachable`, { error: err.message });
    throw new Error(`SchoolOS ${context}: ต่อ ${BASE} ไม่ได้ (${err.cause?.code || err.message})`);
  }

  if (res.status === 401 || res.status === 403) {
    const code = (await errorCode(res)) || String(res.status);
    logger.error(`SchoolOS ${context} rejected key`, { status: res.status, code });
    throw new SosKeyError(code);
  }
  if (!res.ok) {
    logger.error(`SchoolOS ${context} failed`, { status: res.status });
    throw new Error(`SchoolOS ${context}: HTTP ${res.status}`);
  }
  return res.json();
}

// ─── mapping ─────────────────────────────────────────────────────────────────
// number_in_room / class_room จาก API เป็น string ("1") — โค้ดเดิมเอาไปลบกันตอน sort
// จึงแปลงเป็นตัวเลขให้ตรงนี้ (ถ้าแปลงไม่ได้คงค่าเดิมไว้ ดีกว่าได้ NaN ไปเรียงมั่ว)
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

function mapStudent(s) {
  if (!s) return null;
  return {
    id: s.id,
    student_code: s.studentCode,
    title_prefix: s.prefix ?? '',
    first_name: s.firstName ?? '',
    last_name: s.lastName ?? '',
    full_name: s.fullName ?? `${s.prefix ?? ''}${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
    nickname: s.nickname ?? '',
    first_name_en: s.firstNameEn ?? null,
    last_name_en: s.lastNameEn ?? null,
    gender: s.gender ?? null,
    birth_date: s.birthDate ?? null,
    email: s.email ?? null,
    status: s.status ?? null,
    class_level: s.gradeLevel ?? '',
    class_room: num(s.classroom),
    number_in_room: num(s.classNumber),
    // มีค่าก็ต่อเมื่อ key มี scope students:pii เท่านั้น — ปกติเป็น undefined
    citizen_id: s.citizenId,
  };
}

function mapTeacher(t) {
  if (!t) return null;
  return {
    id: t.id,
    teacher_code: t.teacherCode,
    title_prefix: t.prefix ?? '',
    first_name: t.firstName ?? '',
    last_name: t.lastName ?? '',
    full_name: t.fullName ?? `${t.prefix ?? ''}${t.firstName ?? ''} ${t.lastName ?? ''}`.trim(),
    email: t.email ?? null,
    subject_group: t.subjectGroup ?? null,
    grade_taught: t.gradeTaught ?? null,
    role: t.role ?? 'teacher',
    employment_status: t.employmentStatus ?? null,
  };
}

// ปีการศึกษา: API ตอบ { id, year: 2569 } — client เดิมอ่าน year_be / title / is_active
function mapYear(y, isCurrent = false) {
  if (!y) return null;
  return {
    id: Number(y.id),
    year_be: String(y.year ?? ''),
    title: `ปีการศึกษา ${y.year ?? ''}`.trim(),
    is_active: isCurrent ? 1 : 0,
  };
}

// ─── students ────────────────────────────────────────────────────────────────
// รับ params แบบเดิมของ GradTrack (year_id, class_level, limit) แล้วแปลงเป็นชื่อของ API ใหม่
async function listStudents(params = {}) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.class_level) sp.set('grade', params.class_level);
  if (params.class_room) sp.set('classroom', String(params.class_room));
  if (params.year_id) sp.set('yearId', String(params.year_id));
  // ค่าเริ่มต้นฝั่ง API คือ status=studying — GradTrack ต้องเห็นเด็กที่จบไปแล้วด้วย
  // (หน้ารายงาน/สถานะ admission ของรุ่นก่อนหน้า) จึงขอ all เว้นแต่ระบุมาเอง
  sp.set('status', params.status || 'all');
  sp.set('page', String(params.page || 1));
  sp.set('pageSize', String(Math.min(Number(params.limit) || 50, MAX_PAGE_SIZE)));

  const d = await getJson(`/students?${sp}`, 'listStudents');
  return {
    data: (d.data || []).map(mapStudent),
    meta: {
      total: d.total ?? 0,
      page: d.page ?? 1,
      limit: d.pageSize ?? 0,
      academic_year: d.academicYear ? mapYear(d.academicYear, true) : null,
    },
  };
}

/** ดึงนักเรียนทุกหน้า (วนตาม pagination) */
async function listAllStudents(params = {}) {
  const limit = Math.min(Number(params.limit) || MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  let page = 1;
  let firstMeta = null;
  const all = [];

  for (;;) {
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

/**
 * หานักเรียนจากรหัส
 *
 * API ใหม่ไม่มี endpoint /students/:code แบบเดิม — ต้องค้นผ่าน q แล้วจับคู่เอง
 * (q ค้นได้ทั้งชื่อ/นามสกุล/รหัส จึงต้องกรองซ้ำฝั่งเราเพื่อไม่ให้ได้คนที่ชื่อพ้องรหัส)
 *
 * รหัสจาก SchoolOS pad ศูนย์ 5 หลัก ("02809") แต่ข้อมูลเก่าใน DB เก็บแบบ "2809"
 * จึงลองเทียบทั้งสองแบบ
 */
async function getStudentByCode(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;

  const candidates = [...new Set([code, code.padStart(5, '0'), String(parseInt(code, 10))]
    .filter((c) => c && c !== 'NaN'))];

  for (const candidate of candidates) {
    const { data } = await listStudents({ q: candidate, limit: MAX_PAGE_SIZE });
    const hit = (data || []).find((s) =>
      candidates.includes(String(s.student_code)) ||
      String(parseInt(s.student_code, 10)) === String(parseInt(candidate, 10))
    );
    if (hit) return hit;
  }
  return null;
}

// ─── academic years ──────────────────────────────────────────────────────────
// SchoolOS ไม่มี endpoint ให้ list ปีการศึกษา — มีแต่ field academicYear ที่ติดมากับ
// /students จึงอ่านปีปัจจุบันจากตรงนั้น แล้วสะสมลงตาราง academic_years ของเราเอง
// เพื่อให้หน้า "ปีการศึกษา" ยังเลือกย้อนหลังได้หลังขึ้นปีใหม่
async function getAcademicYears() {
  let current = null;

  try {
    const d = await getJson('/students?pageSize=1&status=all', 'getAcademicYears');
    current = d.academicYear ? mapYear(d.academicYear, true) : null;
  } catch (err) {
    // API ล่ม → ยังคืนปีที่เคยเห็นจากแคชได้ ดีกว่าทั้งหน้าพัง
    logger.warn('SchoolOS academic year probe failed, using cache', { error: err.message });
  }

  if (current) {
    await db
      .query(
        `INSERT INTO academic_years (id, year_be, title, is_current)
         VALUES (?, ?, ?, 1)
         ON CONFLICT (id) DO UPDATE
           SET year_be = EXCLUDED.year_be, title = EXCLUDED.title, is_current = 1, seen_at = CURRENT_TIMESTAMP`,
        [current.id, current.year_be, current.title]
      )
      .catch((e) => logger.warn('cache academic year failed', { error: e.message }));
    await db
      .query('UPDATE academic_years SET is_current = 0 WHERE id <> ?', [current.id])
      .catch(() => {});
  }

  const [rows] = await db
    .query('SELECT id, year_be, title, is_current FROM academic_years ORDER BY id DESC')
    .catch(() => [[]]);

  const years = rows.map((r) => ({
    id: r.id,
    year_be: r.year_be,
    title: r.title,
    is_active: r.is_current ? 1 : 0,
  }));

  return { current: current || years.find((y) => y.is_active) || years[0] || null, years };
}

async function getAcademicYearById(yearId) {
  const { years } = await getAcademicYears();
  return years.find((y) => Number(y.id) === Number(yearId)) || null;
}

// ─── teachers ────────────────────────────────────────────────────────────────
async function listTeachers(params = {}) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.role) sp.set('role', params.role);
  if (params.subject_group) sp.set('subjectGroup', params.subject_group);
  sp.set('status', params.status || 'active');
  sp.set('page', String(params.page || 1));
  sp.set('pageSize', String(Math.min(Number(params.limit) || 50, MAX_PAGE_SIZE)));

  const d = await getJson(`/teachers?${sp}`, 'listTeachers');
  return {
    data: (d.data || []).map(mapTeacher),
    meta: { total: d.total ?? 0, page: d.page ?? 1, limit: d.pageSize ?? 0 },
  };
}

// ─── auth/verify ─────────────────────────────────────────────────────────────
/**
 * ตรวจรหัสผ่านกับ SchoolOS — endpoint นี้ "ตรวจอย่างเดียว ไม่ออก token"
 * GradTrack ออก JWT ของตัวเองต่อ (ไม่มีการแชร์ JWT secret ข้ามระบบ)
 *
 * คืน null = รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ไม่แยกให้ กัน enumerate)
 * โยน SosKeyError = key ของ GradTrack เองมีปัญหา — คนละเรื่องกับผู้ใช้กรอกผิด
 *   ถ้าไม่แยกสองอย่างนี้ ปัญหา config จะไปโผล่หน้า login ว่า "รหัสผ่านไม่ถูกต้อง"
 *   ซึ่งไล่หาสาเหตุแทบไม่ได้
 */
async function verify(role, username, password) {
  let res;
  try {
    res = await sos('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ role, username, password }),
    });
  } catch (err) {
    if (err instanceof SosKeyError) throw err;
    logger.error('SchoolOS verify unreachable', { error: err.message });
    throw new Error(`SchoolOS verify: ต่อ ${BASE} ไม่ได้ (${err.cause?.code || err.message})`);
  }

  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After')) || 900;
    throw new SosRateLimitError(retry);
  }

  if (res.status === 401 || res.status === 403) {
    const code = await errorCode(res);
    if (code && code !== 'invalid_credentials') throw new SosKeyError(code);
    return null;
  }

  if (!res.ok) throw new Error(`SchoolOS verify: HTTP ${res.status}`);

  const data = await res.json();
  if (!data?.valid || !data.user) return null;
  return data.user; // { id, code, name, role, active, status }
}

// ─── /me — ใช้ตรวจ key ตอนสตาร์ท ─────────────────────────────────────────────
async function me() {
  return getJson('/me', 'me');
}

module.exports = {
  listStudents,
  listAllStudents,
  getStudentByCode,
  getAcademicYears,
  getAcademicYearById,
  listTeachers,
  verify,
  me,
  SosKeyError,
  SosRateLimitError,
  BASE,
};
