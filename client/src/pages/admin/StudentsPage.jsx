import { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';

export default function StudentsPage() {
  const [years, setYears] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [citizenIds, setCitizenIds] = useState({}); // student_code -> citizen_id (on-demand)
  const [loadingCode, setLoadingCode] = useState(null);

  // ดึง citizen_id รายคนแบบ on-demand (เลี่ยง rate limit ของ Student API)
  const revealCitizenId = async (code) => {
    if (citizenIds[code] !== undefined || loadingCode) return;
    setLoadingCode(code);
    try {
      const res = await api.get(`/students/${code}/citizen-id`);
      setCitizenIds((prev) => ({ ...prev, [code]: res.data.citizen_id || '' }));
    } catch {
      setCitizenIds((prev) => ({ ...prev, [code]: '' }));
    } finally {
      setLoadingCode(null);
    }
  };

  // โหลดปีการศึกษา + ปีที่ active ของ GradTrack
  useEffect(() => {
    const init = async () => {
      try {
        const [yearsRes, activeRes] = await Promise.all([
          api.get('/academic-years'),
          api.get('/academic-years/active'),
        ]);
        setYears(yearsRes.data);
        const defaultId = activeRes.data.active_year_id ?? yearsRes.data[0]?.id ?? null;
        setSelectedYearId(defaultId);
      } catch {
        // ถ้า load ไม่ได้ ปล่อยให้ผู้ใช้เลือกเอง
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, []);

  // โหลดนักเรียนเมื่อ selectedYearId เปลี่ยน
  useEffect(() => {
    if (!selectedYearId) { setStudents([]); return; }
    const fetch = async () => {
      setLoading(true);
      setStudents([]);
      setCitizenIds({}); // ล้าง citizen_id ที่เคยเผยไว้เมื่อเปลี่ยนปี
      try {
        const res = await api.get(`/students?year_id=${selectedYearId}`);
        setStudents(res.data);
      } catch {
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [selectedYearId]);

  // ห้องเรียนที่มี (สำหรับ filter dropdown)
  const rooms = useMemo(() => {
    const set = new Set(students.map((s) => s.class_room).filter(Boolean));
    return [...set].sort();
  }, [students]);

  // กรองตาม search + room
  const filtered = useMemo(() => {
    return students.filter((s) => {
      const full = `${s.student_code} ${s.first_name} ${s.last_name} ${s.class_room} ${citizenIds[s.student_code] ?? ''}`.toLowerCase();
      const matchSearch = !search || full.includes(search.toLowerCase());
      const matchRoom = !filterRoom || s.class_room === filterRoom;
      return matchSearch && matchRoom;
    });
  }, [students, search, filterRoom, citizenIds]);

  const selectedYear = years.find((y) => y.id === selectedYearId);

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold">🎓 รายชื่อนักเรียน ม.6</h2>
          <p className="text-xs text-base-content/50">
            ดึงข้อมูลจาก Student API · เฉพาะชั้น ม.6 · เลขประชาชนคลิกดูรายคน
          </p>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-base-content/60 whitespace-nowrap">📅 ปีการศึกษา</label>
          <select
            className="select select-bordered select-sm"
            value={selectedYearId ?? ''}
            onChange={(e) => setSelectedYearId(Number(e.target.value))}
            disabled={initializing}
          >
            {!selectedYearId && <option value="">-- เลือกปี --</option>}
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.title || y.year_be}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active year info */}
      {selectedYear && (
        <div className="flex items-center gap-2 mb-4">
          <span className="badge badge-primary badge-sm">
            {selectedYear.title || selectedYear.year_be}
          </span>
          {!loading && (
            <span className="text-xs text-base-content/50">
              พบ {students.length} คน (กรองแสดง {filtered.length} คน)
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="🔍 ค้นหา รหัส, ชื่อ, ห้อง..."
          className="input input-bordered input-sm w-full max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select select-bordered select-sm"
          value={filterRoom}
          onChange={(e) => setFilterRoom(e.target.value)}
        >
          <option value="">🏫 ทุกห้อง</option>
          {rooms.map((r) => (
            <option key={r} value={r}>ห้อง {r}</option>
          ))}
        </select>
        {(search || filterRoom) && (
          <button
            className="btn btn-ghost btn-sm text-base-content/50"
            onClick={() => { setSearch(''); setFilterRoom(''); }}
          >
            ✕ ล้าง
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card bg-base-100 shadow-sm overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr className="text-xs text-base-content/60 uppercase tracking-wide">
              <th>#</th>
              <th>🪪 รหัสนักเรียน</th>
              <th>📝 ชื่อ</th>
              <th>นามสกุล</th>
              <th>🏷️ ชั้น</th>
              <th>🏫 ห้อง</th>
              <th>เลขที่</th>
              <th>เลขประชาชน</th>
            </tr>
          </thead>
          <tbody>
            {initializing || loading ? (
              <tr>
                  <td className="text-center py-12 text-base-content/40" colSpan={8}>
                  <span className="loading loading-spinner loading-sm mr-2" />
                  กำลังโหลด...
                </td>
              </tr>
            ) : !selectedYearId ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-base-content/30">
                  กรุณาเลือกปีการศึกษา
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-base-content/30">
                  {students.length === 0 ? 'ไม่พบนักเรียน ม.6 ในปีการศึกษานี้' : 'ไม่พบข้อมูลที่ค้นหา'}
                </td>
              </tr>
            ) : (
              filtered.map((s, i) => (
                <tr key={`${s.student_code}-${i}`}>
                  <td className="text-base-content/40 text-xs">{i + 1}</td>
                  <td className="font-mono text-xs">{s.student_code}</td>
                  <td>{s.first_name}</td>
                  <td>{s.last_name}</td>
                  <td>
                    <span className="badge badge-outline badge-sm">{s.class_level}</span>
                  </td>
                  <td>{s.class_room}</td>
                  <td className="text-center">{s.number_in_room}</td>
                  <td className="font-mono text-xs tracking-widest">
                    {citizenIds[s.student_code] !== undefined ? (
                      citizenIds[s.student_code] || <span className="text-base-content/30">—</span>
                    ) : (
                      <button
                        className="btn btn-ghost btn-xs font-normal"
                        onClick={() => revealCitizenId(s.student_code)}
                        disabled={loadingCode === s.student_code}
                      >
                        {loadingCode === s.student_code
                          ? <span className="loading loading-spinner loading-xs" />
                          : '👁 ดู'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
