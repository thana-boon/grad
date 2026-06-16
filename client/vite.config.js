import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // โหลดค่าจากไฟล์ .env / .env.production เข้ามาใช้ใน config ด้วย
  // (process.env ไม่มีค่าจากไฟล์ .env — ต้องใช้ loadEnv)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // Support deployment under subpaths like /gradtrack/
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:5000',
        '/uploads': 'http://localhost:5000',
      },
    },
  }
})
