import { useEffect, useState } from 'react';
import api from '../../utils/api';
import Icon from '../../components/ui/Icon';
import { PageHeader, TableWrap, TableSkeleton, EmptyState, Tag, Toast } from '../../components/ui';

export default function AcademicYearsPage() {
  const [years, setYears] = useState([]);
  const [activeYearId, setActiveYearId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // year_id ที่กำลัง set
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // โหลดปีการศึกษาทั้งหมด + ปีที่ active ใน GradTrack
  const load = async () => {
    setLoading(true);
    try {
      const [yearsRes, activeRes] = await Promise.all([
        api.get('/academic-years'),
        api.get('/academic-years/active'),
      ]);
      setYears(yearsRes.data);
      setActiveYearId(activeRes.data.active_year_id);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ดึงรายการปีจาก SchoolOS ใหม่ทันที — ปกติระบบซิงก์เองทุก 6 ชม. ปุ่มนี้ไว้ใช้
  // ตอนผู้ดูแล SchoolOS เพิ่งเพิ่มปีแล้วอยากเห็นเดี๋ยวนี้ ไม่ต้องรอรอบถัดไป
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/academic-years/sync');
      setYears(data.years || []);
      showToast(`ซิงก์แล้ว พบ ${data.synced} ปีการศึกษา`);
    } catch {
      showToast('ซิงก์จาก SchoolOS ไม่สำเร็จ', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ตั้งปีการศึกษาที่ GradTrack ใช้งาน
  const handleSetActive = async (yearId) => {
    setSaving(yearId);
    try {
      await api.put('/academic-years/active', { year_id: yearId });
      setActiveYearId(yearId);
      showToast('ตั้งปีการศึกษาที่ใช้งานแล้ว');
    } catch {
      showToast('ไม่สามารถตั้งปีการศึกษาได้', 'error');
    } finally {
      setSaving(null);
    }
  };

  const activeYear = years.find((y) => y.id === activeYearId);

  return (
    <div className="relative">
      <Toast toast={toast} />

      <PageHeader
        icon="calendar"
        title="ปีการศึกษา"
        subtitle="เลือกปีการศึกษาที่ GradTrack ใช้งาน — ทุกหน้าจะอ้างอิงปีนี้เป็นค่าเริ่มต้น"
      >
        <button className="btn btn-outline btn-sm gap-1.5" onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Icon name="refresh" size={14} />
          )}
          ซิงก์จาก SchoolOS
        </button>
      </PageHeader>

      {/* ปีที่ใช้งานอยู่ */}
      {activeYear && (
        <div className="card anim-fade-up mb-5 flex flex-row items-center gap-3.5 bg-base-100 p-4">
          <span className="gt-chip size-10">
            <Icon name="checkCircle" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-base-content/55">ปีการศึกษาที่ใช้งานอยู่</p>
            <p className="truncate text-sm font-semibold text-primary">
              {activeYear.title || `ปีการศึกษา ${activeYear.year_be}`}
            </p>
          </div>
        </div>
      )}

      {/* ตาราง */}
      <TableWrap className="anim-fade-up">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>ปี พ.ศ.</th>
              <th>ชื่อปีการศึกษา</th>
              <th>สถานะใน SchoolOS</th>
              <th>สถานะใน GradTrack</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : years.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState
                    icon="calendar"
                    title="ไม่พบข้อมูลปีการศึกษา"
                    hint="ปีการศึกษาดึงมาจาก SchoolOS — ตรวจสอบการเชื่อมต่อ แล้วลองโหลดหน้านี้อีกครั้ง"
                  />
                </td>
              </tr>
            ) : (
              years.map((y, i) => {
                const isActive = y.id === activeYearId;
                return (
                  <tr key={y.id} className={isActive ? 'bg-primary/5' : ''}>
                    <td className="text-xs tabular-nums text-base-content/40">{i + 1}</td>
                    <td className="font-medium tabular-nums">{y.year_be}</td>
                    <td>{y.title || `ปีการศึกษา ${y.year_be}`}</td>
                    <td>
                      {y.is_active ? (
                        <Tag tone="success" icon="check">กำลังใช้งาน</Tag>
                      ) : (
                        <span className="text-xs text-base-content/35">—</span>
                      )}
                    </td>
                    <td>
                      {isActive ? (
                        <Tag tone="primary" icon="checkCircle">ใช้งานอยู่</Tag>
                      ) : (
                        <span className="text-xs text-base-content/35">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!isActive && (
                        <button
                          className="btn btn-outline btn-primary btn-xs gap-1"
                          onClick={() => handleSetActive(y.id)}
                          disabled={saving === y.id}
                        >
                          {saving === y.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <Icon name="refresh" size={13} />
                          )}
                          เลือกใช้
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}
