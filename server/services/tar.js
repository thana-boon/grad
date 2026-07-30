// =============================================================================
// tar.js — เขียน/อ่านไฟล์ .tar.gz เท่าที่ระบบสำรองข้อมูลต้องใช้ (ไม่มี dependency)
// =============================================================================
// ทำไมเขียนเอง: ไฟล์สำรองต้องเป็นฟอร์แมตมาตรฐานที่แตกดูได้ด้วย tar/7-Zip ทั่วไป
// (ไม่ใช่ไฟล์ลับเฉพาะของแอป) แต่การเพิ่ม dependency ใหม่ต้องแก้ package-lock แล้ว
// build image ใหม่ทั้งก้อน — ส่วนที่เราใช้จริงของ tar คือ header 512 ไบต์แบบ ustar
// อย่างเดียว ซึ่งสั้นกว่าการอธิบายว่าทำไมต้องลง lib
//
// รองรับเฉพาะ "ไฟล์ธรรมดา" (typeflag 0) — ไม่มี symlink / hardlink / device
// เพราะเนื้อในไฟล์สำรองมีแค่ JSON กับรูปภาพ
//
// เขียนทีละไฟล์แบบ buffer ต่อไฟล์ (ไม่ใช่ทั้งก้อน) — รูปนักเรียนใหญ่สุดไม่กี่ MB
// จึงไม่ต้องแลกความซับซ้อนของการ stream เนื้อไฟล์กับหน่วยความจำที่ประหยัดได้นิดเดียว
const fs = require('fs');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

const BLOCK = 512;

// ตัวเลขใน header เป็น octal ที่ปิดท้ายด้วย NUL (len นับรวม NUL แล้ว)
const octal = (value, len) =>
  Math.floor(value).toString(8).padStart(len - 1, '0').slice(-(len - 1)) + '\0';

// ustar เก็บชื่อไฟล์แยกเป็น prefix (155) + name (100) — ยาวกว่านั้นต้องหาจุดตัดที่ '/'
function splitName(name) {
  if (Buffer.byteLength(name) <= 100) return { base: name, prefix: '' };
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== '/') continue;
    const prefix = name.slice(0, i);
    const base = name.slice(i + 1);
    if (Buffer.byteLength(base) <= 100 && Buffer.byteLength(prefix) <= 155) {
      return { base, prefix };
    }
  }
  throw new Error(`ชื่อไฟล์ยาวเกินกว่าที่ฟอร์แมต tar รองรับ: ${name}`);
}

function makeHeader(name, size, mtime) {
  const h = Buffer.alloc(BLOCK);
  const { base, prefix } = splitName(name);

  h.write(base, 0, 100, 'utf8');
  h.write(octal(0o644, 8), 100, 8, 'ascii');       // mode
  h.write(octal(0, 8), 108, 8, 'ascii');           // uid
  h.write(octal(0, 8), 116, 8, 'ascii');           // gid
  h.write(octal(size, 12), 124, 12, 'ascii');
  h.write(octal(Math.floor(mtime.getTime() / 1000), 12), 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');            // checksum: เว้นว่างไว้ก่อนคำนวณ
  h.write('0', 156, 1, 'ascii');                   // typeflag = ไฟล์ธรรมดา
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  if (prefix) h.write(prefix, 345, 155, 'utf8');

  let sum = 0;
  for (const b of h) sum += b;
  // 6 หลัก octal + NUL + space (ตามสเปก)
  h.write(octal(sum, 7), 148, 7, 'ascii');
  h.write(' ', 155, 1, 'ascii');
  return h;
}

const cstr = (buf, off, len) => {
  const slice = buf.subarray(off, off + len);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
};

// ─── ตัวเขียน ────────────────────────────────────────────────────────────────
class TarWriter {
  constructor(dest) {
    this.dest = dest;
  }

  // เขียนโดยเคารพ backpressure — ไม่งั้น gzip กลืนทั้ง backup ไว้ในหน่วยความจำ
  async _write(chunk) {
    if (this.dest.write(chunk)) return;
    await new Promise((resolve, reject) => {
      const onDrain = () => { this.dest.off('error', onError); resolve(); };
      const onError = (err) => { this.dest.off('drain', onDrain); reject(err); };
      this.dest.once('drain', onDrain);
      this.dest.once('error', onError);
    });
  }

  async add(name, data, mtime = new Date()) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    await this._write(makeHeader(name, buf.length, mtime));
    if (buf.length === 0) return;
    await this._write(buf);
    const pad = (BLOCK - (buf.length % BLOCK)) % BLOCK;
    if (pad) await this._write(Buffer.alloc(pad));
  }
}

/**
 * เปิดไฟล์ .tar.gz ไว้เขียน
 *   const { tar, close } = createTarGz('/path/backup.tar.gz');
 *   await tar.add('manifest.json', buf);
 *   await close();
 */
function createTarGz(destPath) {
  const gzip = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(destPath);
  const done = pipeline(gzip, out);
  // กัน unhandled rejection ระหว่างที่ยังไม่มีใคร await done (เช่นดิสก์เต็มกลางคัน)
  done.catch(() => {});

  return {
    tar: new TarWriter(gzip),
    async close() {
      await new Promise((resolve) => gzip.end(resolve));
      await done;
    },
    async abort(err) {
      gzip.destroy(err);
      await done.catch(() => {});
    },
  };
}

/**
 * อ่านไฟล์ .tar.gz ทีละ entry — คืน { name, size, data }
 * ถือไว้ในหน่วยความจำครั้งละไฟล์เดียว และหยุดกลางทางได้ (break ออกจาก for await)
 */
async function* readTarGz(srcPath) {
  const src = fs.createReadStream(srcPath);
  const gunzip = zlib.createGunzip();
  src.on('error', (err) => gunzip.destroy(err));
  src.pipe(gunzip);

  const it = gunzip[Symbol.asyncIterator]();
  let buf = Buffer.alloc(0);
  let ended = false;

  const read = async (n) => {
    while (buf.length < n) {
      if (ended) return null;
      const next = await it.next();
      if (next.done) { ended = true; return null; }
      buf = buf.length ? Buffer.concat([buf, next.value]) : next.value;
    }
    const out = buf.subarray(0, n);
    buf = buf.subarray(n);
    return out;
  };

  try {
    for (;;) {
      const head = await read(BLOCK);
      if (!head) break;
      if (head.every((b) => b === 0)) break; // สองบล็อกศูนย์ = จบไฟล์

      const declared = parseInt(cstr(head, 148, 8).trim() || '-1', 8);
      let sum = 0;
      for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : head[i];
      if (sum !== declared) throw new Error('ไฟล์สำรองเสียหาย (checksum ของ tar ไม่ตรง)');

      const base = cstr(head, 0, 100);
      const prefix = cstr(head, 345, 155);
      const size = parseInt(cstr(head, 124, 12).trim() || '0', 8);
      const type = String.fromCharCode(head[156]) || '0';

      const padded = Math.ceil(size / BLOCK) * BLOCK;
      const body = padded ? await read(padded) : Buffer.alloc(0);
      if (size && !body) throw new Error('ไฟล์สำรองไม่ครบ (ขาดข้อมูลท้ายไฟล์)');

      // ข้ามอย่างอื่นที่ไม่ใช่ไฟล์ธรรมดา (โฟลเดอร์ / pax header ที่ tar ตัวอื่นใส่มา)
      if (type !== '0' && type !== '\0') continue;

      yield {
        name: prefix ? `${prefix}/${base}` : base,
        size,
        data: body.subarray(0, size),
      };
    }
  } finally {
    gunzip.destroy();
    src.destroy();
  }
}

module.exports = { createTarGz, readTarGz };
