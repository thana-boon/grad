import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import api from '../../utils/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import SearchableSelect from '../../components/SearchableSelect';

// ─── Layout engine (left column only, 1 or 2 cols, up to 20 unis) ─────────────
function getUniLayout(count) {
  if (count === 0) return {};
  if (count <= 4)  return { cols: 1, logo: 80,  uni: 22, fac: 16, prog: 13, pad: '14px 18px', gap: 12 };
  if (count <= 8)  return { cols: 1, logo: 64,  uni: 18, fac: 14, prog: 11, pad: '10px 14px', gap: 9  };
  if (count <= 10) return { cols: 1, logo: 52,  uni: 15, fac: 12, prog: 10, pad: '8px 12px',  gap: 7  };
  // >10: switch to 2 columns to use vertical space efficiently
  if (count <= 14) return { cols: 2, logo: 44,  uni: 13, fac: 11, prog: 9,  pad: '7px 10px',  gap: 6  };
  return           { cols: 2, logo: 36,  uni: 11, fac: 10, prog: 8,  pad: '5px 8px',   gap: 5  };
}

// ─── การตั้งค่าที่แยกรายคนได้ (รูปนักเรียนแต่ละคนมาไม่เหมือนกัน) ────────────────
export const PER_STUDENT_KEYS = ['photo_scale', 'photo_offset_y', 'photo_overflow', 'info_offset_y'];

// รหัสนักเรียนบางที่ pad 0 นำหน้า บางที่ไม่ pad — normalize ให้ตรงกับฝั่ง server
export const normCode = (c) => {
  const n = parseInt(c, 10);
  return Number.isNaN(n) ? String(c ?? '') : String(n);
};

// รวมค่ากลาง + ค่าเฉพาะคน (null/undefined ใน override = ใช้ค่ากลาง)
export function mergeStudentSettings(settings, override) {
  if (!override) return settings;
  const out = { ...settings };
  for (const k of PER_STUDENT_KEYS) {
    if (override[k] !== null && override[k] !== undefined) out[k] = override[k];
  }
  return out;
}

// แปลง hex (#rgb / #rrggbb) → rgba ตามค่าความทึบ (0–100)
function hexToRgba(hex, opacityPct) {
  let h = (hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(100, Math.max(0, opacityPct)) / 100})`;
}

// ─── StudentCard ─────────────────────────────────────────────────────────────
export function StudentCard({ student, settings, yearName, quoteApproved = true }) {
  const confirmedUni = student.admissions?.find(a => a.confirmed);
  const allAdmissions = student.admissions || [];

  // Group admissions by university
  const grouped = Object.values(
    allAdmissions.reduce((acc, a) => {
      const key = `${a.university_id || a.university_name}_${a.campus || ''}`;
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
  const showFrame = settings.show_photo_frame === undefined ? true : !!settings.show_photo_frame;
  const photoZoom = (Number(settings.photo_scale) || 100) / 100;
  const allowOverflow = !!settings.photo_overflow;
  const photoOffsetY = Number(settings.photo_offset_y) || 0;
  const nameBgOpacity = Number(settings.name_bg_opacity) || 0;
  const nameBg = nameBgOpacity > 0 ? hexToRgba(settings.name_bg_color, nameBgOpacity) : 'transparent';
  const infoOffsetY = Number(settings.info_offset_y) || 0;
  const confirmColor = settings.confirm_color || '#22c55e';
  const confirmOpacity = Number.isFinite(Number(settings.confirm_opacity)) ? Number(settings.confirm_opacity) : 22;
  const confirmBg = hexToRgba(confirmColor, confirmOpacity);
  const confirmBorder = hexToRgba(confirmColor, 80);

  const fullName = `${student.title_prefix || ''}${student.first_name || ''} ${student.last_name || ''}`;
  const nameFontSize = fullName.length <= 18 ? 38
    : fullName.length <= 22 ? 32
    : fullName.length <= 27 ? 27
    : fullName.length <= 33 ? 23
    : fullName.length <= 40 ? 19
    : fullName.length <= 48 ? 16
    : 14;

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
          src={resolveMediaUrl(settings.background_image_url)}
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
          src={resolveMediaUrl(settings.school_logo_url)}
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
                        background: isConfirmed ? confirmBg : 'rgba(255,255,255,0.1)',
                        border: isConfirmed ? `1.5px solid ${confirmBorder}` : '1px solid rgba(255,255,255,0.12)',
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
                            src={resolveMediaUrl(g.logo_url)}
                            crossOrigin="anonymous"
                            alt=""
                            style={{ width: logoSize, height: logoSize, objectFit: 'contain', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ flex: isVertical ? undefined : 1, minWidth: 0, textAlign: isVertical ? 'center' : 'left' }}>
                          <div style={{ fontSize: uniSize, fontWeight: 700, lineHeight: 1.25, marginBottom: 6 }}>
                            {g.university_name}{g.campus ? ` (${g.campus})` : ''}
                          </div>
                          {g.entries.map((e, i) => (
                            <div key={i} style={{
                              marginTop: i > 0 ? 8 : 0,
                              paddingTop: i > 0 ? 8 : 0,
                              borderTop: i > 0 ? `1px solid ${textColor}22` : 'none',
                            }}>
                              <div style={{ fontSize: facSize, opacity: 0.85, lineHeight: 1.3, marginBottom: 1 }}>
                                {e.faculty_name}
                                {!!e.confirmed && <span style={{ marginLeft: 6, fontSize: facSize - 2, color: 'rgba(74,222,128,0.9)' }}>✓</span>}
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
              borderRadius: showFrame ? 20 : 0,
              overflow: allowOverflow ? 'visible' : 'hidden',
              // clip-path บังคับตัดรูปตามกรอบแม้ตอน print/PDF — overflow:hidden ตัด child ที่มี transform ไม่อยู่บน Chrome print
              clipPath: allowOverflow ? undefined : `inset(0 round ${showFrame ? 20 : 0}px)`,
              border: showFrame ? `4px solid ${textColor}dd` : 'none',
              // โหมดล้นกรอบ: พื้นหลังต้องโปร่งใส ไม่งั้นจะบังรูปที่อยู่ชั้นหลัง
              background: showFrame && !allowOverflow ? '#555' : 'transparent',
              position: 'relative', flexShrink: 0,
            }}>
              {student.photo_url
                ? allowOverflow
                  // โหมดล้นกรอบ: ต้องใช้ <img> เพราะรูปต้องโผล่พ้นกรอบได้ (background ล้นกล่องไม่ได้)
                  ? <img
                      src={resolveMediaUrl(student.photo_url)}
                      crossOrigin="anonymous"
                      alt=""
                      // zIndex -1 ดันรูปไปอยู่หลังสุด (เหนือพื้นหลัง แต่ใต้ข้อความ/การ์ดทั้งหมด)
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', transform: `translateY(${photoOffsetY}px) scale(${photoZoom})`, transformOrigin: 'center top', zIndex: -1 }}
                    />
                  // โหมดปกติ: ใช้ background-image (backgroundSize:cover) — html2canvas เรนเดอร์สัดส่วนถูก
                  // ต่างจาก object-fit ของ <img> ที่ html2canvas 1.4.1 ตีความเป็น fill ทำให้รูปยืด/หัวแบน
                  : <div
                      style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(${resolveMediaUrl(student.photo_url)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center top',
                        backgroundRepeat: 'no-repeat',
                        transform: `translateY(${photoOffsetY}px) scale(${photoZoom})`,
                        transformOrigin: 'center top',
                      }}
                    />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 100 }}>👤</div>
              }
            </div>

            {/* Name + Quote + กล่องยืนยัน — เลื่อนขึ้น/ลงพร้อมกัน */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              width: '100%', boxSizing: 'border-box',
              transform: `translateY(${infoOffsetY}px)`,
            }}>
              {/* Name */}
              <div style={{
                fontSize: nameFontSize, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, color: textColor,
                background: nameBg,
                padding: nameBgOpacity > 0 ? '8px 22px' : 0,
                borderRadius: nameBgOpacity > 0 ? 14 : 0,
                maxWidth: '100%', boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}>
                {fullName}
              </div>

              {/* Quote */}
              {!!settings.show_quote && !!student.quote && quoteApproved && (
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
                  background: confirmBg,
                  border: `2px solid ${confirmBorder}`,
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
    </div>
  );
}

// ─── ReportPage ───────────────────────────────────────────────────────────────
export default function ReportPage() {
  const [settings, setSettings] = useState({ congrats_text: '', show_quote: true, background_image_url: null, school_name: '', school_logo_url: null, text_color: '#ffffff', show_photo_frame: true, photo_scale: 100, photo_overflow: false, photo_offset_y: 0, name_bg_color: '#000000', name_bg_opacity: 0, info_offset_y: 0, confirm_color: '#22c55e', confirm_opacity: 22 });
  // ค่าเฉพาะรายคน: { [normCode]: { photo_scale, photo_offset_y, photo_overflow, info_offset_y } }
  const [overrides, setOverrides] = useState({});
  const [dirtyCodes, setDirtyCodes] = useState(new Set());
  const [perStudent, setPerStudent] = useState(false);
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
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load settings + year + students
  useEffect(() => {
    Promise.all([
      api.get('/report-settings'),
      api.get('/academic-years'),
      api.get('/academic-years/active').then(r => r.data || null).catch(() => null),
      api.get('/report-settings/students').then(r => r.data || {}).catch((err) => {
        // แยกแยะ: endpoint ไม่มีบน server (ยังไม่ deploy) vs ปัญหาอื่น
        console.error('โหลดค่าเฉพาะรายคนไม่สำเร็จ', err);
        showToast('โหลดค่าเฉพาะรายคนไม่สำเร็จ — server อาจยังไม่อัปเดต', 'error');
        return {};
      }),
    ]).then(([sRes, yRes, activeRes, ovRes]) => {
      setSettings(sRes.data || { congrats_text: '', show_quote: true, background_image_url: null });
      setOverrides(ovRes);
      const years = yRes.data || [];
      if (activeRes?.active_year_id) {
        const active = years.find(y => String(y.id) === String(activeRes.active_year_id)) || activeRes.year;
        setYearId(String(activeRes.active_year_id));
        setYearName(String(active?.year_be || active?.title || active?.name || ''));
      } else if (years.length > 0) {
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
    const codes = [...dirtyCodes];
    try {
      await api.put('/report-settings', {
        congrats_text: settings.congrats_text,
        show_quote: settings.show_quote,
        school_name: settings.school_name,
        text_color: settings.text_color,
        show_photo_frame: settings.show_photo_frame,
        photo_scale: settings.photo_scale,
        photo_overflow: settings.photo_overflow,
        photo_offset_y: settings.photo_offset_y,
        name_bg_color: settings.name_bg_color,
        name_bg_opacity: settings.name_bg_opacity,
        info_offset_y: settings.info_offset_y,
        confirm_color: settings.confirm_color,
        confirm_opacity: settings.confirm_opacity,
      });
      // เซฟค่าเฉพาะรายคน — เก็บผลรายตัวเพื่อรู้ว่ามีอันไหน fail
      const results = await Promise.allSettled(
        codes.map(code =>
          api.put(`/report-settings/students/${code}`, overrides[code] || {})
        )
      );
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('บันทึกค่าเฉพาะรายคนไม่สำเร็จ', failed.map(f => f.reason));
        // เอาเฉพาะที่ fail กลับเข้า dirty เพื่อให้กดเซฟซ้ำได้ ที่สำเร็จเอาออก
        const failedCodes = new Set(codes.filter((_, i) => results[i].status === 'rejected'));
        setDirtyCodes(failedCodes);
        showToast(`บันทึกค่ากลางแล้ว แต่ค่าเฉพาะรายคน ${failed.length} คนไม่สำเร็จ`, 'error');
      } else {
        setDirtyCodes(new Set());
        showToast(codes.length > 0 ? `บันทึกสำเร็จ (รวมเฉพาะคน ${codes.length} คน) ✅` : 'บันทึกสำเร็จ ✅');
      }
    } catch (err) {
      console.error('บันทึกการตั้งค่าไม่สำเร็จ', err);
      showToast('บันทึกไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ / สิทธิ์ผู้ใช้', 'error');
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

  // ── Export helpers ──
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

  // เรนเดอร์การ์ดนักเรียน 1 ใบ → <canvas> (ใช้ร่วมกันทั้ง ZIP และ PDF)
  // scale = ความละเอียด (2 = คมขึ้น 2 เท่า, ช่วยให้ตราไม่มัว)
  const renderCardCanvas = async (student, scale = 2) => {
    // preload รูปเฉพาะคนนี้ก่อน (ทีละคน กัน server โดนยิงรูปพร้อมกันทีเดียว)
    await preloadImages([
      resolveMediaUrl(student.photo_url),
      ...(student.admissions || []).map(a => resolveMediaUrl(a.logo_url)),
    ]);

    // วางที่มุมซ้ายบนให้ html2canvas เห็น — ถูก overlay ตอน export ทับไว้ (z 99999)
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;width:1080px;height:1080px;overflow:hidden;pointer-events:none;z-index:1000;';
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(
      <StudentCard
        student={student}
        settings={mergeStudentSettings(settings, overrides[normCode(student.student_code)])}
        yearName={yearName}
        quoteApproved={approvedQuotes.has(student.student_code)}
      />
    );

    // รอ paint จริง (แทน delay ตายตัว 1 วินาที/คน) — รูปกับฟอนต์ถูกโหลดไว้ก่อนแล้ว
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 50));

    try {
      // จับภาพ container ตามขนาดจริง (1080×1080) ตรงๆ — ไม่ส่ง width/height/window
      // เพื่อเลี่ยง logic crop ของ html2canvas ที่ทำให้สัดส่วนเพี้ยน (ภาพยืด/หัวแบน)
      return await html2canvas(container, {
        useCORS: true, allowTaint: false,
        scale, logging: false,
        imageTimeout: 15000,
        backgroundColor: '#0f0c29',
      });
    } finally {
      root.unmount();
      document.body.removeChild(container);
    }
  };

  // วางภาพลง PDF แบบคงสัดส่วน (letterbox-fit) — ป้องกันภาพยืดถ้าขนาดหน้ากับ canvas ไม่ตรงกัน
  const addFittedImage = (doc, imgData, fmt, cw, ch) => {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const fit = Math.min(pw / cw, ph / ch);
    const w = cw * fit;
    const h = ch * fit;
    doc.addImage(imgData, fmt, (pw - w) / 2, (ph - h) / 2, w, h);
  };

  // ── Export คนเดียว (คนที่กำลังพรีวิว) — ไว้เทสเร็ว ไม่ต้องรอทั้งชั้น ──
  const exportOne = async () => {
    if (!previewStudent) return;
    setExporting(true);
    setExportProgress(0);
    try {
      await preloadImages([
        resolveMediaUrl(settings.background_image_url),
        resolveMediaUrl(settings.school_logo_url),
      ]);
      await document.fonts.ready;
      const canvas = await renderCardCanvas(previewStudent);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (blob) saveAs(blob, `${previewStudent.student_code}_${previewStudent.first_name}_${previewStudent.last_name}.png`);
      setExportProgress(100);
    } catch (err) {
      console.error('Export คนเดียวไม่สำเร็จ', err);
      showToast('ดาวน์โหลดรูปคนนี้ไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const exportZip = async () => {
    if (students.length === 0) return;
    setExporting(true);
    setExportProgress(0);
    try {
      const zip = new JSZip();
      await preloadImages([
        resolveMediaUrl(settings.background_image_url),
        resolveMediaUrl(settings.school_logo_url),
      ]);
      await document.fonts.ready;

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        try {
          const canvas = await renderCardCanvas(student);
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          if (blob) zip.file(`${student.student_code}_${student.first_name}_${student.last_name}.png`, blob);
        } catch (err) {
          console.error('Capture failed:', student.student_code, err);
        }
        setExportProgress(Math.round(((i + 1) / students.length) * 100));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `gradtrack-report-${yearName}.zip`);
    } catch (err) {
      console.error('Export ZIP failed', err);
      showToast('สร้าง ZIP ไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  // ── Export PDF ──
  // สร้าง PDF ตรงๆ ฝั่ง client (html2canvas → jsPDF) ทีละใบ — ไม่พึ่ง print dialog ของ browser
  // ที่ค้างเมื่อมีนักเรียนหลักร้อยคน
  const exportPdf = async () => {
    if (students.length === 0) return;
    setExporting(true);
    setExportProgress(0);
    try {
      await preloadImages([
        resolveMediaUrl(settings.background_image_url),
        resolveMediaUrl(settings.school_logo_url),
      ]);
      await document.fonts.ready;

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'px', format: [1080, 1080], compress: true });

      let added = 0;
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        try {
          const canvas = await renderCardCanvas(student);
          // JPEG 0.92 เพื่อลดขนาดไฟล์ (หลายร้อยหน้าเป็น PNG จะใหญ่มาก)
          const img = canvas.toDataURL('image/jpeg', 0.92);
          if (added > 0) doc.addPage([1080, 1080], 'portrait');
          // วางแบบคงสัดส่วน (fit) — กันภาพยืด/หัวแบน ไม่ว่าขนาดหน้าจะเป็นเท่าไร
          addFittedImage(doc, img, 'JPEG', canvas.width, canvas.height);
          added++;
        } catch (err) {
          console.error('Capture failed:', student.student_code, err);
        }
        setExportProgress(Math.round(((i + 1) / students.length) * 100));
      }

      if (added === 0) {
        showToast('ไม่สามารถสร้างหน้า PDF ได้', 'error');
        return;
      }
      doc.save(`gradtrack-report-${yearName}.pdf`);
    } catch (err) {
      console.error('Export PDF failed', err);
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const previewStudent = students[previewIndex];
  const SCALE = 0.35; // preview scale

  // ── ค่าเฉพาะรายคน ──
  const previewCode = previewStudent ? normCode(previewStudent.student_code) : null;
  const activeOverride = previewCode ? overrides[previewCode] : null;
  // แก้ค่าเฉพาะคนได้ต่อเมื่อเปิดโหมด และมีนักเรียนที่กำลังพรีวิวอยู่
  const editingStudent = perStudent && !!previewCode;
  const hasOverride = !!activeOverride && PER_STUDENT_KEYS.some(k => activeOverride[k] !== null && activeOverride[k] !== undefined);

  // อ่านค่า: โหมดรายคนใช้ค่า override ถ้ามี ไม่มีก็ตกไปใช้ค่ากลาง
  const pv = (key) => {
    if (editingStudent && activeOverride && activeOverride[key] !== null && activeOverride[key] !== undefined) {
      return activeOverride[key];
    }
    return settings[key];
  };
  const isOverridden = (key) =>
    editingStudent && !!activeOverride && activeOverride[key] !== null && activeOverride[key] !== undefined;

  // เขียนค่า: null = กลับไปใช้ค่ากลาง
  const setPv = (key, value) => {
    if (editingStudent) {
      setOverrides(prev => ({ ...prev, [previewCode]: { ...(prev[previewCode] || {}), [key]: value } }));
      setDirtyCodes(prev => new Set(prev).add(previewCode));
    } else {
      setSettings(p => ({ ...p, [key]: value }));
    }
  };
  const resetPv = (key, def) => setPv(key, editingStudent ? null : def);

  // ล้าง override ทั้งหมดของคนนี้
  const clearOverride = async () => {
    if (!previewCode) return;
    await api.delete(`/report-settings/students/${previewCode}`);
    setOverrides(prev => {
      const next = { ...prev };
      delete next[previewCode];
      return next;
    });
    setDirtyCodes(prev => {
      const next = new Set(prev);
      next.delete(previewCode);
      return next;
    });
  };

  const previewSettings = mergeStudentSettings(settings, activeOverride);

  return (
    <div className="p-4 flex flex-col gap-4 min-h-screen">
      {/* Toast */}
      {toast && (
        <div className="toast toast-top toast-end z-[100000]">
          <div className={`alert alert-${toast.type === 'error' ? 'error' : 'success'} py-2 text-sm`}>
            {toast.msg}
          </div>
        </div>
      )}

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
        <div className="card bg-base-100 shadow border border-base-300 h-fit overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-base-300 bg-base-200/50">
            <h2 className="font-semibold text-base">⚙️ ตั้งค่ารายงาน</h2>
          </div>

          <div className="p-4 flex flex-col gap-5">

            {/* ── Section: โรงเรียน ── */}
            <section className="flex flex-col gap-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-base-content/40">🏫 โรงเรียน</p>

              {/* School logo — compact row */}
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 shrink-0 rounded-lg border border-base-300 bg-base-200 flex items-center justify-center overflow-hidden">
                  {settings.school_logo_url
                    ? <img src={resolveMediaUrl(settings.school_logo_url)} alt="logo" className="w-full h-full object-contain p-1" />
                    : <span className="text-2xl opacity-30">🏫</span>}
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-xs text-base-content/60">โลโก้โรงเรียน</span>
                  <div className="flex gap-1">
                    <button
                      className="btn btn-outline btn-xs"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                    >
                      {logoUploading ? <span className="loading loading-spinner loading-xs" /> : (settings.school_logo_url ? 'เปลี่ยน' : 'อัพโหลด')}
                    </button>
                    {settings.school_logo_url && (
                      <button className="btn btn-ghost btn-xs text-error" onClick={removeSchoolLogo}>ลบ</button>
                    )}
                  </div>
                </div>
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
            </section>

            <div className="divider my-0" />

            {/* ── Section: เนื้อหาบนการ์ด ── */}
            <section className="flex flex-col gap-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-base-content/40">📝 เนื้อหาบนการ์ด</p>

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

              {/* Toggles group */}
              <div className="flex flex-col gap-2">
                {[
                  { key: 'show_quote', label: 'แสดงคำคม' },
                  { key: 'show_photo_frame', label: 'แสดงกรอบรูปนักเรียน' },
                ].map(({ key, label }) => {
                  const on = !!settings[key];
                  return (
                    <label
                      key={key}
                      className={`flex items-center justify-between gap-3 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                        on
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-base-300 bg-base-200/40 hover:border-base-content/20'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className={`text-xs font-bold w-9 text-center rounded px-1 py-0.5 ${on ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/50'}`}>
                          {on ? 'เปิด' : 'ปิด'}
                        </span>
                        <span className={on ? 'font-semibold' : 'text-base-content/70'}>{label}</span>
                      </span>
                      <input
                        type="checkbox"
                        className="toggle toggle-primary toggle-sm"
                        checked={on}
                        onChange={e => setSettings(p => ({ ...p, [key]: e.target.checked }))}
                      />
                    </label>
                  );
                })}
              </div>

              {/* ── กลุ่มค่าที่แยกรายคนได้ ── */}
              <div className={`flex flex-col gap-3 rounded-lg border p-3 transition-colors ${
                editingStudent ? 'border-secondary/60 bg-secondary/5' : 'border-base-300'
              }`}>
                {/* Mode switch: ค่ากลาง ↔ เฉพาะคนที่พรีวิวอยู่ */}
                <div className="flex flex-col gap-1.5">
                  <div className="join w-full">
                    <button
                      className={`btn btn-xs join-item flex-1 ${!perStudent ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setPerStudent(false)}
                    >ทุกคน</button>
                    <button
                      className={`btn btn-xs join-item flex-1 ${perStudent ? 'btn-secondary' : 'btn-outline'}`}
                      onClick={() => setPerStudent(true)}
                      disabled={!previewCode}
                    >เฉพาะคนนี้</button>
                  </div>
                  <p className="text-[10px] leading-relaxed text-base-content/50">
                    {editingStudent ? (
                      <>ปรับให้ <span className="font-semibold text-base-content/80">{previewStudent.first_name} {previewStudent.last_name}</span> คนเดียว — คนอื่นยังใช้ค่ากลาง</>
                    ) : perStudent
                      ? 'เลือกนักเรียนในช่องพรีวิวก่อน จึงจะปรับเฉพาะคนได้'
                      : 'ค่าเหล่านี้ใช้กับนักเรียนทุกคน ยกเว้นคนที่ตั้งค่าเฉพาะไว้'}
                  </p>
                  {editingStudent && hasOverride && (
                    <button className="btn btn-ghost btn-xs text-error self-start" onClick={clearOverride}>
                      ↺ ล้างค่าเฉพาะคนนี้ (กลับไปใช้ค่ากลาง)
                    </button>
                  )}
                </div>

                {/* Photo overflow */}
                {(() => {
                  const on = !!pv('photo_overflow');
                  return (
                    <label className={`flex items-center justify-between gap-3 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                      on ? 'border-primary/60 bg-primary/10' : 'border-base-300 bg-base-200/40 hover:border-base-content/20'
                    }`}>
                      <span className="flex items-center gap-2 text-sm">
                        <span className={`text-xs font-bold w-9 text-center rounded px-1 py-0.5 ${on ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/50'}`}>
                          {on ? 'เปิด' : 'ปิด'}
                        </span>
                        <span className={on ? 'font-semibold' : 'text-base-content/70'}>ให้รูปล้นกรอบได้ (อยู่ชั้นหลังสุด)</span>
                        {isOverridden('photo_overflow') && <span className="badge badge-secondary badge-xs">เฉพาะคน</span>}
                      </span>
                      <input
                        type="checkbox"
                        className="toggle toggle-primary toggle-sm"
                        checked={on}
                        onChange={e => setPv('photo_overflow', e.target.checked)}
                      />
                    </label>
                  );
                })()}

                {/* Photo zoom */}
                <div className="form-control gap-1 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="label-text text-xs flex items-center gap-1.5">
                      ขนาดรูปนักเรียน (zoom)
                      {isOverridden('photo_scale') && <span className="badge badge-secondary badge-xs">เฉพาะคน</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums">{pv('photo_scale') ?? 100}%</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => resetPv('photo_scale', 100)}>รีเซ็ต</button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={300}
                    step={5}
                    value={pv('photo_scale') ?? 100}
                    onChange={e => setPv('photo_scale', Number(e.target.value))}
                    className="range range-primary range-xs"
                  />
                  <div className="flex justify-between text-[10px] text-base-content/40 px-0.5">
                    <span>ย่อ 50%</span>
                    <span>ปกติ 100%</span>
                    <span>ขยาย 300%</span>
                  </div>
                </div>

                {/* Photo offset Y — เลื่อนรูปขึ้น/ลง */}
                <div className="form-control gap-1 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="label-text text-xs flex items-center gap-1.5">
                      เลื่อนรูปขึ้น/ลง
                      {isOverridden('photo_offset_y') && <span className="badge badge-secondary badge-xs">เฉพาะคน</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums">{pv('photo_offset_y') ?? 0}px</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => resetPv('photo_offset_y', 0)}>รีเซ็ต</button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={-300}
                    max={300}
                    step={5}
                    value={pv('photo_offset_y') ?? 0}
                    onChange={e => setPv('photo_offset_y', Number(e.target.value))}
                    className="range range-primary range-xs"
                  />
                  <div className="flex justify-between text-[10px] text-base-content/40 px-0.5">
                    <span>ขึ้น</span>
                    <span>กลาง</span>
                    <span>ลง</span>
                  </div>
                </div>

                {/* Info offset Y — เลื่อนชื่อ + กล่องมหาลัยที่ยืนยัน ขึ้น/ลงพร้อมกัน */}
                <div className="form-control gap-1 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="label-text text-xs flex items-center gap-1.5">
                      เลื่อนชื่อ + มหาลัยที่ยืนยัน ขึ้น/ลง
                      {isOverridden('info_offset_y') && <span className="badge badge-secondary badge-xs">เฉพาะคน</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums">{pv('info_offset_y') ?? 0}px</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => resetPv('info_offset_y', 0)}>รีเซ็ต</button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={-300}
                    max={300}
                    step={5}
                    value={pv('info_offset_y') ?? 0}
                    onChange={e => setPv('info_offset_y', Number(e.target.value))}
                    className="range range-primary range-xs"
                  />
                  <div className="flex justify-between text-[10px] text-base-content/40 px-0.5">
                    <span>ขึ้น</span>
                    <span>กลาง</span>
                    <span>ลง</span>
                  </div>
                </div>
              </div>
            </section>

            <div className="divider my-0" />

            {/* ── Section: รูปแบบ & ดีไซน์ ── */}
            <section className="flex flex-col gap-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-base-content/40">🎨 รูปแบบ & ดีไซน์</p>

              {/* Text color */}
              <div className="flex items-center justify-between gap-2">
                <span className="label-text text-xs">สีตัวอักษร</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-50">{settings.text_color || '#ffffff'}</span>
                  <input
                    type="color"
                    value={settings.text_color || '#ffffff'}
                    onChange={e => setSettings(p => ({ ...p, text_color: e.target.value }))}
                    className="w-9 h-9 rounded cursor-pointer border border-base-300"
                    style={{ padding: 2 }}
                  />
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setSettings(p => ({ ...p, text_color: '#ffffff' }))}
                  >รีเซ็ต</button>
                </div>
              </div>

              {/* Name background — สี + ความทึบ (ช่วยให้ชื่ออ่านง่ายเวลามีรูปอยู่ข้างหลัง) */}
              <div className="form-control gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-text text-xs">พื้นหลังชื่อนักเรียน</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.name_bg_color || '#000000'}
                      onChange={e => setSettings(p => ({ ...p, name_bg_color: e.target.value }))}
                      className="w-9 h-9 rounded cursor-pointer border border-base-300"
                      style={{ padding: 2 }}
                    />
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => setSettings(p => ({ ...p, name_bg_color: '#000000', name_bg_opacity: 0 }))}
                    >รีเซ็ต</button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="label-text text-xs">ความทึบ</span>
                  <span className="text-xs font-semibold tabular-nums">{settings.name_bg_opacity ?? 0}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.name_bg_opacity ?? 0}
                  onChange={e => setSettings(p => ({ ...p, name_bg_opacity: Number(e.target.value) }))}
                  className="range range-primary range-xs"
                />
                <div className="flex justify-between text-[10px] text-base-content/40 px-0.5">
                  <span>โปร่งใส 0%</span>
                  <span>ทึบ 100%</span>
                </div>
              </div>

              {/* Confirmed university background — สี + ความทึบ */}
              <div className="form-control gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-text text-xs">พื้นหลังมหาลัยที่ยืนยัน</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.confirm_color || '#22c55e'}
                      onChange={e => setSettings(p => ({ ...p, confirm_color: e.target.value }))}
                      className="w-9 h-9 rounded cursor-pointer border border-base-300"
                      style={{ padding: 2 }}
                    />
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => setSettings(p => ({ ...p, confirm_color: '#22c55e', confirm_opacity: 22 }))}
                    >รีเซ็ต</button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="label-text text-xs">ความทึบ</span>
                  <span className="text-xs font-semibold tabular-nums">{settings.confirm_opacity ?? 22}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.confirm_opacity ?? 22}
                  onChange={e => setSettings(p => ({ ...p, confirm_opacity: Number(e.target.value) }))}
                  className="range range-primary range-xs"
                />
                <div className="flex justify-between text-[10px] text-base-content/40 px-0.5">
                  <span>โปร่งใส 0%</span>
                  <span>ทึบ 100%</span>
                </div>
              </div>

              {/* Background image */}
              <div className="form-control gap-2">
                <label className="label py-0"><span className="label-text text-xs">ภาพพื้นหลัง</span></label>
                {settings.background_image_url ? (
                  <div className="relative group">
                    <img
                      src={resolveMediaUrl(settings.background_image_url)}
                      alt="background"
                      className="w-full h-28 object-cover rounded-lg border border-base-300"
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/40 transition rounded-lg opacity-0 group-hover:opacity-100">
                      <button className="btn btn-xs" onClick={() => bgInputRef.current?.click()} disabled={bgUploading}>
                        {bgUploading ? <span className="loading loading-spinner loading-xs" /> : 'เปลี่ยน'}
                      </button>
                      <button className="btn btn-error btn-xs" onClick={removeBg}>ลบ</button>
                    </div>
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
            </section>
          </div>

          {/* Sticky save footer */}
          <div className="px-4 py-3 border-t border-base-300 bg-base-200/50">
            <button
              className="btn btn-primary btn-sm w-full"
              onClick={saveSettings}
              disabled={saving}
            >
              {saving
                ? <span className="loading loading-spinner loading-xs" />
                : `💾 บันทึกการตั้งค่า${dirtyCodes.size > 0 ? ` (+ เฉพาะคน ${dirtyCodes.size} คน)` : ''}`}
            </button>
          </div>
        </div>

        {/* ── Preview Panel ── */}
        <div className="flex flex-col gap-3">
          <div className="card bg-base-100 shadow border border-base-300 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold text-base shrink-0">👁️ ตัวอย่างรายงาน</h2>
              {students.length > 0 && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    className="btn btn-outline btn-sm btn-square shrink-0"
                    onClick={() => setPreviewIndex(i => Math.max(0, i - 1))}
                    disabled={previewIndex <= 0}
                    title="คนก่อนหน้า"
                  >‹</button>
                  <SearchableSelect
                    className="w-40 sm:w-56 min-w-0"
                    value={previewIndex}
                    onChange={setPreviewIndex}
                    placeholder="เลือกนักเรียน..."
                    options={students.map((s, i) => {
                      const ov = overrides[normCode(s.student_code)];
                      const tuned = ov && PER_STUDENT_KEYS.some(k => ov[k] !== null && ov[k] !== undefined);
                      return {
                        value: i,
                        label: `${tuned ? '🎨 ' : ''}${s.title_prefix || ''}${s.first_name} ${s.last_name} (${s.student_code})`,
                      };
                    })}
                  />
                  <button
                    className="btn btn-outline btn-sm btn-square shrink-0"
                    onClick={() => setPreviewIndex(i => Math.min(students.length - 1, i + 1))}
                    disabled={previewIndex >= students.length - 1}
                    title="คนถัดไป"
                  >›</button>
                  <span className="text-xs text-base-content/50 tabular-nums whitespace-nowrap shrink-0">
                    {previewIndex + 1}/{students.length}
                  </span>
                </div>
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
                    <StudentCard student={previewStudent} settings={previewSettings} yearName={yearName} quoteApproved={approvedQuotes.has(previewStudent.student_code)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Export Section ── */}
          <div className="card bg-base-100 shadow border border-base-300 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex flex-col items-center justify-center w-16 shrink-0 rounded-lg bg-primary/10 py-1.5">
                  <span className="text-2xl font-bold leading-none text-primary">{students.length}</span>
                  <span className="text-[10px] text-base-content/60">คน</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">นักเรียนที่บันทึกผล</p>
                  <p className="text-xs text-base-content/50">เฉพาะที่มีการบันทึกมหาวิทยาลัยแล้ว</p>
                </div>
              </div>

              {/* Progress */}
              {exporting && (
                <div className="flex items-center gap-2 text-sm opacity-60">
                  <span className="loading loading-spinner loading-xs" />
                  {exportProgress}%
                </div>
              )}

              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  className="btn btn-outline btn-sm gap-2 flex-1 sm:flex-none"
                  onClick={exportOne}
                  disabled={exporting || !previewStudent}
                  title="ดาวน์โหลดเฉพาะคนที่พรีวิวอยู่ (PNG) — ไว้เทสเร็ว"
                >
                  ⬇️ โหลดคนนี้
                </button>
                <button
                  className="btn btn-primary btn-sm gap-2 flex-1 sm:flex-none"
                  onClick={exportZip}
                  disabled={exporting || students.length === 0}
                >
                  📦 Export ZIP
                </button>
                <button
                  className="btn btn-secondary btn-sm gap-2 flex-1 sm:flex-none"
                  onClick={exportPdf}
                  disabled={exporting || students.length === 0}
                >
                  📄 Export PDF
                </button>
              </div>
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
                            <p className="text-xs font-semibold">{s.title_prefix}{s.first_name} {s.last_name} <span className="opacity-40">{s.student_code}</span></p>
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
