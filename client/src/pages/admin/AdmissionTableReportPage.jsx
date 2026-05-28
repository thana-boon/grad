import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../utils/api';

const PIE_COLORS = [
  '#6366f1','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6',
  '#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#a855f7',
  '#e11d48','#0ea5e9','#d97706','#059669','#7c3aed','#db2777',
  '#2563eb','#16a34a',
];

export default function AdmissionTableReportPage() {
  const [yearId, setYearId] = useState('');
  const [yearName, setYearName] = useState('');
  const [years, setYears] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [chartMode, setChartMode] = useState('all'); // 'all' | 'confirmed'
  const tableRef = useRef(null);

  // Load academic years
  useEffect(() => {
    api.get('/academic-years').then(r => {
      const ys = r.data || [];
      setYears(ys);
      if (ys.length > 0) {
        setYearId(String(ys[0].id));
        setYearName(String(ys[0].year_be || ys[0].title || ys[0].name || ''));
      }
    });
  }, []);

  // Load students when yearId changes
  useEffect(() => {
    if (!yearId) return;
    setLoading(true);
    api.get('/student/admin/admission-overview', { params: { year_id: yearId } })
      .then(r => {
        // Include ALL students (even those with no admissions)
        setStudents(r.data || []);
      })
      .finally(() => setLoading(false));
  }, [yearId]);

  // Flatten to rows for table/export
  // Each student → one row per admission; if none → one blank row
  const flatRows = students.map((s, si) => {
    const admissions = s.admissions || [];
    if (admissions.length === 0) {
      return [{
        seq: si + 1,
        class_level: s.class_level,
        class_room: s.class_room,
        number_in_room: s.number_in_room,
        student_code: s.student_code,
        first_name: s.first_name,
        last_name: s.last_name,
        university_name: '',
        faculty_name: '',
        program_name: '',
        confirmed: '',
        rowSpan: 1,
        isFirst: true,
      }];
    }
    return admissions.map((a, ai) => ({
      seq: si + 1,
      class_level: s.class_level,
      class_room: s.class_room,
      number_in_room: s.number_in_room,
      student_code: s.student_code,
      first_name: s.first_name,
      last_name: s.last_name,
      university_name: a.university_name || '',
      faculty_name: a.faculty_name || '',
      program_name: a.program_name || '',
      confirmed: a.confirmed ? 'ยืนยัน' : '',
      rowSpan: ai === 0 ? admissions.length : 0,
      isFirst: ai === 0,
    }));
  }).flat();

  // ── Export Excel ──
  const exportExcel = () => {
    const data = flatRows.map(r => ({
      'ลำดับ': r.isFirst ? r.seq : '',
      'ชั้น': r.isFirst ? r.class_level : '',
      'ห้อง': r.isFirst ? r.class_room : '',
      'เลขที่': r.isFirst ? r.number_in_room : '',
      'รหัสนักเรียน': r.isFirst ? r.student_code : '',
      'ชื่อ': r.isFirst ? r.first_name : '',
      'นามสกุล': r.isFirst ? r.last_name : '',
      'มหาวิทยาลัย': r.university_name,
      'คณะ': r.faculty_name,
      'สาขา': r.program_name,
      'ยืนยันสิทธิ์': r.confirmed,
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    // Column widths
    ws['!cols'] = [
      { wch: 7 }, { wch: 8 }, { wch: 6 }, { wch: 7 }, { wch: 12 },
      { wch: 16 }, { wch: 18 }, { wch: 36 }, { wch: 30 }, { wch: 28 }, { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ผลการสอบ');
    XLSX.writeFile(wb, `ผลการสอบ_${yearName}.xlsx`);
  };

  // ── Export PDF (print tab) ──
  const exportPdf = () => {
    localStorage.setItem('gradtrack-table-print-data', JSON.stringify({ flatRows, yearName }));
    window.open('/admin/report-table/print', '_blank');
  };

  const totalStudents = students.length;
  const withAdmissions = students.filter(s => s.admissions?.length > 0).length;
  const confirmed = students.filter(s => s.admissions?.some(a => a.confirmed)).length;

  // Chart data
  const allAdmissions = students.flatMap(s => s.admissions || []);
  const confirmedAdmissions = allAdmissions.filter(a => a.confirmed);

  const buildChartData = (admissions) => ({
    uni: Object.values(
      admissions.reduce((acc, a) => {
        const key = a.university_name || 'ไม่ระบุ';
        acc[key] = acc[key] || { name: key, value: 0 };
        acc[key].value++;
        return acc;
      }, {})
    ).sort((a, b) => b.value - a.value),
    fac: Object.values(
      admissions.reduce((acc, a) => {
        const key = a.faculty_name || 'ไม่ระบุ';
        acc[key] = acc[key] || { name: key, value: 0 };
        acc[key].value++;
        return acc;
      }, {})
    ).sort((a, b) => b.value - a.value),
  });

  const allChartData = buildChartData(allAdmissions);
  const confirmedChartData = buildChartData(confirmedAdmissions);

  const activeData = chartMode === 'confirmed' ? confirmedChartData : allChartData;
  const activeTotal = chartMode === 'confirmed' ? confirmedAdmissions.length : allAdmissions.length;

  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11px; }
          table { font-size: 10px; }
        }
      `}</style>

      <div className="p-4 flex flex-col gap-4 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <h1 className="text-xl font-bold">📋 รายงานผลการสอบ (ตาราง)</h1>

          {/* Year selector */}
          <select
            className="select select-bordered select-sm"
            value={yearId}
            onChange={e => {
              const y = years.find(y => String(y.id) === e.target.value);
              setYearId(e.target.value);
              setYearName(y ? String(y.year_be || y.title || y.name || '') : '');
            }}
          >
            {years.map(y => (
              <option key={y.id} value={y.id}>
                ปีการศึกษา {y.year_be || y.title || y.name}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="card bg-base-100 shadow border border-base-300 no-print">
          <div className="flex divide-x divide-base-300">
            <div className="flex-1 px-4 py-3 text-center">
              <div className="text-xs text-base-content/50">นักเรียนทั้งหมด</div>
              <div className="text-xl font-bold text-primary">{totalStudents}</div>
            </div>
            <div className="flex-1 px-4 py-3 text-center">
              <div className="text-xs text-base-content/50">บันทึกมหาลัยแล้ว</div>
              <div className="text-xl font-bold text-info">{withAdmissions}</div>
            </div>
            <div className="flex-1 px-4 py-3 text-center">
              <div className="text-xs text-base-content/50">ยืนยันสิทธิ์แล้ว</div>
              <div className="text-xl font-bold text-success">{confirmed}</div>
            </div>
            <div className="flex-1 px-4 py-3 text-center">
              <div className="text-xs text-base-content/50">ยังไม่บันทึก</div>
              <div className="text-xl font-bold text-error">{totalStudents - withAdmissions}</div>
            </div>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex flex-wrap gap-2 no-print">
          <button
            className="btn btn-success btn-sm gap-2"
            onClick={exportExcel}
            disabled={loading || students.length === 0}
          >
            📊 Export Excel (.xlsx)
          </button>
          <button
            className="btn btn-primary btn-sm gap-2"
            onClick={exportPdf}
            disabled={loading || students.length === 0}
          >
            🖨️ Print / Export PDF
          </button>
          <button
            className="btn btn-secondary btn-sm gap-2"
            onClick={() => setShowChart(true)}
            disabled={loading || allAdmissions.length === 0}
          >
            🥧 ดูกราฟวิเคราะห์
          </button>
        </div>

        {/* Chart Modal */}
        {showChart && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowChart(false)}
          >
            <div
              className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 p-6 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">📊 กราฟวิเคราะห์ผลการสอบ ปีการศึกษา {yearName}</h2>
                <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowChart(false)}>✕</button>
              </div>

              {/* Tab switcher */}
              <div className="flex gap-2 mb-5">
                <button
                  className={`btn btn-sm ${chartMode === 'all' ? 'btn-primary' : 'btn-outline btn-primary'}`}
                  onClick={() => setChartMode('all')}
                >
                  รวมทั้งหมดที่บันทึก
                  <span className={`badge badge-sm ${chartMode === 'all' ? 'badge-primary-content bg-white/30 text-white' : 'badge-primary'}`}>
                    {allAdmissions.length}
                  </span>
                </button>
                <button
                  className={`btn btn-sm ${chartMode === 'confirmed' ? 'btn-success' : 'btn-outline btn-success'}`}
                  onClick={() => setChartMode('confirmed')}
                >
                  เฉพาะยืนยันสิทธิ์แล้ว
                  <span className={`badge badge-sm ${chartMode === 'confirmed' ? 'bg-white/30 text-white' : 'badge-success'}`}>
                    {confirmedAdmissions.length}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pie 1: by University */}
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-center">มหาวิทยาลัยที่สอบติด</h3>
                  {activeData.uni.length === 0 ? (
                    <p className="text-center text-base-content/40 py-10">ไม่มีข้อมูล</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={activeData.uni}
                            cx="50%" cy="50%"
                            outerRadius={110}
                            dataKey="value"
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {activeData.uni.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v, n) => [`${v} รายการ (${((v/activeTotal)*100).toFixed(1)}%)`, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-col gap-1 mt-2">
                        {activeData.uni.map((d, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="flex-1 truncate">{d.name}</span>
                            <span className="font-semibold">{d.value} รายการ</span>
                            <span className="text-base-content/50">({((d.value/activeTotal)*100).toFixed(1)}%)</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Pie 2: by Faculty */}
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-center">คณะที่สอบติด</h3>
                  {activeData.fac.length === 0 ? (
                    <p className="text-center text-base-content/40 py-10">ไม่มีข้อมูล</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={activeData.fac}
                            cx="50%" cy="50%"
                            outerRadius={110}
                            dataKey="value"
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {activeData.fac.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v, n) => [`${v} รายการ (${((v/activeTotal)*100).toFixed(1)}%)`, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-col gap-1 mt-2">
                        {activeData.fac.map((d, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="flex-1 truncate">{d.name}</span>
                            <span className="font-semibold">{d.value} รายการ</span>
                            <span className="text-base-content/50">({((d.value/activeTotal)*100).toFixed(1)}%)</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner loading-lg" />
          </div>
        )}
      </div>
    </>
  );
}
