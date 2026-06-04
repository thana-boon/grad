import { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const STATUS_LABEL = {
  none: { label: 'ยังไม่บันทึก', badge: 'badge-error', icon: '❌' },
  pending: { label: 'บันทึกแล้ว (ยังไม่ยืนยัน)', badge: 'badge-warning', icon: '⏳' },
  confirmed: { label: 'ยืนยันสิทธิ์แล้ว', badge: 'badge-success', icon: '✅' },
};

const FILTER_BTN = {
  all:       'btn-neutral',
  none:      'btn-error',
  pending:   'btn-warning',
  confirmed: 'btn-success',
};

export default function AdmissionStatusPage() {
  const [yearId, setYearId] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // student object สำหรับ modal
  const modalRef = useRef(null);

  // โหลดปีการศึกษาแล้วใช้ปีแรก
  useEffect(() => {
    api.get('/academic-years').then(r => {
      const data = r.data || [];
      if (data.length > 0) setYearId(String(data[0].id));
    });
  }, []);

  // โหลดข้อมูลเมื่อเลือกปี
  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    api.get('/student/admin/admission-overview', { params: { year_id: yearId } })
      .then(r => setStudents(r.data || []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [yearId]);

  const openModal = (s) => {
    setSelected(s);
    modalRef.current?.showModal();
  };
  const closeModal = () => modalRef.current?.close();

  // สรุปจำนวน
  const counts = { all: students.length, none: 0, pending: 0, confirmed: 0 };
  for (const s of students) counts[s.status]++;

  // filter + search
  const filtered = students.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.student_code.includes(q) ||
        s.first_name?.toLowerCase().includes(q) ||
        s.last_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="text-xl font-bold">📋 สถานะการบันทึกผลสอบ</h1>

      {/* ── ค้นหา ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="input input-bordered input-sm w-56"
          placeholder="🔍 ค้นหาชื่อ / รหัส"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── ปุ่ม filter ── */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all',       label: 'ทั้งหมด' },
          { key: 'none',      label: '❌ ยังไม่บันทึก' },
          { key: 'pending',   label: '⏳ รอยืนยัน' },
          { key: 'confirmed', label: '✅ ยืนยันแล้ว' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`btn btn-sm ${FILTER_BTN[key]} transition-opacity ${filter !== key ? 'opacity-40' : ''}`}
          >
            {label}
            <span className="ml-1 font-bold text-inherit">
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* ── ตาราง ── */}
      {loading ? (
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-base-content/40 text-center py-10">ไม่พบข้อมูล</p>
      ) : (
        <div className="overflow-x-auto rounded-xl shadow">
          <table className="table table-sm bg-base-100">
            <thead>
              <tr className="text-xs">
                <th>#</th>
                <th>รหัส</th>
                <th>ชื่อ-นามสกุล</th>
                <th>ชั้น</th>
                <th>ห้อง</th>
                <th>สถานะ</th>
                <th>รายการที่บันทึก</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const st = STATUS_LABEL[s.status];
                return (
                  <tr
                    key={s.student_code}
                    className="hover:bg-base-200 transition-colors cursor-pointer"
                    onClick={() => openModal(s)}
                  >
                    <td className="text-base-content/40">{i + 1}</td>
                    <td className="font-mono">{s.student_code}</td>
                    <td>{s.first_name} {s.last_name}</td>
                    <td>{s.class_level}</td>
                    <td>{s.class_room}</td>
                    <td>
                      <span className={`badge ${st.badge} badge-sm gap-1 whitespace-nowrap`}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                    <td className="text-base-content/50 text-xs">
                      {s.admissions.length > 0 ? `${s.admissions.length} แห่ง` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal รายละเอียดของนักเรียน ── */}
      <dialog ref={modalRef} className="modal">
        <div className="modal-box max-w-lg">
          {selected && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">{selected.first_name} {selected.last_name}</h3>
                  <p className="text-sm text-base-content/60 font-mono">
                    รหัส {selected.student_code} · ม.{selected.class_level}/{selected.class_room}
                  </p>
                </div>
                <span className={`badge ${STATUS_LABEL[selected.status].badge} badge-md`}>
                  {STATUS_LABEL[selected.status].icon} {STATUS_LABEL[selected.status].label}
                </span>
              </div>

              {/* รายการ admissions */}
              {selected.admissions.length === 0 ? (
                <p className="text-center text-base-content/40 py-8">ยังไม่มีการบันทึกข้อมูล</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selected.admissions.map((a, idx) => (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${a.confirmed ? 'bg-success/10 ring-1 ring-success' : 'bg-base-200'}`}
                    >
                      <span className="text-base-content/40 text-xs w-4 flex-shrink-0">{idx + 1}</span>
                      {a.logo_url
                        ? <img src={resolveMediaUrl(a.logo_url)} alt="" className="w-10 h-10 object-contain rounded flex-shrink-0" />
                        : <div className="w-10 h-10 bg-base-300 rounded flex items-center justify-center text-lg flex-shrink-0">🏛️</div>}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{a.university_name}</p>
                        <p className="text-xs text-base-content/60">{a.faculty_name}</p>
                        <p className="text-xs text-base-content/50">{a.program_name}</p>
                      </div>
                      {a.confirmed && (
                        <span className="badge badge-success badge-sm flex-shrink-0">✅ ยืนยันสิทธิ์</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="modal-action">
            <button className="btn" onClick={closeModal}>ปิด</button>
          </div>
        </div>
        {/* กดพื้นหลังเพื่อปิด */}
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}
