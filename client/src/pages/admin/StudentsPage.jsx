import { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';
import Icon from '../../components/ui/Icon';
import { PageHeader, TableWrap, TableSkeleton, EmptyState, Tag } from '../../components/ui';

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
      const matchRoom = !filterRoom || String(s.class_room) === filterRoom;
      return matchSearch && matchRoom;
    });
  }, [students, search, filterRoom, citizenIds]);

  const selectedYear = years.find((y) => y.id === selectedYearId);

  return (
    <div className="relative">
      <PageHeader
        icon="graduation"
        title="รายชื่อนักเรียน ม.6"
        subtitle="ดึงข้อมูลจาก SchoolOS · เฉพาะชั้น ม.6 · เลขประชาชนกดดูรายคน"
      >
        <label htmlFor="year-select" className="whitespace-nowrap text-xs text-base-content/55">
          ปีการศึกษา
        </label>
        <select
          id="year-select"
          className="select select-sm"
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
      </PageHeader>

      {/* ตัวกรอง */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
          />
          <input
            type="text"
            placeholder="ค้นหา รหัส, ชื่อ, ห้อง..."
            className="input input-sm w-full pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="ค้นหานักเรียน"
          />
        </div>
        <select
          className="select select-sm"
          value={filterRoom}
          onChange={(e) => setFilterRoom(e.target.value)}
          aria-label="กรองตามห้อง"
        >
          <option value="">ทุกห้อง</option>
          {rooms.map((r) => (
            <option key={r} value={r}>ห้อง {r}</option>
          ))}
        </select>
        {(search || filterRoom) && (
          <button
            className="btn btn-ghost btn-sm gap-1"
            onClick={() => { setSearch(''); setFilterRoom(''); }}
          >
            <Icon name="x" size={14} />
            ล้างตัวกรอง
          </button>
        )}

        {selectedYear && !loading && (
          <span className="ml-auto text-xs text-base-content/55">
            <span className="font-medium tabular-nums text-base-content">{filtered.length}</span>
            {filtered.length !== students.length && (
              <> จาก <span className="tabular-nums">{students.length}</span></>
            )}{' '}
            คน
          </span>
        )}
      </div>

      {/* ตาราง */}
      <TableWrap sticky className="anim-fade-up">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>รหัสนักเรียน</th>
              <th>ชื่อ</th>
              <th>นามสกุล</th>
              <th>ชั้น</th>
              <th>ห้อง</th>
              <th className="text-center">เลขที่</th>
              <th>เลขประชาชน</th>
            </tr>
          </thead>
          <tbody>
            {initializing || loading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : !selectedYearId ? (
              <tr>
                <td colSpan={8} className="p-0">
                  <EmptyState
                    icon="calendar"
                    title="เลือกปีการศึกษาก่อน"
                    hint="เลือกปีการศึกษาที่มุมขวาบน เพื่อดูรายชื่อนักเรียนชั้น ม.6"
                  />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-0">
                  <EmptyState
                    icon={students.length === 0 ? 'graduation' : 'search'}
                    title={
                      students.length === 0
                        ? 'ไม่พบนักเรียน ม.6 ในปีการศึกษานี้'
                        : 'ไม่พบข้อมูลที่ค้นหา'
                    }
                    hint={
                      students.length === 0
                        ? 'ลองเปลี่ยนปีการศึกษา หรือตรวจสอบข้อมูลชั้นเรียนใน SchoolOS'
                        : 'ลองเปลี่ยนคำค้นหา หรือกด ล้างตัวกรอง เพื่อดูทั้งหมด'
                    }
                    action={
                      (search || filterRoom) && (
                        <button
                          className="btn btn-outline btn-sm gap-1"
                          onClick={() => { setSearch(''); setFilterRoom(''); }}
                        >
                          <Icon name="x" size={14} />
                          ล้างตัวกรอง
                        </button>
                      )
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((s, i) => (
                <tr key={`${s.student_code}-${i}`}>
                  <td className="text-xs tabular-nums text-base-content/40">{i + 1}</td>
                  <td className="font-mono text-xs tabular-nums">{s.student_code}</td>
                  <td>{s.title_prefix}{s.first_name}</td>
                  <td>{s.last_name}</td>
                  <td>
                    <Tag tone="muted">{s.class_level}</Tag>
                  </td>
                  <td className="tabular-nums">{s.class_room}</td>
                  <td className="text-center tabular-nums">{s.number_in_room}</td>
                  <td className="font-mono text-xs tabular-nums tracking-wider">
                    {citizenIds[s.student_code] !== undefined ? (
                      citizenIds[s.student_code] || (
                        <span className="text-base-content/30">—</span>
                      )
                    ) : (
                      <button
                        className="btn btn-ghost btn-xs gap-1 font-normal"
                        onClick={() => revealCitizenId(s.student_code)}
                        disabled={loadingCode === s.student_code}
                      >
                        {loadingCode === s.student_code ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <Icon name="eye" size={13} />
                        )}
                        ดู
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}
