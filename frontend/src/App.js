import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import Apply from './pages/Apply';

// Sales
import SalesDashboard  from './pages/sales/SalesDashboard';
import LeadsList       from './pages/sales/LeadsList';
import LeadDetail      from './pages/sales/LeadDetail';
import ImportLeads     from './pages/sales/ImportLeads';
import EnrichLeads     from './pages/sales/EnrichLeads';
import SalesActivityLog    from './pages/sales/SalesActivityLog';
import BulkEmail           from './pages/sales/BulkEmail';
import SalesTrackerDashboard from './pages/sales/SalesTrackerDashboard';
import SalesTrackerCEO   from './pages/sales/SalesTrackerCEO';
import PipelineKanban        from './pages/sales/PipelineKanban';
import SequencesManager      from './pages/sales/SequencesManager';
import CallCadence           from './pages/sales/CallCadence';
import IntegrationsDashboard from './pages/IntegrationsDashboard';
import Tasks             from './pages/Tasks';

// Recruitment
import RecruitmentDashboard from './pages/recruitment/RecruitmentDashboard';
import JobsList             from './pages/recruitment/JobsList';
import CandidatesList       from './pages/recruitment/CandidatesList';
import CandidateDetail      from './pages/recruitment/CandidateDetail';
import Pipeline             from './pages/recruitment/Pipeline';
import Interviews           from './pages/recruitment/Interviews';
import ResumeHub         from './pages/recruitment/ResumeHub';

// Timesheet
import Timesheet          from './pages/timesheet/Timesheet';
import TimesheetApprovals from './pages/timesheet/TimesheetApprovals';

// Other
import Settings     from './pages/Settings';
import CEODashboard from './pages/CEODashboard';
import AuditLog     from './pages/AuditLog';
import ExpenseTracker from './pages/expenses/ExpenseTracker';
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
  return <Navigate to="/sales" replace />;
};

const TimesheetRoute = () => {
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
      {/* ── Public routes — no auth required ── */}
      <Route path="/apply" element={<Apply />} />
      <Route path="/login" element={<Login />} />

      {/* ── Sales — admin, sales, viewer only ── */}
      <Route path="/sales"              element={<Page module="sales"><SalesDashboard /></Page>} />
      <Route path="/sales/leads"        element={<Page module="sales"><LeadsList /></Page>} />
      <Route path="/sales/leads/:id"    element={<Page module="sales"><LeadDetail /></Page>} />
      <Route path="/sales/import"       element={<Page module="sales" permission="canViewImport"><ImportLeads /></Page>} />
      <Route path="/sales/enrich"       element={<Page module="sales" permission="canViewImport"><EnrichLeads /></Page>} />
      <Route path="/sales/tasks"        element={<Page module="sales"><Tasks /></Page>} />
      <Route path="/sales/reminders"    element={<Navigate to="/sales/tasks?tab=reminders" replace />} />
      <Route path="/sales/activity-log"  element={<Page module="sales"><SalesActivityLog /></Page>} />
      <Route path="/sales/bulk-email"    element={<Page module="sales"><BulkEmail /></Page>} />
      <Route path="/sales/tracker"        element={<Page module="sales"><SalesTrackerCEO /></Page>} />
      <Route path="/sales/command-centre"
             element={<Page module="sales"><IntegrationsDashboard /></Page>} />
      <Route path="/sales/tracker-legacy" element={<Page module="sales"><SalesTrackerDashboard /></Page>} />
      <Route path="/sales/pipeline"       element={<Page module="sales"><PipelineKanban /></Page>} />
      <Route path="/sales/sequences"      element={<Page module="sales"><SequencesManager /></Page>} />
      <Route path="/sales/call-cadence"   element={<Page module="sales"><CallCadence /></Page>} />

      {/* ── Recruitment — admin, sales, viewer only ── */}
      <Route path="/recruitment"                   element={<Page module="recruitment"><RecruitmentDashboard /></Page>} />
      <Route path="/recruitment/jobs"              element={<Page module="recruitment"><JobsList /></Page>} />
      <Route path="/recruitment/jobs/:id"          element={<Page module="recruitment"><JobsList /></Page>} />
      <Route path="/recruitment/candidates"        element={<Page module="recruitment"><CandidatesList /></Page>} />
      <Route path="/recruitment/candidates/:id"    element={<Page module="recruitment"><CandidateDetail /></Page>} />
      <Route path="/recruitment/import-candidates" element={<Navigate to="/recruitment/resume-hub?tab=import" replace />} />
      <Route path="/recruitment/pipeline"          element={<Page module="recruitment"><Pipeline /></Page>} />
      <Route path="/recruitment/interviews"        element={<Page module="recruitment"><Interviews /></Page>} />
      <Route path="/recruitment/tasks"             element={<Page module="recruitment"><Tasks /></Page>} />
      <Route path="/recruitment/resume-hub"        element={<Page module="recruitment"><ResumeHub /></Page>} />
      <Route path="/recruitment/ats-match"         element={<Navigate to="/recruitment/resume-hub?tab=match" replace />} />
      <Route path="/recruitment/ats-score"         element={<Navigate to="/recruitment/resume-hub?tab=score" replace />} />
      <Route path="/recruitment/bulk-upload"       element={<Navigate to="/recruitment/resume-hub?tab=bulk" replace />} />

      {/* ── Timesheet — all roles ── */}
      <Route path="/timesheet"           element={<TimesheetRoute />} />
      {/* Approvals — viewer (CEO) only ── */}
      <Route path="/timesheet/approvals" element={<Page module="timesheet" permission="viewTimesheetApprovals"><TimesheetApprovals /></Page>} />

      {/* ── Admin/CEO pages — permission guarded ── */}
      <Route path="/settings"   element={<Page permission="viewSettings"><Settings /></Page>} />
      <Route path="/ceo"        element={<Page permission="viewCEO"><CEODashboard /></Page>} />
      <Route path="/audit-log"  element={<Page permission="viewCEO"><AuditLog /></Page>} />
      <Route path="/expenses"   element={<Page permission="viewExpenses"><ExpenseTracker /></Page>} />

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
