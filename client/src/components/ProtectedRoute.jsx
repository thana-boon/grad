import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ป้องกัน route ที่ต้อง login ก่อน
export function ProtectedRoute({ children, allowedRole }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    // redirect ให้ตรงกับ role จริง
    if (user.role === 'student') return <Navigate to="/student" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
