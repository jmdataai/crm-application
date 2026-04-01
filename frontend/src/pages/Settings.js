import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', ...style }}>{name}</span>
);

const ROLE_COLORS = {
  admin:  { bg: '#fef3c7', color: '#92400e' },
  sales:  { bg: '#dbeafe', color: '#1e40af' },
  viewer: { bg: '#f3f4f6', color: '#374151' },
};

const ROLE_LABELS = { admin: 'Admin', sales: 'Sales Rep', viewer: 'Viewer' };

export default function Settings() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';

  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Add user form
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState({ name: '', email: '', password: '', role: 'sales' });
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');

  // Role edit
  const [editingRole, setEditingRole] = useState(null); // user id

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000); }
    else         { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to load users');
      }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      flash(err.message || 'Failed to load users', true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Add user ────────────────────────────────────────────────
  const handleAdd = async () => {
    setFormError('');
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError('Name, email and password are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to create user');
      flash(`User "${form.name}" created successfully`);
      setForm({ name: '', email: '', password: '', role: 'sales' });
      setShowAdd(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Change role ─────────────────────────────────────────────
  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update role');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      setEditingRole(null);
      flash('Role updated');
    } catch (err) {
      flash(err.message, true);
    }
  };

  // ── Delete user ─────────────────────────────────────────────
  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete user');
      setUsers(prev => prev.filter(u => u.id !== userId));
      flash(`User "${userName}" deleted`);
    } catch (err) {
      flash(err.message, true);
    }
  };

  // ── Styles ──────────────────────────────────────────────────
  const card = {
    background: 'var(--surface-container-lowest)',
    border: '1px solid var(--outline-variant)',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--on-surface)', marginBottom: '0.25rem' }}>
        Settings
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginBottom: '2rem' }}>
        Manage your team and application settings
      </p>

      {/* Flash messages */}
      {error   && <div style={{ background:'var(--error-container)', color:'var(--error)', padding:'0.875rem 1rem', borderRadius:'0.5rem', marginBottom:'1rem', fontSize:'0.875rem' }}>{error}</div>}
      {success && <div style={{ background:'#dcfce7', color:'#166534', padding:'0.875rem 1rem', borderRadius:'0.5rem', marginBottom:'1rem', fontSize:'0.875rem' }}>{success}</div>}

      {/* ── User Management ── */}
      {isAdmin && (
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
            <div>
              <h2 style={{ fontSize:'1.1rem', fontWeight:600, color:'var(--on-surface)' }}>User Management</h2>
              <p style={{ fontSize:'0.8rem', color:'var(--on-surface-variant)', marginTop:'0.2rem' }}>
                Add, edit roles, or remove team members
              </p>
            </div>
            <button
              onClick={() => { setShowAdd(!showAdd); setFormError(''); }}
              style={{
                display:'flex', alignItems:'center', gap:'0.4rem',
                padding:'0.5rem 1rem', borderRadius:'0.5rem',
                background:'linear-gradient(135deg,var(--primary),var(--primary-container))',
                color:'#fff', border:'none', cursor:'pointer', fontSize:'0.875rem', fontWeight:600,
              }}
            >
              <Icon name={showAdd ? 'close' : 'person_add'} style={{ fontSize:'1rem', color:'#fff' }} />
              {showAdd ? 'Cancel' : 'Add User'}
            </button>
          </div>

          {/* Add user form */}
          {showAdd && (
            <div style={{
              background:'var(--surface-container)', borderRadius:'0.625rem',
              padding:'1.25rem', marginBottom:'1.25rem',
              border:'1px solid var(--outline-variant)',
            }}>
              <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)', marginBottom:'1rem' }}>
                New User Details
              </p>
              {formError && (
                <div style={{ background:'var(--error-container)', color:'var(--error)', padding:'0.625rem 0.875rem', borderRadius:'0.375rem', fontSize:'0.8rem', marginBottom:'1rem' }}>
                  {formError}
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'0.875rem' }}>
                {[
                  { label:'Full Name',    key:'name',     type:'text',     placeholder:'e.g. Priya Sharma' },
                  { label:'Email',        key:'email',    type:'email',    placeholder:'priya@company.com' },
                  { label:'Password',     key:'password', type:'password', placeholder:'Min. 8 characters' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)', display:'block', marginBottom:'0.35rem' }}>{f.label}</label>
                    <input
                      type={f.type}
                      placeholder={f.placeholder}
                      value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{
                        width:'100%', padding:'0.5rem 0.75rem', borderRadius:'0.375rem',
                        border:'1px solid var(--outline-variant)', background:'var(--surface)',
                        color:'var(--on-surface)', fontSize:'0.875rem', boxSizing:'border-box',
                      }}
                    />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)', display:'block', marginBottom:'0.35rem' }}>Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                    style={{
                      width:'100%', padding:'0.5rem 0.75rem', borderRadius:'0.375rem',
                      border:'1px solid var(--outline-variant)', background:'var(--surface)',
                      color:'var(--on-surface)', fontSize:'0.875rem', boxSizing:'border-box',
                    }}
                  >
                    <option value="sales">Sales Rep</option>
                    <option value="viewer">Viewer (CEO/Read-only)</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleAdd}
                disabled={saving}
                style={{
                  padding:'0.5rem 1.25rem', borderRadius:'0.5rem',
                  background:'linear-gradient(135deg,var(--primary),var(--primary-container))',
                  color:'#fff', border:'none', cursor:'pointer', fontSize:'0.875rem', fontWeight:600,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          )}

          {/* Users table */}
          {loading ? (
            <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem' }}>Loading users...</p>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--outline-variant)' }}>
                    {['Name', 'Email', 'Role', 'Actions'].map(h => (
                      <th key={h} style={{ textAlign:'left', padding:'0.625rem 0.75rem', fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom:'1px solid var(--surface-container)' }}>
                      <td style={{ padding:'0.75rem', color:'var(--on-surface)', fontWeight:500 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                          <div style={{
                            width:32, height:32, borderRadius:'50%',
                            background:'linear-gradient(135deg,var(--primary),var(--primary-container))',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'#fff', fontWeight:700, fontSize:'0.75rem', flexShrink:0,
                          }}>
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          {u.name}
                          {u.id === me?.id && <span style={{ fontSize:'0.7rem', background:'var(--surface-container)', color:'var(--on-surface-variant)', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>You</span>}
                        </div>
                      </td>
                      <td style={{ padding:'0.75rem', color:'var(--on-surface-variant)' }}>{u.email}</td>
                      <td style={{ padding:'0.75rem' }}>
                        {editingRole === u.id ? (
                          <div style={{ display:'flex', gap:'0.375rem', alignItems:'center' }}>
                            <select
                              defaultValue={u.role || 'sales'}
                              onChange={e => handleRoleChange(u.id, e.target.value)}
                              style={{
                                padding:'0.3rem 0.5rem', borderRadius:'0.375rem',
                                border:'1px solid var(--outline-variant)', background:'var(--surface)',
                                color:'var(--on-surface)', fontSize:'0.8rem',
                              }}
                            >
                              <option value="sales">Sales Rep</option>
                              <option value="viewer">Viewer</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => setEditingRole(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--on-surface-variant)' }}>
                              <Icon name="close" style={{ fontSize:'1rem' }} />
                            </button>
                          </div>
                        ) : (
                          <span style={{
                            padding:'0.2rem 0.625rem', borderRadius:'0.75rem', fontSize:'0.75rem', fontWeight:600,
                            background: ROLE_COLORS[u.role || 'sales']?.bg,
                            color:      ROLE_COLORS[u.role || 'sales']?.color,
                          }}>
                            {ROLE_LABELS[u.role || 'sales']}
                          </span>
                        )}
                      </td>
                      <td style={{ padding:'0.75rem' }}>
                        <div style={{ display:'flex', gap:'0.5rem' }}>
                          {u.id !== me?.id && (
                            <>
                              <button
                                onClick={() => setEditingRole(u.id)}
                                title="Change role"
                                style={{ background:'none', border:'1px solid var(--outline-variant)', borderRadius:'0.375rem', padding:'0.25rem 0.5rem', cursor:'pointer', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.75rem' }}
                              >
                                <Icon name="manage_accounts" style={{ fontSize:'0.9rem' }} /> Role
                              </button>
                              <button
                                onClick={() => handleDelete(u.id, u.name)}
                                title="Delete user"
                                style={{ background:'none', border:'1px solid var(--error)', borderRadius:'0.375rem', padding:'0.25rem 0.5rem', cursor:'pointer', color:'var(--error)', display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.75rem' }}
                              >
                                <Icon name="delete" style={{ fontSize:'0.9rem', color:'var(--error)' }} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Account Info (visible to all) ── */}
      <div style={card}>
        <h2 style={{ fontSize:'1.1rem', fontWeight:600, color:'var(--on-surface)', marginBottom:'1rem' }}>Your Account</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {[
            { label:'Name',  value: me?.name },
            { label:'Email', value: me?.email },
            { label:'Role',  value: ROLE_LABELS[me?.role] || me?.role },
          ].map(f => (
            <div key={f.label}>
              <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', fontWeight:600, marginBottom:'0.25rem' }}>{f.label}</p>
              <p style={{ fontSize:'0.9rem', color:'var(--on-surface)' }}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}