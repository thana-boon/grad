const API_URL = import.meta.env.VITE_API_URL || '/api';

function getApiOrigin() {
  if (import.meta.env.VITE_API_ORIGIN) {
    return import.meta.env.VITE_API_ORIGIN.replace(/\/$/, '');
  }

  if (API_URL.startsWith('http://') || API_URL.startsWith('https://')) {
    // Convert http://host:port/api or http://host:port/api/... into http://host:port
    return API_URL.replace(/\/api(?:\/.*)?$/, '').replace(/\/$/, '');
  }

  return '';
}

const API_ORIGIN = getApiOrigin();

export function resolveMediaUrl(src) {
  if (!src || typeof src !== 'string') return src;
  // กัน data: URL ก้อนใหญ่ (เช่น base64 ที่เผลอ paste ลง DB) ที่ทำให้ browser แครชตอน decode
  if (src.startsWith('data:')) return '';
  // กันค่ายาวผิดปกติ (ไม่ใช่ path/URL รูปปกติ)
  if (src.length > 2048) return '';
  if (src.startsWith('blob:')) return src;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;

  if (src.startsWith('/uploads/')) {
    return API_ORIGIN ? `${API_ORIGIN}${src}` : src;
  }

  return src;
}
