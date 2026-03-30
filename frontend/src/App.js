import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// Auth Pages
import Login from './pages/Login';
import Register from './pages/Register';

// Sales Pages
import SalesDashboard from './pages/sales/SalesDashboard';
import LeadsList from './pages/sales/LeadsList';
import LeadDetail from './pages/sales/LeadDetail';
import ImportLeads from './pages/sales/ImportLeads';
import SalesTasks from './pages/sales/SalesTasks';
import SalesReminders from './pages/sales/SalesReminders';

// Recruitment Pages
import RecruitmentDashboard from './pages/recruitment/RecruitmentDashboard';
import JobsList from './pages/recruitment/JobsList';
import CandidatesList from './pages/recruitment/CandidatesList';
import CandidateDetail from './pages/recruitment/CandidateDetail';
import Pipeline from './pages/recruitment/Pipeline';
import Interviews from './pages/recruitment/Interviews';
import RecruitmentTasks from './pages/recruitment/RecruitmentTasks';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Sales Module Routes */}
          <Route path="/sales" element={
            <ProtectedRoute>
              <Layout><SalesDashboard /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/sales/leads" element={
            <ProtectedRoute>
              <Layout><LeadsList /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/sales/leads/:id" element={
            <ProtectedRoute>
              <Layout><LeadDetail /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/sales/import" element={
            <ProtectedRoute>
              <Layout><ImportLeads /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/sales/tasks" element={
            <ProtectedRoute>
              <Layout><SalesTasks /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/sales/reminders" element={
            <ProtectedRoute>
              <Layout><SalesReminders /></Layout>
            </ProtectedRoute>
          } />

          {/* Recruitment Module Routes */}
          <Route path="/recruitment" element={
            <ProtectedRoute>
              <Layout><RecruitmentDashboard /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recruitment/jobs" element={
            <ProtectedRoute>
              <Layout><JobsList /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recruitment/jobs/:id" element={
            <ProtectedRoute>
              <Layout><JobsList /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recruitment/candidates" element={
            <ProtectedRoute>
              <Layout><CandidatesList /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recruitment/candidates/:id" element={
            <ProtectedRoute>
              <Layout><CandidateDetail /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recruitment/pipeline" element={
            <ProtectedRoute>
              <Layout><Pipeline /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recruitment/interviews" element={
            <ProtectedRoute>
              <Layout><Interviews /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recruitment/tasks" element={
            <ProtectedRoute>
              <Layout><RecruitmentTasks /></Layout>
            </ProtectedRoute>
          } />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/sales" replace />} />
          <Route path="*" element={<Navigate to="/sales" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  );
}

export default App;
