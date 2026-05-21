import { useEffect, useState, useMemo, useRef } from 'react';
import api from '../../utils/api';

const EMPTY_FORM = { name: '', short_name: '', logo_url: '' };

export default function UniversitiesPage() {
  const [unis, setUnis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  const fileRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Load ───────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/universities');
      setUnis(res.data);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ─── Filter ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return unis;
    const q = search.toLowerCase();
    return unis.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.short_name || '').toLowerCase().includes(q)
    );
  }, [unis, search]);

  // ─── Modal helpers ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoPreview('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditTarget(u);
    setForm({ name: u.name, short_name: u.short_name || '', logo_url: u.logo_url || '' });
    setLogoFile(null);
    setLogoPreview(u.logo_url || '');
    setFormError('');
    setModalOpen(true);
  };

  // ─── Logo file select ────────────────────────────────────────────────────
  const handleLogoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
    setForm((f) => ({ ...f, logo_url: '' }));
  };

  // ─── Save ────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('กรุณากรอกชื่อมหาวิทยาลัย'); return; }
    setSaving(true);
    setFormError('');
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('short_name', form.short_name.trim());
      if (logoFile) {
        fd.append('logo', logoFile);
      } else {
        fd.append('logo_url', form.logo_url.trim());
      }

      if (editTarget) {
        await api.put(`/universities/${editTarget.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showToast('แก้ไขสำเร็จ ✅');
      } else {
        await api.post('/universities', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showToast('เพิ่มมหาวิทยาลัยสำเร็จ ✅');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/universities/${deleteTarget.id}`);
      showToast('ลบสำเร็จ');
      setDeleteTarget(null);
      load();
    } catch {
      showToast('ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Sync ────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.post('/universities/sync');
      setSyncResult({ ok: true, ...res.data });
      load();
    } catch (err) {
      setSyncResult({ ok: false, message: err.response?.data?.message || 'Sync ไม่สำเร็จ' });
    } finally {
      setSyncing(false);
    }
  };

  // ─── Logo preview component ──────────────────────────────────────────────
  const LogoImg = ({ src, size = 8 }) =>
    src ? (
      <img
        src={src}
        alt="logo"
        className={`w-${size} h-${size} object-contain rounded`}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    ) : (
      <div className={`w-${size} h-${size} rounded bg-base-200 flex items-center justify-center text-base-content/30 text-xs`}>
        🏛️
      </div>
    );

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className="toast toast-top toast-end z-50">
          <div className={`alert alert-${toast.type === 'error' ? 'error' : 'success'} py-2 text-sm`}>
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold">🏛️ มหาวิทยาลัย</h2>
          <p className="text-xs text-base-content/50">จัดการรายชื่อมหาวิทยาลัย · ชื่อย่อ · โลโก้</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-outline btn-sm gap-1"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <span className="loading loading-spinner loading-xs" /> : '🔄'}
            Sync จากเว็บ
          </button>
          <button className="btn btn-primary btn-sm gap-1" onClick={openCreate}>
            ➕ เพิ่มมหาวิทยาลัย
          </button>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div
          className={`alert ${syncResult.ok ? 'alert-success' : 'alert-error'} mb-4 py-3 text-sm`}
        >
          <div className="flex-1">
            {syncResult.ok ? (
              <>
                <p>✅ {syncResult.message}</p>
                <p className="text-xs mt-1 opacity-80">
                  เพิ่มใหม่ <strong>{syncResult.added}</strong> รายการ · มีอยู่แล้ว <strong>{syncResult.skipped}</strong> รายการ · ทั้งหมด {syncResult.total} รายการ
                </p>
                {syncResult.warnings?.length > 0 && (
                  <p className="text-xs mt-1 opacity-60">⚠️ {syncResult.warnings.join(' | ')}</p>
                )}
              </>
            ) : (
              <p>❌ {syncResult.message}</p>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setSyncResult(null)}>✕</button>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 ค้นหาชื่อหรือชื่อย่อ..."
        className="input input-bordered input-sm w-full max-w-xs mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Stats */}
      {!loading && (
        <p className="text-xs text-base-content/40 mb-3">
          🏛️ ทั้งหมด {unis.length} แห่ง · แสดง {filtered.length} รายการ
        </p>
      )}

      {/* Table */}
      <div className="card bg-base-100 shadow-sm overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr className="text-xs text-base-content/60 uppercase tracking-wide">
              <th>#</th>
              <th>🖼️ โลโก้</th>
              <th>🏛️ ชื่อมหาวิทยาลัย</th>
              <th>🔤 ชื่อย่อ</th>
              <th className="text-right">⚙️ จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-base-content/40">
                  <span className="loading loading-spinner loading-sm mr-2" />
                  กำลังโหลด...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-base-content/30">
                  {unis.length === 0 ? 'ยังไม่มีข้อมูล กด Sync หรือเพิ่มเอง' : 'ไม่พบผลการค้นหา'}
                </td>
              </tr>
            ) : (
              filtered.map((u, i) => (
                <tr key={u.id}>
                  <td className="text-base-content/40 text-xs">{i + 1}</td>
                  <td>
                    <LogoImg src={u.logo_url} size={8} />
                  </td>
                  <td className="font-medium max-w-xs truncate">{u.name}</td>
                  <td>
                    {u.short_name ? (
                      <span className="badge badge-outline badge-sm font-mono">{u.short_name}</span>
                    ) : (
                      <span className="text-base-content/30 text-xs">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(u)}>
                        ✏️ แก้ไข
                      </button>
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => setDeleteTarget(u)}
                      >
                        🗑️ ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Modal Create/Edit ─── */}
      {modalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">{editTarget ? '✏️' : '🏛️'}</span>
              <div>
                <h3 className="font-semibold text-base leading-tight">
                  {editTarget ? 'แก้ไขมหาวิทยาลัย' : 'เพิ่มมหาวิทยาลัย'}
                </h3>
                {editTarget && (
                  <p className="text-xs text-base-content/50">{editTarget.short_name || editTarget.name}</p>
                )}
              </div>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* Logo preview + upload */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">🖼️ โลโก้</label>
                <div className="flex items-center gap-3">
                  {/* Preview */}
                  <div className="w-16 h-16 rounded-lg bg-base-200 flex items-center justify-center border border-base-300 overflow-hidden flex-shrink-0">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="preview"
                        className="w-full h-full object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-2xl">🏛️</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    {/* File upload */}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoSelect}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-xs w-fit"
                      onClick={() => fileRef.current.click()}
                    >
                      📁 อัปโหลดรูป
                    </button>
                    <span className="text-xs text-base-content/40">หรือใส่ URL</span>
                    <input
                      type="url"
                      className="input input-bordered input-xs"
                      placeholder="https://..."
                      value={form.logo_url}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, logo_url: e.target.value }));
                        setLogoFile(null);
                        setLogoPreview(e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* ชื่อ + ชื่อย่อ */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">🏛️ ชื่อมหาวิทยาลัย *</label>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  placeholder="เช่น มหาวิทยาลัยเชียงใหม่"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">
                  🔤 ชื่อย่อ <span className="font-normal text-base-content/40">(ไม่บังคับ)</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered input-sm font-mono"
                  placeholder="เช่น มช."
                  value={form.short_name}
                  onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
                />
              </div>

              {formError && (
                <div className="alert alert-error py-2 text-xs">⚠️ {formError}</div>
              )}

              <div className="modal-action mt-1">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  {editTarget ? '💾 บันทึก' : '✨ เพิ่ม'}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setModalOpen(false)} />
        </div>
      )}

      {/* ─── Modal Delete ─── */}
      {deleteTarget && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg">🗑️ ยืนยันการลบ</h3>
            <p className="py-3 text-sm">
              ต้องการลบ{' '}
              <span className="font-semibold text-error">{deleteTarget.name}</span>{' '}
              ใช่หรือไม่?
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-error btn-sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <span className="loading loading-spinner loading-xs" /> : '🗑️'}
                ลบ
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDeleteTarget(null)} />
        </div>
      )}

      {/* ─── Sync Loading Overlay ─── */}
      {syncing && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center">
          <div className="card bg-base-100 p-8 flex flex-col items-center gap-3 shadow-xl">
            <span className="loading loading-spinner loading-lg text-primary" />
            <p className="font-medium text-sm">กำลัง Sync ข้อมูลจาก Wikipedia...</p>
            <p className="text-xs text-base-content/50">อาจใช้เวลาสักครู่</p>
          </div>
        </div>
      )}
    </div>
  );
}
