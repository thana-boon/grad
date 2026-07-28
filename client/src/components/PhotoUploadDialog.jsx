import { useEffect, useMemo, useRef, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';
import Icon from './ui/Icon';

// โหลด Blob เป็น HTMLImageElement
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Auto-crop: หากรอบจริงของตัวนักเรียนจาก pixel ที่ไม่โปร่งใส (alpha bounding box)
 * แล้วตัดพื้นที่ว่างทิ้ง + ขยายตัวเด็กให้เต็มกรอบสัดส่วน 2:3 (เท่ากรอบ 240×360 ในรายงาน)
 * คืนค่าเป็น PNG blob ใหม่ — ถ้าหาตัวเด็กไม่เจอ (โปร่งใสทั้งรูป) จะคืน blob เดิม
 *
 *  - fill: ตัวคูณขยายตัวเด็กให้ใหญ่ขึ้นหลัง crop (1 = พอดีกรอบ, 1.2 = ใหญ่ขึ้น 20%)
 *          ส่วนที่ล้นจะถูกตัด โดยยึดหัวไว้ด้านบนเสมอ (ตัดส่วนล่าง/ขา ไม่ตัดหัว)
 *  - headroom: เว้นที่เหนือหัวเล็กน้อย (สัดส่วนของความสูงตัวเด็ก)
 */
async function autoCropToFrame(blob, { ratio = 240 / 360, fill = 1.2, headroom = 0.05, outW = 480 } = {}) {
  let img;
  try { img = await blobToImage(blob); } catch { return blob; }
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) return blob;

  // ตรวจหา bounding box บนภาพย่อส่วน เพื่อความเร็ว
  const DET = 400;
  const s = Math.min(1, DET / Math.max(W, H));
  const dw = Math.max(1, Math.round(W * s));
  const dh = Math.max(1, Math.round(H * s));
  const dc = document.createElement('canvas');
  dc.width = dw; dc.height = dh;
  const dctx = dc.getContext('2d', { willReadFrequently: true });
  dctx.drawImage(img, 0, 0, dw, dh);
  let data;
  try { data = dctx.getImageData(0, 0, dw, dh).data; } catch { return blob; }

  const ALPHA = 16; // ละเลย pixel จางๆ ที่หลงเหลือ
  let minX = dw, minY = dh, maxX = -1, maxY = -1;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      if (data[(y * dw + x) * 4 + 3] > ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return blob; // โปร่งใสทั้งรูป

  // แปลงพิกัดกลับเป็นความละเอียดเต็ม
  const bx = minX / s, by = minY / s;
  const bw = (maxX - minX + 1) / s, bh = (maxY - minY + 1) / s;

  // กรอบครอบสัดส่วน 2:3 ที่ครอบตัวเด็กพอดี (contain) — ตัวเด็กแตะขอบด้านที่ยาวกว่า
  let cw, ch;
  if (bw / bh > ratio) { cw = bw; ch = bw / ratio; }
  else { ch = bh; cw = bh * ratio; }

  // ขยายตัวเด็กให้ใหญ่ขึ้น = ย่อกรอบครอบลงตาม fill (ส่วนเกินจะถูกตัด)
  cw /= fill; ch /= fill;

  // จัดตำแหน่ง: กึ่งกลางแนวนอน + ยึดหัวไว้ด้านบน (เผื่อ headroom) แล้วตัดส่วนล่างแทน
  const cx = bx + bw / 2;
  const sx = cx - cw / 2;
  const sy = by - bh * headroom;

  const outH = Math.round(outW / ratio);
  const oc = document.createElement('canvas');
  oc.width = outW; oc.height = outH;
  oc.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, outW, outH);
  return await new Promise((resolve) => oc.toBlob((b) => resolve(b || blob), 'image/png'));
}

/**
 * Modal สำหรับยืนยันรูปก่อนอัปโหลด + เลือกลบพื้นหลังได้
 *
 * Props:
 *  - file: File | null        ไฟล์ที่ผู้ใช้เลือก (เปิด modal เมื่อไม่ null)
 *  - uploading: boolean       กำลังอัปโหลดอยู่ไหม (จากฝั่ง caller)
 *  - autoRemoveBg: boolean    ถ้า true จะเปิดสวิตช์ลบพื้นหลังให้อัตโนมัติเมื่อเปิด modal
 *  - onCancel: () => void
 *  - onConfirm: (finalFile: File) => void   ส่งไฟล์สุดท้ายกลับไปให้ caller อัปโหลด
 */
export default function PhotoUploadDialog({ file, uploading, autoRemoveBg = false, onCancel, onConfirm }) {
  const [removeBg, setRemoveBg] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [processedUrl, setProcessedUrl] = useState(null);
  const processedBlobRef = useRef(null);

  // preview ของรูปต้นฉบับ (สถานะอื่นรีเซ็ตด้วยการ remount ผ่าน key จาก parent)
  const originalUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => { if (originalUrl) URL.revokeObjectURL(originalUrl); };
  }, [originalUrl]);

  // เก็บกวาด objectURL ของรูปที่ลบพื้นหลัง
  useEffect(() => {
    return () => { if (processedUrl) URL.revokeObjectURL(processedUrl); };
  }, [processedUrl]);

  // แอดมินสั่งลบพื้นหลังให้รูปที่นักเรียนอัปมาแล้ว → เปิดสวิตช์อัตโนมัติตอน mount
  useEffect(() => {
    if (autoRemoveBg && file) handleToggle(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRemoveBg, file]);

  const handleToggle = async (checked) => {
    setError('');
    setRemoveBg(checked);
    if (!checked || !file) return;
    // ถ้าประมวลผลแล้วไม่ต้องทำซ้ำ
    if (processedBlobRef.current) return;

    setProcessing(true);
    try {
      const blob = await removeBackground(file);
      // ตัดพื้นที่ว่าง + ขยายตัวเด็กให้เต็มกรอบ ให้ทุกรูปขนาดเท่ากัน
      const cropped = await autoCropToFrame(blob);
      processedBlobRef.current = cropped;
      setProcessedUrl(URL.createObjectURL(cropped));
    } catch (err) {
      console.error('removeBackground failed', err);
      setError('ลบพื้นหลังไม่สำเร็จ ลองใหม่อีกครั้ง หรืออัปโหลดแบบเดิม');
      setRemoveBg(false);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirm = () => {
    if (!file) return;
    if (removeBg && processedBlobRef.current) {
      // เปลี่ยนนามสกุลเป็น .png เพราะมี transparency
      const base = file.name.replace(/\.[^.]+$/, '');
      const finalFile = new File([processedBlobRef.current], `${base}.png`, { type: 'image/png' });
      onConfirm(finalFile);
    } else {
      onConfirm(file);
    }
  };

  if (!file) return null;

  const showProcessed = removeBg && processedUrl && !processing;
  // พื้นหลังลายตารางหมากรุก เพื่อให้เห็นความโปร่งใส
  const checker = {
    backgroundImage:
      'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
    backgroundColor: '#fff',
  };

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label="ตรวจสอบรูปก่อนอัปโหลด">
      <div className="modal-box max-w-md">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="gt-chip size-8">
            <Icon name="image" size={16} />
          </span>
          <h3 className="text-base font-semibold">ตรวจสอบรูปก่อนอัปโหลด</h3>
        </div>

        {/* Preview */}
        <div className="mb-4 flex justify-center">
          <div
            className="relative h-64 w-48 overflow-hidden rounded-2xl border border-base-300"
            style={showProcessed ? checker : { background: '#f1edf7' }}
          >
            <img
              src={showProcessed ? processedUrl : originalUrl}
              alt="ตัวอย่างรูปที่จะอัปโหลด"
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: 'cover', objectPosition: 'center top' }}
            />
            {processing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1a102a]/65 text-white backdrop-blur-[1px]">
                <span className="loading loading-spinner loading-md" />
                <span className="text-xs">กำลังลบพื้นหลัง…</span>
              </div>
            )}
          </div>
        </div>

        {/* Toggle — card style */}
        <label
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
            removeBg
              ? 'border-primary/40 bg-primary/8'
              : 'border-base-300 bg-base-100 hover:border-primary/35 hover:bg-secondary/50'
          } ${(processing || uploading) ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={`gt-chip size-10 ${removeBg ? 'bg-primary text-primary-content' : ''}`}>
              <Icon name="sparkle" size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">ลบพื้นหลัง</span>
              <span className="block text-xs text-base-content/55">เหลือแต่ตัวนักเรียน</span>
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle toggle-primary shrink-0"
            checked={removeBg}
            disabled={processing || uploading}
            onChange={(e) => handleToggle(e.target.checked)}
          />
        </label>
        <p className="mt-2 px-1 text-xs leading-relaxed text-base-content/55">
          ครั้งแรกอาจใช้เวลาสักครู่ (ดาวน์โหลดตัวประมวลผล) ทุกอย่างทำในเครื่องของคุณ รูปไม่ถูกส่งออกไปข้างนอก
        </p>

        <div aria-live="polite">
          {error && (
            <p className="mt-2 flex items-center gap-1.5 px-1 text-sm text-error">
              <Icon name="alert" size={15} strokeWidth={2} />
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="modal-action">
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={uploading || processing}>
            ยกเลิก
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={uploading || processing}>
            {uploading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Icon name="upload" size={15} />
            )}
            อัปโหลด
          </button>
        </div>
      </div>
      <button
        className="modal-backdrop"
        aria-label="ปิด"
        onClick={uploading || processing ? undefined : onCancel}
      />
    </div>
  );
}
