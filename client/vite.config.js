import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// พอร์ตของ API ตอน dev — ต้องตรงกับ PORT ใน .env ของ server
const DEV_API_PORT = process.env.PORT || '3003'

// subpath ที่จะเสิร์ฟ — ถูก "bake" ตอน build เข้าไปใน asset URL ทุกตัว
// แก้ค่านี้แล้วต้อง build ใหม่เสมอ เปลี่ยนตอน runtime ไม่ได้
//
// รับได้ทั้ง BASE_PATH (ชื่อเดียวกับที่ compose/Dockerfile ส่งมา และที่ server ใช้)
// และ VITE_BASE_PATH — ให้ทั้ง client กับ server อ่านค่าจากตัวแปรตัวเดียวกันได้
// ไม่ต้องตั้งสองที่แล้วลืมให้ตรงกัน (ซึ่งจะได้ asset 404 แบบหาสาเหตุยาก)
//
// ?? ไม่ใช่ || — ค่าว่าง "" คือ "เสิร์ฟที่ root" ที่ตั้งใจตั้ง ไม่ใช่ค่าที่ยังไม่ได้ตั้ง
function normalizeBase(raw) {
  const v = (raw ?? '').trim()
  if (!v || v === '/') return '/'
  return '/' + v.replace(/^\/+|\/+$/g, '') + '/'
}

export default defineConfig(({ mode }) => {
  // process.env ไม่มีค่าจากไฟล์ .env — ต้องใช้ loadEnv
  // อ่านจาก root ของ repo (../) เพราะ .env ไฟล์เดียวใช้ร่วมกับ compose และ server
  const env = { ...loadEnv(mode, process.cwd(), ''), ...loadEnv(mode, `${process.cwd()}/..`, '') }

  const base = normalizeBase(
    process.env.BASE_PATH ?? process.env.VITE_BASE_PATH ?? env.BASE_PATH ?? env.VITE_BASE_PATH
  )

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      // ตอน dev vite เสิร์ฟหน้าเว็บเอง แล้ว proxy /api กับ /uploads ไปหา express
      proxy: {
        '/api': `http://localhost:${DEV_API_PORT}`,
        '/uploads': `http://localhost:${DEV_API_PORT}`,
      },
    },
  }
})
