import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// role ในระบบ: admin (แก้ไขได้) · teacher (ดูอย่างเดียว) · student
//
// allowedRole รับได้ 3 ค่า
//   'admin'   — เฉพาะผู้ดูแล (หน้าที่ครู read-only ไม่ควรเห็นเลย เช่น จัดการบัญชี)
//   'staff'   — admin + teacher (หน้าฝั่งหลังบ้านทั่วไป — ครูเข้าดูได้)
//   'student' — นักเรียน
//
// ตัวนี้กันแค่ระดับ "เห็นหน้าไหนได้" เท่านั้น สิทธิ์แก้ไขจริงบังคับที่ server
// (middleware adminOnly) เสมอ — ซ่อนปุ่มฝั่ง client ไม่ใช่มาตรการความปลอดภัย
const STAFF_ROLES = ['admin', 'teacher'];

export function ProtectedRoute({ children, allowedRole }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole) {
    const ok =
      allowedRole === 'staff' ? STAFF_ROLES.includes(user.role) : user.role === allowedRole;

    if (!ok) {
      // redirect ให้ตรงกับ role จริง
      if (user.role === 'student') return <Navigate to="/student" replace />;
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
}
