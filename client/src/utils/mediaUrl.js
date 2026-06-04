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
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;

  if (src.startsWith('/uploads/')) {
    return API_ORIGIN ? `${API_ORIGIN}${src}` : src;
  }

  return src;
}
