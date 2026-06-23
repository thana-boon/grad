import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import SearchableSelect from '../../components/SearchableSelect';

// หน้าตรวจสอบ: เลือกมหาวิทยาลัย → ดูว่ามีนักเรียนคนไหนลงคณะ/สาขาไหนบ้าง
export default function UniversityStudentsPage() {
  const [universities, setUniversities] = useState([]);
  const [uniId, setUniId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [faculty, setFaculty] = useState('all'); // 'all' หรือชื่อคณะ
  const [search, setSearch] = useState('');

  const selectedUni = universities.find(u => String(u.id) === String(uniId)) || null;

  // โหลดรายชื่อมหาวิทยาลัยครั้งเดียว
  useEffect(() => {
    api.get('/universities')
      .then(r => setUniversities(r.data || []))
      .catch(() => setUniversities([]));
  }, []);

  // โหลดนักเรียนเมื่อเลือกมหาวิทยาลัย
  useEffect(() => {
    if (!uniId) { setRows([]); return; }
    setLoading(true);
    setError('');
    setFaculty('all');
    api.get('/student/admin/students-by-university', { params: { university_id: uniId } })
      .then(r => setRows(r.data || []))
      .catch(err => { setRows([]); setError(err.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ'); })
      .finally(() => setLoading(false));
  }, [uniId]);

  const uniOptions = useMemo(
    () => universities.map(u => ({
      value: String(u.id),
      label: u.short_name ? `${u.name} (${u.short_name})` : u.name,
    })),
    [universities]
  );

  // นับจำนวนต่อคณะ (เรียงจากมากไปน้อย)
  const facultyCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const key = r.faculty_name || '— ไม่ระบุคณะ —';
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // filter ตามคณะ + ค้นหา
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (faculty !== 'all' && (r.faculty_name || '— ไม่ระบุคณะ —') !== faculty) return false;
      if (!q) return true;
      const name = `${r.student?.first_name || ''} ${r.student?.last_name || ''}`.toLowerCase();
      return name.includes(q) || String(r.student_code).includes(q);
    });
  }, [rows, faculty, search]);

  const confirmedCount = rows.filter(r => r.confirmed).length;
  const uniqueStudents = new Set(rows.map(r => r.student_code)).size;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">🔎 นักเรียนตามมหาวิทยาลัย</h2>
        <p className="text-xs text-base-content/50">เลือกมหาวิทยาลัยเพื่อดูว่ามีนักเรียนคนไหนบันทึกสอบติดคณะ/สาขาใดบ้าง</p>
      </div>

      {/* เลือกมหาวิทยาลัย */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex flex-col gap-1 w-full max-w-md">
          <label className="text-xs font-medium text-base-content/70">🏛️ มหาวิทยาลัย</label>
          <SearchableSelect
            options={uniOptions}
            value={uniId}
            onChange={setUniId}
            placeholder="— เลือกมหาวิทยาลัย —"
          />
        </div>
        {uniId && !loading && (
          <input
            className="input input-bordered input-sm w-full sm:w-64"
            placeholder="🔍 ค้นหาชื่อ / รหัสนักเรียน"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}
      </div>

      {error && <div className="alert alert-error py-2 text-sm">⚠️ {error}</div>}

      {!uniId ? (
        <div className="text-center py-16 text-base-content/30">
          เลือกมหาวิทยาลัยด้านบนเพื่อเริ่มตรวจสอบ
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-base-content/30">
          ยังไม่มีนักเรียนบันทึกสอบติด <span className="font-medium">{selectedUni?.name}</span>
        </div>
      ) : (
        <>
          {/* สรุป */}
          <div className="flex flex-wrap items-center gap-3">
            {selectedUni?.logo_url && (
              <img src={resolveMediaUrl(selectedUni.logo_url)} alt="" className="w-12 h-12 object-contain rounded-lg border border-base-200 bg-base-100 p-1" />
            )}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: '👥', value: uniqueStudents, label: 'นักเรียน', color: 'text-base-content' },
                { icon: '📋', value: rows.length, label: 'รายการ', color: 'text-primary' },
                { icon: '✅', value: confirmedCount, label: 'ยืนยันแล้ว', color: 'text-success' },
                { icon: '🏫', value: facultyCounts.length, label: 'คณะ', color: 'text-base-content' },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-xl border border-base-200 bg-base-100 px-4 py-2.5 shadow-sm">
                  <span className="text-xl">{s.icon}</span>
                  <div className="leading-tight">
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[11px] text-base-content/50">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* filter คณะ */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFaculty('all')}
              className={`btn btn-xs ${faculty === 'all' ? 'btn-neutral' : 'btn-ghost'}`}
            >
              ทั้งหมด <span className="ml-1 font-bold">{rows.length}</span>
            </button>
            {facultyCounts.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setFaculty(name)}
                className={`btn btn-xs ${faculty === name ? 'btn-primary' : 'btn-ghost'}`}
              >
                {name} <span className="ml-1 font-bold">{count}</span>
              </button>
            ))}
          </div>

          {/* ตาราง */}
          <div className="card bg-base-100 shadow-sm overflow-x-auto">
            <table className="table table-zebra table-sm">
              <thead>
                <tr className="text-xs text-base-content/60 uppercase tracking-wide">
                  <th>#</th>
                  <th>รหัส</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>ชั้น/ห้อง</th>
                  <th>คณะ</th>
                  <th>สาขา/หลักสูตร</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-base-content/30">ไม่พบผลการค้นหา</td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td className="text-base-content/40 text-xs">{i + 1}</td>
                    <td className="font-mono text-xs">{r.student_code}</td>
                    <td className="whitespace-nowrap">
                      {r.student
                        ? <span className="font-medium text-sm">{r.student.title_prefix}{r.student.first_name} {r.student.last_name}</span>
                        : <span className="text-base-content/30 text-xs italic">ไม่พบข้อมูลนักเรียน</span>}
                    </td>
                    <td className="text-xs text-base-content/60 whitespace-nowrap">
                      {r.student ? `${r.student.class_level || ''}${r.student.class_room ? `/${r.student.class_room}` : ''}` : '—'}
                    </td>
                    <td className="text-xs">
                      {r.faculty_name || <span className="text-base-content/30">—</span>}
                      {r.campus && <div className="text-info text-[11px]">วิทยาเขต {r.campus}</div>}
                    </td>
                    <td className="text-xs max-w-md">
                      <div className="truncate">{r.program_name_th}</div>
                      {r.field_name_th && <div className="text-base-content/40 truncate">{r.field_name_th}</div>}
                      {r.program_type && <span className="badge badge-ghost badge-xs mt-0.5">{r.program_type}</span>}
                    </td>
                    <td>
                      {r.confirmed
                        ? <span className="badge badge-success badge-sm gap-1 whitespace-nowrap">✅ ยืนยันแล้ว</span>
                        : <span className="badge badge-warning badge-sm gap-1 whitespace-nowrap">⏳ รอยืนยัน</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
