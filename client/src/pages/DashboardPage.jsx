import { useAuth } from '../context/AuthContext';
import { useNavigate, NavLink } from 'react-router-dom';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import StudentDashboard from '../components/dashboard/StudentDashboard';
import AccountsPage from './admin/AccountsPage';
import AcademicYearsPage from './admin/AcademicYearsPage';
import StudentsPage from './admin/StudentsPage';
import UniversitiesPage from './admin/UniversitiesPage';
import UniversityStudentsPage from './admin/UniversityStudentsPage';
import FacultiesPage from './admin/FacultiesPage';
import AdmissionStatusPage from './admin/AdmissionStatusPage';
import ReportPage from './admin/ReportPage';
import AdmissionTableReportPage from './admin/AdmissionTableReportPage';
import ActivityLogPage from './admin/ActivityLogPage';

const ADMIN_MENU = [
  { label: 'dashboard', path: '/dashboard', icon: '🏠' },
  { label: 'จัดการ account', path: '/admin/accounts', icon: '👥' },
  { label: 'ปีการศึกษา', path: '/admin/academic-years', icon: '📅' },
  { label: 'รายชื่อนักเรียน', path: '/admin/students', icon: '🎓' },
  { label: 'มหาวิทยาลัย', path: '/admin/universities', icon: '🏛️' },
  { label: 'นักเรียนตามมหาวิทยาลัย', path: '/admin/university-students', icon: '🔎' },
  { label: 'คณะ/สาขา', path: '/admin/faculties', icon: '🏫' },
  { label: 'สถานะผลสอบ', path: '/admin/admission-status', icon: '📋' },
  { label: 'รายงาน/Export', path: '/admin/report', icon: '📊' },
  { label: 'รายงานตาราง', path: '/admin/report-table', icon: '�️' },
  { label: 'Activity Log', path: '/admin/activity-log', icon: '🗒️' },
];

export default function DashboardPage({ activePage }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderContent = () => {
    if (user?.role !== 'admin') return <StudentDashboard />;
    if (activePage === 'accounts') return <AccountsPage />;
    if (activePage === 'academic-years') return <AcademicYearsPage />;
    if (activePage === 'students') return <StudentsPage />;
    if (activePage === 'universities') return <UniversitiesPage />;
    if (activePage === 'university-students') return <UniversityStudentsPage />;
    if (activePage === 'faculties') return <FacultiesPage />;
    if (activePage === 'admission-status') return <AdmissionStatusPage />;
    if (activePage === 'report') return <ReportPage />;
    if (activePage === 'report-table') return <AdmissionTableReportPage />;
    if (activePage === 'activity-log') return <ActivityLogPage />;
    return <AdminDashboard />;
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Navbar */}
      <div className="navbar bg-base-100 shadow-sm">
        <div className="navbar-start">
          <div className="flex items-center gap-2 px-2">
            <div className="avatar placeholder">
              <div className="bg-primary text-primary-content rounded-lg w-8 text-sm font-bold">
                <span>G</span>
              </div>
            </div>
            <span className="font-medium text-sm">GradTrack</span>
          </div>
        </div>
        <div className="navbar-end gap-3 pr-4">
          <span className="text-xs hidden sm:block text-base-content/60">
            สวัสดี 👋 <span className="font-medium text-base-content">{user?.name || user?.username}</span>
          </span>
          <div className="badge badge-primary badge-sm">
            {user?.role === 'admin' ? '🔧 admin' : '🎓 student'}
          </div>
          <button onClick={handleLogout} className="btn btn-ghost btn-sm text-error">
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar (admin เท่านั้น) */}
        {user?.role === 'admin' && (
          <aside className="w-56 min-h-screen bg-base-100 shadow-sm hidden md:block">
            <ul className="menu p-3 gap-1">
              {ADMIN_MENU.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end
                    className={({ isActive }) =>
                      isActive ? 'active font-medium' : ''
                    }
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-x-auto p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
