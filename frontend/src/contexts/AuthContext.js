import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ── Role permission map ──────────────────────────────────────
// Each role lists what it CAN do. Anything not listed = blocked.
export const PERMISSIONS = {
  admin: {
    modules:        ['sales', 'recruitment'],
    canImport:      true,
    canViewImport:  true,
    canDelete:      true,
    canEdit:        true,
    canManageUsers: true,
    viewSettings:   true,
    viewCEO:        true,
    readOnly:       false,
  },
  sales: {
    modules:        ['sales', 'recruitment'],
    canImport:      true,
    canViewImport:  true,
    canDelete:      true,
    canEdit:        true,
    canManageUsers: false,
    viewSettings:   false,
    viewCEO:        false,   // sales cannot see CEO dashboard or audit log
    readOnly:       false,
  },
  viewer: {
    modules:        ['sales', 'recruitment'],
    canImport:      false,   // cannot actually import — but page is visible (readOnly hides button)
    canViewImport:  true,    // page shows in sidebar for CEO
    canDelete:      false,
    canEdit:        false,
    canManageUsers: false,
    viewSettings:   true,
    viewCEO:        true,    // CEO dashboard + audit log visible
    readOnly:       true,    // all add/edit/delete buttons hidden
  },
};

export const can = (user, permission) => {
  if (!user?.role) return false;
  return PERMISSIONS[user.role]?.[permission] ?? false;
};

export const hasModule = (user, module) => {
  if (!user?.role) return false;
  return PERMISSIONS[user.role]?.modules?.includes(module) ?? false;
};

// ── Provider ─────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem('crm_user');
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      const stored = localStorage.getItem('crm_user');
      if (stored) {
        try { setUser(JSON.parse(stored)); } catch {}
      }

      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!active) return;
        if (res.ok) {
          const userData = await res.json();
          localStorage.setItem('crm_user', JSON.stringify(userData));
          setUser(userData);
        } else if (res.status === 401 || res.status === 403) {
          clearSession();
        }
      } catch {
        // Network error: keep cached user, but don't block the app.
      } finally {
        if (active) setLoading(false);
      }
    };

    init();
    return () => { active = false; };
  }, [clearSession]);

  // ── Login — calls real API ──────────────────────────────────
  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Invalid credentials');
    }
    const userData = await res.json();
    localStorage.setItem('crm_user', JSON.stringify(userData));
    setUser(userData);
    return { success: true };
  };

  // ── Logout ──────────────────────────────────────────────────
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearSession();
  };

  // ── Refresh user from server ────────────────────────────────
  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const userData = await res.json();
        localStorage.setItem('crm_user', JSON.stringify(userData));
        setUser(userData);
      } else if (res.status === 401 || res.status === 403) {
        clearSession();
      }
    } catch {}
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      refreshUser,
      isAuthenticated: !!user,
      isAdmin:   user?.role === 'admin',
      isSales:   user?.role === 'sales',
      isViewer:  user?.role === 'viewer',
      can:       (permission) => can(user, permission),
      hasModule: (module)     => hasModule(user, module),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
