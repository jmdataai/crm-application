import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  FileUp, 
  CheckSquare, 
  Bell,
  Briefcase,
  UserPlus,
  Calendar,
  Settings,
  LogOut,
  TrendingUp,
  GitBranch
} from 'lucide-react';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isRecruitmentMode = location.pathname.startsWith('/recruitment');

  const salesNavItems = [
    { path: '/sales', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/sales/leads', icon: Users, label: 'Leads' },
    { path: '/sales/import', icon: FileUp, label: 'Import Leads' },
    { path: '/sales/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/sales/reminders', icon: Bell, label: 'Reminders' },
  ];

  const recruitmentNavItems = [
    { path: '/recruitment', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/recruitment/jobs', icon: Briefcase, label: 'Jobs' },
    { path: '/recruitment/candidates', icon: UserPlus, label: 'Candidates' },
    { path: '/recruitment/pipeline', icon: GitBranch, label: 'Pipeline' },
    { path: '/recruitment/interviews', icon: Calendar, label: 'Interviews' },
    { path: '/recruitment/tasks', icon: CheckSquare, label: 'Tasks' },
  ];

  const navItems = isRecruitmentMode ? recruitmentNavItems : salesNavItems;
  const sidebarClass = isRecruitmentMode ? 'sidebar sidebar-recruitment' : 'sidebar sidebar-sales';

  return (
    <aside className={sidebarClass} data-testid="sidebar">
      {/* Logo */}
      <div className="px-6 mb-8">
        <h1 className="headline-sm" style={{ color: 'var(--on-surface)' }}>
          {isRecruitmentMode ? 'Recruit Hub' : 'Sales Hub'}
        </h1>
        <p className="label-sm mt-1">CRM Platform</p>
      </div>

      {/* Module Switcher */}
      <div className="px-4 mb-6">
        <div className="flex gap-2 p-1 rounded-lg" style={{ backgroundColor: 'var(--surface-container-high)' }}>
          <NavLink 
            to="/sales" 
            className={`flex-1 py-2 px-3 rounded-md text-center text-sm font-medium transition-all ${!isRecruitmentMode ? 'surface-container-lowest ambient-shadow' : ''}`}
            style={{ color: !isRecruitmentMode ? 'var(--primary)' : 'var(--on-surface-variant)' }}
            data-testid="switch-to-sales"
          >
            <TrendingUp className="inline-block w-4 h-4 mr-1" />
            Sales
          </NavLink>
          <NavLink 
            to="/recruitment" 
            className={`flex-1 py-2 px-3 rounded-md text-center text-sm font-medium transition-all ${isRecruitmentMode ? 'surface-container-lowest ambient-shadow' : ''}`}
            style={{ color: isRecruitmentMode ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}
            data-testid="switch-to-recruitment"
          >
            <Briefcase className="inline-block w-4 h-4 mr-1" />
            Recruit
          </NavLink>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/sales' || item.path === '/recruitment'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User Section */}
      <div className="mt-auto px-4 py-4" style={{ borderTop: '1px solid var(--ghost-border)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isRecruitmentMode ? 'var(--tertiary)' : 'var(--primary)', color: 'white' }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="title-sm truncate">{user?.name || 'User'}</p>
            <p className="label-sm truncate">{user?.role?.replace('_', ' ') || 'Member'}</p>
          </div>
        </div>
        <button 
          onClick={logout}
          className="nav-item w-full justify-start"
          style={{ color: 'var(--error)' }}
          data-testid="logout-btn"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
