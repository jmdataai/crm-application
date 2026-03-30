import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="text-center animate-fadeIn">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 animate-pulse" style={{ backgroundColor: 'var(--primary)' }}></div>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
