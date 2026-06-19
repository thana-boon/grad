import { useEffect, useState, useMemo, useRef } from 'react';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const TYPE_BADGE = {
  'ทปอ.':    'badge-primary',
  'ราชภัฏ':  'badge-secondary',
  'ราชมงคล': 'badge-accent',
  'เอกชน':   'badge-ghost',
};

export default function UniversitiesPage() {
  const [unis, setUnis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ name: '', short_name: '', logo_url: '' });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Import Excel
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importConfirm, setImportConfirm] = useState(null); // เก็บ File object รอ confirm

  // Clear all
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Sync logos
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncConfirm, setSyncConfirm] = useState(false); // false | 'missing' | 'all'

  const fileRef = useRef(null);
  const excelRef = useRef(null);
  const previewUrlRef = useRef(null); // เก็บ object URL ปัจจุบันไว้ revoke คืนหน่วยความจำ

  // ตั้งค่า preview เป็น object URL พร้อม revoke อันเก่า (กัน memory leak → renderer crash)
  const setPreviewObjectUrl = (url) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
  };

  // ย่อรูปโลโก้ฝั่ง client ก่อนอัปโหลด — กัน browser decode บิตแมปก้อนใหญ่จนแท็บแครช
  const downscaleImage = (file, max = 256) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > max || height > max) {
        const scale = Math.min(max / width, max / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('แปลงรูปไม่สำเร็จ')),
        'image/png'
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ไฟล์รูปไม่ถูกต้อง')); };
    img.src = url;
  });

  // คืนหน่วยความจำตอน component ถูกถอด
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

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

  const filtered = useMemo(() => {
    if (!search) return unis;
    const q = search.toLowerCase();
    return unis.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.name_en || '').toLowerCase().includes(q) ||
      (u.short_name || '').toLowerCase().includes(q)
    );
  }, [unis, search]);

  // ─── Logo file select ────────────────────────────────────────────────────
  const handleLogoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const blob = await downscaleImage(file, 256); // ย่อก่อน เก็บเฉพาะรูปเล็ก
      setLogoFile(blob);
      const objUrl = URL.createObjectURL(blob);
      setPreviewObjectUrl(objUrl);
      setLogoPreview(objUrl);
      setForm(f => ({ ...f, logo_url: '' }));
    } catch (err) {
      setFormError(err.message || 'ไม่สามารถอ่านไฟล์รูปได้');
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: '', short_name: '', logo_url: '', university_type: '' });
    setLogoFile(null); setPreviewObjectUrl(null); setLogoPreview(''); setFormError('');
    if (fileRef.current) fileRef.current.value = '';
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditTarget(u);
    setForm({ name: u.name, short_name: u.short_name || '', logo_url: u.logo_url || '', university_type: u.university_type || '' });
    setLogoFile(null); setPreviewObjectUrl(null); setLogoPreview(resolveMediaUrl(u.logo_url || '')); setFormError('');
    if (fileRef.current) fileRef.current.value = '';
    setModalOpen(true);
  };

  // ปิด modal + เคลียร์รูป/หน่วยความจำ/ค่าใน input
  const closeModal = () => {
    setModalOpen(false);
    setLogoFile(null); setPreviewObjectUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('กรุณากรอกชื่อมหาวิทยาลัย'); return; }
    setSaving(true); setFormError('');
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('short_name', form.short_name.trim());
      fd.append('university_type', form.university_type.trim());
      if (logoFile) fd.append('logo', logoFile, 'logo.png');
      else fd.append('logo_url', form.logo_url.trim());

      if (editTarget) {
        await api.put(`/universities/${editTarget.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        showToast('แก้ไขสำเร็จ ✅');
      } else {
        await api.post('/universities', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        showToast('เพิ่มมหาวิทยาลัยสำเร็จ ✅');
      }
      closeModal(); load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/universities/${deleteTarget.id}`);
      showToast('ลบสำเร็จ');
      setDeleteTarget(null); load();
    } catch { showToast('ลบไม่สำเร็จ', 'error'); }
    finally { setDeleting(false); }
  };

  // ─── Import Excel ─────────────────────────────────────────────────────────
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setImportConfirm(file); // เปิด modal confirm
  };

  const doImport = async (file) => {
    setImportConfirm(null);
    setImporting(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/universities/import-excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setImportResult({ ok: true, ...res.data });
      load();
    } catch (err) {
      setImportResult({ ok: false, message: err.response?.data?.message || 'Import ไม่สำเร็จ', examples: err.response?.data?.examples || [] });
    } finally { setImporting(false); }
  };

  const LogoImg = ({ src }) =>
    src ? (
      <img src={resolveMediaUrl(src)} alt="logo" className="w-8 h-8 object-contain rounded"
        width={32} height={32} loading="lazy" decoding="async"
        onError={e => { e.target.style.display = 'none'; }} />
    ) : (
      <div className="w-8 h-8 rounded bg-base-200 flex items-center justify-center text-base-content/30 text-xs">🏛️</div>
    );

  return (
    <div className="relative">
      {toast && (
        <div className="toast toast-top toast-end z-50">
          <div className={`alert alert-${toast.type === 'error' ? 'error' : 'success'} py-2 text-sm`}>{toast.msg}</div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold">🏛️ มหาวิทยาลัย</h2>
          <p className="text-xs text-base-content/50">จัดการรายชื่อมหาวิทยาลัย · โลโก้ · นำเข้าจาก Excel</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Primary action */}
          <button className="btn btn-primary btn-sm gap-1" onClick={openCreate}>
            ➕ เพิ่มเอง
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-base-300" />

          {/* Import group */}
          <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <button
            className="btn btn-outline btn-sm gap-1"
            onClick={() => excelRef.current.click()}
            disabled={importing || clearing}
          >
            {importing ? <span className="loading loading-spinner loading-xs" /> : '📥'}
            Import Excel
          </button>
          <a
            href="/api/universities/sample-excel"
            download
            className="btn btn-ghost btn-sm gap-1 text-base-content/60"
          >
            📋 ตัวอย่าง Excel
          </a>

          {/* Divider */}
          <div className="w-px h-6 bg-base-300" />

          {/* Utility */}
          <button
            className="btn btn-ghost btn-sm gap-1"
            onClick={() => { setSyncResult(null); setSyncConfirm('missing'); }}
            disabled={syncing || importing || clearing}
          >
            {syncing ? <span className="loading loading-spinner loading-xs" /> : '🖼️'}
            ซิงค์โลโก้
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-base-300" />

          {/* Danger */}
          <button
            className="btn btn-error btn-outline btn-sm gap-1"
            onClick={() => setClearConfirm(true)}
            disabled={clearing || importing || syncing}
          >
            {clearing ? <span className="loading loading-spinner loading-xs" /> : '🗑️'}
            ล้างข้อมูล
          </button>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={`alert ${syncResult.found > 0 ? 'alert-success' : 'alert-info'} mb-4 py-3 text-sm`}>
          <div className="flex-1">
            <p>🖼️ {syncResult.message}</p>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setSyncResult(null)}>✕</button>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className={`alert ${importResult.ok ? 'alert-success' : 'alert-error'} mb-4 py-3 text-sm`}>
          <div className="flex-1">
            {importResult.ok ? (
              <>
                <p>✅ {importResult.message}</p>
                <p className="text-xs mt-1 opacity-80">
                  🏛️ มหาวิทยาลัย <strong>{importResult.universities}</strong> แห่ง ·
                  📚 คณะ <strong>{importResult.faculties}</strong> คณะ ·
                  📋 หลักสูตร <strong>{importResult.programs}</strong> หลักสูตร
                </p>
              </>
            ) : (
              <>
                <p>❌ {importResult.message}</p>
                {importResult.examples?.length > 0 && (
                  <div className="mt-2 text-xs opacity-80">
                    <p className="font-semibold mb-1">ตัวอย่างสาขาซ้ำ (5 รายการแรก):</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {importResult.examples.map((ex, i) => (
                        <li key={i}>{ex.university} › {ex.faculty} › {ex.program}{ex.campus !== '-' ? ` (${ex.campus})` : ''}{ex.type !== '-' ? ` [${ex.type}]` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setImportResult(null)}>✕</button>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 ค้นหาชื่อไทย / อังกฤษ / ชื่อย่อ..."
        className="input input-bordered input-sm w-full max-w-sm mb-4"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

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
              <th>โลโก้</th>
              <th>ชื่อมหาวิทยาลัย</th>
              <th>ประเภท</th>
              <th>ชื่อย่อ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-base-content/40">
                <span className="loading loading-spinner loading-sm mr-2" />กำลังโหลด...
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-base-content/30">
                {unis.length === 0 ? 'ยังไม่มีข้อมูล กด "Import Excel" เพื่อนำเข้าข้อมูล' : 'ไม่พบผลการค้นหา'}
              </td></tr>
            ) : filtered.map((u, i) => (
              <tr key={u.id}>
                <td className="text-base-content/40 text-xs">{i + 1}</td>
                <td><LogoImg src={u.logo_url} /></td>
                <td>
                  <div className="font-medium text-sm max-w-xs truncate">{u.name}</div>
                  {u.name_en && <div className="text-xs text-base-content/40 truncate max-w-xs">{u.name_en}</div>}
                </td>
                <td>
                  {u.university_type ? (
                    <span className={`badge badge-sm ${TYPE_BADGE[u.university_type] || 'badge-outline'}`}>
                      {u.university_type}
                    </span>
                  ) : <span className="text-base-content/30 text-xs">—</span>}
                </td>
                <td>
                  {u.short_name
                    ? <span className="badge badge-outline badge-sm font-mono">{u.short_name}</span>
                    : <span className="text-base-content/30 text-xs">—</span>}
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(u)}>✏️ แก้ไข</button>
                    <button className="btn btn-ghost btn-xs text-error" onClick={() => setDeleteTarget(u)}>🗑️ ลบ</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Create/Edit */}
      {modalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-semibold text-base mb-4">
              {editTarget ? '✏️ แก้ไขมหาวิทยาลัย' : '🏛️ เพิ่มมหาวิทยาลัย'}
            </h3>
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* Logo */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">🖼️ โลโก้</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-base-200 flex items-center justify-center border border-base-300 overflow-hidden flex-shrink-0">
                    {logoPreview
                      ? <img src={logoPreview} alt="preview" className="w-full h-full object-contain" width={64} height={64} decoding="async" onError={e => { e.target.style.display = 'none'; }} />
                      : <span className="text-2xl">🏛️</span>}
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                    <button type="button" className="btn btn-outline btn-xs w-fit" onClick={() => fileRef.current.click()}>
                      📁 อัปโหลดรูป
                    </button>
                    <span className="text-xs text-base-content/40">หรือใส่ URL</span>
                    <input
                      type="text"
                      className="input input-bordered input-xs"
                      placeholder="https://..."
                      value={form.logo_url}
                      onChange={e => { setForm(f => ({ ...f, logo_url: e.target.value })); setLogoFile(null); setPreviewObjectUrl(null); setLogoPreview(e.target.value); }}
                    />
                  </div>
                </div>
              </div>
              {/* ชื่อไทย */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">🏛️ ชื่อภาษาไทย *</label>
                <input
                  type="text" className="input input-bordered input-sm"
                  placeholder="เช่น มหาวิทยาลัยเชียงใหม่"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              {/* ชื่อย่อ */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">
                  🔤 ชื่อย่อ <span className="font-normal text-base-content/40">(ไม่บังคับ)</span>
                </label>
                <input
                  type="text" className="input input-bordered input-sm font-mono"
                  placeholder="เช่น มช."
                  value={form.short_name}
                  onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                />
              </div>
              {/* ประเภท */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">
                  🏷️ ประเภท <span className="font-normal text-base-content/40">(ไม่บังคับ)</span>
                </label>
                <select
                  className="select select-bordered select-sm"
                  value={form.university_type}
                  onChange={e => setForm(f => ({ ...f, university_type: e.target.value }))}
                >
                  <option value="">— ไม่ระบุ —</option>
                  <option value="ทปอ.">ทปอ. (มหาวิทยาลัยรัฐ)</option>
                  <option value="ราชภัฏ">ราชภัฏ</option>
                  <option value="ราชมงคล">ราชมงคล</option>
                  <option value="เอกชน">เอกชน</option>
                  <option value="สมทบ">สมทบ</option>
                </select>
              </div>
              {formError && <div className="alert alert-error py-2 text-xs">⚠️ {formError}</div>}
              <div className="modal-action mt-1">
                <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  {editTarget ? '💾 บันทึก' : '✨ เพิ่ม'}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={closeModal} />
        </div>
      )}

      {/* Modal Delete (single uni) */}
      {deleteTarget && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg">🗑️ ยืนยันการลบ</h3>
            <p className="py-3 text-sm">
              ต้องการลบ <span className="font-semibold text-error">{deleteTarget.name}</span> ใช่หรือไม่?
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>ยกเลิก</button>
              <button className="btn btn-error btn-sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <span className="loading loading-spinner loading-xs" /> : '🗑️'} ลบ
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDeleteTarget(null)} />
        </div>
      )}

      {/* Modal Sync Logos Confirm */}
      {syncConfirm && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg">🖼️ ซิงค์โลโก้มหาวิทยาลัย</h3>
            <div className="py-4 space-y-3 text-sm">
              <p>ระบบจะค้นหาโลโก้จาก <strong>Wikipedia (ภาษาไทย)</strong> ตามชื่อมหาวิทยาลัย</p>
              <p className="text-base-content/60">อาจใช้เวลาสักครู่ขึ้นอยู่กับจำนวนมหาวิทยาลัย</p>
              <div className="form-control">
                <label className="label cursor-pointer gap-3 justify-start">
                  <input type="radio" className="radio radio-sm" checked={syncConfirm === 'missing'}
                    onChange={() => setSyncConfirm('missing')} />
                  <span>เฉพาะที่ยังไม่มีโลโก้</span>
                </label>
                <label className="label cursor-pointer gap-3 justify-start">
                  <input type="radio" className="radio radio-sm" checked={syncConfirm === 'all'}
                    onChange={() => setSyncConfirm('all')} />
                  <span>ทั้งหมด (แทนที่โลโก้เดิมด้วย)</span>
                </label>
              </div>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setSyncConfirm(false)}>ยกเลิก</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  const force = syncConfirm === 'all';
                  setSyncConfirm(false);
                  setSyncing(true); setSyncResult(null);
                  try {
                    const res = await api.post('/universities/sync-logos', { force }, { timeout: 300000 });
                    setSyncResult(res.data);
                    load();
                  } catch (err) {
                    setSyncResult({ found: 0, message: err.response?.data?.message || 'ซิงค์ไม่สำเร็จ' });
                  } finally { setSyncing(false); }
                }}
              >
                🖼️ เริ่มซิงค์
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setSyncConfirm(false)} />
        </div>
      )}

      {/* Modal Import Excel Confirm */}
      {importConfirm && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg">📥 ยืนยันการนำเข้าข้อมูล</h3>
            <div className="py-4 space-y-2 text-sm">
              <p>ไฟล์: <span className="font-mono font-semibold">{importConfirm.name}</span></p>
              <p>การดำเนินการนี้จะ<strong>ลบและแทนที่</strong>ข้อมูลทั้งหมด:</p>
              <ul className="list-none space-y-1 text-base-content/70 pl-2">
                <li>🏛️ มหาวิทยาลัย ทุกแห่ง</li>
                <li>🏫 คณะ ทุกคณะ</li>
                <li>📚 หลักสูตร / สาขา ทุกรายการ</li>
                <li>🖼️ โลโก้ทุกไฟล์</li>
              </ul>
              <p className="text-warning font-medium">ยืนยันหรือไม่?</p>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setImportConfirm(null)}>ยกเลิก</button>
              <button className="btn btn-primary btn-sm" onClick={() => doImport(importConfirm)}>
                📥 นำเข้าข้อมูล
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setImportConfirm(null)} />
        </div>
      )}

      {/* Modal Clear All */}
      {clearConfirm && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg text-error">⚠️ ล้างข้อมูลทั้งหมด</h3>
            <div className="py-4 space-y-2 text-sm">
              <p>การดำเนินการนี้จะ<strong>ลบถาวร</strong>ทั้งหมด:</p>
              <ul className="list-none space-y-1 text-base-content/70 pl-2">
                <li>🏛️ มหาวิทยาลัย ทุกแห่ง</li>
                <li>🏫 คณะ ทุกคณะ</li>
                <li>📚 หลักสูตร / สาขา ทุกรายการ</li>
                <li>🖼️ โลโก้ทุกไฟล์</li>
              </ul>
              <p className="text-error font-medium mt-2">ไม่สามารถกู้คืนได้ ยืนยันหรือไม่?</p>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setClearConfirm(false)} disabled={clearing}>
                ยกเลิก
              </button>
              <button
                className="btn btn-error btn-sm"
                disabled={clearing}
                onClick={async () => {
                  setClearing(true); setImportResult(null);
                  try {
                    await api.delete('/universities/clear-all');
                    setUnis([]);
                    setClearConfirm(false);
                    showToast('ล้างข้อมูลทั้งหมดสำเร็จ');
                  } catch (err) {
                    showToast(err.response?.data?.message || 'ล้างข้อมูลไม่สำเร็จ', 'error');
                    setClearConfirm(false);
                  } finally { setClearing(false); }
                }}
              >
                {clearing ? <span className="loading loading-spinner loading-xs" /> : '🗑️'}
                ล้างข้อมูลทั้งหมด
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !clearing && setClearConfirm(false)} />
        </div>
      )}
    </div>
  );
}
