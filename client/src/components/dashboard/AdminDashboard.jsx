export default function AdminDashboard() {
  return (
    <div>
      <h2 className="text-base font-semibold mb-4">📊 ภาพรวม</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="👥 นักเรียนทั้งหมด" value="—" color="primary" />
        <StatCard label="📚 วิชาทั้งหมด" value="—" color="success" />
        <StatCard label="⏳ รอดำเนินการ" value="—" color="warning" />
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <p className="text-base-content/50 text-sm">เนื้อหา dashboard จะเพิ่มทีละส่วน...</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`stat bg-base-100 shadow-sm rounded-2xl`}>
      <div className={`stat-figure text-${color}`}>
        <div className={`w-10 h-10 rounded-full bg-${color}/10 flex items-center justify-center text-${color} text-xl font-bold`}>
          {value}
        </div>
      </div>
      <div className="stat-title">{label}</div>
      <div className={`stat-value text-${color}`}>{value}</div>
    </div>
  );
}
