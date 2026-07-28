import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../utils/api';
import { withBase } from '../../utils/withBase';
import Icon from '../../components/ui/Icon';
import { PageHeader } from '../../components/ui';

// จานสีกราฟ: ไล่จากสีหลักของแบรนด์ (ม่วง → ทอง → เขียว → น้ำเงิน → แดง) แล้ววนโทนใกล้เคียง
// เรียงให้สีที่อยู่ติดกันต่างกันชัด เพราะ pie chart วางชิ้นติดกัน
const PIE_COLORS = [
  '#5b2d8e','#f5c518','#16a34a','#1e2a5e','#dc2626','#7a3fc0',
  '#c79b00','#0d9488','#3b5bb5','#b91c1c','#9b6ad4','#8a6a00',
  '#15803d','#2563eb','#e11d48','#a855f7','#d97706','#059669',
  '#1d4ed8','#f472b6',
];

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_YEARS = Array.from({ length: 16 }, (_, i) => 2560 + i); // พ.ศ. 2560–2575

function ThaiDatePicker({ value, onChange }) {
  const parse = (v) => {
    if (!v) return { day: '', month: '', year: '' };
    const p = v.split('-');
    return { day: parseInt(p[2]) || '', month: parseInt(p[1]) || '', year: parseInt(p[0]) + 543 || '' };
  };

  const [local, setLocal] = useState(() => parse(value));

  // sync เมื่อ parent ล้างค่า (เช่น กดปุ่ม ✕ ล้าง)
  useEffect(() => { setLocal(parse(value)); }, [value]);

  const handleChange = (field, val) => {
    const next = { ...local, [field]: val };
    setLocal(next);
    if (next.day && next.month && next.year) {
      onChange(`${next.year - 543}-${String(next.month).padStart(2,'0')}-${String(next.day).padStart(2,'0')}`);
    } else {
      onChange('');
    }
  };

  return (
    <div className="flex gap-1">
      <select className="select select-sm w-16"
        aria-label="วัน"
        value={local.day} onChange={e => handleChange('day', Number(e.target.value))}>
        <option value="">วัน</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select className="select select-sm w-[4.5rem]"
        aria-label="เดือน"
        value={local.month} onChange={e => handleChange('month', Number(e.target.value))}>
        <option value="">เดือน</option>
        {THAI_MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
      </select>
      <select className="select select-sm w-24"
        aria-label="ปี พ.ศ."
        value={local.year} onChange={e => handleChange('year', Number(e.target.value))}>
        <option value="">ปี พ.ศ.</option>
        {THAI_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

// ตารางสรุปตัวเลขในกราฟ — คนอ่านหน้าจอ/คนตาบอดสีต้องได้ข้อมูลเท่ากับคนที่เห็นสี
function ChartLegend({ data, total, colors, scroll = false }) {
  return (
    <ul className={`flex flex-col gap-1 ${scroll ? 'max-h-80 overflow-y-auto' : 'mt-2'}`}>
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center gap-2 text-xs">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ background: colors[i % colors.length] }}
          />
          <span className="flex-1 truncate">{d.name}</span>
          <span className="whitespace-nowrap font-semibold tabular-nums">{d.value} รายการ</span>
          <span className="whitespace-nowrap tabular-nums text-base-content/50">
            ({((d.value / total) * 100).toFixed(1)}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AdmissionTableReportPage() {
  const [yearId, setYearId] = useState('');
  const [yearName, setYearName] = useState('');
  const [years, setYears] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [chartMode, setChartMode] = useState('all'); // 'all' | 'confirmed'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeNoData, setIncludeNoData] = useState(true);
  const tableRef = useRef(null);

  const filterByDate = (admissions) => {
    if (!dateFrom && !dateTo) return admissions;
    return admissions.filter(a => {
      if (!a.created_at) return false;
      const d = new Date(a.created_at);
      if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false;
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  };

  // Load academic years
  useEffect(() => {
    Promise.all([
      api.get('/academic-years').then(r => r.data || []),
      api.get('/academic-years/active').then(r => r.data || null).catch(() => null),
    ]).then(([ys, active]) => {
      setYears(ys);
      if (active?.active_year_id) {
        const activeYear = ys.find(y => String(y.id) === String(active.active_year_id)) || active.year;
        setYearId(String(active.active_year_id));
        setYearName(String(activeYear?.year_be || activeYear?.title || activeYear?.name || ''));
        return;
      }
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

  // Flatten to rows for table/export — admissions filtered by date range
  const exportStudents = includeNoData
    ? students
    : students.filter(s => filterByDate(s.admissions || []).length > 0);

  const flatRows = exportStudents.map((s, si) => {
    const admissions = filterByDate(s.admissions || []);
    if (admissions.length === 0) {
      return [{
        seq: si + 1,
        class_level: s.class_level,
        class_room: s.class_room,
        number_in_room: s.number_in_room,
        student_code: s.student_code,
        title_prefix: s.title_prefix,
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
      title_prefix: s.title_prefix,
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
      'ชื่อ': r.isFirst ? `${r.title_prefix || ''}${r.first_name || ''}` : '',
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
    window.open(withBase('/admin/report-table/print'), '_blank');
  };

  const totalStudents = students.length;
  const allAdmissions = students.flatMap(s => filterByDate(s.admissions || []));
  const confirmedAdmissions = allAdmissions.filter(a => a.confirmed);
  const withAdmissions = students.filter(s => filterByDate(s.admissions || []).length > 0).length;
  const confirmed = students.filter(s => filterByDate(s.admissions || []).some(a => a.confirmed)).length;
  const isFiltered = !!(dateFrom || dateTo);

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
    prog: Object.values(
      admissions.reduce((acc, a) => {
        const key = a.group_field || 'ไม่ระบุ';
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

      <div className="flex min-w-0 flex-col overflow-hidden">
        <div className="no-print">
          <PageHeader
            icon="table"
            title="รายงานผลการสอบ (ตาราง)"
            subtitle="สรุปผลทั้งชั้นปี พร้อมส่งออกเป็น Excel / PDF และดูกราฟภาพรวม"
          >
            <label htmlFor="report-year" className="whitespace-nowrap text-xs text-base-content/55">
              ปีการศึกษา
            </label>
            <select
              id="report-year"
              className="select select-sm"
              value={yearId}
              onChange={e => {
                const y = years.find(y => String(y.id) === e.target.value);
                setYearId(e.target.value);
                setYearName(y ? String(y.year_be || y.title || y.name || '') : '');
              }}
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>
                  {y.year_be || y.title || y.name}
                </option>
              ))}
            </select>
          </PageHeader>
        </div>

        {/* สรุป + ตัวกรอง + ปุ่ม */}
        <div className="card no-print anim-fade-up overflow-hidden bg-base-100">
          {/* ตัวเลขสรุป */}
          <dl className="grid grid-cols-2 divide-base-300 border-b border-base-300 sm:grid-cols-4 sm:divide-x">
            {[
              { label: 'นักเรียนทั้งหมด', value: totalStudents, cls: 'text-base-content' },
              {
                label: isFiltered ? 'บันทึกในช่วงนี้' : 'บันทึกมหาลัยแล้ว',
                value: withAdmissions,
                cls: 'text-primary',
              },
              { label: 'ยืนยันสิทธิ์แล้ว', value: confirmed, cls: 'text-success' },
              { label: 'ยังไม่บันทึก', value: totalStudents - withAdmissions, cls: 'text-error' },
            ].map((s) => (
              <div key={s.label} className="px-4 py-3 text-center max-sm:border-b max-sm:border-base-300">
                <dd className={`text-xl font-semibold tabular-nums ${s.cls}`}>{s.value}</dd>
                <dt className="mt-0.5 text-xs text-base-content/55">{s.label}</dt>
              </div>
            ))}
          </dl>

          {/* ตัวกรอง + ปุ่มส่งออก */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-base-content/55">
                <Icon name="calendar" size={14} />
                ตั้งแต่
              </span>
              <ThaiDatePicker value={dateFrom} onChange={setDateFrom} />
              <span className="text-xs text-base-content/45">ถึง</span>
              <ThaiDatePicker value={dateTo} onChange={setDateTo} />
              {isFiltered && (
                <button
                  className="btn btn-ghost btn-xs gap-1"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                >
                  <Icon name="x" size={12} />
                  ล้าง
                </button>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={includeNoData}
                onChange={e => setIncludeNoData(e.target.checked)}
              />
              <span className="text-sm">รวมนักเรียนที่ไม่มีข้อมูล</span>
            </label>

            <div className="ml-auto flex flex-wrap gap-2">
              <button
                className="btn btn-outline btn-sm gap-1.5"
                onClick={exportExcel}
                disabled={loading || students.length === 0}
              >
                <Icon name="sheet" size={15} />
                Excel
              </button>
              <button
                className="btn btn-outline btn-sm gap-1.5"
                onClick={exportPdf}
                disabled={loading || students.length === 0}
              >
                <Icon name="print" size={15} />
                PDF
              </button>
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() => setShowChart(true)}
                disabled={loading || allAdmissions.length === 0}
              >
                <Icon name="chart" size={15} />
                ดูกราฟ
              </button>
            </div>
          </div>
        </div>

        {/* Chart Modal */}
        {showChart && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a102a]/55 p-4 backdrop-blur-[2px]"
            onClick={() => setShowChart(false)}
            role="dialog"
            aria-modal="true"
            aria-label="กราฟวิเคราะห์ผลการสอบ"
          >
            <div
              className="anim-scale-in max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="gt-chip size-9">
                    <Icon name="chart" size={18} />
                  </span>
                  <h2 className="text-base font-semibold sm:text-lg">
                    กราฟวิเคราะห์ผลการสอบ ปีการศึกษา {yearName}
                  </h2>
                </div>
                <button
                  className="btn btn-ghost btn-sm px-2"
                  onClick={() => setShowChart(false)}
                  aria-label="ปิดกราฟ"
                >
                  <Icon name="x" size={18} />
                </button>
              </div>

              {/* สลับชุดข้อมูล */}
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  className={`btn btn-sm gap-1.5 ${chartMode === 'all' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setChartMode('all')}
                  aria-pressed={chartMode === 'all'}
                >
                  รวมทั้งหมดที่บันทึก
                  <span className="font-semibold tabular-nums">{allAdmissions.length}</span>
                </button>
                <button
                  className={`btn btn-sm gap-1.5 ${chartMode === 'confirmed' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setChartMode('confirmed')}
                  aria-pressed={chartMode === 'confirmed'}
                >
                  เฉพาะยืนยันสิทธิ์แล้ว
                  <span className="font-semibold tabular-nums">{confirmedAdmissions.length}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {[
                  { key: 'uni', title: 'มหาวิทยาลัยที่สอบติด', data: activeData.uni },
                  { key: 'fac', title: 'คณะที่สอบติด', data: activeData.fac },
                ].map(({ key, title, data }) => (
                  <section key={key} className="flex flex-col gap-2">
                    <h3 className="text-center text-sm font-semibold">{title}</h3>
                    {data.length === 0 ? (
                      <p className="py-10 text-center text-sm text-base-content/45">ไม่มีข้อมูล</p>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={data}
                              cx="50%" cy="50%"
                              outerRadius={110}
                              dataKey="value"
                              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {data.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(v, n) => [
                                `${v} รายการ (${((v / activeTotal) * 100).toFixed(1)}%)`,
                                n,
                              ]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <ChartLegend data={data} total={activeTotal} colors={PIE_COLORS} />
                      </>
                    )}
                  </section>
                ))}
              </div>

              {/* สาขา — เต็มความกว้าง */}
              <section className="mt-8 flex flex-col gap-2 border-t border-base-300 pt-6">
                <h3 className="text-center text-sm font-semibold">สาขา/กลุ่มวิชาที่สอบติด</h3>
                {activeData.prog.length === 0 ? (
                  <p className="py-10 text-center text-sm text-base-content/45">ไม่มีข้อมูล</p>
                ) : (
                  <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                    <ResponsiveContainer width="100%" height={350}>
                      <PieChart>
                        <Pie
                          data={activeData.prog}
                          cx="50%" cy="50%"
                          outerRadius={130}
                          dataKey="value"
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {activeData.prog.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v, n) => [
                            `${v} รายการ (${((v / activeTotal) * 100).toFixed(1)}%)`,
                            n,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <ChartLegend data={activeData.prog} total={activeTotal} colors={PIE_COLORS} scroll />
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {loading && (
          <div className="card mt-4 bg-base-100 p-5">
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="gt-skeleton h-4" style={{ width: `${92 - i * 7}%` }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
