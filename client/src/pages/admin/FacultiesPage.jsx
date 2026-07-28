import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../utils/api';
import Icon from '../../components/ui/Icon';
import { PageHeader, EmptyState, Tag } from '../../components/ui';

const EMPTY_FORM = { campus: '', faculty_name: '', group_field: '', field_name_th: '', program_name_th: '', program_type: '' };

export default function FacultiesPage() {
  const [unis, setUnis] = useState([]);
  const [selectedUniId, setSelectedUniId] = useState('');
  const [uniSearch, setUniSearch] = useState('');
  const [showUniDropdown, setShowUniDropdown] = useState(false);
  const uniDropdownRef = useRef(null);
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

  // ปิด dropdown เมื่อคลิกนอก
  useEffect(() => {
    const handler = (e) => {
      if (uniDropdownRef.current && !uniDropdownRef.current.contains(e.target)) {
        setShowUniDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredUnis = useMemo(() => {
    const q = uniSearch.toLowerCase();
    if (!q) return unis;
    return unis.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.name_th || '').toLowerCase().includes(q) ||
      (u.university_type || '').toLowerCase().includes(q)
    );
  }, [unis, uniSearch]);

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
    <div>
      <PageHeader
        icon="faculty"
        title="คณะและหลักสูตร"
        subtitle="ข้อมูลนำเข้าจาก Excel · เลือกมหาวิทยาลัยเพื่อดูโครงสร้างคณะและหลักสูตร"
      />

      {/* เลือกมหาวิทยาลัย */}
      <div className="relative mb-5 w-full max-w-lg" ref={uniDropdownRef}>
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-base-content/40"
        />
        <input
          className="input w-full pl-10 pr-10"
          placeholder="พิมพ์ชื่อมหาวิทยาลัย..."
          value={uniSearch}
          onChange={e => { setUniSearch(e.target.value); setShowUniDropdown(true); }}
          onFocus={() => setShowUniDropdown(true)}
          aria-label="ค้นหามหาวิทยาลัย"
        />
        {selectedUniId && (
          <button
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-base-content/50 transition-colors hover:bg-secondary hover:text-primary"
            onClick={() => { setSelectedUniId(''); setUniSearch(''); }}
            aria-label="ล้างการเลือกมหาวิทยาลัย"
          >
            <Icon name="x" size={16} />
          </button>
        )}

        {showUniDropdown && (
          <ul className="anim-scale-in absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-base-300 bg-base-100 py-1 shadow-lg">
            {filteredUnis.length === 0 ? (
              <li className="px-4 py-3 text-center text-sm text-base-content/45">ไม่พบมหาวิทยาลัย</li>
            ) : (
              filteredUnis.map(u => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                      String(selectedUniId) === String(u.id) ? 'bg-primary/8 font-medium text-primary' : ''
                    }`}
                    onMouseDown={() => {
                      setSelectedUniId(String(u.id));
                      setUniSearch(u.name || u.name_th || '');
                      setShowUniDropdown(false);
                    }}
                  >
                    {u.university_type && (
                      <span className="shrink-0 text-xs text-base-content/40">[{u.university_type}]</span>
                    )}
                    <span className="truncate">{u.name || u.name_th}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {!selectedUniId ? (
        <div className="card bg-base-100">
          <EmptyState
            icon="university"
            title="เลือกมหาวิทยาลัยเพื่อดูหลักสูตร"
            hint="ค้นหาชื่อมหาวิทยาลัยในช่องด้านบน ระบบจะแสดงคณะและหลักสูตรทั้งหมดที่นำเข้าไว้"
          />
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="card bg-base-100 p-4 lg:col-span-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="gt-skeleton mb-2 h-6" />
            ))}
          </div>
          <div className="card bg-base-100 p-4 lg:col-span-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="gt-skeleton mb-2 h-8" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* วิทยาเขต — แสดงเฉพาะถ้ามีหลายวิทยาเขต */}
          {multiCampus && (
            <div className="flex flex-wrap gap-2">
              <button
                className={`btn btn-sm gap-1.5 ${!selCampus ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setSelCampus(''); setSelFaculty(''); }}
                aria-pressed={!selCampus}
              >
                ทุกวิทยาเขต
                <span className="font-semibold tabular-nums">{programs.length}</span>
              </button>
              {campuses.map(c => (
                <button
                  key={c}
                  className={`btn btn-sm gap-1.5 ${selCampus === c ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => { setSelCampus(c); setSelFaculty(''); }}
                  aria-pressed={selCampus === c}
                >
                  <Icon name="pin" size={13} />
                  <span className="max-w-[14rem] truncate">{c}</span>
                  <span className="font-semibold tabular-nums">
                    {Object.values(campusTree[c]).reduce((a, b) => a + b, 0)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
            {/* ซ้าย: รายชื่อคณะ */}
            <div className="card bg-base-100 p-3 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  คณะ
                  {multiCampus && selCampus && (
                    <span className="text-xs font-normal text-primary">· {selCampus}</span>
                  )}
                  <span className="badge badge-ghost badge-sm tabular-nums">
                    {selCampus
                      ? Object.keys(campusTree[selCampus] || {}).length
                      : Object.values(campusTree).reduce((a, v) => a + Object.keys(v).length, 0)}
                  </span>
                </h2>
                {selFaculty && (
                  <button className="btn btn-ghost btn-xs gap-1" onClick={() => setSelFaculty('')}>
                    <Icon name="x" size={12} />
                    ล้าง
                  </button>
                )}
              </div>

              <ul className="flex max-h-[540px] flex-col gap-0.5 overflow-y-auto">
                <li>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      !selFaculty ? 'bg-primary font-medium text-primary-content' : 'hover:bg-secondary'
                    }`}
                    onClick={() => setSelFaculty('')}
                    aria-pressed={!selFaculty}
                  >
                    <span className="flex items-center gap-2">
                      <Icon name="list" size={14} />
                      ทุกคณะ
                    </span>
                    <span className={`text-xs tabular-nums ${!selFaculty ? 'opacity-75' : 'opacity-45'}`}>
                      {visiblePrograms.length}
                    </span>
                  </button>
                </li>

                {(selCampus ? [selCampus] : campuses).flatMap(campus =>
                  Object.keys(campusTree[campus] || {}).sort().map(fac => {
                    const isActive = selFaculty === fac && selCampus === campus;
                    return (
                      <li key={`${campus}::${fac}`}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            isActive ? 'bg-primary font-medium text-primary-content' : 'hover:bg-secondary'
                          }`}
                          onClick={() => { if (multiCampus) setSelCampus(campus); setSelFaculty(fac); }}
                          aria-pressed={isActive}
                        >
                          <span className="truncate">{fac}</span>
                          <span className={`shrink-0 text-xs tabular-nums ${isActive ? 'opacity-75' : 'opacity-45'}`}>
                            {campusTree[campus][fac]}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            {/* ขวา: รายการหลักสูตร */}
            <div className="card bg-base-100 p-3 lg:col-span-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  หลักสูตร
                  <span className="badge badge-ghost badge-sm tabular-nums">{visiblePrograms.length}</span>
                </h2>
                <button className="btn btn-primary btn-xs gap-1" onClick={openCreate}>
                  <Icon name="plus" size={13} />
                  เพิ่มหลักสูตร
                </button>
              </div>

              <div className="relative mb-2">
                <Icon
                  name="search"
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40"
                />
                <input
                  type="text"
                  className="input input-xs w-full pl-7"
                  placeholder="ค้นหาหลักสูตร..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  aria-label="ค้นหาหลักสูตร"
                />
              </div>

              {visiblePrograms.length === 0 ? (
                <EmptyState
                  icon="clipboard"
                  title={search ? 'ไม่พบหลักสูตรที่ค้นหา' : 'ยังไม่มีหลักสูตรในคณะนี้'}
                  hint={search ? 'ลองเปลี่ยนคำค้นหา' : 'กด เพิ่มหลักสูตร เพื่อสร้างรายการใหม่'}
                  className="py-12"
                />
              ) : (
                <ul className="flex max-h-[480px] flex-col gap-1.5 overflow-y-auto">
                  {visiblePrograms.map(p => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-base-300 px-3 py-2.5 transition-colors hover:bg-secondary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{p.program_name_th}</p>
                        <div className="flex shrink-0 gap-0.5">
                          <button
                            className="btn btn-ghost btn-xs px-1.5"
                            aria-label={`แก้ไข ${p.program_name_th}`}
                            onClick={() => openEdit(p)}
                          >
                            <Icon name="edit" size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-xs px-1.5 text-error"
                            aria-label={`ลบ ${p.program_name_th}`}
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {p.group_field && <span className="badge badge-ghost badge-xs">{p.group_field}</span>}
                        {p.field_name_th && <Tag tone="primary">{p.field_name_th}</Tag>}
                        {p.program_type && <Tag tone="navy">{p.program_type}</Tag>}
                        {!selFaculty && p.faculty_name && (
                          <span className="ml-auto truncate text-xs text-base-content/45">
                            {p.faculty_name}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal เพิ่ม/แก้ไขหลักสูตร ─── */}
      {modalOpen && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-lg">
            <div className="mb-5 flex items-center gap-3">
              <span className="gt-chip size-10">
                <Icon name={editTarget ? 'edit' : 'plus'} size={20} />
              </span>
              <h3 className="text-base font-semibold">
                {editTarget ? 'แก้ไขหลักสูตร' : 'เพิ่มหลักสูตรใหม่'}
              </h3>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {[
                { id: 'campus', key: 'campus', label: 'วิทยาเขต', placeholder: 'เช่น วิทยาเขตหลัก' },
                { id: 'faculty', key: 'faculty_name', label: 'คณะ', placeholder: 'เช่น คณะวิศวกรรมศาสตร์' },
                { id: 'group', key: 'group_field', label: 'สาขา/กลุ่มวิชา', placeholder: 'เช่น วิศวกรรมคอมพิวเตอร์' },
                { id: 'field', key: 'field_name_th', label: 'วิชาเอก', placeholder: 'เช่น วิศวกรรมซอฟต์แวร์' },
                { id: 'program', key: 'program_name_th', label: 'ชื่อหลักสูตร', placeholder: 'เช่น หลักสูตรวิศวกรรมศาสตรบัณฑิต', required: true },
                { id: 'type', key: 'program_type', label: 'ประเภท/โปรแกรม', placeholder: 'เช่น ภาษาไทย ปกติ / นานาชาติ' },
              ].map((f) => (
                <div key={f.key}>
                  <label htmlFor={`fac-${f.id}`} className="label">
                    {f.label}{' '}
                    {f.required ? (
                      <span className="text-error">*</span>
                    ) : (
                      <span className="font-normal text-base-content/45">(ไม่บังคับ)</span>
                    )}
                  </label>
                  <input
                    id={`fac-${f.id}`}
                    type="text"
                    className="input input-sm w-full"
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}

              <div aria-live="polite">
                {formError && (
                  <div className="alert alert-error py-2">
                    <Icon name="alert" size={15} className="mt-px" />
                    <span className="text-xs">{formError}</span>
                  </div>
                )}
              </div>

              <div className="modal-action mt-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary btn-sm gap-1.5" disabled={saving}>
                  {saving ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Icon name={editTarget ? 'save' : 'plus'} size={15} />
                  )}
                  {editTarget ? 'บันทึก' : 'เพิ่ม'}
                </button>
              </div>
            </form>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setModalOpen(false)} />
        </div>
      )}

      {/* ─── Delete confirm ─── */}
      {deleteTarget && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/10 text-error">
                <Icon name="trash" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">ยืนยันการลบ</h3>
                <p className="mt-1 text-sm text-base-content/65">ต้องการลบหลักสูตรนี้ใช่ไหม?</p>
                <p className="mt-1 text-sm font-medium">{deleteTarget.program_name_th}</p>
              </div>
            </div>
            <div className="modal-action mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>ยกเลิก</button>
              <button className="btn btn-error btn-sm gap-1.5" disabled={deleting} onClick={handleDelete}>
                {deleting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Icon name="trash" size={15} />
                )}
                ลบ
              </button>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setDeleteTarget(null)} />
        </div>
      )}
    </div>
  );
}
