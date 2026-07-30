import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api';
import Icon from '../../components/ui/Icon';
import {
  PageHeader,
  SectionTitle,
  TableWrap,
  TableSkeleton,
  EmptyState,
  Tag,
  Toast,
} from '../../components/ui';

// ชื่อไทยของแต่ละตาราง — manifest ในไฟล์สำรองเก็บเป็นชื่อตารางจริง
const TABLE_LABELS = {
  settings: 'ตั้งค่าระบบ',
  users: 'บัญชีสำรอง',
  staff_access: 'สิทธิ์ครู',
  academic_years: 'ปีการศึกษา',
  universities: 'มหาวิทยาลัย',
  faculties: 'คณะ',
  programs: 'หลักสูตร',
  student_profiles: 'โปรไฟล์นักเรียน',
  student_admissions: 'ผลสอบติด',
  report_settings: 'ตั้งค่ารายงาน',
  report_student_settings: 'ตั้งค่ารายงานรายคน',
  activity_logs: 'Activity log',
};

// ตัวเลขที่คนดูแล้วเห็นภาพทันทีว่าไฟล์นี้คือข้อมูลชุดไหน
const HIGHLIGHT = ['student_profiles', 'student_admissions', 'universities', 'programs'];

const fmtBytes = (n = 0) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const sumCounts = (counts = {}) => Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);

export default function BackupPage() {
  const [list, setList] = useState([]);
  const [info, setInfo] = useState({ keep: 0, dir: '', maxUploadMb: 0, totalBytes: 0 });
  const [loading, setLoading] = useState(true);

  const [includeUploads, setIncludeUploads] = useState(true);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const [downloading, setDownloading] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  // ─── กู้คืน ────────────────────────────────────────────────
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreMode, setRestoreMode] = useState('merge');
  const [restoreUploads, setRestoreUploads] = useState(true);
  const [understood, setUnderstood] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const errMsg = (err, fallback) => err.response?.data?.message || fallback;

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await api.get('/backups');
      setList(res.data.backups || []);
      setInfo({
        keep: res.data.keep,
        dir: res.data.dir,
        maxUploadMb: res.data.maxUploadMb,
        totalBytes: res.data.totalBytes,
      });
    } catch (err) {
      showToast(errMsg(err, 'โหลดรายการไฟล์สำรองไม่สำเร็จ'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const autoCount = useMemo(() => list.filter((b) => !b.protected).length, [list]);

  // ─── สร้าง ─────────────────────────────────────────────────
  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await api.post('/backups', { includeUploads, note: note.trim() });
      const pruned = res.data.pruned || [];
      showToast(
        `สำรองข้อมูลเรียบร้อย (${fmtBytes(res.data.size)})` +
          (pruned.length ? ` · ลบไฟล์เก่าเกินโควตา ${pruned.length} ไฟล์` : '')
      );
      setNote('');
      fetchAll();
    } catch (err) {
      showToast(errMsg(err, 'สำรองข้อมูลไม่สำเร็จ'), 'error');
    } finally {
      setCreating(false);
    }
  };

  // ─── ดาวน์โหลด ─────────────────────────────────────────────
  // ใช้ axios ไม่ใช่ <a href> เพราะ endpoint ต้องแนบ JWT มาด้วย
  const handleDownload = async (b) => {
    setDownloading(b.name);
    try {
      const res = await api.get(`/backups/${encodeURIComponent(b.name)}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = b.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // ปล่อยทีหลัง ไม่งั้น Safari ยกเลิกดาวน์โหลดที่เพิ่งเริ่ม
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      showToast(errMsg(err, 'ดาวน์โหลดไม่สำเร็จ'), 'error');
    } finally {
      setDownloading('');
    }
  };

  // ─── อัปโหลด ───────────────────────────────────────────────
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadPct(0);
    const form = new FormData();
    form.append('file', file);
    try {
      await api.post('/backups/upload', form, {
        onUploadProgress: (evt) => {
          if (evt.total) setUploadPct(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      showToast('อัปโหลดไฟล์สำรองเรียบร้อย — กดกู้คืนได้จากรายการด้านล่าง');
      fetchAll();
    } catch (err) {
      showToast(errMsg(err, 'อัปโหลดไม่สำเร็จ'), 'error');
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ─── กู้คืน ────────────────────────────────────────────────
  const openRestore = (b) => {
    setRestoreTarget(b);
    setRestoreMode('merge');
    setRestoreUploads(b.manifest?.includeUploads !== false);
    setUnderstood(false);
    setResult(null);
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await api.post(`/backups/${encodeURIComponent(restoreTarget.name)}/restore`, {
        mode: restoreMode,
        includeUploads: restoreUploads,
      });
      setResult(res.data);
      setRestoreTarget(null);
      fetchAll();
    } catch (err) {
      showToast(errMsg(err, 'กู้คืนไม่สำเร็จ'), 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/backups/${encodeURIComponent(deleteTarget.name)}`);
      showToast('ลบไฟล์สำรองแล้ว');
      setDeleteTarget(null);
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
        icon="save"
        title="สำรองและกู้คืนข้อมูล"
        subtitle="เก็บไฟล์สำรองไว้บน server ดาวน์โหลดเก็บไว้เอง หรืออัปโหลดไฟล์เก่ากลับเข้ามากู้คืน"
      >
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={fetchAll} disabled={loading}>
          <Icon name="refresh" size={15} />
          รีเฟรช
        </button>
      </PageHeader>

      <div className="alert alert-info anim-fade-up mb-5 py-2.5">
        <Icon name="info" size={18} className="mt-px" />
        <div className="min-w-0 flex-1 text-sm">
          <p>
            ไฟล์สำรองมี <span className="font-medium">ข้อมูลทุกตารางของ GradTrack</span>{' '}
            และไฟล์ใน uploads (รูปนักเรียน โลโก้ พื้นหลังการ์ด)
          </p>
          <p className="mt-0.5 text-xs opacity-80">
            ไม่มี: ชื่อ/ชั้น/ห้องของนักเรียนและครู (อ่านสดจาก SchoolOS เสมอ) และค่าลับใน{' '}
            <code className="text-[11px]">.env</code> — สองอย่างนี้ต้องดูแลแยกต่างหาก
          </p>
        </div>
      </div>

      {/* ─── ผลการกู้คืนล่าสุด ─── */}
      {result && (
        <div className="alert alert-success anim-scale-in mb-5 items-start py-3">
          <Icon name="checkCircle" size={18} className="mt-px" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              กู้คืนข้อมูลเรียบร้อย ({result.mode === 'replace' ? 'แทนที่ทั้งหมด' : 'เติมเฉพาะที่ยังไม่มี'})
            </p>
            <p className="mt-1 text-xs opacity-85">
              {Object.entries(result.restored || {})
                .filter(([, n]) => n > 0)
                .map(([t, n]) => `${TABLE_LABELS[t] || t} ${n}`)
                .join(' · ') || 'ไม่มีแถวใหม่ถูกเพิ่ม'}
              {result.uploads > 0 && ` · ไฟล์ uploads ${result.uploads}`}
            </p>
            <p className="mt-1 text-xs opacity-70">
              ข้อมูลก่อนกู้คืนถูกสำรองไว้ให้แล้วที่{' '}
              <span className="font-mono">{result.safetyBackup}</span> — ถ้ากู้ผิดไฟล์ ให้กู้คืนจากไฟล์นั้นกลับ
            </p>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setResult(null)} aria-label="ปิด">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* ─── สร้าง / อัปโหลด ─── */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="card bg-base-100 p-5">
          <SectionTitle icon="save">สำรองข้อมูลตอนนี้</SectionTitle>
          <p className="-mt-2 mb-4 text-xs text-base-content/55">
            ไฟล์จะถูกเก็บไว้บนเครื่อง server (คงอยู่ข้าม redeploy) และดาวน์โหลดมาเก็บเองได้
          </p>

          <label className="mb-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="checkbox checkbox-sm mt-0.5"
              checked={includeUploads}
              onChange={(e) => setIncludeUploads(e.target.checked)}
            />
            <span className="text-sm">
              รวมไฟล์ใน uploads ด้วย
              <span className="block text-xs text-base-content/50">
                รูปนักเรียน โลโก้มหาวิทยาลัย พื้นหลังการ์ด — ไฟล์จะใหญ่ขึ้นมาก แต่กู้กลับได้ครบจริง
              </span>
            </span>
          </label>

          <label className="label" htmlFor="backup-note">
            บันทึกช่วยจำ (ไม่บังคับ)
          </label>
          <input
            id="backup-note"
            type="text"
            className="input input-sm mb-4 w-full"
            placeholder="เช่น ก่อนนำเข้าข้อมูลปี 2568"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button className="btn btn-primary btn-sm gap-1.5 self-start" onClick={handleCreate} disabled={creating}>
            {creating ? <span className="loading loading-spinner loading-xs" /> : <Icon name="save" size={15} />}
            {creating ? 'กำลังสำรอง...' : 'สร้างไฟล์สำรอง'}
          </button>
        </div>

        <div className="card bg-base-100 p-5">
          <SectionTitle icon="upload">อัปโหลดไฟล์สำรอง</SectionTitle>
          <p className="-mt-2 mb-4 text-xs text-base-content/55">
            เอาไฟล์ <code className="text-[11px]">.tar.gz</code> ที่เคยดาวน์โหลดไว้กลับขึ้น server
            เพื่อกู้คืน — ไฟล์ที่อัปโหลดเองจะไม่ถูกลบอัตโนมัติ
            {info.maxUploadMb ? ` (ไม่เกิน ${info.maxUploadMb} MB)` : ''}
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".gz,.tar.gz,application/gzip"
            className="file-input file-input-sm w-full"
            onChange={handleUpload}
            disabled={uploading}
            aria-label="เลือกไฟล์สำรอง"
          />

          {uploading && (
            <div className="mt-3">
              <progress className="progress progress-primary w-full" value={uploadPct} max="100" />
              <p className="mt-1 text-xs text-base-content/55">
                กำลังอัปโหลด {uploadPct}% — อย่าปิดหน้านี้
              </p>
            </div>
          )}

          <div className="mt-auto pt-4 text-xs text-base-content/45">
            <p>
              เก็บบน server:{' '}
              <span className="font-medium tabular-nums">{fmtBytes(info.totalBytes || 0)}</span>
              {' · '}
              {list.length} ไฟล์
            </p>
            {info.keep > 0 && (
              <p className="mt-0.5">
                ไฟล์ที่ระบบสร้างเองเก็บไว้ล่าสุด {info.keep} ไฟล์ (ตอนนี้ {autoCount}) — ที่เกินจะถูกลบอัตโนมัติ
                ตอนสำรองครั้งถัดไป
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── รายการไฟล์ ─── */}
      <SectionTitle icon="file">ไฟล์สำรองบน server</SectionTitle>

      <TableWrap className="anim-fade-up">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>ไฟล์</th>
              <th>สร้างเมื่อ</th>
              <th>ข้อมูลข้างใน</th>
              <th className="text-right">ขนาด</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={4} cols={5} />
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState
                    icon="save"
                    title="ยังไม่มีไฟล์สำรอง"
                    hint="กดปุ่ม สร้างไฟล์สำรอง ด้านบน หรืออัปโหลดไฟล์ที่เคยเก็บไว้"
                  />
                </td>
              </tr>
            ) : (
              list.map((b) => {
                const m = b.manifest || {};
                return (
                  <tr key={b.name}>
                    <td>
                      <p className="break-all font-mono text-xs font-medium">{b.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {b.uploaded && (
                          <Tag tone="navy" icon="upload">
                            อัปโหลดเอง
                          </Tag>
                        )}
                        {m.kind === 'pre-restore' && (
                          <Tag tone="gold" icon="undo">
                            ก่อนกู้คืน
                          </Tag>
                        )}
                        {!b.valid && (
                          <Tag tone="error" icon="alert">
                            ไฟล์เสีย/ไม่ใช่ของระบบนี้
                          </Tag>
                        )}
                        {m.includeUploads === false && b.valid && (
                          <Tag tone="muted" icon="image">
                            ไม่มีไฟล์รูป
                          </Tag>
                        )}
                      </div>
                      {m.note && (
                        <p className="mt-1 text-xs text-base-content/55">{m.note}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {fmtDate(m.createdAt || b.mtime)}
                      <p className="text-base-content/45">โดย {m.createdBy || '—'}</p>
                    </td>
                    <td className="text-xs">
                      {b.valid ? (
                        <>
                          <p className="tabular-nums">
                            {sumCounts(m.counts).toLocaleString('th-TH')} แถว
                            {m.uploads?.files > 0 && ` · ${m.uploads.files} ไฟล์`}
                          </p>
                          <p className="text-base-content/45">
                            {HIGHLIGHT.filter((t) => m.counts?.[t])
                              .map((t) => `${TABLE_LABELS[t]} ${m.counts[t]}`)
                              .join(' · ') || '—'}
                          </p>
                        </>
                      ) : (
                        <span className="text-base-content/40">อ่านรายละเอียดไม่ได้</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right text-xs tabular-nums">
                      {fmtBytes(b.size)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn btn-ghost btn-xs gap-1"
                          onClick={() => handleDownload(b)}
                          disabled={downloading === b.name}
                        >
                          {downloading === b.name ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <Icon name="download" size={13} />
                          )}
                          ดาวน์โหลด
                        </button>
                        <button
                          className="btn btn-ghost btn-xs gap-1"
                          onClick={() => openRestore(b)}
                          disabled={!b.valid}
                          title={b.valid ? undefined : 'ไฟล์นี้อ่าน manifest ไม่ได้'}
                        >
                          <Icon name="undo" size={13} />
                          กู้คืน
                        </button>
                        <button
                          className="btn btn-ghost btn-xs gap-1 text-error"
                          onClick={() => setDeleteTarget(b)}
                        >
                          <Icon name="trash" size={13} />
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && info.dir && (
          <div className="border-t border-base-300 px-4 py-2.5 text-xs text-base-content/45">
            เก็บที่ <span className="font-mono">{info.dir}</span> บนเครื่อง server
          </div>
        )}
      </TableWrap>

      {/* ─── Modal: กู้คืน ─── */}
      {restoreTarget && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box flex max-h-[88vh] max-w-lg flex-col">
            <div className="mb-4 flex items-center gap-3">
              <span className="gt-chip size-10">
                <Icon name="undo" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-tight">กู้คืนข้อมูล</h3>
                <p className="truncate font-mono text-xs text-base-content/50">
                  {restoreTarget.name}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* สรุปว่าในไฟล์มีอะไร */}
              <div className="mb-4 rounded-xl border border-base-300 p-3">
                <p className="mb-2 text-xs font-medium text-base-content/70">
                  ข้อมูลในไฟล์ · สำรองเมื่อ {fmtDate(restoreTarget.manifest?.createdAt)}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(restoreTarget.manifest?.counts || {}).map(([t, n]) => (
                    <div key={t} className="flex justify-between gap-2">
                      <span className="truncate text-base-content/60">{TABLE_LABELS[t] || t}</span>
                      <span className="tabular-nums">{Number(n).toLocaleString('th-TH')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* โหมด */}
              <p className="label">วิธีกู้คืน</p>
              <div className="mb-3 flex flex-col gap-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-base-300 p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name="restore-mode"
                    className="radio radio-sm mt-0.5"
                    checked={restoreMode === 'merge'}
                    onChange={() => {
                      setRestoreMode('merge');
                      setUnderstood(false);
                    }}
                  />
                  <span className="text-sm">
                    เติมเฉพาะที่ยังไม่มี
                    <span className="block text-xs text-base-content/55">
                      ข้อมูลปัจจุบันไม่ถูกแตะเลย แถวที่ชนกันจะถูกข้าม — ปลอดภัยที่สุด
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-base-300 p-3 has-[:checked]:border-error has-[:checked]:bg-error/5">
                  <input
                    type="radio"
                    name="restore-mode"
                    className="radio radio-sm mt-0.5"
                    checked={restoreMode === 'replace'}
                    onChange={() => {
                      setRestoreMode('replace');
                      setUnderstood(false);
                    }}
                  />
                  <span className="text-sm">
                    แทนที่ทั้งหมด
                    <span className="block text-xs text-base-content/55">
                      ล้างข้อมูลปัจจุบันของทุกตารางในไฟล์ แล้วใส่ของในไฟล์แทน — ได้สภาพ ณ วันที่สำรองเป๊ะ ๆ
                    </span>
                  </span>
                </label>
              </div>

              {restoreTarget.manifest?.includeUploads !== false && (
                <label className="mb-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm mt-0.5"
                    checked={restoreUploads}
                    onChange={(e) => setRestoreUploads(e.target.checked)}
                  />
                  <span className="text-sm">
                    กู้ไฟล์ใน uploads ด้วย ({restoreTarget.manifest?.uploads?.files || 0} ไฟล์)
                    <span className="block text-xs text-base-content/55">
                      เขียนทับไฟล์ชื่อเดียวกัน — ไฟล์ที่เพิ่มเข้ามาหลังวันสำรองจะไม่ถูกลบ
                    </span>
                  </span>
                </label>
              )}

              <div className="alert alert-warning py-2.5">
                <Icon name="warning" size={16} className="mt-px" />
                <span className="text-xs">
                  ระบบจะสำรองข้อมูลปัจจุบันให้อัตโนมัติก่อนกู้คืนทุกครั้ง
                  {restoreMode === 'replace' && ' — แต่โหมดแทนที่ทั้งหมดทำให้ทุกคนเห็นข้อมูลเปลี่ยนทันที'}
                </span>
              </div>

              {restoreMode === 'replace' && (
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm mt-0.5"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                  />
                  <span className="text-sm">
                    เข้าใจแล้วว่าข้อมูลปัจจุบันในตารางเหล่านี้จะถูกลบและแทนที่ด้วยข้อมูลในไฟล์
                  </span>
                </label>
              )}
            </div>

            <div className="modal-action mt-4">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setRestoreTarget(null)}
                disabled={restoring}
              >
                ยกเลิก
              </button>
              <button
                className={`btn btn-sm gap-1.5 ${restoreMode === 'replace' ? 'btn-error' : 'btn-primary'}`}
                onClick={handleRestore}
                disabled={restoring || (restoreMode === 'replace' && !understood)}
              >
                {restoring ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Icon name="undo" size={15} />
                )}
                {restoring ? 'กำลังกู้คืน...' : 'กู้คืนข้อมูล'}
              </button>
            </div>
          </div>
          <button
            className="modal-backdrop"
            aria-label="ปิด"
            onClick={() => !restoring && setRestoreTarget(null)}
          />
        </div>
      )}

      {/* ─── Modal: ลบไฟล์ ─── */}
      {deleteTarget && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-sm">
            <div className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-error/10 text-error">
                <Icon name="trash" size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">ลบไฟล์สำรอง</h3>
                <p className="mt-1 break-all text-sm text-base-content/65">
                  ลบ <span className="font-mono text-xs font-semibold">{deleteTarget.name}</span>{' '}
                  ออกจาก server ใช่หรือไม่? ถ้ายังไม่ได้ดาวน์โหลดเก็บไว้ ไฟล์นี้จะหายถาวร
                </p>
              </div>
            </div>
            <div className="modal-action mt-5">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-error btn-sm gap-1.5" onClick={handleDelete} disabled={busy}>
                {busy ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Icon name="trash" size={15} />
                )}
                ลบไฟล์
              </button>
            </div>
          </div>
          <button className="modal-backdrop" aria-label="ปิด" onClick={() => setDeleteTarget(null)} />
        </div>
      )}
    </div>
  );
}
