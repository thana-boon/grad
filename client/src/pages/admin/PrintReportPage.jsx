import { useEffect, useState } from 'react';
import { StudentCard } from './ReportPage';

// หน้านี้เปิดใน tab ใหม่เพื่อ print เป็น PDF
// รับข้อมูลจาก localStorage ที่ ReportPage เก็บไว้
export default function PrintReportPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('gradtrack-print-data');
      if (raw) {
        setData(JSON.parse(raw));
      }
    } catch (e) {
      console.error('Failed to load print data', e);
    }
  }, []);

  // Auto-print เมื่อโหลดเสร็จ
  useEffect(() => {
    if (!data) return;
    // รอ font + image โหลด
    const timer = setTimeout(() => {
      window.print();
    }, 1200);
    return () => clearTimeout(timer);
  }, [data]);

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Prompt, sans-serif' }}>
        <p>ไม่พบข้อมูล กรุณาเปิดจากหน้า Export PDF อีกครั้ง</p>
      </div>
    );
  }

  const { students, settings, yearName } = data;
  const SCALE = 0.714; // 1080 * 0.714 ≈ 771px ≈ A4 width at 96dpi

  return (
    <>
      {/* Print CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: white; font-family: 'Prompt', sans-serif; }

        .print-notice {
          text-align: center;
          padding: 20px;
          background: #f5f5f5;
          font-family: 'Prompt', sans-serif;
          color: #555;
        }

        .print-page-wrapper {
          width: ${Math.round(1080 * SCALE)}px;
          height: ${Math.round(1080 * SCALE)}px;
          overflow: hidden;
          margin: 0 auto 8px;
          page-break-after: always;
          break-after: page;
        }

        .print-scale-container {
          transform: scale(${SCALE});
          transform-origin: top left;
          width: 1080px;
          height: 1080px;
        }

        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .print-notice { display: none !important; }

          @page {
            size: ${Math.round(1080 * SCALE)}px ${Math.round(1080 * SCALE)}px;
            margin: 0;
          }

          .print-page-wrapper {
            margin: 0;
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      <div className="print-notice">
        <p>📄 หน้านี้พร้อม print เป็น PDF แล้ว ({students.length} คน)</p>
        <p style={{ fontSize: 13, marginTop: 4 }}>
          กด <strong>Ctrl+P</strong> เพื่อบันทึก PDF | ตั้ง Destination เป็น "Save as PDF" | ปิด margin และเลือก "No headers and footers"
        </p>
      </div>

      {students.map(student => (
        <div key={student.student_code} className="print-page-wrapper">
          <div className="print-scale-container">
            <StudentCard student={student} settings={settings} yearName={yearName} />
          </div>
        </div>
      ))}
    </>
  );
}
