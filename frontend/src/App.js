import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';

// Sales
import SalesDashboard  from './pages/sales/SalesDashboard';
import LeadsList       from './pages/sales/LeadsList';
import LeadDetail      from './pages/sales/LeadDetail';
import ImportLeads     from './pages/sales/ImportLeads';
import EnrichLeads     from './pages/sales/EnrichLeads';
import SalesTasks      from './pages/sales/SalesTasks';
import SalesReminders  from './pages/sales/SalesReminders';

// Recruitment
import RecruitmentDashboard from './pages/recruitment/RecruitmentDashboard';
import JobsList             from './pages/recruitment/JobsList';
import CandidatesList       from './pages/recruitment/CandidatesList';
import CandidateDetail      from './pages/recruitment/CandidateDetail';
import ImportCandidates     from './pages/recruitment/ImportCandidates';
import Pipeline             from './pages/recruitment/Pipeline';
import Interviews           from './pages/recruitment/Interviews';
import RecruitmentTasks     from './pages/recruitment/RecruitmentTasks';
import ATSMatch             from './pages/recruitment/ATSMatch';

// Timesheet
import Timesheet          from './pages/timesheet/Timesheet';
import TimesheetApprovals from './pages/timesheet/TimesheetApprovals';

// Other
import Settings     from './pages/Settings';
import CEODashboard from './pages/CEODashboard';
import AuditLog     from './pages/AuditLog';
import './index.css';

// ── Helpers ──────────────────────────────────────────────────

// Wraps a page with auth + optional module + optional permission guard + Layout
const Page = ({ children, module: reqModule, mod, permission }) => (
  <ProtectedRoute requiresModule={reqModule || mod} requiresPermission={permission}>
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

// Redirect based on role after login
const DefaultRedirect = () => {
  const { user } = useAuth();
  if (user?.role === 'worker') return <Navigate to="/timesheet" replace />;
  if (user?.role === 'viewer') return <Navigate to="/timesheet/approvals" replace />;
  return <Navigate to="/sales" replace />;
};

const TimesheetRoute = () => {
  const { user } = useAuth();
  if (user?.role === 'viewer') return <Navigate to="/timesheet/approvals" replace />;
  return (
    <Page module="timesheet">
      <Timesheet />
    </Page>
  );
};

// ── Routes ───────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* ── Sales — admin, sales, viewer only ── */}
      <Route path="/sales"              element={<Page module="sales"><SalesDashboard /></Page>} />
      <Route path="/sales/leads"        element={<Page module="sales"><LeadsList /></Page>} />
      <Route path="/sales/leads/:id"    element={<Page module="sales"><LeadDetail /></Page>} />
      <Route path="/sales/import"       element={<Page module="sales" permission="canViewImport"><ImportLeads /></Page>} />
      <Route path="/sales/enrich"       element={<Page module="sales" permission="canViewImport"><EnrichLeads /></Page>} />
      <Route path="/sales/tasks"        element={<Page module="sales"><SalesTasks /></Page>} />
      <Route path="/sales/reminders"    element={<Page module="sales"><SalesReminders /></Page>} />

      {/* ── Recruitment — admin, sales, viewer only ── */}
      <Route path="/recruitment"                   element={<Page module="recruitment"><RecruitmentDashboard /></Page>} />
      <Route path="/recruitment/jobs"              element={<Page module="recruitment"><JobsList /></Page>} />
      <Route path="/recruitment/jobs/:id"          element={<Page module="recruitment"><JobsList /></Page>} />
      <Route path="/recruitment/candidates"        element={<Page module="recruitment"><CandidatesList /></Page>} />
      <Route path="/recruitment/candidates/:id"    element={<Page module="recruitment"><CandidateDetail /></Page>} />
      <Route path="/recruitment/import-candidates" element={<Page module="recruitment" permission="canViewImport"><ImportCandidates /></Page>} />
      <Route path="/recruitment/pipeline"          element={<Page module="recruitment"><Pipeline /></Page>} />
      <Route path="/recruitment/interviews"        element={<Page module="recruitment"><Interviews /></Page>} />
      <Route path="/recruitment/tasks"             element={<Page module="recruitment"><RecruitmentTasks /></Page>} />
      <Route path="/recruitment/ats-match"         element={<Page module="recruitment"><ATSMatch /></Page>} />

      {/* ── Timesheet — all roles ── */}
      <Route path="/timesheet"           element={<TimesheetRoute />} />
      {/* Approvals — viewer (CEO) only ── */}
      <Route path="/timesheet/approvals" element={<Page module="timesheet" permission="viewTimesheetApprovals"><TimesheetApprovals /></Page>} />

      {/* ── Admin/CEO pages — permission guarded ── */}
      <Route path="/settings"   element={<Page permission="viewSettings"><Settings /></Page>} />
      <Route path="/ceo"        element={<Page permission="viewCEO"><CEODashboard /></Page>} />
      <Route path="/audit-log"  element={<Page permission="viewCEO"><AuditLog /></Page>} />

      {/* ── Default / 404 ── */}
      <Route path="/"  element={<DefaultRedirect />} />
      <Route path="*"  element={<DefaultRedirect />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
