import React, { createContext, useContext, useState, useEffect } from 'react';

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
    modules:      ['sales', 'recruitment'],
    canImport:    true,
    canDelete:    true,
    canEdit:      true,
    canManageUsers: true,
    viewSettings: true,
    readOnly:     false,
  },
  sales: {
    modules:      ['sales', 'recruitment'], // sales + recruitment access
    canImport:    true,
    canDelete:    true,
    canEdit:      true,
    canManageUsers: false,
    viewSettings: false,
    readOnly:     false,
  },
  viewer: {
    modules:      ['sales', 'recruitment'], // sees everything
    canImport:    false,
    canDelete:    false,
    canEdit:      false,
    canManageUsers: false,
    viewSettings: true,
    readOnly:     true,             // no add/edit/delete buttons shown
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

  useEffect(() => {
    const stored = localStorage.getItem('crm_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setLoading(false);
  }, []);

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
    localStorage.removeItem('crm_user');
    setUser(null);
  };

  // ── Refresh user from server ────────────────────────────────
  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const userData = await res.json();
        localStorage.setItem('crm_user', JSON.stringify(userData));
        setUser(userData);
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