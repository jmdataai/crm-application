import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Icon = ({ name }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle' }}>{name}</span>
);

// ── Nav definitions ──────────────────────────────────────────
const salesNav = [
  { path: '/sales',           icon: 'dashboard',    label: 'Dashboard',    exact: true },
  { path: '/sales/leads',     icon: 'group',         label: 'Leads' },
  { path: '/sales/import',    icon: 'upload_file',   label: 'Import Leads', requiresPerm: 'canViewImport' },
  { path: '/sales/enrich',    icon: 'auto_fix_high', label: 'Enrich Leads', requiresPerm: 'canViewImport' },
  { path: '/sales/tasks',     icon: 'task_alt',      label: 'Tasks' },
  { path: '/sales/reminders', icon: 'notifications', label: 'Reminders' },
];

const recruitNav = [
  { path: '/recruitment',                   icon: 'dashboard',     label: 'Dashboard',         exact: true },
  { path: '/recruitment/jobs',              icon: 'work',           label: 'Jobs' },
  { path: '/recruitment/candidates',        icon: 'person_search',  label: 'Candidates' },
  { path: '/recruitment/import-candidates', icon: 'upload_file',    label: 'Import Candidates', requiresPerm: 'canViewImport' },
  { path: '/recruitment/pipeline',          icon: 'account_tree',   label: 'Pipeline' },
  { path: '/recruitment/interviews',        icon: 'event',          label: 'Interviews' },
  { path: '/recruitment/tasks',             icon: 'task_alt',       label: 'Tasks' },
  { path: '/recruitment/ats-match',         icon: 'manage_search',  label: 'ATS Match' },
];

const timesheetNav = [
  { path: '/timesheet',           icon: 'schedule',     label: 'My Timesheet', exact: true, requiresPerm: 'viewOwnTimesheet' },
  { path: '/timesheet/approvals', icon: 'task_alt',     label: 'Approvals',    requiresPerm: 'viewTimesheetApprovals' },
];

// ── Role badge ───────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const map = {
    admin:  { label: 'Admin',    bg: 'rgba(68,104,176,0.1)',   color: 'var(--primary)' },
    sales:  { label: 'Sales',    bg: 'rgba(0,98,67,0.1)',    color: 'var(--tertiary)' },
    viewer: { label: 'Viewer',   bg: 'rgba(115,118,134,0.1)',color: 'var(--on-surface-variant)' },
    worker: { label: 'Worker',   bg: 'rgba(234,88,12,0.1)',  color: '#ea580c' },
  };
  const s = map[role] || map.viewer;
  return (
    <span style={{
      fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.07em',
      textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
};

// ── Sidebar ──────────────────────────────────────────────────
const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout, hasModule, can, isViewer, isWorker } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const isTimesheet = location.pathname.startsWith('/timesheet');
  const isRecruit = !isTimesheet && location.pathname.startsWith('/recruitment');

  // Close sidebar on route change (mobile)
  const prevPath = React.useRef(location.pathname);
  React.useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      if (onClose) onClose();
    }
  }, [location.pathname, onClose]);

  const canSeeRecruit   = hasModule('recruitment');
  const canSeeSales     = hasModule('sales');
  const canSeeTimesheet = hasModule('timesheet');

  // Determine current mode
  let currentMode = isTimesheet ? 'timesheet' : (isRecruit ? 'recruitment' : 'sales');
  const accentColor = isTimesheet
    ? '#ea580c'
    : (isRecruit ? 'var(--tertiary)' : 'var(--primary)');

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  // Filter nav items by permission
  const filterNav = (items) =>
    items.filter(item => !item.requiresPerm || can(item.requiresPerm));

  let navItems;
  if (isTimesheet) navItems = filterNav(timesheetNav);
  else if (isRecruit) navItems = filterNav(recruitNav);
  else navItems = filterNav(salesNav);

  const NavItem = ({ item }) => (
    <NavLink
      to={item.path}
      end={item.exact}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        padding: '0.5625rem 0.75rem', borderRadius: '0.625rem',
        textDecoration: 'none', fontSize: '0.875rem',
        fontFamily: 'var(--font-display)',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#FAF7FB' : 'var(--sidebar-text)',
        background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
        transition: 'all 0.15s',
      })}
    >
      <Icon name={item.icon} />
      {item.label}
    </NavLink>
  );

  return (
    <aside className={`sidebar ${isRecruit ? 'sidebar-recruitment' : isTimesheet ? 'sidebar-timesheet' : 'sidebar-sales'}${isOpen ? ' sidebar-open' : ''}`}>

      {/* Logo + mobile close button */}
      <div style={{ padding: '0 0.25rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img
          src="/jm-logo.png"
          alt="JMData"
          style={{ width: 40, height: 40, borderRadius: '0.625rem', flexShrink: 0, objectFit: 'cover' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#FAF7FB', fontFamily: 'var(--font-display)', margin: 0 }}>JMData Talent CRM</p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--sidebar-text)', opacity: 0.7, margin: 0, marginTop: 1, fontFamily: 'var(--font-ui)' }}>
            {isTimesheet ? 'Timesheet' : isRecruit ? 'Recruitment' : 'Sales'} Portal
          </p>
        </div>
        <button className="sidebar-close-btn" onClick={onClose} title="Close menu" style={{ color: 'var(--sidebar-text)' }}>
          <Icon name="close" />
        </button>
      </div>

      {/* Module switcher — skip for worker (only timesheet) */}
      {!isWorker && (canSeeSales || canSeeRecruit || canSeeTimesheet) && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{
            display: 'flex', gap: 4, padding: 4,
            background: 'rgba(255,255,255,0.07)', borderRadius: '0.75rem',
            flexWrap: 'wrap',
          }}>
            {canSeeSales && (
              <button onClick={() => navigate('/sales')} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '0.375rem', padding: '0.5rem 0.5rem', borderRadius: '0.625rem',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                fontSize: '0.75rem', fontWeight: currentMode === 'sales' ? 600 : 500,
                background: currentMode === 'sales' ? 'rgba(68,104,176,0.35)' : 'transparent',
                color: currentMode === 'sales' ? '#FAF7FB' : 'var(--sidebar-text)',
                boxShadow: 'none',
                transition: 'all 0.2s',
              }}>
                <Icon name="trending_up" /> Sales
              </button>
            )}
            {canSeeRecruit && (
              <button onClick={() => navigate('/recruitment')} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '0.375rem', padding: '0.5rem 0.5rem', borderRadius: '0.625rem',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                fontSize: '0.75rem', fontWeight: currentMode === 'recruitment' ? 600 : 500,
                background: currentMode === 'recruitment' ? 'rgba(68,104,176,0.35)' : 'transparent',
                color: currentMode === 'recruitment' ? '#FAF7FB' : 'var(--sidebar-text)',
                boxShadow: 'none',
                transition: 'all 0.2s',
              }}>
                <Icon name="person_search" /> Recruit
              </button>
            )}
            {canSeeTimesheet && (
              <button onClick={() => navigate(isViewer ? '/timesheet/approvals' : '/timesheet')} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '0.375rem', padding: '0.5rem 0.5rem', borderRadius: '0.625rem',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                fontSize: '0.75rem', fontWeight: currentMode === 'timesheet' ? 600 : 500,
                background: currentMode === 'timesheet' ? 'rgba(234,88,12,0.3)' : 'transparent',
                color: currentMode === 'timesheet' ? '#f97316' : 'var(--sidebar-text)',
                boxShadow: 'none',
                transition: 'all 0.2s',
              }}>
                <Icon name="schedule" /> Time
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {navItems.map(item => <NavItem key={item.path} item={item} />)}
      </nav>

      {/* Read-only banner for viewer */}
      {isViewer && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
          background: 'rgba(255,255,255,0.06)', borderRadius: '0.625rem',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Icon name="visibility" />
          <span style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', fontWeight: 500 }}>
            View-only access
          </span>
        </div>
      )}

      <div className="divider" style={{ margin: '0.75rem 0', background: 'rgba(255,255,255,0.1)' }} />

      {can('viewCEO') && (
        <>
          <NavLink to="/ceo" style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
            textDecoration: 'none', fontSize: '0.875rem',
            fontFamily: 'var(--font-display)',
            color: isActive ? '#FAF7FB' : 'var(--sidebar-text)',
            background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
          })}>
            <Icon name="analytics" /><span>CEO Dashboard</span>
          </NavLink>
          <NavLink to="/audit-log" style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
            textDecoration: 'none', fontSize: '0.875rem',
            fontFamily: 'var(--font-display)',
            color: isActive ? '#FAF7FB' : 'var(--sidebar-text)',
            background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
          })}>
            <Icon name="policy" /><span>Audit Log</span>
          </NavLink>
          <NavLink to="/expenses" style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
            textDecoration: 'none', fontSize: '0.875rem',
            fontFamily: 'var(--font-display)',
            color: isActive ? '#FAF7FB' : 'var(--sidebar-text)',
            background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
          })}>
            <Icon name="receipt_long" /><span>Expenses</span>
          </NavLink>
        </>
      )}

      {can('viewSettings') && (
        <NavLink to="/settings" style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: '0.625rem',
          padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
          textDecoration: 'none', fontSize: '0.875rem',
          fontFamily: 'var(--font-display)',
          color: isActive ? '#FAF7FB' : 'var(--sidebar-text)',
          background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
        })}>
          <Icon name="settings" /><span>Settings</span>
        </NavLink>
      )}

      <div style={{
        marginTop: '0.5rem', padding: '0.75rem',
        borderRadius: '0.75rem', background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        <div className="avatar" style={{
          width: 36, height: 36, fontSize: '0.75rem', fontWeight: 700,
          background: `linear-gradient(135deg, var(--sidebar-accent), #6B8FCC)`,
          color: '#fff',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.125rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#FAF7FB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {user?.name || 'User'}
            </p>
            <RoleBadge role={user?.role} />
          </div>
          <p style={{ fontSize: '0.6875rem', color: 'var(--sidebar-text)', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
            {user?.email || ''}
          </p>
        </div>
        <button onClick={logout} className="btn-icon" title="Logout" style={{ color: '#f87171', flexShrink: 0 }}>
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
