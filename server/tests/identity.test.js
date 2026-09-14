// ─── claim ตัวตนต้องรอดจากการต่ออายุ session ─────────────────────────────────
//
// เทสชุดนี้มีไว้กันบั๊กเดียว: ssoSub หลุดหายตอน /auth/refresh ออก token ใบใหม่
// ถ้ามันหาย ตัวตรวจสลับคนฝั่ง client จะหยุดทำงานเงียบ ๆ และอาการที่ได้คือ
// "ล็อกอินคนใหม่แล้วยังเห็นข้อมูลคนเก่า แต่เฉพาะหลังผ่านไปพักหนึ่ง" ซึ่งอ่านเหมือน
// ของหลอนและไล่หาสาเหตุยากมาก — จึงต้องมีเครื่องจักรยืนยัน ไม่ใช่ตรวจด้วยตา
//
// รัน: cd server && npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-for-identity-claims';

const { identityOf, IDENTITY_FIELDS, VIA } = require('../config/identity');
const { signToken } = require('../config/jwt');

const decode = (token) => jwt.verify(token, process.env.JWT_SECRET);

// จำลอง POST /api/auth/refresh: verifyToken ถอด token ใบเก่ามาเป็น req.user
// (ซึ่งมี iat/exp ติดมาด้วย) แล้วส่งเข้า signToken ทั้งก้อน
const renew = (token) => signToken(decode(token));

const ssoStaffClaims = {
  id: 42,
  username: 'T00116',
  name: 'ชรินทร์ รีนับถือ',
  role: 'admin',
  source: 'schoolos',
  via: VIA.SSO,
  ssoSub: 'T00116',
};

const ssoStudentClaims = {
  student_code: '02809',
  username: '02809',
  role: 'student',
  via: VIA.SSO,
  ssoSub: '02809',
};

test('identityOf เก็บ ssoSub/via ไว้ และทิ้ง iat/exp ของใบเก่า', () => {
  const identity = identityOf({ ...ssoStaffClaims, iat: 1, exp: 2 });

  assert.equal(identity.ssoSub, 'T00116');
  assert.equal(identity.via, VIA.SSO);
  assert.equal(identity.iat, undefined);
  assert.equal(identity.exp, undefined);
});

test('ssoSub ของครูรอดจากการต่ออายุซ้ำ ๆ', () => {
  let token = signToken(ssoStaffClaims);
  assert.equal(decode(token).ssoSub, 'T00116');

  // ต่ออายุหลายรอบ — ครูที่นั่งทำงานทั้งวันเจอมากกว่าหนึ่งรอบแน่นอน
  for (let i = 0; i < 3; i++) token = renew(token);

  const claims = decode(token);
  assert.equal(claims.ssoSub, 'T00116', 'ssoSub หายตอนต่ออายุ — ตัวตรวจสลับคนจะตายเงียบ ๆ');
  assert.equal(claims.via, VIA.SSO, 'via หายตอนต่ออายุ — session จะถูกมองเป็นบัญชีที่ไม่ได้มาจาก SSO');
  assert.equal(claims.role, 'admin');
  assert.equal(claims.username, 'T00116');
});

test('ssoSub ของนักเรียนรอดจากการต่ออายุ', () => {
  const claims = decode(renew(signToken(ssoStudentClaims)));

  assert.equal(claims.ssoSub, '02809');
  assert.equal(claims.via, VIA.SSO);
  assert.equal(claims.student_code, '02809');
});

test('บัญชีที่ไม่ได้มาจาก SSO ไม่มี ssoSub ติดไปด้วย', () => {
  // บัญชี local คือทางเข้าสำรองตอน SchoolOS ล่ม — ห้ามมีอะไรผูกให้ถูกเตะออก
  const local = decode(renew(signToken({
    id: 1, username: 'admin', name: 'ผู้ดูแล', role: 'admin', source: 'local', via: VIA.LOCAL,
  })));

  assert.equal(local.ssoSub, undefined);
  assert.equal(local.via, VIA.LOCAL);
});

test('signToken ไม่ปล่อย claim นอกรายการหลุดลง token', () => {
  const claims = decode(signToken({ ...ssoStaffClaims, secretNote: 'ห้ามหลุด' }));
  assert.equal(claims.secretNote, undefined);
});

// ─── กันคนแก้ทีหลังเผลอออก token เอง ──────────────────────────────────────────
// ทั้งเรพต้องมีจุดที่เรียก jwt.sign() อยู่ที่เดียวคือ config/jwt.js ซึ่งบังคับให้ payload
// ผ่าน identityOf() เสมอ ใครไปเรียกตรง ๆ ที่อื่น = claim ตัวตนหลุดได้อีกครั้ง
test('มีที่ออก token อยู่ที่เดียวคือ config/jwt.js', () => {
  const root = path.join(__dirname, '..');
  // ข้าม tests/ เพราะไฟล์นี้เองพูดถึงชื่อฟังก์ชันอยู่ในคำอธิบาย
  const skip = new Set(['node_modules', 'uploads', 'backups', 'logs', '.git', 'tests']);
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && full !== path.join(root, 'config', 'jwt.js')) {
        if (/\bjwt\.sign\s*\(/.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(path.relative(root, full));
        }
      }
    }
  };
  walk(root);

  assert.deepEqual(offenders, [], 'ออก token ต้องผ่าน signToken() ใน config/jwt.js เท่านั้น');
});

test('รายการ claim ตัวตนครบตามที่ทุกทางเข้าต้องใช้', () => {
  for (const field of ['via', 'ssoSub', 'role', 'username', 'student_code']) {
    assert.ok(IDENTITY_FIELDS.includes(field), `ขาด ${field} ใน IDENTITY_FIELDS`);
  }
});

// ─── นาฬิกาของแอปที่ติดตั้งบนมือถือ (กับดัก 4.19) ────────────────────────────
//
// พี่น้องกับ ssoSub ข้างบน แต่แพงกว่า: client กับ capAt คือตัวที่กำหนดอายุของ token
// ใบถัดไป หล่นตัวใดตัวหนึ่งตอนต่ออายุ session ของมือถือจะถูกมินต์ใหม่เป็น 8 ชั่วโมง
// แบบเครื่องส่วนกลาง — ตัวที่มีไว้ยืดอายุให้เขา กลายเป็นตัวที่เตะเขาออกเอง และเพิ่งจะ
// เริ่มทำอย่างนั้นหลังทำงานถูกต้องมาพักหนึ่งแล้ว

test('แอปที่ติดตั้งยังเป็นแอปที่ติดตั้งหลังต่ออายุ', () => {
  const capAt = Date.now() + 14 * 24 * 3600 * 1000;
  const first = signToken({
    id: 7, name: 'ครูทดสอบ', role: 'teacher', source: 'schoolos',
    via: VIA.SSO, ssoSub: 'T00116', client: 'pwa', capAt,
  });

  const claims = decode(first);
  assert.strictEqual(claims.client, 'pwa');
  assert.strictEqual(claims.capAt, capAt);

  const renewed = decode(renew(first));
  assert.strictEqual(renewed.client, 'pwa', 'session ของ pwa ที่ต่ออายุแล้วต้องไม่กลายเป็น web');
  assert.strictEqual(renewed.capAt, capAt, 'เพดานของแพลตฟอร์มต้องไม่หายไปตอนต่ออายุ');
  assert.strictEqual(renewed.ssoSub, 'T00116');
  assert.ok(
    renewed.exp - renewed.iat > 24 * 3600,
    'อายุใบใหม่ต้องยังเป็นวัน ไม่ใช่ 8 ชั่วโมงของเครื่องส่วนกลาง',
  );
});

test('อายุ token ถูกตัดด้วยเพดานของแพลตฟอร์ม ทั้งตอนออกใบแรกและตอนต่ออายุ', () => {
  const capAt = Date.now() + 2 * 3600 * 1000; // เหลืออีก 2 ชั่วโมง
  const token = signToken({
    id: 7, name: 'ครูทดสอบ', role: 'teacher', source: 'schoolos',
    via: VIA.SSO, ssoSub: 'T00116', client: 'pwa', capAt,
  });
  const claims = decode(token);
  assert.ok(claims.exp - claims.iat <= 2 * 3600 + 5, 'ใบแรกต้องไม่ยาวเกินเพดาน');

  // เดิมเพดานถูกส่งเป็น expiresIn ตอนล็อกอินใบเดียว แล้วหายไปตั้งแต่การต่ออายุครั้งแรก
  // ใบที่สองจึงกลับไปเป็น 8 ชั่วโมงเต็มเสมอ ไม่ว่า session ต้นทางจะเหลือเท่าไร
  const renewed = decode(renew(token));
  assert.ok(renewed.exp - renewed.iat <= 2 * 3600 + 5, 'ใบที่ต่ออายุก็ต้องไม่ยาวเกินเพดานเดิม');
});

test('ไม่มีเพดาน กับ ไม่ได้ตอบ ไม่ใช่เรื่องเดียวกัน', () => {
  // null = แพลตฟอร์มบอกว่า "ไม่มีเพดาน" — ต้องรอดไปถึง token และรอดข้ามการต่ออายุ
  const uncapped = signToken({
    id: 7, name: 'ครูทดสอบ', role: 'teacher', source: 'schoolos',
    via: VIA.SSO, ssoSub: 'T00116', client: 'pwa', capAt: null,
  });
  assert.strictEqual(decode(uncapped).capAt, null, 'null ต้องไม่ถูกตัวกรอง claim ทิ้ง');
  assert.strictEqual(decode(renew(uncapped)).capAt, null, 'null ต้องรอดข้ามการต่ออายุ');

  // undefined = ไม่ได้ตอบ — ต้องไม่กลายเป็น null (ซึ่งจะอ่านว่า "ไม่มีเพดาน")
  const silent = signToken({
    id: 7, name: 'ครูทดสอบ', role: 'teacher', source: 'schoolos', via: VIA.SSO, ssoSub: 'T00116',
  });
  assert.ok(!('capAt' in decode(silent)), 'ไม่มีค่า ต้องยังคงไม่มีค่า');
});

test('claim ที่หายไปถูกอ่านเป็นเครื่องส่วนกลาง ไม่ใช่เป็นแอปที่ติดตั้ง', () => {
  const token = signToken({ id: 7, name: 'ครู', role: 'teacher', source: 'schoolos' });
  const claims = decode(token);
  assert.ok(!('client' in claims), 'ไม่มี client claim');
  assert.ok(claims.exp - claims.iat <= 8 * 3600 + 5, 'ต้องได้หน้าต่างสั้น ไม่ใช่ยาว');
});
