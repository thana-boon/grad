import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import Icon from '../ui/Icon';
import { SectionTitle, EmptyState, CardSkeleton } from '../ui';

const SHORTCUTS = [
  { label: 'รายชื่อนักเรียน', desc: 'ข้อมูล ม.6 ทั้งหมดจาก Student API', icon: 'graduation', path: '/admin/students' },
  { label: 'สถานะผลสอบ', desc: 'บันทึก/ยืนยันสิทธิ์รายคน', icon: 'clipboard', path: '/admin/admission-status' },
  { label: 'รายงาน/Export', desc: 'ออกภาพรายงานและไฟล์ Excel', icon: 'chart', path: '/admin/report' },
  { label: 'รายงานตาราง', desc: 'ตารางสรุปสำหรับพิมพ์', icon: 'table', path: '/admin/report-table' },
  { label: 'มหาวิทยาลัย', desc: 'จัดการรายชื่อและโลโก้', icon: 'university', path: '/admin/universities' },
  { label: 'จัดการ Account', desc: 'บัญชีผู้ใช้และสิทธิ์', icon: 'users', path: '/admin/accounts' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState('');
  const [yearName, setYearName] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/academic-years').then(r => r.data || []),
      api.get('/academic-years/active').then(r => r.data || null).catch(() => null),
    ]).then(([ys, active]) => {
      setYears(ys);
      // ใช้ปีที่ GradTrack ตั้ง active ก่อน ถ้าไม่มีค่อย fallback ปีล่าสุด
      let pick = null;
      if (active?.active_year_id) {
        pick = ys.find(y => String(y.id) === String(active.active_year_id));
      }
      if (!pick && ys.length > 0) pick = ys[0];
      if (pick) {
        setYearId(String(pick.id));
        setYearName(String(pick.year_be || pick.title || pick.name || ''));
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    api.get('/student/admin/admission-overview', { params: { year_id: yearId } })
      .then(r => setStudents(r.data || []))
      .finally(() => setLoading(false));
  }, [yearId]);

  const total = students.length;
  const withAdmission = students.filter(s => s.admissions?.length > 0).length;
  const confirmed = students.filter(s => s.admissions?.some(a => a.confirmed)).length;
  const notRecorded = total - withAdmission;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // มหาวิทยาลัยยอดนิยมจากทุกใบสมัครที่บันทึกไว้
  const allAdmissions = students.flatMap(s => s.admissions || []);
  const uniMap = allAdmissions.reduce((acc, a) => {
    const key = a.university_name || 'ไม่ระบุ';
    if (!acc[key]) acc[key] = { name: key, logo_url: a.logo_url || null, count: 0 };
    acc[key].count++;
    return acc;
  }, {});
  const topUnis = Object.values(uniMap).sort((a, b) => b.count - a.count).slice(0, 6);
  const maxCount = topUnis[0]?.count || 1;

  const METRICS = [
    { icon: 'graduation', label: 'นักเรียนทั้งหมด', value: total, helper: `ปีการศึกษา ${yearName || '—'}` },
    { icon: 'clipboard', label: 'บันทึกผลแล้ว', value: withAdmission, helper: `${pct(withAdmission)}% ของทั้งหมด` },
    { icon: 'checkCircle', label: 'ยืนยันสิทธิ์แล้ว', value: confirmed, helper: `${pct(confirmed)}% ของทั้งหมด` },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* ── แถบสถานะหัวหน้า ────────────────────────────────── */}
      <section className="gt-band anim-fade-up p-6 lg:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-white/60">ภาพรวมระบบ</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              การศึกษาต่อ ปีการศึกษา {yearName || '—'}
            </h2>
            <p className="mt-1.5 text-sm text-white/70">
              {loading
                ? 'กำลังรวบรวมข้อมูล...'
                : total === 0
                  ? 'ยังไม่มีข้อมูลนักเรียนในปีการศึกษานี้'
                  : `บันทึกผลแล้ว ${withAdmission} จาก ${total} คน · ยืนยันสิทธิ์ ${confirmed} คน`}
            </p>
            <span className="gt-band-rule mt-4 block" />
          </div>

          {/* ตัวเลขสำคัญ 3 ตัว */}
          <div className="grid shrink-0 grid-cols-3 divide-x divide-white/15">
            {METRICS.map((m, i) => (
              <div key={m.label} className={`px-4 ${i === 0 ? 'pl-0' : ''} lg:px-6`}>
                <Icon name={m.icon} size={16} className="text-white/50" />
                <p className="mt-1.5 text-[11px] text-white/60">{m.label}</p>
                <p className="text-xl font-semibold tabular-nums text-white">
                  {loading ? '—' : m.value}
                </p>
                <p className="text-[11px] text-white/45">{loading ? '' : m.helper}</p>
              </div>
            ))}
          </div>
        </div>

        {/* เลือกปีการศึกษา */}
        {years.length > 0 && (
          <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4">
            <Icon name="calendar" size={15} className="text-white/50" />
            <label htmlFor="year" className="text-xs text-white/60">
              ปีการศึกษา
            </label>
            <select
              id="year"
              className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-sm text-white outline-none transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C518]"
              value={yearId}
              onChange={e => {
                const y = years.find(y => String(y.id) === e.target.value);
                setYearId(e.target.value);
                setYearName(y ? String(y.year_be || y.title || y.name || '') : '');
              }}
            >
              {years.map(y => (
                <option key={y.id} value={y.id} className="text-base-content">
                  {y.year_be || y.title || y.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* ── ความคืบหน้า ────────────────────────────────────── */}
      <section className="card anim-fade-up bg-base-100 p-5" style={{ '--anim-delay': '0.06s' }}>
        <SectionTitle icon="chart">ความคืบหน้าการบันทึกผล</SectionTitle>

        {loading ? (
          <CardSkeleton className="h-2.5 w-full rounded-full" />
        ) : total === 0 ? (
          <p className="text-sm text-base-content/50">
            เลือกปีการศึกษาที่มีข้อมูลนักเรียน เพื่อดูความคืบหน้า
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm text-base-content/60">
                บันทึกแล้ว{' '}
                <span className="font-semibold tabular-nums text-base-content">{withAdmission}</span>
                {' / '}
                <span className="tabular-nums">{total}</span> คน
              </span>
              <span className="text-lg font-semibold tabular-nums text-primary">
                {pct(withAdmission)}%
              </span>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="anim-bar-grow h-full rounded-full bg-primary"
                style={{ width: `${pct(withAdmission)}%` }}
                role="progressbar"
                aria-valuenow={pct(withAdmission)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="ความคืบหน้าการบันทึกผล"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-success" />
                <span className="text-base-content/60">ยืนยันสิทธิ์</span>
                <span className="font-semibold tabular-nums">{confirmed} คน</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" />
                <span className="text-base-content/60">บันทึกแล้ว</span>
                <span className="font-semibold tabular-nums">{withAdmission} คน</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-base-300" />
                <span className="text-base-content/60">ยังไม่บันทึก</span>
                <span className="font-semibold tabular-nums">{notRecorded} คน</span>
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── มหาวิทยาลัยยอดนิยม ─────────────────────────────── */}
      <section className="card anim-fade-up bg-base-100 p-5" style={{ '--anim-delay': '0.1s' }}>
        <SectionTitle
          icon="university"
          action={
            topUnis.length > 0 && (
              <button
                onClick={() => navigate('/admin/university-students')}
                className="btn btn-ghost btn-xs gap-1 text-primary"
              >
                ดูรายชื่อ
                <Icon name="arrowUpRight" size={13} />
              </button>
            )
          }
        >
          มหาวิทยาลัยยอดนิยม
        </SectionTitle>

        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <CardSkeleton className="size-8 rounded-lg" />
                <CardSkeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        ) : topUnis.length === 0 ? (
          <EmptyState
            icon="university"
            title="ยังไม่มีการบันทึกมหาวิทยาลัย"
            hint="เมื่อบันทึกผลสอบของนักเรียนแล้ว อันดับมหาวิทยาลัยจะขึ้นที่นี่"
            action={
              <button onClick={() => navigate('/admin/admission-status')} className="btn btn-primary btn-sm">
                <Icon name="plus" size={15} />
                เริ่มบันทึกผลสอบ
              </button>
            }
          />
        ) : (
          <ul className="stagger-children flex flex-col gap-3.5">
            {topUnis.map((u, i) => (
              <li key={u.name} className="flex items-center gap-3" style={{ '--i': i }}>
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-base-content/35">
                  {i + 1}
                </span>
                {u.logo_url ? (
                  <img
                    src={resolveMediaUrl(u.logo_url)}
                    alt=""
                    width="32"
                    height="32"
                    loading="lazy"
                    className="size-8 shrink-0 rounded-lg bg-base-200 object-contain p-0.5"
                  />
                ) : (
                  <span className="gt-chip size-8">
                    <Icon name="university" size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="anim-bar-grow h-full rounded-full bg-primary"
                      style={{ width: `${(u.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                  {u.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── ทางลัดไปหน้าอื่น ───────────────────────────────── */}
      <section className="anim-fade-up" style={{ '--anim-delay': '0.14s' }}>
        <h2 className="mb-3 text-sm font-semibold text-base-content/70">ไปยังหน้าที่ใช้บ่อย</h2>
        <div className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SHORTCUTS.map((s, i) => (
            <button
              key={s.path}
              onClick={() => navigate(s.path)}
              style={{ '--i': i }}
              className="card card-interactive group flex flex-row items-center gap-4 bg-base-100 p-4 text-left active:scale-[0.985]"
            >
              <span className="gt-chip size-12 transition-colors group-hover:bg-primary group-hover:text-primary-content">
                <Icon name={s.icon} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold tracking-tight">{s.label}</span>
                <span className="mt-0.5 block truncate text-xs text-base-content/50">{s.desc}</span>
              </span>
              <Icon
                name="arrowUpRight"
                size={16}
                className="text-base-content/25 transition-colors group-hover:text-primary"
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
