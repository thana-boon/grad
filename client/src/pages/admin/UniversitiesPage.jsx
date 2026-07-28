import { useEffect, useState, useMemo, useRef } from 'react';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import Icon from '../../components/ui/Icon';
import { PageHeader, TableWrap, TableSkeleton, EmptyState, Tag, Toast } from '../../components/ui';

// โทนของ Tag ต่อประเภทมหาวิทยาลัย (ดู Tag ใน components/ui)
const TYPE_BADGE = {
  'ทปอ.':    'primary',
  'ราชภัฏ':  'navy',
  'ราชมงคล': 'gold',
  'เอกชน':   'muted',
  'สมทบ':    'muted',
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
        showToast('แก้ไขสำเร็จ');
      } else {
        await api.post('/universities', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        showToast('เพิ่มมหาวิทยาลัยสำเร็จ');
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

  // ─── ดาวน์โหลดไฟล์ตัวอย่าง ────────────────────────────────────────────────
  // ต้องยิงผ่าน api (axios) ไม่ใช่ <a href download> เพราะ endpoint นี้ต้องใช้ JWT
  // ซึ่ง <a> ไม่ได้แนบ header ไปด้วย (ที่ผ่านมาจึงได้ 401 กลับมาเป็นไฟล์)
  // ผลพลอยได้: baseURL ของ api พา prefix /gradtrack ไปให้เอง ไม่ต้อง hardcode path
  const downloadSample = async () => {
    try {
      const res = await api.get('/universities/sample-excel', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'university_import_sample.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('ดาวน์โหลดไฟล์ตัวอย่างไม่สำเร็จ', 'error');
    }
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

  return (
    <div className="relative">
      <Toast toast={toast} />

      <PageHeader
        icon="university"
        title="มหาวิทยาลัย"
        subtitle="จัดการรายชื่อมหาวิทยาลัย · โลโก้ · นำเข้าจาก Excel"
      >
        <button className="btn btn-primary btn-sm gap-1.5" onClick={openCreate}>
          <Icon name="plus" size={15} />
          เพิ่มเอง
        </button>

        <span className="h-6 w-px bg-base-300" aria-hidden="true" />

        <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
        <button
          className="btn btn-outline btn-sm gap-1.5"
          onClick={() => excelRef.current.click()}
          disabled={importing || clearing}
        >
          {importing ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Icon name="upload" size={15} />
          )}
          นำเข้า Excel
        </button>
        <button type="button" onClick={downloadSample} className="btn btn-ghost btn-sm gap-1.5">
          <Icon name="download" size={15} />
          ไฟล์ตัวอย่าง
        </button>

        <span className="h-6 w-px bg-base-300" aria-hidden="true" />

        <button
          className="btn btn-ghost btn-sm gap-1.5"
          onClick={() => { setSyncResult(null); setSyncConfirm('missing'); }}
          disabled={syncing || importing || clearing}
        >
          {syncing ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Icon name="image" size={15} />
          )}
          ซิงค์โลโก้
        </button>

        <button
          className="btn btn-ghost btn-sm gap-1.5 text-error hover:bg-error/10"
          onClick={() => setClearConfirm(true)}
          disabled={clearing || importing || syncing}
        >
          {clearing ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Icon name="trash" size={15} />
          )}
          ล้างข้อมูล
        </button>
      </PageHeader>

      <div aria-live="polite">
        {/* ผลการซิงค์โลโก้ */}
        {syncResult && (
          <div className={`alert anim-scale-in mb-4 ${syncResult.found > 0 ? 'alert-success' : 'alert-info'}`}>
            <Icon name={syncResult.found > 0 ? 'checkCircle' : 'info'} size={17} className="mt-px" />
            <p className="flex-1 text-sm">{syncResult.message}</p>
            <button
              className="btn btn-ghost btn-xs px-1.5"
              onClick={() => setSyncResult(null)}
              aria-label="ปิดข้อความ"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* ผลการนำเข้า */}
        {importResult && (
          <div className={`alert anim-scale-in mb-4 ${importResult.ok ? 'alert-success' : 'alert-error'}`}>
            <Icon name={importResult.ok ? 'checkCircle' : 'alert'} size={17} className="mt-px" />
            <div className="min-w-0 flex-1 text-sm">
              <p>{importResult.message}</p>
              {importResult.ok ? (
                <p className="mt-1 text-xs opacity-80">
                  มหาวิทยาลัย <strong className="tabular-nums">{importResult.universities}</strong> แห่ง ·
                  คณะ <strong className="tabular-nums">{importResult.faculties}</strong> คณะ ·
                  หลักสูตร <strong className="tabular-nums">{importResult.programs}</strong> หลักสูตร
                </p>
              ) : (
                importResult.examples?.length > 0 && (
                  <div className="mt-2 text-xs opacity-85">
                    <p className="mb-1 font-semibold">ตัวอย่างสาขาซ้ำ (5 รายการแรก):</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {importResult.examples.map((ex, i) => (
                        <li key={i}>
                          {ex.university} › {ex.faculty} › {ex.program}
                          {ex.campus !== '-' ? ` (${ex.campus})` : ''}
                          {ex.type !== '-' ? ` [${ex.type}]` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
            <button
              className="btn btn-ghost btn-xs px-1.5"
              onClick={() => setImportResult(null)}
              aria-label="ปิดข้อความ"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ค้นหา */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
          />
          <input
            type="text"
            placeholder="ค้นหาชื่อไทย / อังกฤษ / ชื่อย่อ..."
            className="input input-sm w-full pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="ค้นหามหาวิทยาลัย"
          />
        </div>
        {!loading && (
          <p className="text-xs text-base-content/55">
            ทั้งหมด <span className="font-medium tabular-nums text-base-content">{unis.length}</span> แห่ง
            {filtered.length !== unis.length && (
              <> · แสดง <span className="tabular-nums">{filtered.length}</span> รายการ</>
            )}
          </p>
        )}
      </div>

      {/* ตาราง */}
      <TableWrap sticky className="anim-fade-up">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th className="w-14">โลโก้</th>
              <th>ชื่อมหาวิทยาลัย</th>
              <th>ประเภท</th>
              <th>ชื่อย่อ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={8} cols={6} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState
                    icon={unis.length === 0 ? 'university' : 'search'}
                    title={unis.length === 0 ? 'ยังไม่มีข้อมูลมหาวิทยาลัย' : 'ไม่พบผลการค้นหา'}
                    hint={
                      unis.length === 0
                        ? 'นำเข้าจากไฟล์ Excel ทีเดียวทั้งชุด หรือกด เพิ่มเอง เพื่อสร้างทีละรายการ'
                        : 'ลองเปลี่ยนคำค้นหา หรือดูรายการทั้งหมด'
                    }
                    action={
                      unis.length === 0 && (
                        <button
                          className="btn btn-primary btn-sm gap-1.5"
                          onClick={() => excelRef.current.click()}
                        >
                          <Icon name="upload" size={15} />
                          นำเข้า Excel
                        </button>
                      )
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((u, i) => (
                <tr key={u.id}>
                  <td className="text-xs tabular-nums text-base-content/40">{i + 1}</td>
                  <td>
                    {u.logo_url ? (
                      <img
                        src={resolveMediaUrl(u.logo_url)}
                        alt=""
                        className="size-8 rounded-lg object-contain"
                        width={32}
                        height={32}
                        loading="lazy"
                        decoding="async"
                        onError={e => { e.target.style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <span className="gt-chip size-8">
                        <Icon name="university" size={16} />
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="max-w-xs truncate text-sm font-medium">{u.name}</div>
                    {u.name_en && (
                      <div className="max-w-xs truncate text-xs text-base-content/45">{u.name_en}</div>
                    )}
                  </td>
                  <td>
                    {u.university_type ? (
                      <Tag tone={TYPE_BADGE[u.university_type] || 'muted'}>{u.university_type}</Tag>
                    ) : (
                      <span className="text-xs text-base-content/30">—</span>
                    )}
                  </td>
                  <td>
                    {u.short_name ? (
                      <span className="badge badge-ghost badge-sm font-mono">{u.short_name}</span>
                    ) : (
                      <span className="text-xs text-base-content/30">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-ghost btn-xs gap-1" onClick={() => openEdit(u)}>
                        <Icon name="edit" size={13} />
                        แก้ไข
                      </button>
                      <button
                        className="btn btn-ghost btn-xs gap-1 text-error"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Icon name="trash" size={13} />
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrap>

      {/* Modal Create/Edit */}
      {modalOpen && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-md">
            <div className="mb-5 flex items-center gap-3">
              <span className="gt-chip size-10">
                <Icon name={editTarget ? 'edit' : 'university'} size={20} />
              </span>
              <h3 className="text-base font-semibold">
                {editTarget ? 'แก้ไขมหาวิทยาลัย' : 'เพิ่มมหาวิทยาลัย'}
              </h3>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* โลโก้ */}
              <div>
                <span className="label">โลโก้</span>
                <div className="flex items-center gap-3">
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-base-300 bg-base-200">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="ตัวอย่างโลโก้"
                        className="h-full w-full object-contain"
                        width={64}
                        height={64}
                        decoding="async"
                        onError={e => { e.target.style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <Icon name="university" size={24} className="text-base-content/30" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                    <button
                      type="button"
                      className="btn btn-outline btn-xs w-fit gap-1"
                      onClick={() => fileRef.current.click()}
                    >
                      <Icon name="upload" size={13} />
                      อัปโหลดรูป
                    </button>
                    <span className="text-xs text-base-content/45">หรือใส่ URL</span>
                    <input
                      type="text"
                      className="input input-xs"
                      placeholder="https://..."
                      value={form.logo_url}
                      onChange={e => {
                        setForm(f => ({ ...f, logo_url: e.target.value }));
                        setLogoFile(null);
                        setPreviewObjectUrl(null);
                        setLogoPreview(e.target.value);
                      }}
                      aria-label="URL โลโก้"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="uni-name" className="label">
                  ชื่อภาษาไทย <span className="text-error">*</span>
                </label>
                <input
                  id="uni-name"
                  type="text"
                  className="input input-sm w-full"
                  placeholder="เช่น มหาวิทยาลัยเชียงใหม่"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label htmlFor="uni-short" className="label">
                  ชื่อย่อ <span className="font-normal text-base-content/45">(ไม่บังคับ)</span>
                </label>
                <input
                  id="uni-short"
                  type="text"
                  className="input input-sm w-full font-mono"
                  placeholder="เช่น มช."
                  value={form.short_name}
                  onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="uni-type" className="label">
                  ประเภท <span className="font-normal text-base-content/45">(ไม่บังคับ)</span>
                </label>
                <select
                  id="uni-type"
                  className="select select-sm w-full"
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

              <div aria-live="polite">
                {formError && (
                  <div className="alert alert-error py-2">
                    <Icon name="alert" size={15} className="mt-px" />
                    <span className="text-xs">{formError}</span>
                  </div>
                )}
              </div>

              <div className="modal-action mt-1">
                <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal}>
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
          <button className="modal-backdrop" aria-label="ปิด" onClick={closeModal} />
        </div>
      )}

      {/* Modal Delete (single uni) */}
      {deleteTarget && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/10 text-error">
                <Icon name="trash" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">ยืนยันการลบ</h3>
                <p className="mt-1 text-sm text-base-content/65">
                  ลบ <span className="font-semibold text-error">{deleteTarget.name}</span> ใช่หรือไม่?
                </p>
              </div>
            </div>
            <div className="modal-action mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>ยกเลิก</button>
              <button className="btn btn-error btn-sm gap-1.5" onClick={handleDelete} disabled={deleting}>
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

      {/* Modal Sync Logos Confirm */}
      {syncConfirm && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="gt-chip size-10">
                <Icon name="image" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">ซิงค์โลโก้มหาวิทยาลัย</h3>
                <p className="mt-1 text-sm text-base-content/65">
                  ระบบจะค้นหาโลโก้จาก <strong>Wikipedia (ภาษาไทย)</strong> ตามชื่อมหาวิทยาลัย
                  อาจใช้เวลาสักครู่ขึ้นอยู่กับจำนวนรายการ
                </p>
              </div>
            </div>

            <fieldset className="mt-4 flex flex-col gap-1">
              <legend className="sr-only">ขอบเขตการซิงค์</legend>
              {[
                { key: 'missing', label: 'เฉพาะที่ยังไม่มีโลโก้', hint: 'ปลอดภัย ไม่แตะของเดิม' },
                { key: 'all', label: 'ทั้งหมด', hint: 'แทนที่โลโก้เดิมด้วย' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    syncConfirm === opt.key
                      ? 'border-primary/40 bg-primary/8'
                      : 'border-base-300 hover:bg-secondary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="sync-scope"
                    className="radio radio-sm radio-primary mt-0.5"
                    checked={syncConfirm === opt.key}
                    onChange={() => setSyncConfirm(opt.key)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-xs text-base-content/55">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setSyncConfirm(false)}>ยกเลิก</button>
              <button
                className="btn btn-primary btn-sm gap-1.5"
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
                <Icon name="refresh" size={15} />
                เริ่มซิงค์
              </button>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setSyncConfirm(false)} />
        </div>
      )}

      {/* Modal Import Excel Confirm */}
      {importConfirm && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F5C518]/20 text-[#8a6a00]">
                <Icon name="warning" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">ยืนยันการนำเข้าข้อมูล</h3>
                <p className="mt-1 truncate font-mono text-xs text-base-content/55">
                  {importConfirm.name}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm">
              การนำเข้าจะ<strong>ลบและแทนที่</strong>ข้อมูลเดิมทั้งหมด:
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-base-content/70">
              {[
                { icon: 'university', text: 'มหาวิทยาลัย ทุกแห่ง' },
                { icon: 'faculty', text: 'คณะ ทุกคณะ' },
                { icon: 'clipboard', text: 'หลักสูตร / สาขา ทุกรายการ' },
                { icon: 'image', text: 'โลโก้ทุกไฟล์' },
              ].map((it) => (
                <li key={it.text} className="flex items-center gap-2">
                  <Icon name={it.icon} size={14} className="text-base-content/45" />
                  {it.text}
                </li>
              ))}
            </ul>

            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setImportConfirm(null)}>ยกเลิก</button>
              <button className="btn btn-primary btn-sm gap-1.5" onClick={() => doImport(importConfirm)}>
                <Icon name="upload" size={15} />
                นำเข้าข้อมูล
              </button>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setImportConfirm(null)} />
        </div>
      )}

      {/* Modal Clear All */}
      {clearConfirm && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/10 text-error">
                <Icon name="warning" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-error">ล้างข้อมูลทั้งหมด</h3>
                <p className="mt-1 text-sm text-base-content/65">
                  การดำเนินการนี้จะ<strong>ลบถาวร</strong> และกู้คืนไม่ได้
                </p>
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-1.5 text-sm text-base-content/70">
              {[
                { icon: 'university', text: 'มหาวิทยาลัย ทุกแห่ง' },
                { icon: 'faculty', text: 'คณะ ทุกคณะ' },
                { icon: 'clipboard', text: 'หลักสูตร / สาขา ทุกรายการ' },
                { icon: 'image', text: 'โลโก้ทุกไฟล์' },
              ].map((it) => (
                <li key={it.text} className="flex items-center gap-2">
                  <Icon name={it.icon} size={14} className="text-base-content/45" />
                  {it.text}
                </li>
              ))}
            </ul>

            <div className="modal-action">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setClearConfirm(false)}
                disabled={clearing}
              >
                ยกเลิก
              </button>
              <button
                className="btn btn-error btn-sm gap-1.5"
                disabled={clearing}
                onClick={async () => {
                  setClearing(true); setImportResult(null);
                  try {
                    await api.delete('/universities/clear-all');
                    setUnis([]);
                    setClearConfirm(false);
                    showToast('ล้างข้อมูลทั้งหมดแล้ว');
                  } catch (err) {
                    showToast(err.response?.data?.message || 'ล้างข้อมูลไม่สำเร็จ', 'error');
                    setClearConfirm(false);
                  } finally { setClearing(false); }
                }}
              >
                {clearing ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Icon name="trash" size={15} />
                )}
                ล้างข้อมูลทั้งหมด
              </button>
            </div>
          </div>
          <button
            className="modal-backdrop"
            aria-label="ปิด"
            onClick={() => !clearing && setClearConfirm(false)}
          />
        </div>
      )}
    </div>
  );
}
