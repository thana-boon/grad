// =============================================================================
// backup.js — สร้าง / อ่าน / กู้คืน ไฟล์สำรองข้อมูลของ GradTrack
// =============================================================================
// ไฟล์สำรอง 1 ไฟล์ = .tar.gz ที่ข้างในมี
//
//   manifest.json        ข้อมูลกำกับ (สร้างเมื่อไร โดยใคร มีอะไรอยู่ข้างในบ้าง)
//   data/<table>.json    ทุกแถวของแต่ละตาราง  { table, rows: [ {...}, ... ] }
//   uploads/<path>       ไฟล์ใน server/uploads (รูปนักเรียน โลโก้ พื้นหลังการ์ด)
//
// manifest ถูกเขียนเป็น entry แรกเสมอ → หน้ารายการอ่านรายละเอียดของไฟล์ได้โดย
// ไม่ต้องคลายทั้งก้อน
//
// ⚠️ สิ่งที่ "ไม่" อยู่ในไฟล์สำรอง — ตั้งใจทั้งหมด
//   * ชื่อ/ชั้น/ห้องของนักเรียนและครู — อ่านสดจาก SchoolOS เสมอ ไม่มีสำเนาที่นี่
//   * ค่าใน .env (รหัส DB / JWT_SECRET / SCHOOLOS_API_KEY) — ความลับไม่ควรอยู่ใน
//     ไฟล์ที่ดาวน์โหลดผ่านเว็บได้
//   * โครงสร้างตาราง — schema มาจาก migration ตอนสตาร์ทเสมอ ไฟล์นี้เก็บแค่ "ข้อมูล"
//     กู้คืนข้ามเวอร์ชันได้ตราบใดที่ migration เป็น additive (ซึ่งเป็นกฎของโปรเจกต์อยู่แล้ว)
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const db = require('../config/db');
const logger = require('../config/logger');
const { createTarGz, readTarGz } = require('./tar');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// เก็บไฟล์ที่ระบบสร้างเองไว้กี่ไฟล์ (0 = ไม่ลบอะไรเลย)
// ไฟล์ที่ผู้ใช้อัปโหลดเข้ามาเอง และไฟล์ที่สร้างก่อนกู้คืน ไม่ถูกนับ/ไม่ถูกลบ
const KEEP = Math.max(0, Number(process.env.BACKUP_KEEP ?? 20) || 0);

const APP = 'gradtrack';
const FORMAT = 1;

// ลำดับตาม foreign key — ตอนใส่ข้อมูลไล่จากบนลงล่าง ตอนลบไล่กลับทาง
const TABLES = [
  'settings',
  'users',
  'staff_access',
  'academic_years',
  'universities',
  'faculties',
  'programs',
  'student_profiles',
  'student_admissions',
  'report_settings',
  'report_student_settings',
  'activity_logs',
];

const PREFIX = {
  AUTO: 'gradtrack-',
  PRE_RESTORE: 'gradtrack-prerestore-',
  UPLOADED: 'uploaded-',
};

// ─── ชื่อไฟล์ ────────────────────────────────────────────────────────────────
// ยอมเฉพาะ [A-Za-z0-9._-] และต้องลงท้าย .tar.gz — ตัดปัญหา path traversal
// ตั้งแต่ก่อนแตะ filesystem (ชื่อไฟล์มาจาก URL parameter)
const NAME_RE = /^[A-Za-z0-9._-]+\.tar\.gz$/;

function resolveBackupPath(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name) || name.includes('..')) return null;
  const full = path.join(BACKUP_DIR, name);
  // กันไว้อีกชั้นเผื่อ regex ข้างบนถูกแก้ในอนาคต
  if (path.dirname(path.resolve(full)) !== path.resolve(BACKUP_DIR)) return null;
  return full;
}

function stamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function ensureDir() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

// ─── uploads ─────────────────────────────────────────────────────────────────
async function listUploads(dir = UPLOAD_DIR, base = '') {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return []; // ยังไม่เคยมีการอัปโหลดอะไรเลย
  }

  const out = [];
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await listUploads(abs, rel)));
    } else if (e.isFile()) {
      const st = await fsp.stat(abs).catch(() => null);
      if (st) out.push({ rel, abs, size: st.size, mtime: st.mtime });
    }
  }
  return out;
}

// ─── สร้างไฟล์สำรอง ──────────────────────────────────────────────────────────
async function createBackup({ includeUploads = true, note = '', actor = '', kind = 'manual' } = {}) {
  await ensureDir();

  const now = new Date();
  const prefix = kind === 'pre-restore' ? PREFIX.PRE_RESTORE : PREFIX.AUTO;

  // ชื่อไฟล์ละเอียดถึงวินาที — สองครั้งในวินาทีเดียวกันต้องไม่ทับกันเงียบ ๆ
  let name = `${prefix}${stamp(now)}.tar.gz`;
  for (let i = 2; fs.existsSync(path.join(BACKUP_DIR, name)); i++) {
    name = `${prefix}${stamp(now)}-${i}.tar.gz`;
  }
  const dest = path.join(BACKUP_DIR, name);

  // นับก่อนเขียน เพื่อให้ manifest (entry แรก) มีตัวเลขครบตั้งแต่ต้นไฟล์
  const counts = {};
  for (const t of TABLES) {
    const [[row]] = await db.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    counts[t] = row.n;
  }

  const files = includeUploads ? await listUploads() : [];
  const uploadBytes = files.reduce((sum, f) => sum + f.size, 0);

  const manifest = {
    app: APP,
    format: FORMAT,
    createdAt: now.toISOString(),
    createdBy: actor || '',
    kind,
    note: String(note || '').slice(0, 300),
    includeUploads,
    tables: TABLES,
    counts,
    uploads: { files: files.length, bytes: uploadBytes },
  };

  const { tar, close, abort } = createTarGz(dest);
  try {
    await tar.add('manifest.json', JSON.stringify(manifest, null, 2), now);

    for (const t of TABLES) {
      const [rows] = await db.query(`SELECT * FROM "${t}"`);
      // Array.from: rows เป็น array ที่ถูกแปะ property พิเศษไว้ (ดู config/db.js)
      await tar.add(`data/${t}.json`, JSON.stringify({ table: t, rows: Array.from(rows) }), now);
    }

    for (const f of files) {
      const data = await fsp.readFile(f.abs).catch(() => null);
      if (!data) continue; // ไฟล์หายไประหว่างสำรอง — ข้าม ดีกว่าล้มทั้งงาน
      await tar.add(`uploads/${f.rel}`, data, f.mtime);
    }

    await close();
  } catch (err) {
    await abort(err).catch(() => {});
    await fsp.unlink(dest).catch(() => {}); // ไม่ทิ้งไฟล์ครึ่ง ๆ กลาง ๆ ไว้ให้คนเข้าใจผิด
    throw err;
  }

  const st = await fsp.stat(dest);
  const pruned = kind === 'manual' ? await pruneOld() : [];

  return { name, size: st.size, manifest, pruned };
}

// ─── รายการไฟล์สำรอง ─────────────────────────────────────────────────────────
async function readManifest(filePath) {
  for await (const entry of readTarGz(filePath)) {
    if (entry.name !== 'manifest.json') break; // manifest ต้องเป็น entry แรกเสมอ
    try {
      return JSON.parse(entry.data.toString('utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

async function listBackups() {
  await ensureDir();
  const names = (await fsp.readdir(BACKUP_DIR)).filter((n) => NAME_RE.test(n));

  const out = [];
  for (const name of names) {
    const full = path.join(BACKUP_DIR, name);
    const st = await fsp.stat(full).catch(() => null);
    if (!st || !st.isFile()) continue;

    // ไฟล์เสีย/อ่านไม่ออกก็ยังต้องขึ้นในรายการ — ผู้ใช้จะได้ลบทิ้งได้
    const manifest = await readManifest(full).catch(() => null);
    out.push({
      name,
      size: st.size,
      mtime: st.mtime.toISOString(),
      uploaded: name.startsWith(PREFIX.UPLOADED),
      protected: name.startsWith(PREFIX.UPLOADED) || name.startsWith(PREFIX.PRE_RESTORE),
      valid: !!manifest && manifest.app === APP,
      manifest,
    });
  }

  out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return out;
}

// ลบเฉพาะไฟล์ที่ระบบสร้างเองจากปุ่ม "สร้างไฟล์สำรอง" — ไฟล์ที่ผู้ใช้อัปโหลดเข้ามา
// และไฟล์ที่ระบบสร้างให้ก่อนกู้คืน ถือเป็นของที่ผู้ใช้ตั้งใจเก็บ ห้ามแตะ
async function pruneOld() {
  if (KEEP <= 0) return [];

  const names = (await fsp.readdir(BACKUP_DIR).catch(() => [])).filter(
    (n) => NAME_RE.test(n) && n.startsWith(PREFIX.AUTO) && !n.startsWith(PREFIX.PRE_RESTORE)
  );

  // เรียงตามเวลาไฟล์จริง ไม่ใช่ชื่อ — ชื่อละเอียดแค่ระดับวินาที และไฟล์ที่ชนวินาที
  // เดียวกันถูกต่อท้ายด้วย -2 ซึ่งเรียงตามตัวอักษรแล้วสลับที่กับไฟล์ที่เก่ากว่า
  const withTime = [];
  for (const n of names) {
    const st = await fsp.stat(path.join(BACKUP_DIR, n)).catch(() => null);
    if (st) withTime.push({ n, t: st.mtimeMs });
  }
  withTime.sort((a, b) => b.t - a.t);

  const doomed = withTime.slice(KEEP).map((x) => x.n);
  for (const n of doomed) {
    await fsp.unlink(path.join(BACKUP_DIR, n)).catch(() => {});
    logger.info(`ลบไฟล์สำรองเก่าเกินโควตา (BACKUP_KEEP=${KEEP}): ${n}`);
  }
  return doomed;
}

// ─── กู้คืน ──────────────────────────────────────────────────────────────────
async function tableColumns(q, table) {
  const [rows] = await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

/**
 * mode 'replace' = ล้างตารางที่มีอยู่ในไฟล์แล้วใส่ของในไฟล์แทน (ข้อมูลปัจจุบันหาย)
 * mode 'merge'   = เติมเฉพาะแถวที่ยังไม่มี (ชนคีย์ = ข้าม) ของเดิมไม่ถูกแตะ
 *
 * ทั้งสองแบบอยู่ใน transaction เดียว — พังกลางคันแล้วข้อมูลกลับไปเหมือนเดิมทั้งหมด
 */
async function restoreBackup(name, { mode = 'merge', includeUploads = true, actor = '' } = {}) {
  const filePath = resolveBackupPath(name);
  if (!filePath || !fs.existsSync(filePath)) {
    const err = new Error('ไม่พบไฟล์สำรองที่เลือก');
    err.status = 404;
    throw err;
  }
  if (mode !== 'replace' && mode !== 'merge') {
    const err = new Error('โหมดการกู้คืนไม่ถูกต้อง');
    err.status = 400;
    throw err;
  }

  const manifest = await readManifest(filePath);
  if (!manifest || manifest.app !== APP) {
    const err = new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ GradTrack');
    err.status = 400;
    throw err;
  }
  if (Number(manifest.format) > FORMAT) {
    const err = new Error(
      `ไฟล์สำรองมาจาก GradTrack รุ่นใหม่กว่า (format ${manifest.format}) — อัปเดตระบบก่อนกู้คืน`
    );
    err.status = 400;
    throw err;
  }

  const restoreUploads = includeUploads && manifest.includeUploads !== false;

  // จุดกลับตัว: ถ้ากู้คืนแล้วพบว่าเลือกไฟล์ผิด ยังมีของเดิมให้กู้กลับ
  const safety = await createBackup({
    includeUploads: restoreUploads,
    note: `อัตโนมัติ ก่อนกู้คืนจาก ${name}`,
    actor,
    kind: 'pre-restore',
  });

  // ─── รอบที่ 1: อ่านเฉพาะข้อมูลตาราง ───────────────────────────────────────
  const data = new Map();
  for await (const entry of readTarGz(filePath)) {
    const m = /^data\/(.+)\.json$/.exec(entry.name);
    if (!m) continue;
    if (!TABLES.includes(m[1])) continue; // ตารางที่ระบบนี้ไม่รู้จัก (ไฟล์จากรุ่นอื่น) → ข้าม
    let parsed;
    try {
      parsed = JSON.parse(entry.data.toString('utf8'));
    } catch {
      const err = new Error(`ไฟล์สำรองเสียหาย: อ่าน data/${m[1]}.json ไม่ได้`);
      err.status = 400;
      throw err;
    }
    data.set(m[1], Array.isArray(parsed?.rows) ? parsed.rows : []);
  }

  if (data.size === 0) {
    const err = new Error('ไฟล์สำรองไม่มีข้อมูลตารางอยู่เลย');
    err.status = 400;
    throw err;
  }

  const present = TABLES.filter((t) => data.has(t));
  const restored = {};

  await db.withTransaction(async (tx) => {
    if (mode === 'replace') {
      for (const t of [...present].reverse()) {
        await tx.query(`DELETE FROM "${t}"`);
      }
    }

    // ใช้เฉพาะคอลัมน์ที่ schema ปัจจุบันมีจริง — ไฟล์เก่ากู้เข้าระบบใหม่ได้
    // (คอลัมน์ที่เพิ่มมาทีหลังจะได้ค่า default) และคอลัมน์แปลกปลอมไม่ทำให้ล้ม
    const colsOf = new Map();
    for (const t of present) colsOf.set(t, await tableColumns(tx.query, t));

    for (const t of present) {
      const rows = data.get(t);
      restored[t] = 0;
      if (rows.length === 0) continue;

      const cols = colsOf.get(t);
      const keys = Object.keys(rows[0] || {}).filter((k) => cols.has(k));
      if (keys.length === 0) continue;

      const quoted = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(', ');
      const chunkSize = Math.max(1, Math.floor(50000 / keys.length));

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const placeholders = chunk
          .map((row) => {
            for (const k of keys) {
              const v = row[k];
              values.push(v === undefined ? null : v);
            }
            return `(${keys.map(() => '?').join(', ')})`;
          })
          .join(', ');

        // merge: ชนคีย์ใด ๆ ก็ข้ามแถวนั้น (ไม่ระบุ target เพราะแต่ละตารางคนละคีย์)
        const [result] = await tx.query(
          `INSERT INTO "${t}" (${quoted}) VALUES ${placeholders}` +
            (mode === 'merge' ? ' ON CONFLICT DO NOTHING' : ''),
          values
        );
        restored[t] += result.affectedRows ?? chunk.length;
      }
    }

    // ตาราง SERIAL: ใส่ id มากับข้อมูล → ตัวนับยังชี้ที่เดิม แถวใหม่จะชนคีย์ทันที
    for (const t of present) {
      // pg_get_serial_sequence โยน error ถ้าไม่มีคอลัมน์ชื่อนั้นจริง (เช่น settings)
      if (!colsOf.get(t)?.has('id')) continue;
      const [[seqRow]] = await tx.query(`SELECT pg_get_serial_sequence(?, 'id') AS seq`, [t]);
      if (!seqRow?.seq) continue; // ตารางที่ id ไม่ใช่ serial (เช่น academic_years)
      await tx.query(
        `SELECT setval(?, GREATEST(COALESCE((SELECT MAX(id) FROM "${t}"), 0), 1),
                (SELECT COUNT(*) FROM "${t}") > 0)`,
        [seqRow.seq]
      );
    }
  });

  // ─── รอบที่ 2: ไฟล์ใน uploads (หลัง DB สำเร็จเท่านั้น) ────────────────────
  // เขียนทับไฟล์ชื่อซ้ำ แต่ "ไม่ลบ" ไฟล์ที่ไม่มีในไฟล์สำรอง — รูปที่เพิ่งอัปหลัง
  // จากวันที่สำรองไว้จะได้ไม่หายไปเพราะกดกู้คืน
  let uploadCount = 0;
  if (restoreUploads) {
    for await (const entry of readTarGz(filePath)) {
      if (!entry.name.startsWith('uploads/')) continue;
      const rel = entry.name.slice('uploads/'.length);
      if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue;

      const abs = path.join(UPLOAD_DIR, rel);
      if (!path.resolve(abs).startsWith(path.resolve(UPLOAD_DIR) + path.sep)) continue;

      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, entry.data);
      uploadCount++;
    }
  }

  return {
    mode,
    manifest,
    restored,
    uploads: uploadCount,
    safetyBackup: safety.name,
  };
}

// ─── ตรวจไฟล์ที่ผู้ใช้อัปโหลดเข้ามา ──────────────────────────────────────────
async function inspectFile(filePath) {
  const manifest = await readManifest(filePath);
  if (!manifest || manifest.app !== APP) return null;
  return manifest;
}

module.exports = {
  BACKUP_DIR,
  UPLOAD_DIR,
  TABLES,
  KEEP,
  PREFIX,
  NAME_RE,
  createBackup,
  listBackups,
  readManifest,
  restoreBackup,
  resolveBackupPath,
  inspectFile,
  stamp,
  ensureDir,
};
