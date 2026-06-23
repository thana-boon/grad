import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { resolveMediaUrl } from '../utils/mediaUrl';
import PhotoUploadDialog from '../components/PhotoUploadDialog';

// ── Custom Confirm Dialog ─────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel = 'ยืนยัน', confirmClass = 'btn-error', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm">
        {title && <h3 className="font-bold text-lg mb-1">{title}</h3>}
        <p className="text-base-content/70 text-sm">{message}</p>
        <div className="modal-action mt-4">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>ยกเลิก</button>
          <button className={`btn btn-sm ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onCancel} />
    </div>
  );
}

// ── Admission Add Form (7-level cascade) ─────────────────────────────────────
function AdmissionForm({ onSaved, onCancel }) {
  const [unis, setUnis]                 = useState([]);
  const [selUni, setSelUni]             = useState('');   // university_id
  const [uniSearch, setUniSearch]       = useState('');
  const [showUniDrop, setShowUniDrop]   = useState(false);

  const [campuses, setCampuses]         = useState([]);
  const [selCampus, setSelCampus]       = useState('');

  const [faculties, setFaculties]       = useState([]);
  const [selFaculty, setSelFaculty]     = useState('');
  const [facSearch, setFacSearch]       = useState('');
  const [showFacDrop, setShowFacDrop]   = useState(false);

  const [groupFields, setGroupFields]   = useState([]);   // สาขา
  const [selGroupField, setSelGroupField] = useState('');

  const [fields, setFields]             = useState([]);   // เอก
  const [selField, setSelField]         = useState('');

  const [progNames, setProgNames]       = useState([]);
  const [selProgName, setSelProgName]   = useState('');
  const [progSearch, setProgSearch]     = useState('');
  const [showProgDrop, setShowProgDrop] = useState(false);

  const [progTypes, setProgTypes]       = useState([]);
  const [selProgType, setSelProgType]   = useState('');

  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  // ── Load unis on mount ────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/universities').then(r => setUnis(r.data || []));
  }, []);

  // ── Level 2: Campuses — when uni changes ──────────────────────────────────
  useEffect(() => {
    setCampuses([]); setSelCampus('');
    setFaculties([]); setSelFaculty(''); setFacSearch('');
    setGroupFields([]); setSelGroupField('');
    setFields([]); setSelField('');
    setProgNames([]); setSelProgName(''); setProgSearch('');
    setProgTypes([]); setSelProgType('');
    setError('');
    if (!selUni) return;
    api.get('/programs/campuses', { params: { university_id: selUni } }).then(r => {
      const list = r.data || [];
      setCampuses(list);
      if (list.length === 1) setSelCampus(list[0]);
    });
  }, [selUni]);

  // ── Level 3: Faculties — when campus confirmed ────────────────────────────
  useEffect(() => {
    setFaculties([]); setSelFaculty(''); setFacSearch('');
    setGroupFields([]); setSelGroupField('');
    setFields([]); setSelField('');
    setProgNames([]); setSelProgName(''); setProgSearch('');
    setProgTypes([]); setSelProgType('');
    if (!selUni) return;
    if (campuses.length > 1 && !selCampus) return;  // รอผู้ใช้เลือก campus
    const params = { university_id: selUni };
    if (selCampus) params.campus = selCampus;
    api.get('/programs/faculties', { params }).then(r => setFaculties(r.data || []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCampus, campuses.length]);

  // ── Level 4: Group fields (สาขา) — when faculty chosen ───────────────────
  useEffect(() => {
    setGroupFields([]); setSelGroupField('');
    setFields([]); setSelField('');
    setProgNames([]); setSelProgName(''); setProgSearch('');
    setProgTypes([]); setSelProgType('');
    if (!selUni || !selFaculty) return;
    const params = { university_id: selUni, faculty: selFaculty };
    if (selCampus) params.campus = selCampus;
    api.get('/programs/group-fields', { params }).then(r => {
      const list = r.data || [];
      setGroupFields(list);
      if (list.length <= 1) setSelGroupField(list[0] || '');
    });
  }, [selFaculty]);

  // ── Level 5: Fields (เอก) — when group_field resolved ────────────────────
  useEffect(() => {
    setFields([]); setSelField('');
    setProgNames([]); setSelProgName(''); setProgSearch('');
    setProgTypes([]); setSelProgType('');
    if (!selUni || !selFaculty) return;
    if (groupFields.length > 1 && !selGroupField) return;  // รอเลือก
    const params = { university_id: selUni, faculty: selFaculty };
    if (selCampus) params.campus = selCampus;
    if (selGroupField) params.group_field = selGroupField;
    api.get('/programs/fields', { params }).then(r => {
      const list = r.data || [];
      setFields(list);
      if (list.length <= 1) setSelField(list[0] || '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selGroupField, groupFields.length]);

  // ── Level 6: Program names (หลักสูตร) — when field resolved ──────────────
  useEffect(() => {
    setProgNames([]); setSelProgName(''); setProgSearch('');
    setProgTypes([]); setSelProgType('');
    if (!selUni || !selFaculty) return;
    if (groupFields.length > 1 && !selGroupField) return;
    if (fields.length > 1 && !selField) return;
    const params = { university_id: selUni, faculty: selFaculty };
    if (selCampus) params.campus = selCampus;
    if (selGroupField) params.group_field = selGroupField;
    if (selField) params.field_name = selField;
    api.get('/programs/names', { params }).then(r => setProgNames(r.data || []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selField, fields.length]);

  // ── Level 7: Program types (โปรแกรม) — when program name chosen ──────────
  useEffect(() => {
    setProgTypes([]); setSelProgType('');
    if (!selProgName || !selUni || !selFaculty) return;
    const params = { university_id: selUni, faculty: selFaculty, program_name: selProgName };
    if (selCampus) params.campus = selCampus;
    if (selGroupField) params.group_field = selGroupField;
    if (selField) params.field_name = selField;
    api.get('/programs/types', { params }).then(r => {
      const list = r.data || [];
      setProgTypes(list);
      if (list.length <= 1) setSelProgType(list[0] || '');
    });
  }, [selProgName]);

  const canSave = selUni && selFaculty && selProgName &&
    (campuses.length === 0 || selCampus) &&
    (groupFields.length <= 1 || selGroupField) &&
    (fields.length <= 1 || selField) &&
    (progTypes.length <= 1 || selProgType);

  const handleSave = async () => {
    if (!canSave) { setError('กรุณาเลือกข้อมูลให้ครบ'); return; }
    setSaving(true); setError('');
    try {
      const params = { university_id: selUni, faculty: selFaculty, program_name: selProgName };
      if (selCampus) params.campus = selCampus;
      if (selGroupField) params.group_field = selGroupField;
      if (selField) params.field_name = selField;
      if (selProgType) params.program_type = selProgType;
      const { data: prog } = await api.get('/programs/find', { params });
      await api.post('/student/admissions', { program_id: prog.id });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  };

  const filteredUnis = unis.filter(u =>
    !uniSearch || u.name?.toLowerCase().includes(uniSearch.toLowerCase()) ||
    u.short_name?.toLowerCase().includes(uniSearch.toLowerCase())
  );
  const filteredFacs = faculties.filter(f =>
    !facSearch || f.toLowerCase().includes(facSearch.toLowerCase())
  );
  const filteredProgs = progNames.filter(p =>
    !progSearch || p.toLowerCase().includes(progSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 bg-base-200 rounded-xl p-3">
      {/* 1. มหาวิทยาลัย */}
      <div className="relative">
        <label className="label py-0"><span className="label-text text-xs">🏛️ มหาวิทยาลัย</span></label>
        <input
          className="input input-bordered input-sm w-full"
          placeholder="พิมพ์ชื่อเพื่อค้นหา..."
          value={uniSearch}
          onChange={e => { setUniSearch(e.target.value); setShowUniDrop(true); setSelUni(''); }}
          onFocus={() => setShowUniDrop(true)}
          onBlur={() => setTimeout(() => setShowUniDrop(false), 150)}
        />
        {showUniDrop && (
          <div className="absolute z-50 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-0.5">
            {filteredUnis.length === 0
              ? <div className="px-3 py-2 text-xs opacity-50">ไม่พบ</div>
              : filteredUnis.map(u => (
                <div key={u.id} className="px-3 py-1.5 text-sm hover:bg-base-200 cursor-pointer"
                  onMouseDown={() => { setSelUni(String(u.id)); setUniSearch(u.name); setShowUniDrop(false); }}>
                  <span className="font-medium">{u.name}</span>
                  {u.short_name && <span className="text-xs opacity-50 ml-1">({u.short_name})</span>}
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* 2. วิทยาเขต — ถ้ามี >1 */}
      {selUni && campuses.length > 1 && (
        <div>
          <label className="label py-0"><span className="label-text text-xs">📍 วิทยาเขต</span></label>
          <select className="select select-bordered select-sm w-full" value={selCampus}
            onChange={e => setSelCampus(e.target.value)}>
            <option value="">-- เลือกวิทยาเขต --</option>
            {campuses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* 3. คณะ */}
      {faculties.length > 0 && (
        <div className="relative">
          <label className="label py-0"><span className="label-text text-xs">🏫 คณะ</span></label>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="พิมพ์ชื่อคณะ..."
            value={facSearch}
            onChange={e => { setFacSearch(e.target.value); setShowFacDrop(true); setSelFaculty(''); }}
            onFocus={() => setShowFacDrop(true)}
            onBlur={() => setTimeout(() => setShowFacDrop(false), 150)}
          />
          {showFacDrop && (
            <div className="absolute z-50 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-0.5">
              {filteredFacs.length === 0
                ? <div className="px-3 py-2 text-xs opacity-50">ไม่พบ</div>
                : filteredFacs.map(f => (
                  <div key={f} className="px-3 py-1.5 text-sm hover:bg-base-200 cursor-pointer"
                    onMouseDown={() => { setSelFaculty(f); setFacSearch(f); setShowFacDrop(false); }}>
                    {f}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* 4. กลุ่มสาขา (สาขา) — ถ้ามี >1 */}
      {selFaculty && groupFields.length > 1 && (
        <div>
          <label className="label py-0"><span className="label-text text-xs">📂 กลุ่มสาขา</span></label>
          <select className="select select-bordered select-sm w-full" value={selGroupField}
            onChange={e => setSelGroupField(e.target.value)}>
            <option value="">-- เลือกกลุ่มสาขา --</option>
            {groupFields.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      )}

      {/* 5. เอก (field_name) — ถ้ามี >1 */}
      {selFaculty && fields.length > 1 && (groupFields.length <= 1 || selGroupField) && (
        <div>
          <label className="label py-0"><span className="label-text text-xs">🎯 เอก / วิชาเอก</span></label>
          <select className="select select-bordered select-sm w-full" value={selField}
            onChange={e => setSelField(e.target.value)}>
            <option value="">-- เลือกวิชาเอก --</option>
            {fields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      )}

      {/* 6. หลักสูตร */}
      {progNames.length > 0 && (
        <div className="relative">
          <label className="label py-0"><span className="label-text text-xs">📋 หลักสูตร</span></label>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="พิมพ์ชื่อหลักสูตร..."
            value={progSearch}
            onChange={e => { setProgSearch(e.target.value); setShowProgDrop(true); setSelProgName(''); }}
            onFocus={() => setShowProgDrop(true)}
            onBlur={() => setTimeout(() => setShowProgDrop(false), 150)}
          />
          {showProgDrop && (
            <div className="absolute z-50 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-52 overflow-y-auto mt-0.5">
              {filteredProgs.length === 0
                ? <div className="px-3 py-2 text-xs opacity-50">ไม่พบ</div>
                : filteredProgs.map(p => (
                  <div key={p} className="px-3 py-1.5 text-sm hover:bg-base-200 cursor-pointer leading-snug"
                    onMouseDown={() => { setSelProgName(p); setProgSearch(p); setShowProgDrop(false); }}>
                    {p}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* 7. โปรแกรม (program_type) — ถ้ามี >1 */}
      {selProgName && progTypes.length > 1 && (
        <div>
          <label className="label py-0"><span className="label-text text-xs">🔖 โปรแกรม / ประเภท</span></label>
          <select className="select select-bordered select-sm w-full" value={selProgType}
            onChange={e => setSelProgType(e.target.value)}>
            <option value="">-- เลือกโปรแกรม --</option>
            {progTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Preview summary */}
      {canSave && (
        <div className="bg-success/10 rounded-lg px-3 py-2 text-xs space-y-0.5 border border-success/30">
          <div className="font-semibold text-sm">{uniSearch}</div>
          {selCampus && <div className="text-base-content/60">📍 {selCampus}</div>}
          <div className="text-base-content/70">{selFaculty}</div>
          {selGroupField && <div className="text-base-content/60">{selGroupField}{selField ? ` › ${selField}` : ''}</div>}
          {!selGroupField && selField && <div className="text-base-content/60">{selField}</div>}
          <div className="font-medium text-base-content/90 leading-snug">{selProgName}</div>
          {selProgType && <span className="badge badge-xs badge-outline">{selProgType}</span>}
        </div>
      )}

      {error && <p className="text-error text-xs">{error}</p>}
      <div className="flex gap-2 justify-end mt-1">
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>ยกเลิก</button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !canSave}>
          {saving && <span className="loading loading-spinner loading-xs" />} เพิ่ม
        </button>
      </div>
    </div>
  );
}

export default function StudentPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();

  // ── Quote ──
  const [quote, setQuote] = useState(user?.quote || '');
  const [editingQuote, setEditingQuote] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);

  // ── Photo ──
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(user?.photo_url || null);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const fileInputRef = useRef(null);

  // ── Toast ──
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Confirm Dialog ──
  const [dialog, setDialog] = useState(null); // { title, message, confirmLabel, confirmClass, onConfirm }
  const openDialog = useCallback((opts) => setDialog(opts), []);
  const closeDialog = () => setDialog(null);

  // ── Admission ──
  const [admissions, setAdmissions] = useState([]);
  const [loadingAdmissions, setLoadingAdmissions] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const hasConfirmed = admissions.some(a => a.confirmed);

  const loadAdmissions = () => {
    setLoadingAdmissions(true);
    api.get('/student/admissions')
      .then(r => setAdmissions(r.data || []))
      .catch(() => setAdmissions([]))
      .finally(() => setLoadingAdmissions(false));
  };

  useEffect(() => { loadAdmissions(); }, []);

  const handleAdmissionSaved = () => {
    setShowAddForm(false);
    loadAdmissions();
    showToast('เพิ่มมหาวิทยาลัยแล้ว ✅');
  };

  const handleDelete = (id) => {
    openDialog({
      title: '🗑️ ลบรายการ',
      message: 'ต้องการลบมหาวิทยาลัยนี้ออกจากรายการ?',
      confirmLabel: 'ลบ',
      confirmClass: 'btn-error',
      onConfirm: async () => {
        closeDialog();
        setDeletingId(id);
        try {
          await api.delete(`/student/admissions/${id}`);
          loadAdmissions();
          showToast('ลบแล้ว');
        } catch (err) {
          showToast(err.response?.data?.message || 'ลบไม่สำเร็จ', 'error');
        } finally { setDeletingId(null); }
      },
    });
  };

  const handleConfirm = (id) => {
    openDialog({
      title: '🎓 ยืนยันสิทธิ์',
      message: 'ต้องการยืนยันสิทธิ์ที่มหาวิทยาลัยนี้? ยังสามารถยกเลิกได้ภายหลัง',
      confirmLabel: 'ยืนยันสิทธิ์',
      confirmClass: 'btn-success',
      onConfirm: async () => {
        closeDialog();
        setConfirmingId(id);
        try {
          await api.post(`/student/admissions/${id}/confirm`);
          loadAdmissions();
          showToast('ยืนยันสิทธิ์เรียบร้อยแล้ว 🎉');
        } catch (err) {
          showToast(err.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
        } finally { setConfirmingId(null); }
      },
    });
  };

  const handleUnconfirm = (id) => {
    openDialog({
      title: '↩️ ยกเลิกการยืนยัน',
      message: 'ต้องการยกเลิกการยืนยันสิทธิ์?',
      confirmLabel: 'ยกเลิกยืนยัน',
      confirmClass: 'btn-warning',
      onConfirm: async () => {
        closeDialog();
        setConfirmingId(id);
        try {
          await api.post(`/student/admissions/${id}/unconfirm`);
          loadAdmissions();
          showToast('ยกเลิกการยืนยันแล้ว');
        } catch (err) {
          showToast(err.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
        } finally { setConfirmingId(null); }
      },
    });
  };
  const handleSaveQuote = async () => {
    setSavingQuote(true);
    try {
      await api.put('/student/profile/quote', { quote });
      const updated = { ...user, quote };
      login(updated, localStorage.getItem('token'));
      setEditingQuote(false);
      showToast('บันทึกคำคมสำเร็จ ✨');
    } catch {
      showToast('บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSavingQuote(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingPhoto(file);
  };

  const uploadPhotoFile = async (file) => {
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await api.post('/student/profile/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPhotoUrl(res.data.photo_url);
      login({ ...user, photo_url: res.data.photo_url }, localStorage.getItem('token'));
      showToast('อัปโหลดรูปสำเร็จ 🎉');
      setPendingPhoto(null);
    } catch {
      showToast('อัปโหลดรูปไม่สำเร็จ', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const deletePhoto = () => {
    openDialog({
      title: 'ลบรูปโปรไฟล์',
      message: 'ต้องการลบรูปนี้ใช่หรือไม่?',
      confirmLabel: 'ลบรูป',
      confirmClass: 'btn-error',
      onConfirm: async () => {
        closeDialog();
        setUploadingPhoto(true);
        try {
          await api.delete('/student/profile/photo');
          setPhotoUrl(null);
          login({ ...user, photo_url: null }, localStorage.getItem('token'));
          showToast('ลบรูปแล้ว');
        } catch {
          showToast('ลบรูปไม่สำเร็จ', 'error');
        } finally {
          setUploadingPhoto(false);
        }
      },
    });
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel}
        confirmClass={dialog?.confirmClass}
        onConfirm={dialog?.onConfirm}
        onCancel={closeDialog}
      />

      {/* Photo upload + background removal */}
      <PhotoUploadDialog
        key={pendingPhoto?.name + pendingPhoto?.lastModified}
        file={pendingPhoto}
        uploading={uploadingPhoto}
        onCancel={() => setPendingPhoto(null)}
        onConfirm={uploadPhotoFile}
      />

      {/* Toast */}
      {toast && (
        <div className="toast toast-top toast-end z-50">
          <div className={`alert ${toast.type === 'error' ? 'alert-error' : 'alert-success'} shadow-lg`}>
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Navbar */}
      <div className="navbar bg-base-100 shadow-sm px-4">
        <div className="flex-1">
          <span className="font-bold text-lg">🎓 GradTrack</span>
        </div>
        <div className="flex-none gap-2">
          <span className="text-sm text-base-content/60 hidden sm:block">
            {user?.class_level} ห้อง {user?.class_room}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>ออกจากระบบ</button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-10 flex flex-col items-center gap-6">

        {/* Photo */}
        <div className="relative">
          <div className="avatar cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-28 h-40 rounded-2xl ring ring-primary ring-offset-base-100 ring-offset-2 overflow-hidden bg-base-300 flex items-center justify-center">
              {photoUrl
                ? <img src={resolveMediaUrl(photoUrl)} alt="รูปโปรไฟล์" className="w-full h-full object-cover" />
                : <span className="text-5xl">🧑‍🎓</span>}
            </div>
          </div>
          <button
            className="absolute bottom-1 right-1 btn btn-circle btn-sm btn-primary shadow"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            title="เปลี่ยนรูปโปรไฟล์"
          >
            {uploadingPhoto ? <span className="loading loading-spinner loading-xs" /> : '📷'}
          </button>
          {photoUrl && (
            <button
              className="absolute bottom-1 left-1 btn btn-circle btn-sm btn-error shadow"
              onClick={deletePhoto}
              disabled={uploadingPhoto}
              title="ลบรูปโปรไฟล์"
            >
              🗑️
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>

        {/* Name */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">{user?.title_prefix}{user?.first_name} {user?.last_name}</h1>
          <p className="text-base-content/50 text-sm mt-1">
            รหัส {user?.username} · {user?.class_level} ห้อง {user?.class_room}
          </p>
        </div>

        {/* ── Admission Card ── */}
        <div className="card bg-base-100 shadow w-full">
          <div className="card-body gap-3">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">🏫 ผลการสอบคัดเลือก</h2>
              {!hasConfirmed && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowAddForm(v => !v)}
                >
                  {showAddForm ? '✕ ปิด' : '+ เพิ่ม'}
                </button>
              )}
            </div>

            {/* ฟอร์มเพิ่มใหม่ */}
            {showAddForm && (
              <AdmissionForm
                onSaved={handleAdmissionSaved}
                onCancel={() => setShowAddForm(false)}
              />
            )}

            {loadingAdmissions ? (
              <div className="flex justify-center py-4">
                <span className="loading loading-spinner loading-md" />
              </div>
            ) : admissions.length === 0 ? (
              <p className="text-base-content/30 text-sm italic">
                ยังไม่มีรายการ — กด + เพิ่ม เพื่อบันทึกผลสอบติด
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {admissions.map(a => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-xl p-3 ${a.confirmed ? 'bg-success/10 ring-1 ring-success' : 'bg-base-200'}`}
                  >
                    {/* Logo */}
                    <div className="w-10 h-10 flex-shrink-0">
                      {a.logo_url
                        ? <img src={resolveMediaUrl(a.logo_url)} alt="" className="w-10 h-10 object-contain rounded" />
                        : <div className="w-10 h-10 bg-base-300 rounded flex items-center justify-center text-lg">🏛️</div>}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{a.university_name}</p>
                      {a.campus && <p className="text-xs text-base-content/50 truncate">📍 {a.campus}</p>}
                      <p className="text-xs text-base-content/60 truncate">{a.faculty_name}</p>
                      {(a.group_field || a.field_name_th) && (
                        <p className="text-xs text-base-content/50 truncate">
                          {[a.group_field, a.field_name_th].filter(Boolean).join(' › ')}
                        </p>
                      )}
                      <p className="text-xs text-base-content/80 truncate font-medium leading-snug">{a.program_name_th}</p>
                      {a.program_type && (
                        <span className="badge badge-xs badge-outline opacity-60 mt-0.5">{a.program_type}</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {a.confirmed ? (
                        <>
                          <span className="badge badge-success badge-sm gap-1">✅ ยืนยันแล้ว</span>
                          <button
                            className="btn btn-ghost btn-xs text-warning"
                            onClick={() => handleUnconfirm(a.id)}
                            disabled={confirmingId === a.id}
                            title="ยกเลิกการยืนยัน"
                          >
                            {confirmingId === a.id
                              ? <span className="loading loading-spinner loading-xs" />
                              : '↩️'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-success btn-xs"
                            onClick={() => handleConfirm(a.id)}
                            disabled={confirmingId === a.id || hasConfirmed}
                            title="ยืนยันสิทธิ์ที่นี่"
                          >
                            {confirmingId === a.id
                              ? <span className="loading loading-spinner loading-xs" />
                              : '🎓 ยืนยัน'}
                          </button>
                          <button
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                            title="ลบรายการนี้"
                          >
                            {deletingId === a.id
                              ? <span className="loading loading-spinner loading-xs" />
                              : '🗑️'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Quote Card ── */}
        <div className="card bg-base-100 shadow w-full">
          <div className="card-body gap-3">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">💬 คำคมของฉัน</h2>
              {!editingQuote && (
                <button className="btn btn-ghost btn-xs" onClick={() => setEditingQuote(true)}>
                  ✏️ แก้ไข
                </button>
              )}
            </div>

            {editingQuote ? (
              <>
                <textarea
                  className="textarea textarea-bordered w-full resize-none"
                  rows={4}
                  maxLength={300}
                  placeholder="เขียนคำคม คติประจำใจ หรือความฝันของคุณ..."
                  value={quote}
                  onChange={e => setQuote(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-base-content/40 text-right">{quote.length}/300</p>
                <div className="flex gap-2 justify-end">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setQuote(user?.quote || ''); setEditingQuote(false); }}
                    disabled={savingQuote}
                  >ยกเลิก</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveQuote} disabled={savingQuote}>
                    {savingQuote && <span className="loading loading-spinner loading-sm" />}
                    บันทึก
                  </button>
                </div>
              </>
            ) : (
              <p className="text-base-content/70 italic whitespace-pre-wrap min-h-[3rem]">
                {quote || (
                  <span className="text-base-content/30 not-italic">
                    ยังไม่มีคำคม — กด แก้ไข เพื่อเพิ่ม
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

