import { useAuth } from '../../context/AuthContext';

export default function StudentDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h2 className="text-base font-semibold mb-1">
        สวัสดี {user?.name || user?.username} 👋
      </h2>
      <p className="text-xs text-base-content/50 mb-5">ดูผลการเรียนและข้อมูลของคุณได้ที่นี่</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="stat bg-base-100 shadow-sm rounded-2xl">
          <div className="stat-title">GPA เฉลี่ย</div>
          <div className="stat-value text-primary">—</div>
        </div>
        <div className="stat bg-base-100 shadow-sm rounded-2xl">
          <div className="stat-title">วิชาที่ลงทะเบียน</div>
          <div className="stat-value text-success">—</div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <p className="text-base-content/50 text-sm">ตารางผลการเรียนจะแสดงที่นี่...</p>
        </div>
      </div>
    </div>
  );
}
