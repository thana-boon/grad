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
  const [reloadToken, setReloadToken] = useState(0);
  const modalRef = useRef(null);
  const importInputRef = useRef(null);
  const importResultRef = useRef(null);
  const photoInputRef = useRef(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [forceLoading, setForceLoading] = useState(false);
  const [forceResult, setForceResult] = useState(null);

  // ── CRUD state ──
  const [universities, setUniversities] = useState([]);
  const [uniPrograms, setUniPrograms] = useState([]);
  const [addForm, setAddForm] = useState({ uni_id: '', program_id: '', confirmed: false });
  const [addLoading, setAddLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // id ของ admission ที่กำลัง action
  const [photoUploading, setPhotoUploading] = useState(false);

  const loadData = () => setReloadToken(t => t + 1);

  // โหลดปีการศึกษาแล้วใช้ปีแรก
  useEffect(() => {
    Promise.all([
      api.get('/academic-years').then(r => r.data || []),
      api.get('/academic-years/active').then(r => r.data || null).catch(() => null),
    ]).then(([years, active]) => {
      if (active?.active_year_id) {
        setYearId(String(active.active_year_id));
        return;
      }
      if (years.length > 0) setYearId(String(years[0].id));
    });
  }, []);

  // โหลดข้อมูลเมื่อเลือกปี
  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    api.get('/student/admin/admission-overview', { params: { year_id: yearId } })
      .then(r => {
        const data = r.data || [];
        setStudents(data);
        // sync selected ถ้า modal ยังเปิดอยู่
        setSelected(prev => prev ? (data.find(s => s.student_code === prev.student_code) || prev) : null);
      })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [yearId, reloadToken]);

  // โหลดรายการมหาลัยครั้งเดียว
  useEffect(() => {
    api.get('/universities').then(r => setUniversities(r.data || [])).catch(() => {});
  }, []);

  // โหลด programs เมื่อเลือก uni
  useEffect(() => {
    if (!addForm.uni_id) return;
    api.get('/programs/list', { params: { university_id: addForm.uni_id } })
      .then(r => setUniPrograms(r.data || []))
      .catch(() => setUniPrograms([]));
  }, [addForm.uni_id]);

  // Import Excel handler
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const formData = new FormData();
    formData.append('file', file);
    setImportLoading(true);
    setImportResult(null);
    try {
      const r = await api.post('/student/admin/import-admissions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult({ ok: true, ...r.data });
      importResultRef.current?.showModal();
      loadData();
    } catch (err) {
      setImportResult({ ok: false, message: err.response?.data?.message || err.message });
      importResultRef.current?.showModal();
    } finally {
      setImportLoading(false);
    }
  };

  const openModal = (s) => {
    setSelected(s);
    setAddForm({ uni_id: '', program_id: '', confirmed: false });
    setUniPrograms([]);
    modalRef.current?.showModal();
  };
  const closeModal = () => modalRef.current?.close();

  // ── Admin CRUD handlers ──
  const handleAddAdmission = async () => {
    if (!addForm.program_id || !selected) return;
    setAddLoading(true);
    try {
      await api.post('/student/admin/admissions', {
        student_code: selected.student_code,
        program_id: Number(addForm.program_id),
        confirmed: addForm.confirmed ? 1 : 0,
      });
      setAddForm({ uni_id: '', program_id: '', confirmed: false });
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleToggleConfirm = async (admission) => {
    setActionLoading(admission.id);
    try {
      await api.patch(`/student/admin/admissions/${admission.id}/confirm`, {
        confirmed: admission.confirmed ? 0 : 1,
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAdmission = async (admission) => {
    if (!confirm(`ลบ "${admission.university_name}" ของ ${selected?.first_name}?`)) return;
    setActionLoading(admission.id);
    try {
      await api.delete(`/student/admin/admissions/${admission.id}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdminUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    e.target.value = '';
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('year_id', String(yearId || '0'));

    setPhotoUploading(true);
    try {
      await api.post(`/student/admin/students/${selected.student_code}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleForceImport = async () => {
    if (!importResult?.warnings?.length) return;
    setForceLoading(true);
    setForceResult(null);
    try {
      const r = await api.post('/student/admin/force-import-admissions', {
        rows: importResult.warnings,
      });
      setForceResult({ ok: true, ...r.data });
      setImportResult(prev => ({ ...prev, warnings: [] }));
      loadData();
    } catch (err) {
      setForceResult({ ok: false, message: err.response?.data?.message || err.message });
    } finally {
      setForceLoading(false);
    }
  };

  const getUniversityLabel = (u) => u?.name || u?.name_th || u?.name_en || u?.short_name || `มหาวิทยาลัย #${u?.id}`;

  // จำนวนที่ยืนยันสิทธิ์ของนักเรียนแต่ละคน
  const confirmedCount = (s) => s.admissions.filter(a => a.confirmed).length;

  // สรุปจำนวน
  const counts = { all: students.length, none: 0, pending: 0, confirmed: 0 };
  for (const s of students) counts[s.status]++;
  // นักเรียนที่ยืนยันสิทธิ์มากกว่า 1 ที่ (ผิดหลักเกณฑ์ — มักเกิดจากตอน import)
  const multiConfirm = students.filter(s => confirmedCount(s) > 1);

  // filter + search
  const filtered = students.filter(s => {
    if (filter === 'multi') {
      if (confirmedCount(s) <= 1) return false;
    } else if (filter !== 'all' && s.status !== filter) {
      return false;
    }
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

      {/* ── ค้นหา + Import ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          className="input input-bordered input-sm w-56"
          placeholder="🔍 ค้นหาชื่อ / รหัส"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImportFile}
        />
        <button
          className={`btn btn-sm btn-success gap-2 ${importLoading ? 'loading' : ''}`}
          onClick={() => importInputRef.current?.click()}
          disabled={importLoading}
        >
          {!importLoading && '📥'} Import Excel
        </button>
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

      {/* ── ปุ่มตรวจสอบนักเรียนที่ยืนยันสิทธิ์เกิน 1 ที่ ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter(filter === 'multi' ? 'all' : 'multi')}
          className={`btn btn-sm gap-2 ${multiConfirm.length > 0 ? 'btn-error' : 'btn-ghost'} ${filter === 'multi' ? '' : 'opacity-70'}`}
          disabled={multiConfirm.length === 0}
          title="นักเรียนที่ยืนยันสิทธิ์มากกว่า 1 ที่ ซึ่งผิดหลักเกณฑ์ (มักเกิดจากตอน import)"
        >
          ⚠️ ยืนยันสิทธิ์เกิน 1 ที่
          <span className="badge badge-sm badge-neutral font-bold">{multiConfirm.length}</span>
        </button>
        {multiConfirm.length > 0 && (
          <span className="text-xs text-error/80">
            พบนักเรียน {multiConfirm.length} คนที่ยืนยันสิทธิ์เกิน 1 ที่ — คลิกเพื่อดูและแก้ไข
          </span>
        )}
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
                const nConfirmed = confirmedCount(s);
                const overConfirmed = nConfirmed > 1;
                return (
                  <tr
                    key={s.student_code}
                    className={`hover:bg-base-200 transition-colors cursor-pointer ${overConfirmed ? 'bg-error/10' : ''}`}
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
                      {overConfirmed && (
                        <span className="badge badge-error badge-sm gap-1 ml-1 whitespace-nowrap">
                          ⚠️ ยืนยัน {nConfirmed} ที่
                        </span>
                      )}
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

              <div className="flex items-center gap-3 mb-4 p-2 rounded-lg bg-base-200/60">
                <div className="avatar">
                  <div className="w-16 h-16 rounded-lg bg-base-300 overflow-hidden">
                    {selected.photo_url
                      ? <img src={resolveMediaUrl(selected.photo_url)} alt="student" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>}
                  </div>
                </div>
                <div className="flex-1 text-xs text-base-content/60">รูปนักเรียน (แก้ไขได้โดยแอดมิน)</div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAdminUploadPhoto}
                />
                <button
                  className={`btn btn-sm btn-outline ${photoUploading ? 'loading' : ''}`}
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                >
                  {!photoUploading && '🖼️'} ใส่รูป
                </button>
              </div>

              {/* แจ้งเตือนยืนยันสิทธิ์เกิน 1 ที่ */}
              {confirmedCount(selected) > 1 && (
                <div className="alert alert-error text-sm mb-3 py-2">
                  <span>
                    ⚠️ นักเรียนคนนี้ยืนยันสิทธิ์ <b>{confirmedCount(selected)}</b> ที่
                    ซึ่งผิดหลักเกณฑ์ (ยืนยันได้เพียง 1 ที่) — โปรดยกเลิกยืนยันรายการที่เกินด้วยปุ่ม ↩️
                  </span>
                </div>
              )}

              {/* รายการ admissions */}
              {selected.admissions.length === 0 ? (
                <p className="text-center text-base-content/40 py-4">ยังไม่มีการบันทึกข้อมูล</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selected.admissions.map((a, idx) => (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${a.confirmed ? 'bg-success/10 ring-1 ring-success' : 'bg-base-200'}`}
                    >
                      <span className="text-base-content/40 text-xs w-4 flex-shrink-0">{idx + 1}</span>
                      {a.logo_url
                        ? <img src={resolveMediaUrl(a.logo_url)} alt="" className="w-9 h-9 object-contain rounded flex-shrink-0" />
                        : <div className="w-9 h-9 bg-base-300 rounded flex items-center justify-center text-lg flex-shrink-0">🏛️</div>}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">{a.university_name}</p>
                        {a.campus && <p className="text-xs text-info font-medium">วิทยาเขต {a.campus}</p>}
                        <p className="text-xs text-base-content/60">{a.faculty_name}</p>
                        <p className="text-xs text-base-content/50">{a.program_name}</p>
                        {a.created_at && (
                          <p className="text-[10px] text-base-content/40 mt-0.5">
                            {new Date(a.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          className={`btn btn-xs ${a.confirmed ? 'btn-warning' : 'btn-success'}`}
                          disabled={actionLoading === a.id}
                          onClick={() => handleToggleConfirm(a)}
                          title={a.confirmed ? 'ยกเลิกยืนยัน' : 'ยืนยันสิทธิ์'}
                        >
                          {actionLoading === a.id ? <span className="loading loading-spinner loading-xs" /> : a.confirmed ? '↩️' : '✅'}
                        </button>
                        <button
                          className="btn btn-xs btn-error"
                          disabled={actionLoading === a.id}
                          onClick={() => handleDeleteAdmission(a)}
                          title="ลบ"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── เพิ่มรายการ ── */}
              <div className="divider text-xs">เพิ่มมหาวิทยาลัย</div>
              <div className="flex flex-col gap-2">
                <select
                  className="select select-bordered select-sm w-full bg-base-100 text-base-content"
                  value={addForm.uni_id}
                  onChange={e => { setUniPrograms([]); setAddForm(f => ({ ...f, uni_id: e.target.value, program_id: '' })); }}
                >
                  <option value="">— เลือกมหาวิทยาลัย —</option>
                  {universities.map(u => (
                    <option key={u.id} value={u.id}>{getUniversityLabel(u)}</option>
                  ))}
                </select>
                {addForm.uni_id && (
                  <select
                    className="select select-bordered select-sm w-full bg-base-100 text-base-content"
                    value={addForm.program_id}
                    onChange={e => setAddForm(f => ({ ...f, program_id: e.target.value }))}
                  >
                    <option value="">— เลือกสาขา/หลักสูตร —</option>
                    {uniPrograms.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.faculty_name ? `[${p.faculty_name}] ` : ''}{p.program_name_th}
                        {p.program_type ? ` (${p.program_type})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-success"
                    checked={addForm.confirmed}
                    onChange={e => setAddForm(f => ({ ...f, confirmed: e.target.checked }))}
                  />
                  ยืนยันสิทธิ์ทันที
                </label>
                <button
                  className={`btn btn-primary btn-sm ${addLoading ? 'loading' : ''}`}
                  disabled={!addForm.program_id || addLoading}
                  onClick={handleAddAdmission}
                >
                  {!addLoading && '➕'} เพิ่มรายการ
                </button>
              </div>
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

      {/* ── Import Result Dialog ── */}
      <dialog ref={importResultRef} className="modal">
        <div className="modal-box max-w-md">
          {importResult?.ok ? (
            <>
              <h3 className="font-bold text-lg text-success">✅ Import สำเร็จ</h3>
              <div className="mt-3 flex flex-col gap-1 text-sm">
                <p>รวมทั้งหมด: <b>{importResult.total}</b> แถว</p>
                <p>นำเข้าสำเร็จ: <b className="text-success">{importResult.imported}</b> รายการ</p>
                <p>ข้ามไป: <b className="text-warning">{importResult.skipped}</b> รายการ</p>
              </div>
              {importResult.errors?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-error mb-1">รายละเอียดที่ข้าม ({importResult.errors.length}):</p>
                  <div className="max-h-32 overflow-y-auto text-xs text-base-content/60 flex flex-col gap-0.5">
                    {importResult.errors.map((e, i) => <p key={i}>• {e}</p>)}
                  </div>
                </div>
              )}
              {importResult.warnings?.length > 0 && (
                <div className="mt-3 border border-warning/40 rounded-lg p-3 bg-warning/5">
                  <p className="text-sm font-semibold text-warning mb-1">
                    ⚠️ พบ {importResult.warnings.length} รายการที่มีรหัสนักเรียนถูกต้อง แต่ไม่พบข้อมูลในระบบ
                  </p>
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-1 mb-3">
                    {importResult.warnings.map((w, i) => (
                      <div key={i} className="text-xs bg-base-100 rounded px-2 py-1">
                        <span className="font-mono font-semibold">{w.student_code}</span>
                        {w.display_name && <span className="text-base-content/60 ml-1">({w.display_name})</span>}
                        <span className="ml-2 text-warning">{w.reason}</span>
                      </div>
                    ))}
                  </div>
                  {forceResult?.ok ? (
                    <p className="text-xs text-success font-semibold">✅ บันทึกแล้ว {forceResult.saved} รายการ</p>
                  ) : (
                    <>
                      {forceResult?.message && (
                        <p className="text-xs text-error mb-1">{forceResult.message}</p>
                      )}
                      <button
                        className={`btn btn-warning btn-sm w-full ${forceLoading ? 'loading' : ''}`}
                        disabled={forceLoading}
                        onClick={handleForceImport}
                      >
                        {!forceLoading && '➕'} เพิ่มรายการเหล่านี้ลงระบบเลย
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="font-bold text-lg text-error">❌ Import ไม่สำเร็จ</h3>
              <p className="mt-2 text-sm">{importResult?.message}</p>
            </>
          )}
          <div className="modal-action">
            <button className="btn btn-sm" onClick={() => importResultRef.current?.close()}>ปิด</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}
