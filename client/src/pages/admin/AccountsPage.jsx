import { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import Icon from '../../components/ui/Icon';
import { PageHeader, TableWrap, TableSkeleton, EmptyState, Tag, Toast } from '../../components/ui';

const EMPTY_FORM = { username: '', password: '', name: '', role: 'student', email: '' };

export default function AccountsPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = create mode
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Import CSV
  const fileRef = useRef();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── โหลดรายชื่อ ─────────────────────────────────────────────
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // ─── Filter ──────────────────────────────────────────────────
  const filtered = users.filter((u) =>
    [u.username, u.name, u.role].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  // ─── Open modal ──────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditTarget(user);
    setForm({ username: user.username, password: '', name: user.name, role: user.role, email: user.email || '' });
    setFormError('');
    setModalOpen(true);
  };

  // ─── Submit form ─────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editTarget) {
        await api.put(`/users/${editTarget.id}`, form);
        showToast('อัปเดต account สำเร็จ');
      } else {
        await api.post('/users', form);
        showToast('สร้าง account สำเร็จ');
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ──────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      showToast('ลบ account สำเร็จ');
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Import CSV ──────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/users/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'นำเข้าไม่สำเร็จ', 'error');
    } finally {
      setImporting(false);
      fileRef.current.value = '';
    }
  };

  return (
    <div>
      <Toast toast={toast} />

      <PageHeader
        icon="users"
        title="จัดการ Account"
        subtitle="สร้าง · แก้ไข · ลบ · นำเข้าจากไฟล์ CSV"
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
        <button
          className="btn btn-outline btn-sm gap-1.5"
          onClick={() => fileRef.current.click()}
          disabled={importing}
        >
          {importing ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Icon name="upload" size={15} />
          )}
          นำเข้า CSV
        </button>
        <button className="btn btn-primary btn-sm gap-1.5" onClick={openCreate}>
          <Icon name="userPlus" size={15} />
          สร้าง Account
        </button>
      </PageHeader>

      {/* ผลการนำเข้า */}
      {importResult && (
        <div className="alert alert-info anim-scale-in mb-4">
          <Icon name="info" size={18} className="mt-px" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{importResult.message}</p>
            {importResult.errors?.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs">
                {importResult.errors.map((e, i) => (
                  <li key={i}>{e.username}: {e.reason}</li>
                ))}
              </ul>
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

      {/* ค้นหา */}
      <div className="relative mb-4 max-w-sm">
        <Icon
          name="search"
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
        />
        <input
          type="text"
          placeholder="ค้นหา username, ชื่อ, role..."
          className="input input-sm w-full pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="ค้นหา account"
        />
      </div>

      {/* ตาราง */}
      <TableWrap className="anim-fade-up">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>Username</th>
              <th>ชื่อ-นามสกุล</th>
              <th>Role</th>
              <th>Email</th>
              <th>วันที่สร้าง</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon="users"
                    title={search ? 'ไม่พบ account ที่ค้นหา' : 'ยังไม่มี account'}
                    hint={
                      search
                        ? 'ลองเปลี่ยนคำค้นหา หรือดูรายการทั้งหมด'
                        : 'กดปุ่ม สร้าง Account เพื่อเพิ่มผู้ใช้คนแรก'
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((u, i) => (
                <tr key={u.id}>
                  <td className="text-xs tabular-nums text-base-content/40">{i + 1}</td>
                  <td className="font-mono text-xs font-medium">{u.username}</td>
                  <td>{u.name}</td>
                  <td>
                    <Tag
                      tone={u.role === 'admin' ? 'primary' : 'muted'}
                      icon={u.role === 'admin' ? 'shield' : 'graduation'}
                    >
                      {u.role}
                    </Tag>
                  </td>
                  <td className="text-base-content/60">{u.email || '—'}</td>
                  <td className="whitespace-nowrap text-xs text-base-content/55">
                    {new Date(u.created_at).toLocaleDateString('th-TH')}
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
        {!loading && filtered.length > 0 && (
          <div className="border-t border-base-300 px-4 py-2.5 text-xs text-base-content/50">
            ทั้งหมด <span className="font-medium tabular-nums">{filtered.length}</span> account
          </div>
        )}
      </TableWrap>

      {/* ─── Modal: สร้าง / แก้ไข ─── */}
      {modalOpen && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-md">
            <div className="mb-5 flex items-center gap-3">
              <span className="gt-chip size-10">
                <Icon name={editTarget ? 'edit' : 'userPlus'} size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-tight">
                  {editTarget ? 'แก้ไข Account' : 'สร้าง Account ใหม่'}
                </h3>
                {editTarget && (
                  <p className="truncate text-xs text-base-content/50">@{editTarget.username}</p>
                )}
              </div>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="acc-username" className="label">
                    Username <span className="text-error">*</span>
                  </label>
                  <input
                    id="acc-username"
                    type="text"
                    className="input input-sm w-full"
                    placeholder="เช่น student01"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="acc-role" className="label">
                    Role <span className="text-error">*</span>
                  </label>
                  <select
                    id="acc-role"
                    className="select select-sm w-full"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="student">นักเรียน (student)</option>
                    <option value="admin">ผู้ดูแลระบบ (admin)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="acc-password" className="label">
                  Password{' '}
                  {editTarget ? (
                    <span className="font-normal text-base-content/45">(เว้นว่างหากไม่เปลี่ยน)</span>
                  ) : (
                    <span className="text-error">*</span>
                  )}
                </label>
                <input
                  id="acc-password"
                  type="password"
                  className="input input-sm w-full"
                  placeholder={editTarget ? '••••••••' : 'กรอกรหัสผ่าน'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  required={!editTarget}
                />
              </div>

              <div>
                <label htmlFor="acc-name" className="label">
                  ชื่อ-นามสกุล <span className="text-error">*</span>
                </label>
                <input
                  id="acc-name"
                  type="text"
                  className="input input-sm w-full"
                  placeholder="เช่น นักเรียน ทดสอบ"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label htmlFor="acc-email" className="label">
                  Email <span className="font-normal text-base-content/45">(ไม่บังคับ)</span>
                </label>
                <input
                  id="acc-email"
                  type="email"
                  className="input input-sm w-full"
                  placeholder="example@school.ac.th"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="off"
                />
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setModalOpen(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary btn-sm gap-1.5" disabled={saving}>
                  {saving ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Icon name={editTarget ? 'save' : 'plus'} size={15} />
                  )}
                  {editTarget ? 'บันทึก' : 'สร้าง Account'}
                </button>
              </div>
            </form>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setModalOpen(false)} />
        </div>
      )}

      {/* ─── Modal: ยืนยันลบ ─── */}
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
                  ลบ account{' '}
                  <span className="font-semibold text-error">@{deleteTarget.username}</span> ใช่หรือไม่?
                  การลบไม่สามารถย้อนกลับได้
                </p>
              </div>
            </div>
            <div className="modal-action mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-error btn-sm gap-1.5" onClick={handleDelete} disabled={deleting}>
                {deleting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Icon name="trash" size={15} />
                )}
                ลบ Account
              </button>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setDeleteTarget(null)} />
        </div>
      )}
    </div>
  );
}
