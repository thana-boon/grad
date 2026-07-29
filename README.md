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

**ไม่มีการ seed บัญชี admin** — สิทธิ์มาจาก role ของ SchoolOS โดยตรง

| ใครล็อกอิน | role ใน GradTrack | ทำอะไรได้ |
|---|---|---|
| ครูที่ SchoolOS ตั้งเป็น `teacher-admin` | `admin` | ทุกอย่าง |
| ครูทั่วไป (`teacher`) | `teacher` | **ดูอย่างเดียว** — เปิดดูได้ทุกหน้า แต่บันทึก/แก้/ลบไม่ได้ |
| นักเรียน | `student` | บันทึกผลสอบติดของตัวเอง |

บัญชี local ในตาราง `users` ยังใช้ได้ — มีไว้เป็น**ทางเข้าสำรองตอน SchoolOS ล่ม**เท่านั้น
(สร้างด้วย `docker compose --profile seed run --rm seed`)

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
│   │   └── schoolos.js        # SchoolOS Public API client + map เป็น snake_case
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
