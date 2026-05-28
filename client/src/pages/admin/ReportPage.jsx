import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import api from '../../utils/api';

// ─── Layout engine (left column only, 1 or 2 cols, up to 20 unis) ─────────────
function getUniLayout(count) {
  if (count === 0) return {};
  if (count <= 4)  return { cols: 1, logo: 80,  uni: 22, fac: 16, prog: 13, pad: '14px 18px', gap: 12 };
  if (count <= 8)  return { cols: 1, logo: 64,  uni: 18, fac: 14, prog: 11, pad: '10px 14px', gap: 9  };
  if (count <= 13) return { cols: 1, logo: 52,  uni: 15, fac: 12, prog: 10, pad: '8px 12px',  gap: 7  };
  return           { cols: 2, logo: 42,  uni: 13, fac: 11, prog: 9,  pad: '7px 10px',  gap: 6  };
}

// ─── StudentCard ─────────────────────────────────────────────────────────────
export function StudentCard({ student, settings, yearName, quoteApproved = true }) {
  const confirmedUni = student.admissions?.find(a => a.confirmed);
  const allAdmissions = student.admissions || [];

  // Group admissions by university
  const grouped = Object.values(
    allAdmissions.reduce((acc, a) => {
      const key = a.university_id || a.university_name;
      if (!acc[key]) acc[key] = { ...a, entries: [] };
      acc[key].entries.push({ faculty_name: a.faculty_name, program_name: a.program_name, confirmed: a.confirmed });
      if (a.confirmed) acc[key].groupConfirmed = true;
      return acc;
    }, {})
  ).sort((a, b) => {
    if (a.groupConfirmed && !b.groupConfirmed) return -1;
    if (!a.groupConfirmed && b.groupConfirmed) return 1;
    return (a.university_name || '').localeCompare(b.university_name || '', 'th');
  });

  const L = getUniLayout(grouped.length);
  const textColor = settings.text_color || '#ffffff';

  return (
    <div style={{
      width: 1080,
      height: 1080,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif",
      background: '#0f0c29',
      boxSizing: 'border-box',
    }}>
      {/* Background image */}
      {settings.background_image_url && (
        <img
          src={settings.background_image_url}
          crossOrigin="anonymous"
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', zIndex: 0,
          }}
        />
      )}

      {/* School Logo — absolute top-left corner */}
      {settings.school_logo_url && (
        <img
          src={settings.school_logo_url}
          crossOrigin="anonymous"
          alt=""
          style={{
            position: 'absolute', top: 24, left: 28,
            width: 96, height: 96,
            objectFit: 'contain', zIndex: 2,
          }}
        />
      )}

      {/* Content column */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '28px 56px 28px',
        boxSizing: 'border-box',
        color: textColor,
        overflowY: 'hidden',
      }}>
        {/* School Name */}
        {settings.school_name && (
          <div style={{
            fontSize: 30, fontWeight: 700, textAlign: 'center',
            opacity: 0.97, marginBottom: 6, flexShrink: 0, lineHeight: 1.35,
          }}>
            {settings.school_name}
          </div>
        )}

        {/* Congrats text */}
        {settings.congrats_text && (
          <div style={{
            fontSize: 22, textAlign: 'center', opacity: 0.9,
            marginBottom: 12, lineHeight: 1.55, flexShrink: 0, maxWidth: 860,
          }}>
            {settings.congrats_text}
          </div>
        )}

        {/* Divider */}
        <div style={{
          width: '50%', height: 1,
          background: `${textColor}4d`,
          marginBottom: 16, flexShrink: 0,
        }} />

        {/* ── Body: two-column ── */}
        <div style={{
          flex: 1, width: '100%',
          display: 'flex', flexDirection: 'row',
          gap: 28, minHeight: 0, alignItems: 'stretch',
        }}>

          {/* LEFT: Universities — vertically centered */}
          <div style={{
            flex: '0 0 56%',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            minHeight: 0, overflow: 'hidden', gap: 0,
          }}>
            {grouped.length > 0 && (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${L.cols}, 1fr)`,
                  gap: L.gap,
                  alignContent: 'end',
                }}>
                  {grouped.map(g => {
                    const isOne      = grouped.length === 1;
                    const isVertical = grouped.length < 3;
                    const logoSize   = isOne ? 200 : isVertical ? 120 : L.logo;
                    const uniSize    = isOne ? L.uni + 12 : isVertical ? L.uni + 4 : L.uni;
                    const facSize    = isOne ? L.fac + 8  : isVertical ? L.fac + 2 : L.fac;
                    const progSize   = isOne ? L.prog + 6 : isVertical ? L.prog + 2 : L.prog;
                    const isConfirmed = !!g.groupConfirmed;
                    return (
                      <div key={g.university_id || g.university_name} style={{
                        background: isConfirmed ? 'rgba(34,197,94,0.22)' : 'rgba(255,255,255,0.1)',
                        border: isConfirmed ? '1.5px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        padding: L.pad,
                        display: 'flex',
                        flexDirection: isVertical ? 'column' : 'row',
                        alignItems: isVertical ? 'center' : 'flex-start',
                        gap: isOne ? 20 : isVertical ? 14 : 10,
                        boxSizing: 'border-box',
                      }}>
                        {g.logo_url && (
                          <img
                            src={g.logo_url}
                            crossOrigin="anonymous"
                            alt=""
                            style={{ width: logoSize, height: logoSize, objectFit: 'contain', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ flex: isVertical ? undefined : 1, minWidth: 0, textAlign: isVertical ? 'center' : 'left' }}>
                          <div style={{ fontSize: uniSize, fontWeight: 700, lineHeight: 1.25, marginBottom: 6 }}>
                            {g.university_name}
                          </div>
                          {g.entries.map((e, i) => (
                            <div key={i} style={{
                              marginTop: i > 0 ? 8 : 0,
                              paddingTop: i > 0 ? 8 : 0,
                              borderTop: i > 0 ? `1px solid ${textColor}22` : 'none',
                            }}>
                              <div style={{ fontSize: facSize, opacity: 0.85, lineHeight: 1.3, marginBottom: 1 }}>
                                {e.faculty_name}
                                {e.confirmed && <span style={{ marginLeft: 6, fontSize: facSize - 2, color: 'rgba(74,222,128,0.9)' }}>✓</span>}
                              </div>
                              <div style={{ fontSize: progSize, opacity: 0.62, lineHeight: 1.2 }}>
                                {e.program_name}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Photo + Name + Quote — centered vertically */}
          <div style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 14,
          }}>
            {/* Photo */}
            <div style={{
              width: 240, height: 360,
              borderRadius: 20, overflow: 'hidden',
              border: `4px solid ${textColor}dd`,
              background: '#555', position: 'relative', flexShrink: 0,
            }}>
              {student.photo_url
                ? <img
                    src={student.photo_url}
                    crossOrigin="anonymous"
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
                  />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 100 }}>👤</div>
              }
            </div>

            {/* Name */}
            <div style={{ fontSize: 38, fontWeight: 700, textAlign: 'center', lineHeight: 1.25, color: textColor }}>
              {student.first_name} {student.last_name}
            </div>

            {/* Quote */}
            {settings.show_quote && student.quote && quoteApproved && (
              <div style={{
                fontSize: 18, fontStyle: 'italic', textAlign: 'center',
                opacity: 0.75, lineHeight: 1.6, maxWidth: 360,
              }}>
                "{student.quote}"
              </div>
            )}

            {/* Confirmed badge */}
            {confirmedUni && (
              <div style={{
                background: 'rgba(34,197,94,0.22)',
                border: '2px solid rgba(34,197,94,0.8)',
                borderRadius: 14, padding: '12px 16px',
                textAlign: 'center', width: '100%', boxSizing: 'border-box',
              }}>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>✅ ยืนยันสิทธิ์</div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
                  {confirmedUni.university_name}
                </div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 3 }}>
                  {confirmedUni.faculty_name}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ReportPage ───────────────────────────────────────────────────────────────
export default function ReportPage() {
  const [settings, setSettings] = useState({ congrats_text: '', show_quote: true, background_image_url: null, school_name: '', school_logo_url: null, text_color: '#ffffff' });
  const [students, setStudents] = useState([]);
  const [yearId, setYearId] = useState('');
  const [yearName, setYearName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [approvedQuotes, setApprovedQuotes] = useState(new Set());
  const [quoteSearch, setQuoteSearch] = useState('');
  const [bgUploading, setBgUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const bgInputRef = useRef(null);
  const logoInputRef = useRef(null);

  // Load settings + year + students
  useEffect(() => {
    Promise.all([
      api.get('/report-settings'),
      api.get('/academic-years'),
    ]).then(([sRes, yRes]) => {
      setSettings(sRes.data || { congrats_text: '', show_quote: true, background_image_url: null });
      const years = yRes.data || [];
      if (years.length > 0) {
        setYearId(String(years[0].id));
        setYearName(String(years[0].year_be || years[0].title || years[0].name || ''));
      }
    });
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    api.get('/student/admin/admission-overview', { params: { year_id: yearId } })
      .then(r => {
        const withAdmissions = (r.data || []).filter(s => s.admissions.length > 0);
        setStudents(withAdmissions);
        setApprovedQuotes(new Set(withAdmissions.map(s => s.student_code)));
        setPreviewIndex(0);
      })
      .finally(() => setLoading(false));
  }, [yearId]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/report-settings', {
        congrats_text: settings.congrats_text,
        show_quote: settings.show_quote,
        school_name: settings.school_name,
        text_color: settings.text_color,
      });
    } finally {
      setSaving(false);
    }
  };

  const uploadBg = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgUploading(true);
    try {
      const form = new FormData();
      form.append('bg', file);
      const r = await api.post('/report-settings/background', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSettings(prev => ({ ...prev, background_image_url: r.data.url }));
    } finally {
      setBgUploading(false);
      e.target.value = '';
    }
  };

  const removeBg = async () => {
    await api.delete('/report-settings/background');
    setSettings(prev => ({ ...prev, background_image_url: null }));
  };

  const uploadSchoolLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append('logo', file);
      const r = await api.post('/report-settings/school-logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSettings(prev => ({ ...prev, school_logo_url: r.data.url }));
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const removeSchoolLogo = async () => {
    await api.delete('/report-settings/school-logo');
    setSettings(prev => ({ ...prev, school_logo_url: null }));
  };

  // ── Export ZIP (images) ──
  // Preload all image URLs before html2canvas
  const preloadImages = async (urls) => {
    await Promise.all(
      urls.filter(Boolean).map(
        url => new Promise(resolve => {
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          img.onload = resolve;
          img.onerror = resolve;
          img.src = url;
        })
      )
    );
  };

  const exportZip = async () => {
    if (students.length === 0) return;
    setExporting(true);
    setExportProgress(0);
    const zip = new JSZip();

    // Preload shared assets
    await preloadImages([
      settings.background_image_url,
      settings.school_logo_url,
    ]);

    for (let i = 0; i < students.length; i++) {
      const student = students[i];

      // Preload per-student images
      await preloadImages([
        student.photo_url,
        ...( student.admissions || []).map(a => a.logo_url),
      ]);

      // Place at top-left so html2canvas can see it; covered by full-screen overlay (rendered below)
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:0;width:1080px;height:1080px;overflow:hidden;pointer-events:none;z-index:1000;';
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(<StudentCard student={student} settings={settings} yearName={yearName} quoteApproved={approvedQuotes.has(student.student_code)} />);

      // Wait for render + fonts
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 1000));

      try {
        const canvas = await html2canvas(container, {
          width: 1080, height: 1080,
          useCORS: true, allowTaint: false,
          scale: 1, logging: false,
          imageTimeout: 10000,
          backgroundColor: '#0f0c29',
        });
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        if (blob) {
          zip.file(`${student.student_code}_${student.first_name}_${student.last_name}.png`, blob);
        }
      } catch (err) {
        console.error('Capture failed:', student.student_code, err);
      }

      root.unmount();
      document.body.removeChild(container);
      setExportProgress(Math.round(((i + 1) / students.length) * 100));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `gradtrack-report-${yearName}.zip`);
    setExporting(false);
    setExportProgress(0);
  };

  // ── Export PDF ──
  const exportPdf = () => {
    if (students.length === 0) return;
    // Store data in localStorage for print page
    localStorage.setItem('gradtrack-print-data', JSON.stringify({ students, settings, yearName }));
    window.open('/admin/report/print', '_blank');
  };

  const previewStudent = students[previewIndex];
  const SCALE = 0.35; // preview scale

  return (
    <div className="p-4 flex flex-col gap-4 min-h-screen">
      <h1 className="text-xl font-bold">📊 รายงานผลการสอบ</h1>

      {/* Full-screen overlay during export — hides the card rendered at top-left for html2canvas */}
      {exporting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
          color: 'white', fontFamily: 'Prompt, sans-serif',
        }}>
          <span className="loading loading-spinner loading-lg" />
          <p style={{ fontSize: 20 }}>กำลัง export... {exportProgress}%</p>
          <progress className="progress progress-primary w-64" value={exportProgress} max={100} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* ── Settings Panel ── */}
        <div className="card bg-base-100 shadow border border-base-300 p-4 flex flex-col gap-4 h-fit">
          <h2 className="font-semibold text-base">⚙️ ตั้งค่ารายงาน</h2>

          {/* School logo */}
          <div className="form-control gap-2">
            <label className="label py-0"><span className="label-text text-xs">Logo โรงเรียน</span></label>
            {settings.school_logo_url ? (
              <div className="flex flex-col gap-2 items-center">
                <img
                  src={settings.school_logo_url}
                  alt="school logo"
                  className="w-24 h-24 object-contain rounded-lg border border-base-300 bg-base-200 p-1"
                />
                <button className="btn btn-error btn-xs" onClick={removeSchoolLogo}>🗑️ ลบ Logo</button>
              </div>
            ) : (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
              >
                {logoUploading ? <span className="loading loading-spinner loading-xs" /> : '🏫 อัพโหลด Logo โรงเรียน'}
              </button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={uploadSchoolLogo} />
          </div>

          {/* School name */}
          <div className="form-control gap-1">
            <label className="label py-0"><span className="label-text text-xs">ชื่อโรงเรียน</span></label>
            <input
              type="text"
              className="input input-bordered input-sm text-sm"
              value={settings.school_name || ''}
              onChange={e => setSettings(p => ({ ...p, school_name: e.target.value }))}
              placeholder="โรงเรียน..."
            />
          </div>

          {/* Congrats text */}
          <div className="form-control gap-1">
            <label className="label py-0"><span className="label-text text-xs">ข้อความแสดงความยินดี</span></label>
            <textarea
              className="textarea textarea-bordered textarea-sm text-sm"
              rows={3}
              value={settings.congrats_text || ''}
              onChange={e => setSettings(p => ({ ...p, congrats_text: e.target.value }))}
              placeholder="ขอแสดงความยินดี..."
            />
          </div>

          {/* Show quote toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={!!settings.show_quote}
              onChange={e => setSettings(p => ({ ...p, show_quote: e.target.checked }))}
            />
            <span className="text-sm">แสดงคำคม</span>
          </label>

          {/* Text color */}
          <div className="form-control gap-1">
            <label className="label py-0"><span className="label-text text-xs">สีตัวอักษร</span></label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.text_color || '#ffffff'}
                onChange={e => setSettings(p => ({ ...p, text_color: e.target.value }))}
                className="w-10 h-10 rounded cursor-pointer border border-base-300"
                style={{ padding: 2 }}
              />
              <span className="text-xs opacity-60">{settings.text_color || '#ffffff'}</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setSettings(p => ({ ...p, text_color: '#ffffff' }))}
              >รีเซ็ต</button>
            </div>
          </div>

          {/* Background image */}
          <div className="form-control gap-2">
            <label className="label py-0"><span className="label-text text-xs">ภาพพื้นหลัง</span></label>
            {settings.background_image_url ? (
              <div className="flex flex-col gap-2">
                <img
                  src={settings.background_image_url}
                  alt="background"
                  className="w-full h-28 object-cover rounded-lg border border-base-300"
                />
                <button className="btn btn-error btn-xs" onClick={removeBg}>🗑️ ลบภาพพื้นหลัง</button>
              </div>
            ) : (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => bgInputRef.current?.click()}
                disabled={bgUploading}
              >
                {bgUploading ? <span className="loading loading-spinner loading-xs" /> : '📷 เลือกภาพพื้นหลัง'}
              </button>
            )}
            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={uploadBg} />
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? <span className="loading loading-spinner loading-xs" /> : '💾 บันทึกการตั้งค่า'}
          </button>
        </div>

        {/* ── Preview Panel ── */}
        <div className="flex flex-col gap-3">
          <div className="card bg-base-100 shadow border border-base-300 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-base">👁️ ตัวอย่างรายงาน</h2>
              {students.length > 0 && (
                <select
                  className="select select-bordered select-xs"
                  style={{ colorScheme: 'light' }}
                  value={previewIndex}
                  onChange={e => setPreviewIndex(Number(e.target.value))}
                >
                  {students.map((s, i) => (
                    <option key={s.student_code} value={i} style={{ color: '#000' }}>
                      {s.first_name} {s.last_name} ({s.student_code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><span className="loading loading-spinner loading-lg" /></div>
            ) : !previewStudent ? (
              <p className="text-center text-base-content/40 py-20">ไม่มีนักเรียนที่บันทึกผล</p>
            ) : (
              <div className="flex justify-center overflow-hidden">
                {/* Scaled preview wrapper */}
                <div style={{
                  width: 1080 * SCALE,
                  height: 1080 * SCALE,
                  overflow: 'hidden',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  flexShrink: 0,
                }}>
                  <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width: 1080, height: 1080 }}>
                    <StudentCard student={previewStudent} settings={settings} yearName={yearName} quoteApproved={approvedQuotes.has(previewStudent.student_code)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Export Section ── */}
          <div className="card bg-base-100 shadow border border-base-300 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  นักเรียนที่บันทึกผล <span className="font-bold text-primary">{students.length}</span> คน
                </p>
                <p className="text-xs text-base-content/50">
                  (เฉพาะที่มีการบันทึกมหาวิทยาลัยแล้ว)
                </p>
              </div>

              {/* Progress */}
              {exporting && (
                <div className="flex items-center gap-2 text-sm opacity-60">
                  <span className="loading loading-spinner loading-xs" />
                  {exportProgress}%
                </div>
              )}

              <button
                className="btn btn-primary btn-sm gap-2"
                onClick={exportZip}
                disabled={exporting || students.length === 0}
              >
                📦 Export ZIP (รูปภาพ 1080×1080)
              </button>

              <button
                className="btn btn-secondary btn-sm gap-2"
                onClick={exportPdf}
                disabled={exporting || students.length === 0}
              >
                📄 Export PDF
              </button>
            </div>
          </div>

          {/* ── Quote Approval ── */}
          {students.some(s => s.quote) && (
            <div className="card bg-base-100 shadow border border-base-300 p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-base">💬 อนุมัติคำคม</h2>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-xs" onClick={() => setApprovedQuotes(new Set(students.map(s => s.student_code)))}>เลือกทั้งหมด</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setApprovedQuotes(new Set())}>ยกเลิกทั้งหมด</button>
                </div>
              </div>
              <input
                className="input input-bordered input-xs w-full mb-2"
                placeholder="🔍 ค้นหาชื่อนักเรียน..."
                value={quoteSearch}
                onChange={e => setQuoteSearch(e.target.value)}
              />
              {(() => {
                const filtered = students.filter(s => s.quote && (
                  `${s.first_name} ${s.last_name}`.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                  s.student_code.includes(quoteSearch)
                ));
                return (
                  <>
                    <p className="text-xs text-base-content/40 mb-1">{filtered.length} คน (อนุมัติแล้ว {filtered.filter(s => approvedQuotes.has(s.student_code)).length} คน)</p>
                    <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                      {filtered.map(s => (
                        <label key={s.student_code} className="flex items-start gap-3 cursor-pointer hover:bg-base-200 rounded-lg px-2 py-1.5">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm checkbox-primary mt-0.5 shrink-0"
                            checked={approvedQuotes.has(s.student_code)}
                            onChange={e => {
                              setApprovedQuotes(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(s.student_code) : next.delete(s.student_code);
                                return next;
                              });
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold">{s.first_name} {s.last_name} <span className="opacity-40">{s.student_code}</span></p>
                            <p className="text-xs text-base-content/60 italic line-clamp-2">{s.quote}</p>
                          </div>
                        </label>
                      ))}
                      {filtered.length === 0 && <p className="text-xs text-center opacity-40 py-4">ไม่พบนักเรียน</p>}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
