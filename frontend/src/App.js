import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';

// Sales
import SalesDashboard    from './pages/sales/SalesDashboard';
import LeadsList         from './pages/sales/LeadsList';
import LeadDetail        from './pages/sales/LeadDetail';
import ImportLeads       from './pages/sales/ImportLeads';
import EnrichLeads       from './pages/sales/EnrichLeads';
import SalesTasks        from './pages/sales/SalesTasks';
import SalesReminders    from './pages/sales/SalesReminders';

// Recruitment
import RecruitmentDashboard from './pages/recruitment/RecruitmentDashboard';
import JobsList             from './pages/recruitment/JobsList';
import CandidatesList       from './pages/recruitment/CandidatesList';
import CandidateDetail      from './pages/recruitment/CandidateDetail';
import Pipeline             from './pages/recruitment/Pipeline';
import Interviews           from './pages/recruitment/Interviews';
import RecruitmentTasks     from './pages/recruitment/RecruitmentTasks';

import Settings      from './pages/Settings';
import CEODashboard  from './pages/CEODashboard';
import AuditLog      from './pages/AuditLog';
import './index.css';

// Wrap a page: requires auth + optional module access
const Page = ({ children, module }) => (
  <ProtectedRoute requiresModule={module}>
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

// Smart default redirect based on user role
const DefaultRedirect = () => {
  const { user } = useAuth();
  // Sales-only users go straight to sales
  if (user?.role === 'sales') return <Navigate to="/sales" replace />;
  // Everyone else also starts at sales dashboard
  return <Navigate to="/sales" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* ── Sales module (role: admin, sales, viewer) ── */}
      <Route path="/sales"              element={<Page module="sales"><SalesDashboard /></Page>} />
      <Route path="/sales/leads"        element={<Page module="sales"><LeadsList /></Page>} />
      <Route path="/sales/leads/:id"    element={<Page module="sales"><LeadDetail /></Page>} />
      <Route path="/sales/import"       element={<Page module="sales"><ImportLeads /></Page>} />
      <Route path="/sales/enrich"       element={<Page module="sales"><EnrichLeads /></Page>} />
      <Route path="/sales/tasks"        element={<Page module="sales"><SalesTasks /></Page>} />
      <Route path="/sales/reminders"    element={<Page module="sales"><SalesReminders /></Page>} />

      {/* ── Recruitment module (role: admin, viewer only) ── */}
      <Route path="/recruitment"                  element={<Page module="recruitment"><RecruitmentDashboard /></Page>} />
      <Route path="/recruitment/jobs"             element={<Page module="recruitment"><JobsList /></Page>} />
      <Route path="/recruitment/jobs/:id"         element={<Page module="recruitment"><JobsList /></Page>} />
      <Route path="/recruitment/candidates"       element={<Page module="recruitment"><CandidatesList /></Page>} />
      <Route path="/recruitment/candidates/:id"   element={<Page module="recruitment"><CandidateDetail /></Page>} />
      <Route path="/recruitment/pipeline"         element={<Page module="recruitment"><Pipeline /></Page>} />
      <Route path="/recruitment/interviews"       element={<Page module="recruitment"><Interviews /></Page>} />
      <Route path="/recruitment/tasks"            element={<Page module="recruitment"><RecruitmentTasks /></Page>} />

      {/* ── Settings (admin + viewer) ── */}
      <Route path="/settings"    element={<Page><Settings /></Page>} />
      <Route path="/ceo"         element={<Page><CEODashboard /></Page>} />
      <Route path="/audit-log"   element={<Page><AuditLog /></Page>} />

      {/* ── Default ── */}
      <Route path="/" element={<DefaultRedirect />} />
      <Route path="*" element={<DefaultRedirect />} />
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
