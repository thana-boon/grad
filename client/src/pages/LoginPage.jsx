import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (countdown > 0) return;
    setLoading(true);
    setError('');

    const rawUsername = form.username.trim();

    try {
      // ลองเป็น admin ก่อน
      const res = await axios.post(`${BASE}/auth/login`, {
        username: rawUsername,
        password: form.password,
      });
      login(res.data.user, res.data.token);
      navigate('/dashboard');
      return;
    } catch (adminErr) {
      if (adminErr.response?.status === 429) {
        const secs = adminErr.response.data?.retryAfterSeconds || 900;
        setCountdown(secs);
        setLoading(false);
        return;
      }
      // admin ไม่ผ่าน → ลอง student (pad 5 หลัก)
    }

    try {
      const res = await axios.post(`${BASE}/student/login`, {
        username: rawUsername.padStart(5, '0'),
        password: form.password,
      });
      login(res.data.user, res.data.token);
      navigate('/student');
    } catch (studentErr) {
      if (studentErr.response?.status === 429) {
        const secs = studentErr.response.data?.retryAfterSeconds || 900;
        setCountdown(secs);
      }
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div className="card bg-base-100 shadow-xl w-full max-w-md">
        <div className="card-body gap-4">

          {/* Logo / Title */}
          <div className="text-center mb-2">
            <div className="avatar placeholder mb-3">
              <div className="bg-primary text-primary-content rounded-2xl w-16 text-2xl font-bold">
                <span>G</span>
              </div>
            </div>
            <h1 className="text-xl font-semibold">GradTrack ✨</h1>
            <p className="text-base-content/50 text-xs mt-1">ระบบติดตามผลการเรียน 📚</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text text-xs">👤 ชื่อผู้ใช้ / รหัสนักเรียน</span>
              </div>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="กรอกชื่อผู้ใช้หรือรหัสนักเรียน"
                required
                className="input input-bordered input-sm w-full"
              />
            </label>

            <label className="form-control w-full">
              <div className="label">
                <span className="label-text text-xs">🔒 รหัสผ่าน</span>
              </div>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="กรอกรหัสผ่าน"
                required
                className="input input-bordered input-sm w-full"
              />
            </label>

            {/* Error message */}
            {error && (
              <div role="alert" className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            {/* Countdown เมื่อโดน rate limit */}
            {countdown > 0 && (
              <div role="alert" className="alert alert-warning">
                <span>
                  ล็อคชั่วคราว รอ{' '}
                  <span className="font-bold">
                    {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                  </span>{' '}
                  นาที
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || countdown > 0}
              className="btn btn-primary btn-sm w-full mt-2"
            >
              {loading && <span className="loading loading-spinner loading-xs"></span>}
              {countdown > 0 ? `⏳ รอ ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')} นาที` : loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ →'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
