import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AccountsPage from './pages/admin/AccountsPage';
import AcademicYearsPage from './pages/admin/AcademicYearsPage';
import StudentsPage from './pages/admin/StudentsPage';
import UniversitiesPage from './pages/admin/UniversitiesPage';
import FacultiesPage from './pages/admin/FacultiesPage';
import StudentPage from './pages/StudentPage';
import AdmissionStatusPage from './pages/admin/AdmissionStatusPage';
import PrintReportPage from './pages/admin/PrintReportPage';
import AdmissionTableReportPage from './pages/admin/AdmissionTableReportPage';
import PrintAdmissionTablePage from './pages/admin/PrintAdmissionTablePage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/accounts"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="accounts" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/academic-years"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="academic-years" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="students" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/universities"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="universities" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/faculties"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="faculties" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/admission-status"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="admission-status" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/report"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="report" />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/report/print" element={<PrintReportPage />} />
          <Route path="/admin/report-table/print" element={<PrintAdmissionTablePage />} />
          <Route
            path="/admin/report-table"
            element={
              <ProtectedRoute allowedRole="admin">
                <DashboardPage activePage="report-table" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRole="student">
                <StudentPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
