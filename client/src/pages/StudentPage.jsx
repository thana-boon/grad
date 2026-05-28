import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

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

// ── Admission Add Form (cascade dropdowns) ────────────────────────────────────
function AdmissionForm({ onSaved, onCancel }) {
  const [unis, setUnis] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selUni, setSelUni] = useState('');
  const [selFaculty, setSelFaculty] = useState('');
  const [selProgram, setSelProgram] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uniSearch, setUniSearch] = useState('');
  const [showUniDropdown, setShowUniDropdown] = useState(false);
  const [facSearch, setFacSearch] = useState('');
  const [showFacDropdown, setShowFacDropdown] = useState(false);
  const [progSearch, setProgSearch] = useState('');
  const [showProgDropdown, setShowProgDropdown] = useState(false);

  useEffect(() => { api.get('/universities').then(r => setUnis(r.data || [])); }, []);

  useEffect(() => {
    setFaculties([]); setSelFaculty(''); setFacSearch(''); setPrograms([]); setSelProgram(''); setProgSearch('');
    if (!selUni) return;
    api.get('/faculties', { params: { university_id: selUni } }).then(r => setFaculties(r.data || []));
  }, [selUni]);

  useEffect(() => {
    setPrograms([]); setSelProgram(''); setProgSearch('');
    if (!selFaculty) return;
    api.get('/faculties/programs', { params: { faculty_id: selFaculty } }).then(r => setPrograms(r.data || []));
  }, [selFaculty]);

  const handleSave = async () => {
    if (!selUni || !selFaculty || !selProgram) { setError('กรุณาเลือกให้ครบ'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/student/admissions', {
        university_id: Number(selUni),
        faculty_id: Number(selFaculty),
        program_id: Number(selProgram),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-3 bg-base-200 rounded-xl p-3">
      <div className="relative">
        <input
          className="input input-bordered input-sm w-full"
          placeholder="🏛️ พิมพ์เพื่อค้นหามหาวิทยาลัย"
          value={uniSearch}
          onChange={e => { setUniSearch(e.target.value); setShowUniDropdown(true); setSelUni(''); }}
          onFocus={() => setShowUniDropdown(true)}
          onBlur={() => setTimeout(() => setShowUniDropdown(false), 150)}
        />
        {showUniDropdown && (
          <div className="absolute z-50 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-52 overflow-y-auto mt-1">
            {unis.filter(u => u.name.toLowerCase().includes(uniSearch.toLowerCase())).length === 0
              ? <div className="px-3 py-2 text-sm opacity-50">ไม่พบมหาวิทยาลัย</div>
              : unis.filter(u => u.name.toLowerCase().includes(uniSearch.toLowerCase())).map(u => (
                <div
                  key={u.id}
                  className="px-3 py-2 text-sm hover:bg-base-200 cursor-pointer"
                  onMouseDown={() => { setSelUni(String(u.id)); setUniSearch(u.name); setShowUniDropdown(false); }}
                >
                  {u.name}
                </div>
              ))
            }
          </div>
        )}
      </div>
      <div className="relative">
        <input
          className="input input-bordered input-sm w-full"
          placeholder="📚 พิมพ์เพื่อค้นหาคณะ"
          value={facSearch}
          disabled={!selUni || !faculties.length}
          onChange={e => { setFacSearch(e.target.value); setShowFacDropdown(true); setSelFaculty(''); }}
          onFocus={() => setShowFacDropdown(true)}
          onBlur={() => setTimeout(() => setShowFacDropdown(false), 150)}
        />
        {showFacDropdown && faculties.length > 0 && (
          <div className="absolute z-50 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-52 overflow-y-auto mt-1">
            {faculties.filter(f => f.name.toLowerCase().includes(facSearch.toLowerCase())).length === 0
              ? <div className="px-3 py-2 text-sm opacity-50">ไม่พบคณะ</div>
              : faculties.filter(f => f.name.toLowerCase().includes(facSearch.toLowerCase())).map(f => (
                <div
                  key={f.id}
                  className="px-3 py-2 text-sm hover:bg-base-200 cursor-pointer"
                  onMouseDown={() => { setSelFaculty(String(f.id)); setFacSearch(f.name); setShowFacDropdown(false); }}
                >
                  {f.name}
                </div>
              ))
            }
          </div>
        )}
      </div>
      <div className="relative">
        <input
          className="input input-bordered input-sm w-full"
          placeholder="🔬 พิมพ์เพื่อค้นหาสาขา"
          value={progSearch}
          disabled={!selFaculty || !programs.length}
          onChange={e => { setProgSearch(e.target.value); setShowProgDropdown(true); setSelProgram(''); }}
          onFocus={() => setShowProgDropdown(true)}
          onBlur={() => setTimeout(() => setShowProgDropdown(false), 150)}
        />
        {showProgDropdown && programs.length > 0 && (
          <div className="absolute z-50 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-52 overflow-y-auto mt-1">
            {programs.filter(p => p.name.toLowerCase().includes(progSearch.toLowerCase())).length === 0
              ? <div className="px-3 py-2 text-sm opacity-50">ไม่พบสาขา</div>
              : programs.filter(p => p.name.toLowerCase().includes(progSearch.toLowerCase())).map(p => (
                <div
                  key={p.id}
                  className="px-3 py-2 text-sm hover:bg-base-200 cursor-pointer"
                  onMouseDown={() => { setSelProgram(String(p.id)); setProgSearch(p.name); setShowProgDropdown(false); }}
                >
                  {p.name}
                </div>
              ))
            }
          </div>
        )}
      </div>
      {error && <p className="text-error text-xs">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>ยกเลิก</button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !selUni || !selFaculty || !selProgram}>
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

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
    } catch {
      showToast('อัปโหลดรูปไม่สำเร็จ', 'error');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
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
                ? <img src={photoUrl} alt="รูปโปรไฟล์" className="w-full h-full object-cover" />
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
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>

        {/* Name */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">{user?.first_name} {user?.last_name}</h1>
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
                        ? <img src={a.logo_url} alt="" className="w-10 h-10 object-contain rounded" />
                        : <div className="w-10 h-10 bg-base-300 rounded flex items-center justify-center text-lg">🏛️</div>}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{a.university_name}</p>
                      <p className="text-xs text-base-content/60 truncate">{a.faculty_name} · {a.program_name}</p>
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

