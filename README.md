# 🎓 GradTrack

ระบบติดตามผลการศึกษาต่อของนักเรียน ม.6 โรงเรียนสุคนธีรวิทย์ — บันทึกผลสอบติดมหาวิทยาลัย
ออกรายงาน/การ์ดแสดงความยินดี และดูสถิติการเข้าศึกษาต่อรายปี

ข้อมูลนักเรียนและครูอ่านสดจาก **SchoolOS Public API** — GradTrack ไม่เก็บสำเนารายชื่อไว้เอง

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + Tailwind/daisyUI |
| Backend | Node.js + Express 5 |
| Database | **PostgreSQL** (เกาะ `postgres-core` บน network `school-net`) |
| ข้อมูลนักเรียน/ครู | SchoolOS Public API (`/api/public/v1`) |
| Auth | JWT ที่ GradTrack ออกเอง (ตรวจรหัสผ่านผ่าน SchoolOS `/auth/verify`) |
| Deploy | Docker + Portainer, พอร์ต **3003** ใต้ path `/grad` |

---

## 🔐 สิทธิ์การใช้งาน

**ไม่มีการสร้างบัญชีในระบบนี้** — ครูทุกคนมาจาก SchoolOS และใช้รหัสผ่านของ SchoolOS เสมอ
ผู้ดูแลเป็นคนเลือกว่า *ครูคนไหนเข้าได้* และ *เข้ามาแล้วมีสิทธิ์แค่ไหน* ที่หน้า **จัดการผู้ใช้งาน**

| ใครล็อกอิน | role ใน GradTrack | ทำอะไรได้ |
|---|---|---|
| ครูที่ถูกเพิ่มไว้ + ตั้งเป็น `admin` | `admin` | ทุกอย่าง |
| ครูที่ถูกเพิ่มไว้ + ตั้งเป็น `teacher` | `teacher` | **ดูอย่างเดียว** — เปิดดูได้ทุกหน้า แต่บันทึก/แก้/ลบไม่ได้ |
| ครูที่**ไม่ได้**ถูกเพิ่มไว้ | — | ล็อกอินไม่ได้ (403) |
| นักเรียน | `student` | บันทึกผลสอบติดของตัวเอง (ไม่เกี่ยวกับรายชื่อนี้) |

รายชื่ออยู่ในตาราง `staff_access` — เพิ่ม/ถอด/เปลี่ยนสิทธิ์ผ่านหน้าเว็บเท่านั้น
ถอดสิทธิ์แล้ว **บัญชี SchoolOS ของครูไม่กระทบ** แค่เข้า GradTrack ไม่ได้ และเพิ่มกลับได้ทุกเมื่อ

> ⚠️ **ตาราง `staff_access` ว่าง = ยังไม่เปิดใช้งานรายชื่อ** ระบบจะกลับไปทำงานแบบเดิม
> (ครูทุกคนเข้าได้ · `teacher-admin` ของ SchoolOS ได้เป็น admin) และหน้าเว็บจะขึ้นแบนเนอร์เตือน
> จงใจให้เป็นแบบนี้ เพราะถ้าปิดตายตั้งแต่ตารางยังว่าง จะไม่มีใครล็อกอินเข้ามาเพิ่มรายชื่อได้เลย
> **พอเพิ่มคนแรกเข้าไป การกันจะเริ่มทำงานทันที — ต้องเพิ่มตัวเองเป็น `admin` ด้วย**
>
> กันพลาดไว้อีกชั้น: ถอด/ลดสิทธิ์ตัวเองไม่ได้ และต้องเหลือ `admin` ในรายชื่ออย่างน้อย 1 คนเสมอ

บัญชี local ในตาราง `users` ไม่ผ่านรายชื่อนี้ — เป็น**ทางเข้าสำรองตอน SchoolOS ล่ม**
สร้างได้จากเครื่อง server เท่านั้น (`docker compose --profile seed run --rm seed`)
หน้าเว็บดูและลบได้ แต่**สร้างไม่ได้** และลบตัวสุดท้ายที่เป็น admin ไม่ได้

### รหัสผ่านนักเรียน
ทางหลักคือ **รหัสผ่าน SchoolOS ของนักเรียนเอง**
ทางเดิม `Skdw` + เลขบัตรประชาชน ยังเปิดอยู่ (`STUDENT_LEGACY_LOGIN=1`) เพื่อไม่ให้เด็กเข้าไม่ได้ในวันแรก
เมื่อย้ายกันครบแล้วให้ตั้ง `STUDENT_LEGACY_LOGIN=0` — รหัสผ่านที่เดาได้จากเลขบัตรประชาชนไม่ปลอดภัย

---

## 🚀 รันในเครื่อง (Docker)

ต้องมี `postgres-core` รันอยู่บน network `school-net` แล้ว (database + role ชื่อ `graduate`)

```bash
cp .env.example .env      # แล้วเติมค่าจริง
docker compose up -d --build
```

เปิด <http://localhost:3003/grad/>

ตั้ง `BASE_PATH=` (ค่าว่าง) ใน `.env` แล้ว build ใหม่ ถ้าอยากให้เสิร์ฟที่ root แทน

> ⚠️ บน PowerShell การสั่ง `$env:BASE_PATH = ""` เท่ากับ **ลบตัวแปรทิ้ง** ไม่ใช่ตั้งเป็นค่าว่าง
> ถ้าจะตั้งค่าว่างจริง ๆ ต้องตั้งในไฟล์ `.env`
>
> ⚠️ อย่ารัน build ผ่าน Git Bash บน Windows — MSYS แปลง `/grad` เป็น path แบบ Windows
> (`C:/Program Files/Git/grad`) ให้อัตโนมัติ ใช้ PowerShell

### รันแบบ dev (ไม่ใช้ docker)

```bash
cd server && npm install && npm run dev     # :3003
cd client && npm install && npm run dev     # :5173 (proxy /api → 3003)
```

---

## ⚙️ Environment

ดู [`.env.example`](.env.example) — มีคำอธิบายทุกตัว

ตัวที่ `docker-compose.yml` **บังคับ** (ไม่ตั้ง = stack ไม่ขึ้น พร้อมบอกเหตุผล):

- `GRADUATE_DB_PASSWORD`
- `JWT_SECRET`
- `SCHOOLOS_API_KEY`

`server/scripts/check-env.js` ตรวจให้อีกชั้นตอนคอนเทนเนอร์สตาร์ท (รันเองได้ด้วย `npm run env:check`)

> ⚠️ **`FIELD_ENCRYPTION_KEY`** — GradTrack **ไม่ได้**เข้ารหัสข้อมูลระดับฟิลด์ จึงไม่ต้องตั้ง
> แต่ถ้ามีการตั้งไว้ (copy `.env` มาจากระบบอื่น หรือเพิ่มฟีเจอร์เข้ารหัสทีหลัง)
> **ห้ามเปลี่ยนค่าเด็ดขาดเมื่อมีข้อมูลเข้ารหัสอยู่แล้ว** — ถอดกลับไม่ได้อีกเลย backup ก็กู้ไม่ได้
>
> ⚠️ **`JWT_SECRET`** — เปลี่ยนแล้วทุกคนหลุดจากระบบพร้อมกัน (ข้อมูลไม่หาย แต่ต้องล็อกอินใหม่ทั้งโรงเรียน)

### ⏱️ หมดเวลาใช้งาน (session timeout)

ผู้ใช้หลุดจากระบบเมื่อเข้าเงื่อนไขใดเงื่อนไขหนึ่ง — ใช้กับทั้งครูและนักเรียนเหมือนกัน

| ชั้น | ค่าเริ่มต้น | ตั้งที่ |
| --- | --- | --- |
| ไม่ได้ใช้งาน (idle) | 30 นาที | `IDLE_TIMEOUT_MS` ใน [`client/src/utils/session.js`](client/src/utils/session.js) — แก้แล้วต้อง build ใหม่ |
| อายุ token สูงสุด | 8 ชั่วโมง | `JWT_EXPIRES_IN` (env) — ครบเมื่อไรก็หลุด ต่อให้ยังใช้งานอยู่ |

- นาฬิกา idle นับข้าม reload และข้ามแท็บ (เก็บใน `localStorage`) — ขยับแท็บไหนก็ต่ออายุให้ทุกแท็บ
- ตัวจับเวลาฝั่งหน้าเว็บเป็นแค่ **การล็อกหน้าจอที่เปิดค้างไว้** ไม่ใช่มาตรการความปลอดภัย
  ตัวที่บังคับจริงคืออายุ token ที่ `verifyToken` ตรวจทุก request (ตอบ 401 `code: TOKEN_EXPIRED`)
- หลุดแล้วหน้า login จะขึ้นข้อความบอกเหตุผล ไม่ใช่เด้งออกเฉย ๆ โดยไม่รู้ว่าเกิดอะไรขึ้น

รหัสผ่าน / คีย์ทั้งหมดอยู่ใน `.env` หรือ stack env ของ Portainer **เท่านั้น**
ห้ามเขียนลงในโค้ดหรือ `docker-compose.yml` ที่ commit ขึ้น git

---

## 🗄️ ฐานข้อมูล

Migration อยู่ที่ [`server/database/postgres/`](server/database/postgres/) รันอัตโนมัติทุกครั้งที่สตาร์ท

**กฎเหล็ก: additive เท่านั้น** — ห้ามมี `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM`
เพราะ deploy ผ่าน Portainer เป็น push แบบไม่ถามใครก่อน ถ้ามี statement ที่ทำข้อมูลหายมันจะหายเงียบ ๆ
`server/database/migrate.js` ตรวจไฟล์ให้ก่อนรัน — เจอคำต้องห้ามจะหยุดทันที

ไฟล์ migration ต้อง idempotent (`IF NOT EXISTS` ทุกที่) เพราะรันซ้ำทุกรอบที่สตาร์ท
เพิ่มคอลัมน์ใหม่ให้แก้ไฟล์เดิมได้เลย ไม่ต้องตั้งชื่อไฟล์ใหม่

รันเดี่ยว ๆ: `cd server && npm run db:migrate`

---

## 🏫 คลังมหาวิทยาลัย (seed)

รายชื่อมหาวิทยาลัย / โลโก้ / คณะ / สาขา / หลักสูตร ติดไปกับ image เป็นข้อมูลตั้งต้น
ระบบที่ deploy ใหม่จึงมีคลังครบตั้งแต่เปิดครั้งแรก ไม่ต้องไป import Excel หรือกดซิงค์วิกิพีเดียเอง

| ไฟล์ | คือ |
|---|---|
| [`server/database/seeds/catalog.json.gz`](server/database/seeds/) | มหาวิทยาลัย + คณะ + หลักสูตร (ซ้อนเป็นชั้น ไม่เก็บ id) |
| `server/database/seeds/logos/` | ไฟล์โลโก้ — ต้องอยู่ที่นี่ เพราะ `server/uploads/` ติด `.gitignore` + `.dockerignore` |
| [`server/database/seed-catalog.js`](server/database/seed-catalog.js) | ตัว seed — `index.js` เรียกตอนสตาร์ทต่อจาก migration |

**ลงมือเฉพาะตอนตาราง `universities` ว่างเปล่า** — ถ้าแอดมินตั้งใจลบมหาวิทยาลัยทิ้ง
restart รอบหน้าจะไม่เอากลับมาให้ และไม่มี `DELETE` อยู่ในตัว seed เลย ของที่แก้ไว้ไม่หาย

```bash
npm run seed:catalog              # ลงให้เฉพาะตอนตารางว่าง (เหมือนตอนสตาร์ท)
npm run seed:catalog -- --force   # เติมทับของที่มีอยู่ (ไม่ลบอะไรทิ้ง กันแถวซ้ำให้)
```

ปิด seed อัตโนมัติ: ตั้ง `CATALOG_SEED=off` ใน stack env

### อัปเดตไฟล์ seed

แก้คลังในหน้าแอดมินให้เรียบร้อยก่อน แล้วดึงออกมาทับไฟล์เดิม (ต้องรันที่ที่เห็นทั้ง DB และ `uploads/`):

```bash
docker exec -u root -w /app/server gradtrack-app node scripts/export-catalog-seed.js
docker cp gradtrack-app:/app/server/database/seeds ./server/database/
git add server/database/seeds && git commit -m "อัปเดตคลังมหาวิทยาลัย"
```

ดูข้างในไฟล์ `.gz`: `gunzip -c catalog.json.gz | head -c 2000`

---

## 💾 สำรอง & กู้คืนข้อมูล

หน้า **สำรอง/กู้คืนข้อมูล** (เมนูล่างสุด — **admin เท่านั้น**) ทำได้ครบในหน้าเดียว:
สำรองลง server · ดาวน์โหลดเก็บไว้เอง · อัปโหลดไฟล์เก่ากลับขึ้นมา · กู้คืน · ลบ

ไฟล์สำรอง 1 ไฟล์ = `.tar.gz` มาตรฐาน (แตกดูด้วย `tar` / 7-Zip ได้ ไม่ใช่ฟอร์แมตลับ)

```
manifest.json        สร้างเมื่อไร โดยใคร มีอะไรอยู่ข้างในบ้าง (entry แรกเสมอ)
data/<table>.json    ทุกแถวของแต่ละตาราง
uploads/…            รูปนักเรียน / โลโก้ / พื้นหลังการ์ด (เลือกได้ว่าจะรวมไหม)
```

| อยู่ในไฟล์ | **ไม่**อยู่ในไฟล์ |
|---|---|
| ทุกตารางของ GradTrack (12 ตาราง) | ชื่อ/ชั้น/ห้องของนักเรียนและครู — อ่านสดจาก SchoolOS เสมอ |
| ไฟล์ใน `server/uploads/` | ค่าใน `.env` (รหัส DB / `JWT_SECRET` / API key) |
| | โครงสร้างตาราง — schema มาจาก migration ตอนสตาร์ทเสมอ |

เก็บแต่ "ข้อมูล" ไม่เก็บ schema โดยตั้งใจ → กู้ไฟล์เก่าเข้าระบบเวอร์ชันใหม่ได้
(ตอนใส่กลับจะใช้เฉพาะคอลัมน์ที่มีอยู่จริง คอลัมน์ที่เพิ่มมาทีหลังได้ค่า default)
ซึ่งใช้ได้เพราะ migration เป็น additive อยู่แล้ว

### กู้คืน 2 แบบ

| โหมด | ทำอะไร | ใช้ตอนไหน |
|---|---|---|
| **เติมเฉพาะที่ยังไม่มี** (ค่าเริ่มต้น) | แถวที่ชนคีย์ถูกข้าม ของเดิมไม่ถูกแตะเลย | เผลอลบข้อมูลบางส่วน อยากได้กลับมาเฉย ๆ |
| **แทนที่ทั้งหมด** | ล้างตารางที่อยู่ในไฟล์ แล้วใส่ของในไฟล์แทน | ย้อนทั้งระบบกลับไปเป็นวันที่สำรองไว้ |

- ทั้งสองแบบอยู่ใน transaction เดียว — พังกลางคันข้อมูลกลับไปเหมือนเดิมทั้งหมด
- **ระบบสำรองของปัจจุบันให้อัตโนมัติก่อนกู้คืนทุกครั้ง** (`gradtrack-prerestore-…`)
  กู้ผิดไฟล์ก็ยังย้อนกลับได้ ไฟล์กลุ่มนี้ไม่ถูกลบตามโควตา
- ไฟล์ใน `uploads/` เขียนทับชื่อที่ซ้ำ แต่**ไม่ลบ**ไฟล์ที่ไม่มีในไฟล์สำรอง
  (รูปที่เพิ่งอัปหลังวันสำรองจะไม่หายเพราะกดกู้คืน)
- ตาราง `SERIAL` ถูก `setval` ใหม่หลังใส่ข้อมูล ไม่งั้นแถวถัดไปที่บันทึกจะชนคีย์ทันที

### ที่เก็บและโควตา

ไฟล์อยู่ใน named volume `gradtrack-backups` (`/app/server/backups`) — **ไม่หายตอน redeploy**
แต่ก็อยู่เครื่องเดียวกับระบบ ของสำคัญจริงควรกดดาวน์โหลดออกมาเก็บที่อื่นด้วย

| ตัวแปร | ค่าเริ่มต้น | คือ |
|---|---|---|
| `BACKUP_KEEP` | `20` | เก็บไฟล์ที่ระบบสร้างเองไว้กี่ไฟล์ (0 = ไม่ลบเลย) — ที่เกินถูกลบตอนสำรองครั้งถัดไป |
| `BACKUP_MAX_UPLOAD_MB` | `1024` | ขนาดไฟล์สูงสุดที่อัปโหลดกลับเข้ามาได้ |
| `BACKUP_DIR` | `server/backups` | ปกติไม่ต้องตั้ง |

โควตานับเฉพาะไฟล์จากปุ่ม "สร้างไฟล์สำรอง" — ไฟล์ที่แอดมิน**อัปโหลดเข้ามาเอง**
และไฟล์ **ก่อนกู้คืน** ถือว่าตั้งใจเก็บ ไม่ถูกลบอัตโนมัติ

หยิบไฟล์ออก/ใส่กลับจากเครื่อง server ตรง ๆ ก็ได้ (ไม่ต้องผ่านหน้าเว็บ):

```bash
docker cp gradtrack-app:/app/server/backups ./backups          # เอาออกมาทั้งโฟลเดอร์
docker cp ./backup.tar.gz gradtrack-app:/app/server/backups/   # ใส่กลับเข้าไป
```

ทุกการสร้าง/ดาวน์โหลด/อัปโหลด/กู้คืน/ลบ ถูกบันทึกใน **Activity Log** เสมอ

---

## 🧭 กฎเรื่อง path / base path

แอปเสิร์ฟใต้ subpath (`schoolos.sukhon.ac.th/grad/`) โดย nginx **คง prefix ไว้** ไม่ตัดออก

- โค้ดใหม่ที่ประกอบ URL ของหน้าเว็บหรือไฟล์ใน `public/` **ต้องผ่าน `withBase()`**
  ([`client/src/utils/withBase.js`](client/src/utils/withBase.js))
- **ห้ามอ่าน `import.meta.env.BASE_URL` ดิบ ๆ** กระจายตามไฟล์ — ใช้ `withBase()` ที่เดียว
  (ยกเว้น `basename` ของ `<BrowserRouter>` ซึ่งเป็นตัวนิยาม base เอง)
- URL ของ API **ไม่ต้อง**ใช้ `withBase()` — ใช้ `api` (axios) ที่ตั้ง baseURL ไว้แล้ว
- asset ใหม่ใน `client/public/` ถูกเสิร์ฟใต้ base ให้อัตโนมัติโดย express
  (SPA fallback ใน `server/index.js` ทำหน้าที่แทน `.htaccess` เดิม)
- `BASE_PATH` ถูก bake ตอน `vite build` — **แก้แล้วต้อง build ใหม่** เปลี่ยนตอน runtime ไม่ได้
  และค่าฝั่ง server ต้องตรงกับตอน build เป๊ะ ๆ ไม่งั้น asset 404
- **หน้า login ต้องอยู่ที่ `/login` เสมอ** ห้ามย้าย

---

## 📁 โครงสร้าง

```
grad/
├── client/                    # React + Vite
│   └── src/utils/withBase.js  # ตัวเดียวที่ประกอบ path ฝั่ง client
├── server/
│   ├── config/
│   │   ├── env.js             # โหลด .env ที่เดียว (ทุก entry point ต้อง require)
│   │   ├── db.js              # pg pool + shim ให้ query หน้าตาเหมือน mysql2 เดิม
│   │   ├── jwt.js             # เซ็น token ที่เดียว (อายุจาก JWT_EXPIRES_IN)
│   │   └── schoolos.js        # SchoolOS Public API client + map เป็น snake_case
│   ├── routes/staff.js        # รายชื่อครูที่เข้าได้ + resolveAccess() ที่ login เรียกใช้
│   ├── routes/backups.js      # สำรอง/ดาวน์โหลด/อัปโหลด/กู้คืน (admin เท่านั้น)
│   ├── services/backup.js     # ตัวสร้าง/กู้คืนไฟล์สำรอง (ข้อมูลทุกตาราง + uploads)
│   ├── services/tar.js        # เขียน/อ่าน .tar.gz เอง — ไม่มี dependency เพิ่ม
│   ├── backups/               # ไฟล์สำรอง (named volume — ไม่หายตอน redeploy)
│   ├── database/postgres/     # migration (additive เท่านั้น)
│   ├── database/seeds/        # คลังมหาวิทยาลัย + โลโก้ ที่ติดไปกับ image
│   ├── database/seed-catalog.js  # seed คลังตอนสตาร์ท (เฉพาะตอน DB ว่าง)
│   ├── bootstrap.js           # งานตอนสตาร์ท — ห้าม fatal
│   ├── scripts/check-env.js   # ตรวจ env ก่อนสตาร์ท
│   └── seed.js                # admin local (profile "seed" เท่านั้น)
├── Dockerfile
├── docker-compose.yml
└── docker-entrypoint.sh
```

---

## 👤 Author

**thana-boon** — ครูและผู้พัฒนา โรงเรียนสุคนธีรวิทย์
