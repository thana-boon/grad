import axios from 'axios';
import { withBase } from './withBase';

// prod: client กับ server เป็นโปรเซสเดียวกันและอยู่ใต้ base เดียวกัน (same-origin เสมอ)
// → baseURL คือ "<base>api" เช่น /grad/api ซึ่ง withBase() ประกอบให้ตาม BASE_PATH ตอน build
// dev: BASE_URL เป็น "/" อยู่แล้ว → ได้ "/api" ซึ่ง vite dev server proxy ไปหา express ให้
const api = axios.create({
  baseURL: withBase('/api'),
});

// แนบ JWT token อัตโนมัติทุก request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
