import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', ...style }}>{name}</span>
);

const Spinner = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--surface-container)', borderTopColor: 'var(--primary)', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
      <p className="label-sm">Loading...</p>
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const AccessDenied = ({ message, homeUrl }) => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', padding: '2rem' }}>
    <div style={{ maxWidth: 400, textAlign: 'center', padding: '3rem', background: 'var(--surface-container-lowest)', borderRadius: '1rem', boxShadow: 'var(--ambient-shadow)' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--error-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
        <Icon name="lock" style={{ fontSize: '1.75rem', color: 'var(--error)' }} />
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--on-surface)', marginBottom: '0.5rem' }}>Access Restricted</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginBottom: '1.5rem' }}>
        {message || "You don't have permission to view this page."}
      </p>
      <a href={homeUrl || '/timesheet'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg,var(--primary),var(--primary-container))', color: '#fff', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
        <Icon name="arrow_back" style={{ fontSize: '1rem', color: '#fff' }} />
        Go to Dashboard
      </a>
    </div>
  </div>
);

function homeForRole(role) {
  if (role === 'worker') return '/timesheet';
  if (role === 'viewer') return '/timesheet/approvals';
  return '/sales';
}

// ── Main guard ───────────────────────────────────────────────
// requiresModule   — checks hasModule(module) from PERMISSIONS
// requiresPermission — checks can(permission) from PERMISSIONS
const ProtectedRoute = ({ children, requiresModule, requiresPermission }) => {
  const { isAuthenticated, loading, hasModule, can, user } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiresModule && !hasModule(requiresModule)) {
    return (
      <AccessDenied
        homeUrl={homeForRole(user?.role)}
        message={`Your account doesn't have access to this section. Contact your admin.`}
      />
    );
  }

  if (requiresPermission && !can(requiresPermission)) {
    return (
      <AccessDenied
        homeUrl={homeForRole(user?.role)}
        message="You don't have permission to view this page. Contact your admin."
      />
    );
  }

  return children;
};

export default ProtectedRoute;
