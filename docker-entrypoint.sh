#!/bin/sh
set -e

# ทุกคำสั่งในไฟล์นี้ปิด stdin (< /dev/null) — บน docker server ไม่มี TTY
# ถ้ามี prompt โผล่มาต้อง "พังทันที" ไม่ใช่ค้างรอ input เงียบ ๆ จนกว่าจะมีคนไปดู
# (deploy ผ่าน Portainer เห็นแค่ว่าคอนเทนเนอร์ไม่ขึ้น ไม่มีใครไปพิมพ์ตอบให้)

# ---- ตรวจ env ที่ขาดไม่ได้ ----
# เช็คก่อนทุกอย่าง เพื่อให้ log บอกตรง ๆ ว่าลืมตั้งตัวไหน
# ดีกว่าปล่อยให้ไปพังตอน query แรกด้วย error ที่อ่านไม่รู้เรื่อง
echo "==> ตรวจ environment"
node scripts/check-env.js < /dev/null

# ---- รอ postgres พร้อมก่อน ----
# กันกรณีสตาร์ตพร้อม postgres-core แล้วต่อไม่ทัน (จะได้ไม่ crash loop ให้ตกใจเล่น)
echo "==> รอ postgres พร้อมใช้งาน"
node -e "
const { Client } = require('pg');
(async () => {
  for (let i = 1; i <= 60; i++) {
    try {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect(); await c.end();
      console.log('    postgres พร้อมแล้ว');
      process.exit(0);
    } catch (e) {
      if (i === 1 || i % 5 === 0) console.log('    ยังต่อไม่ได้ (' + (e.code || e.message) + ') ลองใหม่ ' + i + '/60');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('    ❌ ต่อ postgres ไม่ได้ภายใน 2 นาที — เช็ค DATABASE_URL / network school-net');
  process.exit(1);
})();
" < /dev/null

# ---- ตรวจ SchoolOS API key ----
# ต้องเช็คตรงนี้เพราะถ้า key ผิด อาการจะไปโผล่หน้า login ว่า "รหัสผ่านไม่ถูกต้อง"
# (SchoolOS ตอบ 401 ทั้งกรณีรหัสผ่านผิดและ key ผิด) — ชี้ไปผิดทางจนหาสาเหตุไม่เจอ
echo "==> ตรวจ SchoolOS API key"
node -e "
const base = (process.env.SCHOOLOS_API_BASE || '').replace(/\/+\$/, '');
fetch(base + '/api/public/v1/me', {
  headers: { 'X-API-Key': process.env.SCHOOLOS_API_KEY },
  signal: AbortSignal.timeout(10000),
})
  .then(async (res) => {
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      console.log('    key ใช้ได้: ' + (d.name || '?') + '  scopes=' + (d.scopes || []).join(','));
      // GradTrack ต้องใช้ scope เหล่านี้เป็นอย่างน้อย ไม่งั้นจะไปพังตอนมีคนล็อกอิน
      const need = ['students:read', 'teachers:read', 'auth:students', 'auth:teachers'];
      const missing = need.filter((s) => !(d.scopes || []).includes(s));
      if (missing.length) {
        console.error('    ❌ key ขาด scope: ' + missing.join(', '));
        process.exit(1);
      }
      process.exit(0);
    }
    const code = await res.json().then((d) => d?.error?.code).catch(() => undefined);
    if (res.status === 401 || res.status === 403) {
      console.error('    ❌ SCHOOLOS_API_KEY ใช้ไม่ได้ (' + res.status + (code ? ' ' + code : '') + ') — key ผิด/หมดอายุ หรือขาด scope');
    } else {
      console.error('    ❌ ' + base + ' ตอบ HTTP ' + res.status);
    }
    process.exit(1);
  })
  .catch((e) => {
    console.error('    ❌ ต่อ ' + base + ' ไม่ได้ (' + (e.cause?.code || e.message) + ') — เช็ค network / SCHOOLOS_API_BASE');
    process.exit(1);
  });
" < /dev/null

# migration กับ bootstrap รันอยู่ใน server/index.js ตอนสตาร์ท:
#   migration = fatal   (schema ไม่ถูก → ไม่ต้องรับ request)
#   bootstrap = ไม่ fatal (SchoolOS ล่มชั่วคราวไม่ควรทำให้แอปไม่ขึ้น)
# ไม่มีขั้นตอนสร้าง admin — ผู้ดูแลมาจาก role teacher-admin ของ SchoolOS โดยตรง

echo "==> starting GradTrack on :${PORT} ${BASE_PATH:-/}"
exec "$@"
