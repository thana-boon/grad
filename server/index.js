const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('./config/env');

const logger = require('./config/logger');
const db = require('./config/db');
const { migrate } = require('./database/migrate');
const { seedCatalog } = require('./database/seed-catalog');
const { bootstrap } = require('./bootstrap');

const app = express();
const PORT = Number(process.env.PORT) || 3003;

// ─── BASE_PATH ────────────────────────────────────────────────────────────────
// prod เสิร์ฟใต้ subpath (nginx portal ส่ง schoolos.sukhon.ac.th/gradtrack/... มาที่พอร์ตนี้
// โดย "คง prefix ไว้") — ฝั่ง server จึงต้องรับ path ที่ยังมี /gradtrack นำหน้าอยู่
// ค่าว่าง = เสิร์ฟที่ root (เหมาะกับ dev)
//
// ค่านี้ต้องตรงกับ BASE_PATH ที่ใช้ตอน build ฝั่ง client เป๊ะ ๆ ไม่งั้น asset 404
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

// ─── trust proxy ──────────────────────────────────────────────────────────────
// อยู่หลัง nginx → req.ip จะกลายเป็น IP ของ proxy ทุกคำขอถ้าไม่ตั้งค่านี้
// ผลคือ rate limit ตอน login จะนับรวมทั้งโรงเรียนเป็นถังเดียว (5 ครั้ง/15 นาที ทั้งระบบ)
// ตั้งเป็นจำนวน hop ไม่ใช่ true — `true` เชื่อ X-Forwarded-For ทั้งสายจนปลอมได้
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// เสิร์ฟ client จากโปรเซสเดียวกันแล้ว → prod เป็น same-origin ไม่ต้องใช้ CORS
// รายการนี้เหลือไว้สำหรับ dev ที่ vite dev server อยู่คนละพอร์ต
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // ไม่ใช่ browser (curl / healthcheck)
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // origin ที่ไม่รู้จัก → "ไม่ใส่ CORS header" เฉย ๆ ไม่ใช่โยน error
      //
      // เดิมโยน error ตรงนี้แล้วกลายเป็น HTTP 500 ซึ่งพังของจริง:
      // vite ใส่ attribute crossorigin ให้ <script>/<link> ของ bundle
      // → เบราว์เซอร์แนบ header Origin มาด้วยแม้จะเป็น same-origin
      // → asset ทุกตัวโดนตีเป็น cross-origin แล้ว 500 ทั้งหน้า (จอขาว)
      //
      // คืน false = ไม่มี Access-Control-Allow-Origin ในคำตอบ
      // same-origin ยังโหลดได้ตามปกติ (ไม่ต้องใช้ CORS header อยู่แล้ว)
      // ส่วน cross-origin จริง ๆ เบราว์เซอร์จะบล็อกฝั่งมันเอง ซึ่งคือผลที่ต้องการ
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  })
);

// ─── ทุกอย่างของแอปแขวนอยู่บน router ตัวนี้ แล้วค่อย mount ใต้ BASE_PATH ────────
// เขียน path ในโค้ดเป็น "/api/..." เหมือนเดิมได้ ไม่ต้องเติม prefix เอง
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
router.use('/uploads', express.static(UPLOAD_DIR));

router.use('/api/auth', require('./routes/auth'));
router.use('/api/users', require('./routes/users'));
router.use('/api/academic-years', require('./routes/academicYears'));
router.use('/api/students', require('./routes/students'));
router.use('/api/universities', require('./routes/universities'));
router.use('/api/faculties', require('./routes/faculties'));
router.use('/api/programs', require('./routes/programs'));
router.use('/api/student', require('./routes/studentAuth'));
router.use('/api/report-settings', require('./routes/reportSettings'));
router.use('/api/activity-logs', require('./routes/activityLogs'));

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, basePath: BASE_PATH || '/' });
});

// ─── เสิร์ฟ client ที่ build แล้ว (โปรเซสเดียว พอร์ตเดียว) ─────────────────────
// ไม่มี .htaccess/nginx rule แยกอีกต่อไป — SPA fallback ด้านล่างทำหน้าที่ rewrite แทน
// asset ใหม่ที่วางใน client/public จึงถูกเสิร์ฟใต้ BASE_PATH ให้อัตโนมัติ
const DIST_DIR = path.join(__dirname, '..', 'client', 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const hasClient = fs.existsSync(INDEX_HTML);

if (hasClient) {
  router.use(express.static(DIST_DIR, { index: false }));

  // SPA fallback: path ที่ไม่ใช่ /api และไม่ใช่ไฟล์จริง → คืน index.html
  // ให้ react-router จัดการ route ต่อ (เช่นเปิด /gradtrack/admin/students ตรง ๆ หรือกด refresh)
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(INDEX_HTML);
  });
}

app.use(BASE_PATH || '/', router);

// เปิดที่ root ทั้งที่เสิร์ฟใต้ subpath → เด้งเข้า BASE_PATH ให้ (กัน bookmark เก่า)
if (BASE_PATH) {
  app.get('/', (req, res) => res.redirect(BASE_PATH + '/'));
  // health check ของ docker ยิงที่ root ได้เสมอ ไม่ต้องรู้ว่า prefix คืออะไร
  app.get('/api/health', (req, res) => res.json({ status: 'ok', port: PORT, basePath: BASE_PATH }));
}

// ─── startup ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    // schema ต้องถูกต้องก่อนรับ request — ล้มตรงนี้ = ไม่ต้องสตาร์ต
    const files = await migrate(db);
    logger.info(`Migration สำเร็จ (${files.join(', ')})`);
  } catch (err) {
    logger.error('Migration ล้มเหลว — ไม่สตาร์ต server', { error: err.message });
    process.exit(1);
  }

  // seed คลังมหาวิทยาลัย/คณะ/หลักสูตร + โลโก้ ให้ระบบที่ยังไม่มีข้อมูล
  // ลงมือเฉพาะตอนตาราง universities ว่างเปล่า และไม่ลบอะไรทิ้งเลย (ดู database/seed-catalog.js)
  // ห้าม fatal ด้วยเหตุผลเดียวกับ bootstrap — เป็นข้อมูลตั้งต้น ไม่ใช่เงื่อนไขให้แอปขึ้น
  await seedCatalog(db)
    .then((r) => {
      if (r.skipped) logger.info(`ข้าม seed คลังมหาวิทยาลัย: ${r.skipped}`);
      else logger.info(`Seed คลังมหาวิทยาลัยสำเร็จ (มหาวิทยาลัย ${r.universities} / โลโก้ ${r.logos} / คณะ ${r.faculties} / หลักสูตร ${r.programs})`);
    })
    .catch((err) => logger.warn('Seed คลังมหาวิทยาลัยข้ามไป', { error: err.message }));

  // bootstrap ห้าม fatal: เป็นข้อมูลอำนวยความสะดวก ไม่ใช่เงื่อนไขให้ระบบทำงาน
  // ถ้า SchoolOS ล่มตอนสตาร์ท แอปต้องขึ้นได้ตามปกติแล้วค่อยไปดึงตอนมีคนใช้
  await bootstrap().catch((err) => logger.warn('Bootstrap ข้ามไป', { error: err.message }));

  app.listen(PORT, () => {
    logger.info(`GradTrack ทำงานที่ http://localhost:${PORT}${BASE_PATH || ''}`);
    if (!hasClient) {
      logger.warn(`ไม่พบ ${INDEX_HTML} — เสิร์ฟเฉพาะ API (ตอน dev ให้ใช้ vite dev server)`);
    }
  });
})();
