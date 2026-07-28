import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import Icon from '../../components/ui/Icon';
import { PageHeader, TableWrap, TableSkeleton, EmptyState, Tag } from '../../components/ui';

const ACTION_LABELS = {
  login:               { label: 'เข้าสู่ระบบ',       icon: 'login',       tone: 'navy' },
  add_admission:       { label: 'บันทึกมหาวิทยาลัย', icon: 'plus',        tone: 'primary' },
  confirm_admission:   { label: 'ยืนยันสิทธิ์',       icon: 'checkCircle', tone: 'success' },
  unconfirm_admission: { label: 'ยกเลิกการยืนยัน',   icon: 'undo',        tone: 'gold' },
  create_account:      { label: 'สร้าง Account',      icon: 'userPlus',    tone: 'primary' },
  delete_account:      { label: 'ลบ Account',         icon: 'trash',       tone: 'error' },
};

const ROLE_LABELS = {
  admin:   { label: 'Admin',    tone: 'primary', icon: 'shield' },
  student: { label: 'นักเรียน', tone: 'muted',   icon: 'graduation' },
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
    } catch {
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
    <div>
      <PageHeader
        icon="log"
        title="Activity Log"
        subtitle={`บันทึกการใช้งานระบบทั้งหมด ${total.toLocaleString('th-TH')} รายการ`}
      >
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={fetchLogs} disabled={loading}>
          {loading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Icon name="refresh" size={15} />
          )}
          รีเฟรช
        </button>
      </PageHeader>

      {/* ตัวกรอง */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
          />
          <input
            type="text"
            className="input input-sm w-full pl-9"
            placeholder="ค้นหาชื่อ / action / เป้าหมาย..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="ค้นหาบันทึกการใช้งาน"
          />
        </div>
        <select
          className="select select-sm"
          value={role}
          onChange={e => setRole(e.target.value)}
          aria-label="กรองตาม role"
        >
          <option value="">ทุก Role</option>
          <option value="admin">Admin</option>
          <option value="student">นักเรียน</option>
        </select>
        {(search || role) && (
          <button
            className="btn btn-ghost btn-sm gap-1"
            onClick={() => { setSearch(''); setRole(''); }}
          >
            <Icon name="x" size={14} />
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* ตาราง */}
      <TableWrap sticky className="anim-fade-up">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>เวลา</th>
              <th>ผู้ดำเนินการ</th>
              <th>Role</th>
              <th>Action</th>
              <th>เป้าหมาย</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={8} cols={6} />
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState
                    icon="log"
                    title={search || role ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีบันทึกการใช้งาน'}
                    hint={
                      search || role
                        ? 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูทั้งหมด'
                        : 'ระบบจะบันทึกการเข้าสู่ระบบและการแก้ไขข้อมูลไว้ที่นี่'
                    }
                  />
                </td>
              </tr>
            ) : (
              logs.map((log, i) => {
                const actionInfo =
                  ACTION_LABELS[log.action] || { label: log.action, icon: 'pin', tone: 'muted' };
                const roleInfo =
                  ROLE_LABELS[log.actor_role] || { label: log.actor_role, tone: 'muted' };
                return (
                  <tr key={log.id}>
                    <td className="text-xs tabular-nums text-base-content/40">
                      {page * PAGE_SIZE + i + 1}
                    </td>
                    <td className="whitespace-nowrap text-xs tabular-nums text-base-content/60">
                      {formatDate(log.created_at)}
                    </td>
                    <td>
                      <div className="text-sm font-medium">{log.actor_name || log.actor_username}</div>
                      {log.actor_name && (
                        <div className="font-mono text-xs text-base-content/40">
                          {log.actor_username}
                        </div>
                      )}
                    </td>
                    <td>
                      <Tag tone={roleInfo.tone} icon={roleInfo.icon}>{roleInfo.label}</Tag>
                    </td>
                    <td>
                      <Tag tone={actionInfo.tone} icon={actionInfo.icon}>{actionInfo.label}</Tag>
                    </td>
                    <td className="max-w-[220px] truncate text-xs text-base-content/70">
                      {log.target || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrap>

      {/* แบ่งหน้า */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            className="btn btn-ghost btn-sm gap-1"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            <Icon name="chevronLeft" size={15} />
            ก่อนหน้า
          </button>
          <span className="text-sm tabular-nums text-base-content/60">
            หน้า {page + 1} / {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm gap-1"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            ถัดไป
            <Icon name="chevronRight" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
