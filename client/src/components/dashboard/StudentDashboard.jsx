import { useAuth } from '../../context/AuthContext';

export default function StudentDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">
        สวัสดี, {user?.name || user?.username} 👋
      </h2>
      <p className="text-gray-500 text-sm mb-6">ดูผลการเรียนและข้อมูลของคุณได้ที่นี่</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <p className="text-sm font-medium text-indigo-700">GPA เฉลี่ย</p>
          <p className="text-3xl font-bold text-indigo-700 mt-1">—</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="text-sm font-medium text-green-700">วิชาที่ลงทะเบียน</p>
          <p className="text-3xl font-bold text-green-700 mt-1">—</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <p className="text-gray-500 text-sm">ตารางผลการเรียนจะแสดงที่นี่...</p>
      </div>
    </div>
  );
}
