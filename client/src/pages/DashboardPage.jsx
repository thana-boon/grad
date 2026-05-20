import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import StudentDashboard from '../components/dashboard/StudentDashboard';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <span className="font-semibold text-gray-800">GradTrack</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              สวัสดี, <span className="font-medium">{user?.name || user?.username}</span>
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 font-medium">
                {user?.role === 'admin' ? 'ผู้ดูแล' : 'นักเรียน'}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-600 transition"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </nav>

      {/* Content — แสดงตาม role */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user?.role === 'admin' ? <AdminDashboard /> : <StudentDashboard />}
      </main>
    </div>
  );
}
