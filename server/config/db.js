// ─── PostgreSQL connection pool ───────────────────────────────────────────────
// GradTrack ย้ายจาก MySQL มาเกาะ postgres-core (network "school-net") ที่มีอยู่แล้ว
//
// โมดูลนี้คืน object ที่หน้าตาเหมือน mysql2/promise pool โดยตั้งใจ:
// route ทั้งโปรเจกต์เขียนเป็น `const [rows] = await db.query(sql, params)` อยู่แล้ว
// การรักษา shape เดิมไว้ทำให้ไม่ต้องรื้อ ~150 query ทีเดียว (ซึ่งเสี่ยงพลาดมากกว่า)
// ส่วนที่ Postgres ไม่รู้จักจริง ๆ (ON DUPLICATE KEY / INSERT IGNORE / bulk VALUES ?)
// ถูกแก้ด้วยมือในแต่ละ route แล้ว — ที่นี่แปลงเฉพาะสิ่งที่แปลงอัตโนมัติได้อย่างปลอดภัย
const { Pool } = require('pg');
const logger = require('./logger');

// ─── SQL translation ──────────────────────────────────────────────────────────
// เดินอ่าน SQL ทีละตัวอักษรแทนการ .replace() ทั้งก้อน เพราะ `?` และ backtick
// อาจอยู่ในสตริง (เช่น LIKE '%?%') ซึ่งห้ามแตะ
//
//   `ident`  →  "ident"    (คอลัมน์ `key`/`value` เป็นคำสงวนของ Postgres ต้อง quote จริง)
//   ?        →  $1, $2 …
function translate(sql) {
  let out = '';
  let param = 0;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    // สตริง '...'  (escape ด้วย '' ตามมาตรฐาน SQL)
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j;
      continue;
    }

    // identifier "..." ที่เขียนมาแล้ว — ปล่อยผ่าน
    if (ch === '"') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '"') j++;
      out += sql.slice(i, j + 1);
      i = j;
      continue;
    }

    // identifier แบบ MySQL `...` → "..."
    if (ch === '`') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '`') j++;
      out += '"' + sql.slice(i + 1, j) + '"';
      i = j;
      continue;
    }

    // คอมเมนต์ -- ถึงท้ายบรรทัด
    if (ch === '-' && sql[i + 1] === '-') {
      let j = i;
      while (j < sql.length && sql[j] !== '\n') j++;
      out += sql.slice(i, j);
      i = j - 1;
      continue;
    }

    // คอมเมนต์ /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const j = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, j);
      i = j - 1;
      continue;
    }

    if (ch === '?') {
      out += '$' + ++param;
      continue;
    }

    out += ch;
  }

  return out;
}

// ─── Pool ─────────────────────────────────────────────────────────────────────
// รับได้ทั้ง DATABASE_URL (แบบที่ compose ประกอบให้) และ PG* แยกตัว (สะดวกตอน dev)
// ไม่มี default password ในโค้ด — รหัสต้องมาจาก env เท่านั้น
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 10,
    });

pool.on('error', (err) => {
  // client ที่ idle อยู่ใน pool หลุด (postgres restart / network สะดุด)
  // pg จะคืน client ตัวใหม่ให้เอง — log ไว้เฉย ๆ ห้ามปล่อยให้ throw จนโปรเซสตาย
  logger.error('Postgres idle client error', { error: err.message });
});

// แปะ affectedRows / insertId ไว้บนตัว array ของ rows
// (array ก็เป็น object) → ทั้ง `const [rows] =` และ `const [result] =` ใช้ได้เหมือน mysql2
//
// insertId มีค่าก็ต่อเมื่อ query เขียน RETURNING id เอาไว้ — Postgres ไม่มี
// LAST_INSERT_ID() ให้เดา จึงต้องขอมาตรง ๆ (route ที่ใช้ insertId เติม RETURNING แล้ว)
function decorate(res) {
  const rows = res.rows;
  Object.defineProperty(rows, 'affectedRows', { value: res.rowCount, enumerable: false });
  Object.defineProperty(rows, 'insertId', { value: res.rows[0]?.id ?? null, enumerable: false });
  return rows;
}

// ─── query() — คืนค่าหน้าตาเดียวกับ mysql2/promise ────────────────────────────
async function query(sql, params = []) {
  const res = await pool.query(translate(sql), params);
  return [decorate(res), res.fields];
}

// ต่อ transaction — ใช้ตอน import ที่ต้อง all-or-nothing
async function withTransaction(fn) {
  const client = await pool.connect();
  const tx = {
    query: async (sql, params = []) => {
      const res = await client.query(translate(sql), params);
      return [decorate(res), res.fields];
    },
  };
  try {
    await client.query('BEGIN');
    const out = await fn(tx);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, withTransaction, pool, translate };
