import { useEffect, useMemo, useRef, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';

/**
 * Modal สำหรับยืนยันรูปก่อนอัปโหลด + เลือกลบพื้นหลังได้
 *
 * Props:
 *  - file: File | null        ไฟล์ที่ผู้ใช้เลือก (เปิด modal เมื่อไม่ null)
 *  - uploading: boolean       กำลังอัปโหลดอยู่ไหม (จากฝั่ง caller)
 *  - onCancel: () => void
 *  - onConfirm: (finalFile: File) => void   ส่งไฟล์สุดท้ายกลับไปให้ caller อัปโหลด
 */
export default function PhotoUploadDialog({ file, uploading, onCancel, onConfirm }) {
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

  const handleToggle = async (checked) => {
    setError('');
    setRemoveBg(checked);
    if (!checked || !file) return;
    // ถ้าประมวลผลแล้วไม่ต้องทำซ้ำ
    if (processedBlobRef.current) return;

    setProcessing(true);
    try {
      const blob = await removeBackground(file);
      processedBlobRef.current = blob;
      setProcessedUrl(URL.createObjectURL(blob));
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
    <div className="modal modal-open">
      <div className="modal-box max-w-md">
        <h3 className="font-bold text-lg mb-3">ตรวจสอบรูปก่อนอัปโหลด</h3>

        {/* Preview */}
        <div className="flex justify-center mb-4">
          <div
            className="relative w-48 h-64 rounded-2xl overflow-hidden border border-base-300"
            style={showProcessed ? checker : { background: '#e5e7eb' }}
          >
            <img
              src={showProcessed ? processedUrl : originalUrl}
              alt="ตัวอย่างรูป"
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover', objectPosition: 'center top' }}
            />
            {processing && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 text-white">
                <span className="loading loading-spinner loading-md" />
                <span className="text-xs">กำลังลบพื้นหลัง…</span>
              </div>
            )}
          </div>
        </div>

        {/* Toggle — card style */}
        <label
          className={`flex items-center justify-between gap-3 cursor-pointer rounded-xl border-2 p-3 transition-colors ${
            removeBg
              ? 'border-primary bg-primary/10'
              : 'border-base-300 bg-base-100 hover:border-primary/50'
          } ${(processing || uploading) ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">✂️</span>
            <div className="min-w-0">
              <div className="font-semibold text-sm">ลบพื้นหลัง</div>
              <div className="text-xs text-base-content/60">เหลือแต่ตัวนักเรียน</div>
            </div>
          </div>
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-lg shrink-0"
            checked={removeBg}
            disabled={processing || uploading}
            onChange={(e) => handleToggle(e.target.checked)}
          />
        </label>
        <p className="text-xs text-base-content/60 mt-2 px-1">
          ครั้งแรกอาจใช้เวลาสักครู่ (ดาวน์โหลดตัวประมวลผล) ทุกอย่างทำในเครื่องของคุณ รูปไม่ถูกส่งออกไปข้างนอก
        </p>

        {error && <p className="text-error text-sm mt-2 px-1">{error}</p>}

        {/* Actions */}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onCancel} disabled={uploading || processing}>
            ยกเลิก
          </button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={uploading || processing}>
            {uploading ? <span className="loading loading-spinner loading-xs" /> : 'อัปโหลด'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={uploading || processing ? undefined : onCancel} />
    </div>
  );
}
