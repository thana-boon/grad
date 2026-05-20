export default function AdminDashboard() {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-6">แผงควบคุม (Admin)</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <StatCard label="นักเรียนทั้งหมด" value="—" color="indigo" />
        <StatCard label="วิชาทั้งหมด" value="—" color="green" />
        <StatCard label="รอดำเนินการ" value="—" color="yellow" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <p className="text-gray-500 text-sm">เนื้อหา dashboard จะเพิ่มทีละส่วน...</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
