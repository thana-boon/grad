import { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api';
import Icon from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import {
  PageHeader,
  SectionTitle,
  TableWrap,
  TableSkeleton,
  EmptyState,
  Tag,
  Toast,
} from '../../components/ui';

// ครูทั้งหมดมาจาก SchoolOS — หน้านี้ไม่ได้สร้างบัญชีให้ใคร แค่เลือกว่าใครเข้าได้
// และเข้ามาแล้วมีสิทธิ์แค่ไหน (รหัสผ่านยังเป็นของ SchoolOS เสมอ)
const ROLE_LABELS = {
  admin: 'ผู้ดูแล (แก้ไขได้)',
  teacher: 'ครู (ดูอย่างเดียว)',
};

export default function AccountsPage() {
  const { user } = useAuth();

  const [members, setMembers] = useState([]);
  const [gateActive, setGateActive] = useState(false);
  const [localUsers, setLocalUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // ─── หน้าต่างเพิ่มครู ─────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [newRole, setNewRole] = useState('teacher');
  const [saving, setSaving] = useState(false);

  // ─── ยืนยันถอดสิทธิ์ / ลบบัญชีสำรอง ──────────────────────────
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [deleteLocalTarget, setDeleteLocalTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const errMsg = (err, fallback) => err.response?.data?.message || fallback;

  // ─── โหลดข้อมูล ──────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [staffRes, usersRes] = await Promise.all([
        api.get('/staff'),
        // บัญชีสำรองพังไม่ควรทำให้ทั้งหน้าว่าง — ส่วนหลักคือรายชื่อครู
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      setMembers(staffRes.data.members || []);
      setGateActive(staffRes.data.gateActive);
      setLocalUsers(usersRes.data || []);
    } catch (err) {
      showToast(errMsg(err, 'โหลดข้อมูลไม่สำเร็จ'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.teacher_code, m.name, m.email, m.subject_group].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }, [members, search]);

  // คนที่ล็อกอินอยู่ — ห้ามถอดสิทธิ์/ลดสิทธิ์ตัวเอง (server กันอีกชั้น)
  const isSelf = (m) => user?.source === 'schoolos' && String(user.username) === String(m.teacher_code);
  const adminCount = members.filter((m) => m.role === 'admin').length;

  // ─── เปิดหน้าต่างเลือกครู ────────────────────────────────────
  const openPicker = async () => {
    setPickerOpen(true);
    setSelected(new Set());
    setPickerSearch('');
    setNewRole('teacher');
    setTeachersError('');
    setTeachersLoading(true);
    try {
      const res = await api.get('/staff/available');
      setTeachers(res.data.teachers || []);
    } catch (err) {
      setTeachersError(errMsg(err, 'ดึงรายชื่อครูจาก SchoolOS ไม่ได้'));
    } finally {
      setTeachersLoading(false);
    }
  };

  const pickerList = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) =>
      [t.teacher_code, t.name, t.subject_group].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }, [teachers, pickerSearch]);

  const selectableList = pickerList.filter((t) => !t.added);
  const allSelected = selectableList.length > 0 && selectableList.every((t) => selected.has(t.teacher_code));

  const toggle = (code) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectableList.forEach((t) => next.delete(t.teacher_code));
      else selectableList.forEach((t) => next.add(t.teacher_code));
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await api.post('/staff', {
        members: [...selected].map((code) => ({ teacher_code: code, role: newRole })),
      });
      const { added = [], errors = [], message } = res.data;

      // บางคนเพิ่มไม่ผ่าน (เช่น เพิ่งลาออกจาก SchoolOS ระหว่างที่หน้าต่างเปิดค้างไว้)
      // → คาหน้าต่างไว้พร้อมบอกว่าใครไม่ผ่าน ไม่ใช่ปิดไปเงียบ ๆ แล้วผู้ใช้เพิ่งมารู้ทีหลัง
      if (errors.length > 0) {
        setTeachersError(
          `เพิ่มไม่สำเร็จ ${errors.length} คน: ` +
            errors.map((e) => `${e.teacher_code} (${e.reason})`).join(', ')
        );
        if (added.length > 0) showToast(message);
      } else {
        setPickerOpen(false);
        showToast(message);
      }
      fetchAll();
    } catch (err) {
      setTeachersError(errMsg(err, 'เพิ่มครูไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  };

  // ─── เปลี่ยนสิทธิ์ ───────────────────────────────────────────
  const handleRoleChange = async (member, role) => {
    const before = members;
    // อัปเดตหน้าจอก่อน แล้วค่อยย้อนกลับถ้า server ปฏิเสธ — dropdown ที่ค้าง
    // รอ network ทุกครั้งใช้งานจริงแล้วสะดุด
    setMembers((prev) =>
      prev.map((m) => (m.teacher_code === member.teacher_code ? { ...m, role } : m))
    );
    try {
      await api.patch(`/staff/${encodeURIComponent(member.teacher_code)}`, { role });
      showToast(`เปลี่ยนสิทธิ์ของ ${member.name || member.teacher_code} แล้ว`);
    } catch (err) {
      setMembers(before);
      showToast(errMsg(err, 'เปลี่ยนสิทธิ์ไม่สำเร็จ'), 'error');
    }
  };

  // ─── ถอดสิทธิ์ ───────────────────────────────────────────────
  const handleRevoke = async () => {
    setBusy(true);
    try {
      await api.delete(`/staff/${encodeURIComponent(revokeTarget.teacher_code)}`);
      showToast('ถอดสิทธิ์เรียบร้อย');
      setRevokeTarget(null);
      fetchAll();
    } catch (err) {
      showToast(errMsg(err, 'ถอดสิทธิ์ไม่สำเร็จ'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLocal = async () => {
    setBusy(true);
    try {
      await api.delete(`/users/${deleteLocalTarget.id}`);
      showToast('ลบบัญชีสำรองแล้ว');
      setDeleteLocalTarget(null);
      fetchAll();
    } catch (err) {
      showToast(errMsg(err, 'ลบไม่สำเร็จ'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Toast toast={toast} />

      <PageHeader
        icon="users"
        title="จัดการผู้ใช้งาน"
        subtitle="เลือกครูจาก SchoolOS ที่ให้เข้าใช้ระบบ และกำหนดสิทธิ์ของแต่ละคน"
      >
        <button className="btn btn-primary btn-sm gap-1.5" onClick={openPicker}>
          <Icon name="userPlus" size={15} />
          เพิ่มครูเข้าระบบ
        </button>
      </PageHeader>

      {/* รายชื่อว่าง = ยังไม่เปิดใช้ allowlist — ต้องบอกให้ชัดว่าตอนนี้ยังไม่มีอะไรกันอยู่ */}
      {!loading && !gateActive && (
        <div className="alert alert-warning anim-scale-in mb-4">
          <Icon name="warning" size={18} className="mt-px" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">ยังไม่ได้กำหนดรายชื่อ — ตอนนี้ครูทุกคนใน SchoolOS ล็อกอินเข้าระบบได้</p>
            <p className="mt-0.5 text-xs opacity-80">
              เมื่อเพิ่มครูคนแรกเข้ารายชื่อ ระบบจะเริ่มกันคนที่ไม่อยู่ในรายชื่อทันที
              — อย่าลืมเพิ่มตัวเองเป็นผู้ดูแลด้วย ไม่อย่างนั้นจะเข้ามาแก้รายชื่อไม่ได้อีก
            </p>
          </div>
        </div>
      )}

      {/* ─── รายชื่อครูที่เข้าใช้ระบบได้ ─── */}
      <SectionTitle icon="shield">ครูที่เข้าใช้ระบบได้</SectionTitle>

      <div className="relative mb-4 max-w-sm">
        <Icon
          name="search"
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
        />
        <input
          type="text"
          placeholder="ค้นหารหัสครู, ชื่อ, กลุ่มสาระ..."
          className="input input-sm w-full pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="ค้นหาครูในรายชื่อ"
        />
      </div>

      <TableWrap className="anim-fade-up">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>รหัสครู</th>
              <th>ชื่อ-นามสกุล</th>
              <th>กลุ่มสาระ</th>
              <th className="w-52">สิทธิ์</th>
              <th>เพิ่มโดย</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon="users"
                    title={search ? 'ไม่พบครูที่ค้นหา' : 'ยังไม่มีใครในรายชื่อ'}
                    hint={
                      search
                        ? 'ลองเปลี่ยนคำค้นหา'
                        : 'กดปุ่ม เพิ่มครูเข้าระบบ แล้วเลือกจากรายชื่อครูของ SchoolOS'
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((m, i) => {
                const self = isSelf(m);
                const lastAdmin = m.role === 'admin' && adminCount <= 1;
                return (
                  <tr key={m.teacher_code}>
                    <td className="text-xs tabular-nums text-base-content/40">{i + 1}</td>
                    <td className="font-mono text-xs font-medium">{m.teacher_code}</td>
                    <td>
                      {m.name || '—'}
                      {self && (
                        <span className="ml-1.5 text-xs text-base-content/45">(คุณ)</span>
                      )}
                      {m.email && (
                        <p className="text-xs text-base-content/50">{m.email}</p>
                      )}
                    </td>
                    <td className="text-base-content/60">{m.subject_group || '—'}</td>
                    <td>
                      <select
                        className="select select-xs w-full"
                        value={m.role}
                        disabled={self || lastAdmin}
                        title={
                          self
                            ? 'ลดสิทธิ์ของตัวเองไม่ได้'
                            : lastAdmin
                              ? 'ต้องมีผู้ดูแลอย่างน้อย 1 คน'
                              : undefined
                        }
                        onChange={(e) => handleRoleChange(m, e.target.value)}
                        aria-label={`สิทธิ์ของ ${m.name || m.teacher_code}`}
                      >
                        <option value="teacher">{ROLE_LABELS.teacher}</option>
                        <option value="admin">{ROLE_LABELS.admin}</option>
                      </select>
                    </td>
                    <td className="whitespace-nowrap text-xs text-base-content/55">
                      {m.added_by || '—'}
                      <p className="text-base-content/40">
                        {new Date(m.created_at).toLocaleDateString('th-TH')}
                      </p>
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-xs gap-1 text-error"
                        onClick={() => setRevokeTarget(m)}
                        disabled={self || lastAdmin}
                      >
                        <Icon name="xCircle" size={13} />
                        ถอดสิทธิ์
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="border-t border-base-300 px-4 py-2.5 text-xs text-base-content/50">
            ทั้งหมด <span className="font-medium tabular-nums">{filtered.length}</span> คน
            {' · '}ผู้ดูแล <span className="font-medium tabular-nums">{adminCount}</span> คน
          </div>
        )}
      </TableWrap>

      {/* ─── บัญชีสำรอง (local) ─── */}
      <div className="mt-10">
        <SectionTitle icon="key">บัญชีสำรอง</SectionTitle>
        <p className="-mt-1 mb-3 text-xs text-base-content/55">
          บัญชีที่มีรหัสผ่านของตัวเอง ใช้เป็นทางเข้าตอน SchoolOS ล่ม — ไม่ผ่านรายชื่อด้านบน
          และสร้างใหม่ได้จากเครื่อง server เท่านั้น (<code className="text-[11px]">docker compose --profile seed run --rm seed</code>)
        </p>

        <TableWrap>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Username</th>
                <th>ชื่อ-นามสกุล</th>
                <th>Role</th>
                <th>วันที่สร้าง</th>
                <th className="text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={2} cols={5} />
              ) : localUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    <EmptyState
                      icon="key"
                      title="ไม่มีบัญชีสำรอง"
                      hint="ทุกคนเข้าระบบผ่าน SchoolOS — ถ้า SchoolOS ล่มจะไม่มีทางเข้าสำรอง"
                    />
                  </td>
                </tr>
              ) : (
                localUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="font-mono text-xs font-medium">{u.username}</td>
                    <td>{u.name || '—'}</td>
                    <td>
                      <Tag
                        tone={u.role === 'admin' ? 'primary' : 'muted'}
                        icon={u.role === 'admin' ? 'shield' : 'user'}
                      >
                        {u.role}
                      </Tag>
                    </td>
                    <td className="whitespace-nowrap text-xs text-base-content/55">
                      {new Date(u.created_at).toLocaleDateString('th-TH')}
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-xs gap-1 text-error"
                        onClick={() => setDeleteLocalTarget(u)}
                      >
                        <Icon name="trash" size={13} />
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </div>

      {/* ─── Modal: เลือกครูจาก SchoolOS ─── */}
      {pickerOpen && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box flex max-h-[85vh] max-w-2xl flex-col">
            <div className="mb-4 flex items-center gap-3">
              <span className="gt-chip size-10">
                <Icon name="userPlus" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-tight">เพิ่มครูเข้าระบบ</h3>
                <p className="truncate text-xs text-base-content/50">
                  รายชื่อครูทั้งหมดจาก SchoolOS — เลือกคนที่ต้องการให้เข้าใช้ GradTrack
                </p>
              </div>
            </div>

            <div className="relative mb-3">
              <Icon
                name="search"
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
              />
              <input
                type="text"
                placeholder="ค้นหาชื่อครู หรือรหัสครู..."
                className="input input-sm w-full pl-9"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                aria-label="ค้นหาครู"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-base-300">
              {teachersLoading ? (
                <div className="flex items-center justify-center gap-2 p-10 text-sm text-base-content/55">
                  <span className="loading loading-spinner loading-sm" />
                  กำลังดึงรายชื่อครูจาก SchoolOS...
                </div>
              ) : pickerList.length === 0 ? (
                <EmptyState
                  icon="users"
                  title={pickerSearch ? 'ไม่พบครูที่ค้นหา' : 'ไม่พบรายชื่อครู'}
                  hint={pickerSearch ? 'ลองเปลี่ยนคำค้นหา' : 'ตรวจสอบการเชื่อมต่อ SchoolOS'}
                />
              ) : (
                <>
                  <label className="flex cursor-pointer items-center gap-3 border-b border-base-300 bg-base-200/40 px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={allSelected}
                      disabled={selectableList.length === 0}
                      onChange={toggleAll}
                    />
                    <span className="text-xs font-medium text-base-content/70">
                      เลือกทั้งหมดที่ยังไม่ได้เพิ่ม ({selectableList.length} คน)
                    </span>
                  </label>

                  {pickerList.map((t) => (
                    <label
                      key={t.teacher_code}
                      className={`flex items-center gap-3 border-b border-base-300 px-4 py-2.5 last:border-0 ${
                        t.added ? 'opacity-55' : 'cursor-pointer hover:bg-base-200/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selected.has(t.teacher_code)}
                        disabled={t.added}
                        onChange={() => toggle(t.teacher_code)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{t.name}</p>
                        <p className="truncate text-xs text-base-content/50">
                          <span className="font-mono">{t.teacher_code}</span>
                          {t.subject_group ? ` · ${t.subject_group}` : ''}
                        </p>
                      </div>
                      {t.added && (
                        <Tag tone="muted" icon="check">
                          อยู่ในระบบแล้ว
                        </Tag>
                      )}
                    </label>
                  ))}
                </>
              )}
            </div>

            <div aria-live="polite">
              {teachersError && (
                <div className="alert alert-error mt-3 py-2">
                  <Icon name="alert" size={15} className="mt-px" />
                  <span className="text-xs">{teachersError}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <label htmlFor="new-role" className="label">
                  สิทธิ์ของคนที่เลือก
                </label>
                <select
                  id="new-role"
                  className="select select-sm w-56"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="teacher">{ROLE_LABELS.teacher}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-base-content/55">
                  เลือกแล้ว <span className="font-medium tabular-nums">{selected.size}</span> คน
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPickerOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={handleAdd}
                  disabled={saving || selected.size === 0}
                >
                  {saving ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Icon name="plus" size={15} />
                  )}
                  เพิ่ม {selected.size > 0 ? `${selected.size} คน` : ''}
                </button>
              </div>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setPickerOpen(false)} />
        </div>
      )}

      {/* ─── Modal: ยืนยันถอดสิทธิ์ ─── */}
      {revokeTarget && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/10 text-error">
                <Icon name="xCircle" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">ยืนยันถอดสิทธิ์</h3>
                <p className="mt-1 text-sm text-base-content/65">
                  <span className="font-semibold">{revokeTarget.name || revokeTarget.teacher_code}</span>{' '}
                  จะล็อกอินเข้า GradTrack ไม่ได้อีก (บัญชี SchoolOS ไม่ได้รับผลกระทบ
                  และเพิ่มกลับเข้ามาใหม่ได้ทุกเมื่อ)
                </p>
              </div>
            </div>
            <div className="modal-action mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setRevokeTarget(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-error btn-sm gap-1.5" onClick={handleRevoke} disabled={busy}>
                {busy ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Icon name="xCircle" size={15} />
                )}
                ถอดสิทธิ์
              </button>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setRevokeTarget(null)} />
        </div>
      )}

      {/* ─── Modal: ยืนยันลบบัญชีสำรอง ─── */}
      {deleteLocalTarget && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/10 text-error">
                <Icon name="trash" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">ยืนยันการลบ</h3>
                <p className="mt-1 text-sm text-base-content/65">
                  ลบบัญชีสำรอง{' '}
                  <span className="font-semibold text-error">@{deleteLocalTarget.username}</span>{' '}
                  ใช่หรือไม่? สร้างคืนได้จากเครื่อง server เท่านั้น
                </p>
              </div>
            </div>
            <div className="modal-action mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteLocalTarget(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-error btn-sm gap-1.5" onClick={handleDeleteLocal} disabled={busy}>
                {busy ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Icon name="trash" size={15} />
                )}
                ลบบัญชี
              </button>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setDeleteLocalTarget(null)} />
        </div>
      )}
    </div>
  );
}
