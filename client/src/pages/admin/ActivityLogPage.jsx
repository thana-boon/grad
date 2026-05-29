import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

const ACTION_LABELS = {
  login:               { label: 'เข้าสู่ระบบ',         icon: '🔑', color: 'badge-info' },
  add_admission:       { label: 'บันทึกมหาวิทยาลัย',   icon: '📝', color: 'badge-primary' },
  confirm_admission:   { label: 'ยืนยันสิทธิ์',         icon: '✅', color: 'badge-success' },
  unconfirm_admission: { label: 'ยกเลิกการยืนยัน',     icon: '↩️', color: 'badge-warning' },
  create_account:      { label: 'สร้าง Account',        icon: '👤', color: 'badge-accent' },
  delete_account:      { label: 'ลบ Account',           icon: '🗑️', color: 'badge-error' },
};

const ROLE_LABELS = {
  admin:   { label: 'Admin',    badge: 'badge-primary' },
  student: { label: 'นักเรียน', badge: 'badge-ghost' },
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const PAGE_SIZE = 50;

export default function ActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/activity-logs', {
        params: { search, role, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [search, role, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // reset page when filter changes
  useEffect(() => { setPage(0); }, [search, role]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">🗒️ Activity Log</h1>
        <span className="text-sm text-base-content/50">ทั้งหมด {total} รายการ</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          className="input input-bordered input-sm w-60"
          placeholder="🔍 ค้นหาชื่อ / action / เป้าหมาย..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="select select-bordered select-sm"
          value={role}
          onChange={e => setRole(e.target.value)}
        >
          <option value="">ทุก Role</option>
          <option value="admin">Admin</option>
          <option value="student">นักเรียน</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={fetchLogs}>🔄 รีเฟรช</button>
      </div>

      {/* Table */}
      <div className="card bg-base-100 shadow border border-base-200 overflow-x-auto">
        <table className="table table-xs table-zebra w-full">
          <thead>
            <tr className="text-xs bg-base-200">
              <th className="w-8">#</th>
              <th>เวลา</th>
              <th>ผู้ดำเนินการ</th>
              <th>Role</th>
              <th>Action</th>
              <th>เป้าหมาย</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12"><span className="loading loading-spinner" /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-base-content/40">ไม่พบข้อมูล</td></tr>
            ) : logs.map((log, i) => {
              const actionInfo = ACTION_LABELS[log.action] || { label: log.action, icon: '📌', color: 'badge-ghost' };
              const roleInfo = ROLE_LABELS[log.actor_role] || { label: log.actor_role, badge: 'badge-ghost' };
              return (
                <tr key={log.id}>
                  <td className="text-base-content/40">{page * PAGE_SIZE + i + 1}</td>
                  <td className="whitespace-nowrap text-xs text-base-content/60">{formatDate(log.created_at)}</td>
                  <td>
                    <div className="font-medium text-sm">{log.actor_name || log.actor_username}</div>
                    {log.actor_name && <div className="text-xs text-base-content/40 font-mono">{log.actor_username}</div>}
                  </td>
                  <td>
                    <span className={`badge badge-sm ${roleInfo.badge}`}>{roleInfo.label}</span>
                  </td>
                  <td>
                    <span className={`badge badge-sm ${actionInfo.color} gap-1`}>
                      {actionInfo.icon} {actionInfo.label}
                    </span>
                  </td>
                  <td className="text-xs text-base-content/70 max-w-[200px] truncate">{log.target || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 items-center">
          <button className="btn btn-sm btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
          <span className="text-sm text-base-content/60">หน้า {page + 1} / {totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
        </div>
      )}
    </div>
  );
}
