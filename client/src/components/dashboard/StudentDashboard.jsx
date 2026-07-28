import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';

// หน้านี้จะเจอเฉพาะตอนนักเรียนหลงเข้ามาที่ /dashboard
// (ทางหลักของนักเรียนคือ /student) — ทำให้เป็นทางกลับที่ชัดเจน ไม่ใช่หน้าเปล่า
export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-lg anim-fade-up">
      <div className="card bg-base-100 p-8 text-center">
        <span className="gt-chip mx-auto mb-4 size-14">
          <Icon name="graduation" size={28} />
        </span>
        <h1 className="text-lg font-semibold">
          สวัสดี {user?.name || user?.first_name || user?.username}
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-base-content/55">
          ดูข้อมูลของคุณ บันทึกผลสอบติดมหาวิทยาลัย และยืนยันสิทธิ์ได้ที่หน้าของฉัน
        </p>
        <button onClick={() => navigate('/student')} className="btn btn-primary mx-auto mt-6">
          ไปที่หน้าของฉัน
          <Icon name="arrowRight" size={17} />
        </button>
      </div>
    </div>
  );
}
