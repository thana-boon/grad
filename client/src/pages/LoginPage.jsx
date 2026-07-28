import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import Icon from '../components/ui/Icon';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
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

    // 401 = รหัสไม่ถูกเฉย ๆ → ค่อยไปลองอีกทางหนึ่งได้
    // 403 (บัญชีถูกปิด) / 503 (API key ของระบบมีปัญหา) = คนละเรื่องกับรหัสผิด
    // ต้องแสดงข้อความจาก server ตรง ๆ ไม่งั้นผู้ใช้เห็นแค่ "รหัสผ่านไม่ถูกต้อง" แล้วงง
    const handleFatal = (err) => {
      const status = err.response?.status;
      if (status === 429) {
        setCountdown(err.response.data?.retryAfterSeconds || 900);
        setLoading(false);
        return true;
      }
      if (status === 403 || status === 503) {
        setError(err.response.data?.message || 'เข้าสู่ระบบไม่สำเร็จ');
        setLoading(false);
        return true;
      }
      return false;
    };

    try {
      // ลองเป็นครู/ผู้ดูแลก่อน
      const res = await api.post('/auth/login', {
        username: rawUsername,
        password: form.password,
      });
      login(res.data.user, res.data.token);
      navigate('/dashboard');
      return;
    } catch (adminErr) {
      if (handleFatal(adminErr)) return;
      // ไม่ผ่านฝั่งครู → ลองเป็นนักเรียน (รหัสนักเรียน pad 5 หลัก)
    }

    try {
      const res = await api.post('/student/login', {
        username: rawUsername.padStart(5, '0'),
        password: form.password,
      });
      login(res.data.user, res.data.token);
      navigate('/student');
    } catch (studentErr) {
      if (handleFatal(studentErr)) return;
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      setLoading(false);
    }
  };

  const mmss = `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* ── ฝั่งแบรนด์ (จอใหญ่) ─────────────────────────────── */}
      <div className="gt-aurora relative hidden flex-col justify-between p-12 lg:flex">
        <span className="gt-aurora-blob gt-aurora-1" />
        <span className="gt-aurora-blob gt-aurora-2" />
        <span className="gt-aurora-blob gt-aurora-3" />

        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#F5C518] text-[#241b04]">
            <Icon name="graduation" size={24} strokeWidth={1.9} />
          </span>
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-white">GradTrack</p>
            <p className="text-xs text-white/60">โรงเรียนสุคนธีรวิทย์</p>
          </div>
        </div>

        <div className="relative anim-fade-up">
          <span className="mb-5 block h-0.5 w-12 rounded-full bg-[#F5C518]" />
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
            ระบบติดตามผล
            <br />
            การศึกษาต่อ
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
            บันทึกและติดตามผลสอบเข้ามหาวิทยาลัยของนักเรียนชั้น ม.6
            ตั้งแต่ยื่นสมัครจนถึงยืนยันสิทธิ์
          </p>
        </div>

        <div className="relative flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45">
          <span className="flex items-center gap-1.5">
            <Icon name="shield" size={14} />
            เข้าสู่ระบบด้วยบัญชี SchoolOS
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="graduation" size={14} />
            นักเรียนใช้รหัสนักเรียนได้เลย
          </span>
        </div>
      </div>

      {/* ── ฟอร์ม ───────────────────────────────────────────── */}
      <div className="flex items-center justify-center bg-base-100 p-6 sm:p-10">
        <div className="w-full max-w-sm anim-fade-up">
          {/* แบรนด์ย่อสำหรับมือถือ */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-content">
              <Icon name="graduation" size={24} strokeWidth={1.9} />
            </span>
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight">GradTrack</p>
              <p className="text-xs text-base-content/55">ระบบติดตามผลการศึกษาต่อ</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h2>
          <p className="mt-1.5 text-sm text-base-content/55">
            ใช้บัญชีครู/ผู้ดูแล หรือรหัสนักเรียนของโรงเรียน
          </p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="username" className="label">
                ชื่อผู้ใช้ / รหัสนักเรียน
              </label>
              <div className="relative">
                <Icon
                  name="user"
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40"
                />
                <input
                  id="username"
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="เช่น teacher01 หรือ 12345"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  className="input h-11 w-full pl-11"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">
                รหัสผ่าน
              </label>
              <div className="relative">
                <Icon
                  name="lock"
                  size={17}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="กรอกรหัสผ่าน"
                  required
                  autoComplete="current-password"
                  className="input h-11 w-full pl-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-base-content/50 transition-colors hover:bg-secondary hover:text-primary"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
                </button>
              </div>
            </div>

            {/* ข้อความผิดพลาด — ประกาศให้ screen reader ด้วย */}
            <div aria-live="polite">
              {error && (
                <div role="alert" className="alert alert-error anim-scale-in py-2.5">
                  <Icon name="alert" size={17} className="mt-px" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {countdown > 0 && (
                <div role="alert" className="alert alert-warning anim-scale-in py-2.5">
                  <Icon name="clock" size={17} className="mt-px" />
                  <span className="text-sm">
                    พยายามเข้าสู่ระบบผิดหลายครั้ง — ลองใหม่ได้ในอีก{' '}
                    <span className="font-semibold tabular-nums">{mmss}</span> นาที
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || countdown > 0}
              className="btn btn-primary mt-1 h-11 w-full"
            >
              {loading && <span className="loading loading-spinner loading-xs" />}
              {countdown > 0
                ? `รอ ${mmss} นาที`
                : loading
                  ? 'กำลังเข้าสู่ระบบ...'
                  : 'เข้าสู่ระบบ'}
              {!loading && countdown === 0 && <Icon name="arrowRight" size={17} />}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-base-content/45">
            ลืมรหัสผ่าน? ติดต่อฝ่ายทะเบียนหรือครูที่ปรึกษาของห้อง
          </p>
        </div>
      </div>
    </div>
  );
}
