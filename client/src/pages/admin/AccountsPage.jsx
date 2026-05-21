import { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';

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

  const roleBadge = (role) =>
    role === 'admin'
      ? 'badge badge-primary badge-sm'
      : 'badge badge-ghost badge-sm';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold">👥 จัดการ account</h2>
          <p className="text-xs text-base-content/50">สร้าง · แก้ไข · ลบ · นำเข้า csv</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button
            className="btn btn-outline btn-sm gap-1"
            onClick={() => fileRef.current.click()}
            disabled={importing}
          >
            {importing ? <span className="loading loading-spinner loading-xs" /> : '📂'}
            นำเข้า csv
          </button>
          <button className="btn btn-primary btn-sm gap-1" onClick={openCreate}>
            ✨ สร้าง account
          </button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className="alert alert-info mb-4">
          <div>
            <p className="font-medium">{importResult.message}</p>
            {importResult.errors?.length > 0 && (
              <ul className="text-sm mt-1 list-disc list-inside">
                {importResult.errors.map((e, i) => (
                  <li key={i}>{e.username}: {e.reason}</li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setImportResult(null)}>✕</button>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 ค้นหา username, ชื่อ, role..."
        className="input input-bordered input-sm w-full max-w-sm mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="card bg-base-100 shadow-sm overflow-x-auto">
        <table className="table table-zebra table-sm">
          <thead>
            <tr className="text-xs text-base-content/60 uppercase tracking-wide">
              <th>#</th>
              <th>👤 username</th>
              <th>📝 ชื่อ</th>
              <th>🏷️ role</th>
              <th>📧 email</th>
              <th>📅 วันที่สร้าง</th>
              <th className="text-right">⚙️ จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8">
                  <span className="loading loading-spinner loading-md" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-base-content/50">
                  ไม่พบข้อมูล
                </td>
              </tr>
            ) : (
              filtered.map((u, i) => (
                <tr key={u.id}>
                  <td className="text-base-content/50">{i + 1}</td>
                  <td className="font-medium">{u.username}</td>
                  <td>{u.name}</td>
                  <td><span className={roleBadge(u.role)}>{u.role}</span></td>
                  <td className="text-base-content/60">{u.email || '—'}</td>
                  <td className="text-base-content/60 text-sm">
                    {new Date(u.created_at).toLocaleDateString('th-TH')}
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
        <div className="px-4 py-2 text-xs text-base-content/40">
          👥 ทั้งหมด {filtered.length} account
        </div>
      </div>

      {/* ─── Modal: สร้าง / แก้ไข ─── */}
      {modalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            {/* Header */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">{editTarget ? '✏️' : '✨'}</span>
              <div>
                <h3 className="font-semibold text-base leading-tight">
                  {editTarget ? `แก้ไข account` : 'สร้าง account ใหม่'}
                </h3>
                {editTarget && (
                  <p className="text-xs text-base-content/50">@{editTarget.username}</p>
                )}
              </div>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* row 1: username + role */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-base-content/70">
                    👤 username *
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    placeholder="เช่น student01"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-base-content/70">
                    🏷️ role *
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="student">🎓 student</option>
                    <option value="admin">🔧 admin</option>
                  </select>
                </div>
              </div>

              {/* password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">
                  🔒 password{' '}
                  {editTarget && (
                    <span className="font-normal text-base-content/40">(เว้นว่างหากไม่เปลี่ยน)</span>
                  )}
                  {!editTarget && '*'}
                </label>
                <input
                  type="password"
                  className="input input-bordered input-sm"
                  placeholder={editTarget ? '••••••••' : 'กรอกรหัสผ่าน'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editTarget}
                />
              </div>

              {/* ชื่อ */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">
                  📝 ชื่อ-นามสกุล *
                </label>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  placeholder="เช่น นักเรียน ทดสอบ"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              {/* email */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-base-content/70">
                  📧 email <span className="font-normal text-base-content/40">(ไม่บังคับ)</span>
                </label>
                <input
                  type="email"
                  className="input input-bordered input-sm"
                  placeholder="example@school.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
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
                  {editTarget ? '💾 บันทึก' : '✨ สร้าง account'}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setModalOpen(false)} />
        </div>
      )}

      {/* ─── Modal: ยืนยันลบ ─── */}
      {deleteTarget && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg">🗑️ ยืนยันการลบ</h3>
            <p className="py-4">
              ต้องการลบ account{' '}
              <span className="font-bold text-error">@{deleteTarget.username}</span> ใช่หรือไม่?
              <br />
              <span className="text-sm text-base-content/60">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-error" onClick={handleDelete} disabled={deleting}>
                {deleting && <span className="loading loading-spinner loading-sm" />}
                ลบ Account
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDeleteTarget(null)} />
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="toast toast-end toast-bottom z-50">
          <div className={`alert ${toast.type === 'error' ? 'alert-error' : 'alert-success'}`}>
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
