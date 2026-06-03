import { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api';

const EMPTY_FORM = { campus: '', faculty_name: '', group_field: '', field_name_th: '', program_name_th: '', program_type: '' };

export default function FacultiesPage() {
  const [unis, setUnis] = useState([]);
  const [selectedUniId, setSelectedUniId] = useState('');
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selCampus, setSelCampus] = useState('');
  const [selFaculty, setSelFaculty] = useState('');
  const [search, setSearch] = useState('');

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, campus: selCampus || '', faculty_name: selFaculty || '' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditTarget(p);
    setForm({
      campus: p.campus || '',
      faculty_name: p.faculty_name || '',
      group_field: p.group_field || '',
      field_name_th: p.field_name_th || '',
      program_name_th: p.program_name_th || '',
      program_type: p.program_type || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.program_name_th.trim()) { setFormError('กรุณากรอกชื่อหลักสูตร'); return; }
    setSaving(true); setFormError('');
    try {
      if (editTarget) {
        await api.put(`/programs/${editTarget.id}`, form);
      } else {
        await api.post('/programs', { ...form, university_id: selectedUniId });
      }
      setModalOpen(false);
      // reload
      const r = await api.get('/programs/list', { params: { university_id: selectedUniId } });
      setPrograms(r.data || []);
    } catch (err) {
      setFormError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/programs/${deleteTarget.id}`);
      setDeleteTarget(null);
      const r = await api.get('/programs/list', { params: { university_id: selectedUniId } });
      setPrograms(r.data || []);
    } catch {
      // silent
    } finally { setDeleting(false); }
  };

  useEffect(() => {
    api.get('/universities').then(r => setUnis(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setPrograms([]); setSelCampus(''); setSelFaculty(''); setSearch('');
    if (!selectedUniId) return;
    setLoading(true);
    api.get('/programs/list', { params: { university_id: selectedUniId } })
      .then(r => setPrograms(r.data || []))
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, [selectedUniId]);

  // กลุ่ม campus → faculties
  const campusTree = useMemo(() => {
    const tree = {};
    for (const p of programs) {
      const campus = p.campus || '(ไม่ระบุวิทยาเขต)';
      const faculty = p.faculty_name || '(ไม่ระบุคณะ)';
      if (!tree[campus]) tree[campus] = {};
      if (!tree[campus][faculty]) tree[campus][faculty] = 0;
      tree[campus][faculty]++;
    }
    return tree;
  }, [programs]);

  const campuses = Object.keys(campusTree).sort();
  const multiCampus = campuses.length > 1;

  // หลักสูตรที่กรอง
  const visiblePrograms = useMemo(() => {
    let list = programs;
    if (selCampus) list = list.filter(p => (p.campus || '(ไม่ระบุวิทยาเขต)') === selCampus);
    if (selFaculty) list = list.filter(p => (p.faculty_name || '(ไม่ระบุคณะ)') === selFaculty);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.program_name_th?.toLowerCase().includes(q) ||
        p.field_name_th?.toLowerCase().includes(q) ||
        p.group_field?.toLowerCase().includes(q) ||
        p.faculty_name?.toLowerCase().includes(q) ||
        p.program_type?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [programs, selCampus, selFaculty, search]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">🏫 คณะและหลักสูตร</h2>
        <p className="text-xs text-base-content/50">ข้อมูลนำเข้าจาก Excel · จัดการผ่านหน้ามหาวิทยาลัย</p>
      </div>

      <select className="select select-bordered w-full max-w-lg" value={selectedUniId}
        onChange={e => setSelectedUniId(e.target.value)}>
        <option value="">— เลือกมหาวิทยาลัย —</option>
        {unis.map(u => (
          <option key={u.id} value={u.id}>
            {u.university_type ? `[${u.university_type}] ` : ''}{u.name}
          </option>
        ))}
      </select>

      {!selectedUniId ? (
        <div className="text-center text-base-content/40 py-24 text-sm">
          เลือกมหาวิทยาลัยเพื่อดูหลักสูตร
        </div>
      ) : loading ? (
        <div className="text-center py-20"><span className="loading loading-spinner loading-lg" /></div>
      ) : (
        <>
          {/* Campus tabs — แสดงเฉพาะถ้ามีหลายวิทยาเขต */}
          {multiCampus && (
            <div className="flex flex-wrap gap-2">
              <button
                className={`btn btn-sm ${!selCampus ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                onClick={() => { setSelCampus(''); setSelFaculty(''); }}
              >
                ทั้งหมด
                <span className={`badge badge-xs ml-1 ${!selCampus ? 'badge-primary-content opacity-70' : 'badge-ghost'}`}>
                  {programs.length}
                </span>
              </button>
              {campuses.map(c => (
                <button
                  key={c}
                  className={`btn btn-sm ${selCampus === c ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                  onClick={() => { setSelCampus(c); setSelFaculty(''); }}
                >
                  📍 {c}
                  <span className={`badge badge-xs ml-1 ${selCampus === c ? 'badge-primary-content opacity-70' : 'badge-ghost'}`}>
                    {Object.values(campusTree[c]).reduce((a, b) => a + b, 0)}
                  </span>
                </button>
              ))}
            </div>
          )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

          {/* Left: faculty list */}
          <div className="lg:col-span-2 card bg-base-100 shadow border border-base-200">
            <div className="card-body p-3 gap-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  คณะ
                  {multiCampus && selCampus && <span className="text-xs font-normal text-primary ml-1">· {selCampus}</span>}
                  <span className="badge badge-ghost badge-sm ml-1">
                    {selCampus
                      ? Object.keys(campusTree[selCampus] || {}).length
                      : Object.values(campusTree).reduce((a, v) => a + Object.keys(v).length, 0)
                    }
                  </span>
                </h3>
                {selFaculty && (
                  <button className="btn btn-ghost btn-xs" onClick={() => setSelFaculty('')}>
                    ✕ ล้าง
                  </button>
                )}
              </div>
              <ul className="max-h-[540px] overflow-y-auto space-y-0.5 mt-1">
                {/* All faculties */}
                <li
                  className={`px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${!selFaculty ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'}`}
                  onClick={() => setSelFaculty('')}>
                  📋 ทั้งหมด
                  <span className={`text-xs ml-1 ${!selFaculty ? 'opacity-70' : 'opacity-40'}`}>
                    ({visiblePrograms.length})
                  </span>
                </li>
                {/* Faculty items (filtered by selected campus) */}
                {(selCampus ? [selCampus] : campuses).flatMap(campus =>
                  Object.keys(campusTree[campus] || {}).sort().map(fac => {
                    const isActive = selFaculty === fac && selCampus === campus;
                    return (
                      <li key={`${campus}::${fac}`}
                        className={`px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${isActive ? 'bg-primary text-primary-content font-medium' : 'hover:bg-base-200'}`}
                        onClick={() => { if (multiCampus) setSelCampus(campus); setSelFaculty(fac); }}>
                        <div className="truncate">{fac}</div>
                        <span className={`text-xs ${isActive ? 'opacity-70' : 'opacity-40'}`}>
                          ({campusTree[campus][fac]})
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>

          {/* Right: programs list */}
          <div className="lg:col-span-3 card bg-base-100 shadow border border-base-200">
            <div className="card-body p-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-sm">
                  หลักสูตร
                  <span className="badge badge-ghost badge-sm ml-1">{visiblePrograms.length}</span>
                </h3>
                <button className="btn btn-primary btn-xs" onClick={openCreate}>
                  ➕ เพิ่มหลักสูตร
                </button>
              </div>
              <input type="text" className="input input-bordered input-xs w-full mb-2"
                placeholder="🔍 ค้นหา..." value={search} onChange={e => setSearch(e.target.value)} />
              {visiblePrograms.length === 0 ? (
                <div className="text-center text-base-content/30 py-20 text-xs">ไม่พบข้อมูล</div>
              ) : (
                <ul className="space-y-1 max-h-[480px] overflow-y-auto">
                  {visiblePrograms.map(p => (
                    <li key={p.id} className="px-3 py-2 rounded-lg bg-base-50 border border-base-200 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm leading-snug">{p.program_name_th}</div>
                        <div className="flex gap-1 shrink-0">
                          <button className="btn btn-ghost btn-xs" title="แก้ไข" onClick={() => openEdit(p)}>✏️</button>
                          <button className="btn btn-ghost btn-xs text-error" title="ลบ" onClick={() => setDeleteTarget(p)}>🗑️</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1 items-center">
                        {p.group_field && <span className="badge badge-ghost badge-xs">{p.group_field}</span>}
                        {p.field_name_th && <span className="badge badge-outline badge-xs">{p.field_name_th}</span>}
                        {p.program_type && <span className="badge badge-info badge-xs opacity-70">{p.program_type}</span>}
                        {!selFaculty && p.faculty_name && (
                          <span className="text-xs text-base-content/40 ml-auto truncate">{p.faculty_name}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </>
      )}

      {/* ─── Modal เพิ่ม/แก้ไขหลักสูตร ─── */}
      {modalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="font-bold text-base mb-4">
              {editTarget ? '✏️ แก้ไขหลักสูตร' : '➕ เพิ่มหลักสูตรใหม่'}
            </h3>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* วิทยาเขต */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">📍 วิทยาเขต <span className="opacity-40">(ไม่บังคับ)</span></label>
                <input type="text" className="input input-bordered input-sm"
                  placeholder="เช่น วิทยาเขตหลัก"
                  value={form.campus}
                  onChange={e => setForm(f => ({ ...f, campus: e.target.value }))} />
              </div>
              {/* คณะ */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">🏛️ คณะ <span className="opacity-40">(ไม่บังคับ)</span></label>
                <input type="text" className="input input-bordered input-sm"
                  placeholder="เช่น คณะวิศวกรรมศาสตร์"
                  value={form.faculty_name}
                  onChange={e => setForm(f => ({ ...f, faculty_name: e.target.value }))} />
              </div>
              {/* กลุ่มสาขา */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">📂 สาขา/กลุ่มวิชา <span className="opacity-40">(ไม่บังคับ)</span></label>
                <input type="text" className="input input-bordered input-sm"
                  placeholder="เช่น วิศวกรรมคอมพิวเตอร์"
                  value={form.group_field}
                  onChange={e => setForm(f => ({ ...f, group_field: e.target.value }))} />
              </div>
              {/* วิชาเอก */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">🎯 วิชาเอก <span className="opacity-40">(ไม่บังคับ)</span></label>
                <input type="text" className="input input-bordered input-sm"
                  placeholder="เช่น วิศวกรรมซอฟต์แวร์"
                  value={form.field_name_th}
                  onChange={e => setForm(f => ({ ...f, field_name_th: e.target.value }))} />
              </div>
              {/* ชื่อหลักสูตร (required) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">📋 ชื่อหลักสูตร <span className="text-error">*</span></label>
                <input type="text" className="input input-bordered input-sm"
                  placeholder="เช่น หลักสูตรวิศวกรรมศาสตรบัณฑิต"
                  value={form.program_name_th}
                  onChange={e => setForm(f => ({ ...f, program_name_th: e.target.value }))} />
              </div>
              {/* ประเภทโปรแกรม */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">🏷️ ประเภท/โปรแกรม <span className="opacity-40">(ไม่บังคับ)</span></label>
                <input type="text" className="input input-bordered input-sm"
                  placeholder="เช่น ภาษาไทย ปกติ / นานาชาติ"
                  value={form.program_type}
                  onChange={e => setForm(f => ({ ...f, program_type: e.target.value }))} />
              </div>
              {formError && <div className="alert alert-error py-2 text-xs">⚠️ {formError}</div>}
              <div className="modal-action mt-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-xs" /> : (editTarget ? 'บันทึก' : 'เพิ่ม')}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setModalOpen(false)} />
        </div>
      )}

      {/* ─── Delete confirm ─── */}
      {deleteTarget && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-base mb-2">🗑️ ยืนยันการลบ</h3>
            <p className="text-sm text-base-content/70 mb-1">ต้องการลบหลักสูตรนี้ใช่ไหม?</p>
            <p className="text-sm font-medium">{deleteTarget.program_name_th}</p>
            <div className="modal-action mt-4">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>ยกเลิก</button>
              <button className="btn btn-error btn-sm" disabled={deleting} onClick={handleDelete}>
                {deleting ? <span className="loading loading-spinner loading-xs" /> : 'ลบ'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDeleteTarget(null)} />
        </div>
      )}
    </div>
  );
}
