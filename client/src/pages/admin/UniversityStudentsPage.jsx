import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import SearchableSelect from '../../components/SearchableSelect';
import Icon from '../../components/ui/Icon';
import { PageHeader, TableWrap, EmptyState, Tag } from '../../components/ui';

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

  const STATS = [
    { icon: 'users', value: uniqueStudents, label: 'นักเรียน' },
    { icon: 'clipboard', value: rows.length, label: 'รายการที่บันทึก' },
    { icon: 'checkCircle', value: confirmedCount, label: 'ยืนยันสิทธิ์แล้ว' },
    { icon: 'faculty', value: facultyCounts.length, label: 'คณะ' },
  ];

  return (
    <div>
      <PageHeader
        icon="search"
        title="นักเรียนตามมหาวิทยาลัย"
        subtitle="เลือกมหาวิทยาลัยเพื่อดูว่ามีนักเรียนคนไหนบันทึกสอบติดคณะ/สาขาใดบ้าง"
      />

      {/* เลือกมหาวิทยาลัย */}
      {/* z-30: การ์ดใบนี้กับการ์ดผลลัพธ์ข้างล่างเป็น position:relative ทั้งคู่ (มาจาก .card ของ daisyUI)
          ถ้าไม่ยกใบนี้ขึ้น ใบที่อยู่หลังใน DOM จะทับ dropdown ที่กางลงมา */}
      <div className="card anim-fade-up relative z-30 mb-5 flex flex-col gap-3 bg-base-100 p-4 sm:flex-row sm:items-end">
        <div className="w-full max-w-md">
          <label className="label">มหาวิทยาลัย</label>
          <SearchableSelect
            options={uniOptions}
            value={uniId}
            onChange={setUniId}
            placeholder="— เลือกมหาวิทยาลัย —"
          />
        </div>
        {uniId && !loading && rows.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <input
              className="input input-sm w-full pl-9"
              placeholder="ค้นหาชื่อ / รหัสนักเรียน"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="ค้นหานักเรียน"
            />
          </div>
        )}
      </div>

      <div aria-live="polite">
        {error && (
          <div role="alert" className="alert alert-error mb-4 py-2.5">
            <Icon name="alert" size={17} className="mt-px" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      {!uniId ? (
        <div className="card bg-base-100">
          <EmptyState
            icon="university"
            title="เลือกมหาวิทยาลัยเพื่อเริ่มตรวจสอบ"
            hint="ระบบจะแสดงรายชื่อนักเรียนที่บันทึกว่าสอบติดมหาวิทยาลัยนั้น แยกตามคณะและหลักสูตร"
          />
        </div>
      ) : loading ? (
        <div className="card bg-base-100 p-5">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="gt-skeleton h-4" style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card bg-base-100">
          <EmptyState
            icon="inbox"
            title="ยังไม่มีนักเรียนบันทึกสอบติดที่นี่"
            hint={`ยังไม่มีใครบันทึก ${selectedUni?.name || 'มหาวิทยาลัยนี้'} — ลองเลือกมหาวิทยาลัยอื่น`}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* สรุป */}
          <div className="card anim-fade-up flex flex-row items-center gap-4 bg-base-100 p-4">
            {selectedUni?.logo_url ? (
              <img
                src={resolveMediaUrl(selectedUni.logo_url)}
                alt=""
                width="48"
                height="48"
                className="size-12 shrink-0 rounded-xl border border-base-300 bg-base-100 object-contain p-1"
              />
            ) : (
              <span className="gt-chip size-12">
                <Icon name="university" size={24} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectedUni?.name}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:flex sm:flex-wrap">
                {STATS.map((s) => (
                  <span key={s.label} className="flex items-baseline gap-1.5 text-xs">
                    <span className="text-base font-semibold tabular-nums text-primary">
                      {s.value}
                    </span>
                    <span className="text-base-content/55">{s.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* filter คณะ */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFaculty('all')}
              className={`btn btn-xs gap-1.5 ${faculty === 'all' ? 'btn-primary' : 'btn-outline'}`}
              aria-pressed={faculty === 'all'}
            >
              ทั้งหมด
              <span className="font-semibold tabular-nums">{rows.length}</span>
            </button>
            {facultyCounts.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setFaculty(name)}
                className={`btn btn-xs gap-1.5 ${faculty === name ? 'btn-primary' : 'btn-outline'}`}
                aria-pressed={faculty === name}
              >
                <span className="max-w-[16rem] truncate">{name}</span>
                <span className="font-semibold tabular-nums">{count}</span>
              </button>
            ))}
          </div>

          {/* ตาราง */}
          <TableWrap sticky>
            <table className="table table-sm">
              <thead>
                <tr>
                  <th className="w-10">#</th>
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
                  <tr>
                    <td colSpan={7} className="p-0">
                      <EmptyState
                        icon="search"
                        title="ไม่พบผลการค้นหา"
                        hint="ลองเปลี่ยนคำค้นหา หรือเลือกคณะ ทั้งหมด"
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => (
                    <tr key={r.id}>
                      <td className="text-xs tabular-nums text-base-content/40">{i + 1}</td>
                      <td className="font-mono text-xs tabular-nums">{r.student_code}</td>
                      <td className="whitespace-nowrap">
                        {r.student ? (
                          <span className="text-sm font-medium">
                            {r.student.title_prefix}{r.student.first_name} {r.student.last_name}
                          </span>
                        ) : (
                          <span className="text-xs italic text-base-content/35">
                            ไม่พบข้อมูลนักเรียน
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-xs text-base-content/60">
                        {r.student
                          ? `${r.student.class_level || ''}${r.student.class_room ? `/${r.student.class_room}` : ''}`
                          : '—'}
                      </td>
                      <td className="text-xs">
                        {r.faculty_name || <span className="text-base-content/30">—</span>}
                        {r.campus && (
                          <div className="mt-0.5 text-[11px] text-base-content/50">
                            วิทยาเขต {r.campus}
                          </div>
                        )}
                      </td>
                      <td className="max-w-md text-xs">
                        <div className="truncate">{r.program_name_th}</div>
                        {r.field_name_th && (
                          <div className="truncate text-base-content/45">{r.field_name_th}</div>
                        )}
                        {r.program_type && (
                          <span className="badge badge-ghost badge-xs mt-1">{r.program_type}</span>
                        )}
                      </td>
                      <td>
                        {r.confirmed ? (
                          <Tag tone="success" icon="checkCircle">ยืนยันแล้ว</Tag>
                        ) : (
                          <Tag tone="gold" icon="clock">รอยืนยัน</Tag>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </div>
  );
}
