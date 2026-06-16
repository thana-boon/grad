import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState('');
  const [yearName, setYearName] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

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
      }
    });
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

  // Top universities (all admissions)
  const allAdmissions = students.flatMap(s => s.admissions || []);
  const uniCount = Object.values(
    allAdmissions.reduce((acc, a) => {
      const key = a.university_name || 'ไม่ระบุ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ).map((v, i, arr) => v); // placeholder, rebuild below

  const uniMap = allAdmissions.reduce((acc, a) => {
    const key = a.university_name || 'ไม่ระบุ';
    if (!acc[key]) acc[key] = { name: key, logo_url: a.logo_url || null, count: 0 };
    acc[key].count++;
    return acc;
  }, {});
  const topUnis = Object.values(uniMap).sort((a, b) => b.count - a.count).slice(0, 6);
  const maxCount = topUnis[0]?.count || 1;

  const SHORTCUTS = [
    { label: 'จัดการ Account', icon: '👥', path: '/admin/accounts' },
    { label: 'รายชื่อนักเรียน', icon: '🎓', path: '/admin/students' },
    { label: 'สถานะผลสอบ', icon: '📋', path: '/admin/admission-status' },
    { label: 'รายงาน/Export', icon: '📊', path: '/admin/report' },
    { label: 'รายงานตาราง', icon: '🗂️', path: '/admin/report-table' },
    { label: 'มหาวิทยาลัย', icon: '🏛️', path: '/admin/universities' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">📊 ภาพรวม</h2>
          <p className="text-sm text-base-content/50 mt-0.5">GradTrack — ระบบติดตามผลการสอบ</p>
        </div>
        <select
          className="select select-bordered select-sm"
          value={yearId}
          onChange={e => {
            const y = years.find(y => String(y.id) === e.target.value);
            setYearId(e.target.value);
            setYearName(y ? String(y.year_be || y.title || y.name || '') : '');
          }}
        >
          {years.map(y => (
            <option key={y.id} value={y.id}>ปีการศึกษา {y.year_be || y.title || y.name}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'นักเรียนทั้งหมด', value: loading ? '…' : total, color: 'primary', icon: '🎓' },
          { label: 'บันทึกมหาลัยแล้ว', value: loading ? '…' : withAdmission, color: 'info', icon: '📝' },
          { label: 'ยืนยันสิทธิ์แล้ว', value: loading ? '…' : confirmed, color: 'success', icon: '✅' },
          { label: 'ยังไม่บันทึก', value: loading ? '…' : notRecorded, color: 'error', icon: '⏳' },
        ].map(s => (
          <div key={s.label} className="card bg-base-100 shadow border border-base-200">
            <div className="card-body p-4">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className={`text-3xl font-bold text-${s.color}`}>{s.value}</div>
              <div className="text-xs text-base-content/50 mt-1">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Universities */}
        <div className="card bg-base-100 shadow border border-base-200">
          <div className="card-body p-4">
            <h3 className="font-bold text-base mb-3">🏛️ มหาวิทยาลัยยอดนิยม ปี {yearName}</h3>
            {loading ? (
              <div className="flex justify-center py-8"><span className="loading loading-spinner" /></div>
            ) : topUnis.length === 0 ? (
              <p className="text-center text-base-content/40 py-8 text-sm">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topUnis.map((u, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-base-content/40 w-4 text-right flex-shrink-0">{i + 1}</span>
                    {u.logo_url
                      ? <img src={resolveMediaUrl(u.logo_url)} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
                      : <span className="w-7 h-7 flex items-center justify-center text-lg flex-shrink-0">🏛️</span>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{u.name}</div>
                      <div className="w-full bg-base-200 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${(u.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-primary flex-shrink-0">{u.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Shortcuts */}
        <div className="card bg-base-100 shadow border border-base-200">
          <div className="card-body p-4">
            <h3 className="font-bold text-base mb-3">⚡ ไปยังหน้าต่างๆ</h3>
            <div className="grid grid-cols-2 gap-2">
              {SHORTCUTS.map(s => (
                <button
                  key={s.path}
                  className="btn btn-outline btn-sm justify-start gap-2 font-normal"
                  onClick={() => navigate(s.path)}
                >
                  <span>{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar summary */}
      {!loading && total > 0 && (
        <div className="card bg-base-100 shadow border border-base-200">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm">ความคืบหน้าการบันทึกผล ปี {yearName}</h3>
              <span className="text-xs text-base-content/50">{withAdmission}/{total} คน ({Math.round((withAdmission/total)*100)}%)</span>
            </div>
            <div className="w-full bg-base-200 rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${(withAdmission / total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-base-content/40 mt-1">
              <span>บันทึกแล้ว {withAdmission} คน</span>
              <span>ยืนยันแล้ว {confirmed} คน ({Math.round((confirmed/total)*100)}%)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

