import { useEffect, useState } from 'react';
import api from '../../utils/api';

export default function AcademicYearsPage() {
  const [years, setYears] = useState([]);
  const [activeYearId, setActiveYearId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // year_id ที่กำลัง set
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // โหลดปีการศึกษาทั้งหมด + ปีที่ active ใน GradTrack
  const load = async () => {
    setLoading(true);
    try {
      const [yearsRes, activeRes] = await Promise.all([
        api.get('/academic-years'),
        api.get('/academic-years/active'),
      ]);
      setYears(yearsRes.data);
      setActiveYearId(activeRes.data.active_year_id);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ตั้งปีการศึกษาที่ GradTrack ใช้งาน
  const handleSetActive = async (yearId) => {
    setSaving(yearId);
    try {
      await api.put('/academic-years/active', { year_id: yearId });
      setActiveYearId(yearId);
      showToast('ตั้งปีการศึกษาสำเร็จ ✅');
    } catch {
      showToast('ไม่สามารถตั้งปีการศึกษาได้', 'error');
    } finally {
      setSaving(null);
    }
  };

  const activeYear = years.find((y) => y.id === activeYearId);

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className="toast toast-top toast-end z-50">
          <div className={`alert alert-${toast.type === 'error' ? 'error' : 'success'} py-2 text-sm`}>
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold">📅 ปีการศึกษา</h2>
        <p className="text-xs text-base-content/50">เลือกปีการศึกษาที่ GradTrack ใช้งาน</p>
      </div>

      {/* Active Year Banner */}
      {activeYear && (
        <div className="alert bg-primary/10 border border-primary/20 mb-5 py-3">
          <span className="text-lg">✅</span>
          <div>
            <p className="text-xs text-base-content/60">ปีการศึกษาที่ใช้งานอยู่</p>
            <p className="font-semibold text-sm text-primary">
              {activeYear.title || `ปี ${activeYear.year_be}`}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card bg-base-100 shadow-sm overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr className="text-xs text-base-content/60 uppercase tracking-wide">
              <th>#</th>
              <th>📅 ปี พ.ศ.</th>
              <th>📝 ชื่อปีการศึกษา</th>
              <th>สถานะ school_app</th>
              <th>GradTrack</th>
              <th className="text-right">⚙️</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-base-content/40">
                  <span className="loading loading-spinner loading-sm mr-2" />
                  กำลังโหลด...
                </td>
              </tr>
            ) : years.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-base-content/30">
                  ไม่พบข้อมูลปีการศึกษา
                </td>
              </tr>
            ) : (
              years.map((y, i) => {
                const isActive = y.id === activeYearId;
                return (
                  <tr key={y.id} className={isActive ? 'bg-primary/5' : ''}>
                    <td className="text-base-content/40 text-xs">{i + 1}</td>
                    <td className="font-medium">{y.year_be}</td>
                    <td>{y.title || `ปีการศึกษา ${y.year_be}`}</td>
                    <td>
                      {y.is_active ? (
                        <span className="badge badge-success badge-sm">active</span>
                      ) : (
                        <span className="badge badge-ghost badge-sm">—</span>
                      )}
                    </td>
                    <td>
                      {isActive ? (
                        <span className="badge badge-primary badge-sm">✅ ใช้งานอยู่</span>
                      ) : (
                        <span className="text-base-content/30 text-xs">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!isActive && (
                        <button
                          className="btn btn-outline btn-primary btn-xs"
                          onClick={() => handleSetActive(y.id)}
                          disabled={saving === y.id}
                        >
                          {saving === y.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : '🔄'}
                          เลือกใช้
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
