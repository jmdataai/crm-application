import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';

const Icon = ({ name, style }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const TopBar = ({ title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isRecruit = location.pathname.startsWith('/recruitment');

  return (
    <header className="topbar">
      {/* Search */}
      <div className="search-bar">
        <Icon name="search" style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-variant)', fontSize: '1.1rem' }} />
        <input placeholder={`Search ${isRecruit ? 'candidates, jobs' : 'leads, tasks'}…`} style={{ paddingLeft: '2.25rem' }} />
      </div>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          className="btn-primary"
          onClick={() => navigate(isRecruit ? '/recruitment/candidates' : '/sales/leads')}
          style={{ fontSize: '0.8125rem', padding: '0.4rem 1rem' }}
        >
          <Icon name="add" style={{ fontSize: '1rem', color: '#fff' }} />
          Quick Add
        </button>

        <div style={{ width: 1, height: 24, background: 'var(--ghost-border)', margin: '0 0.25rem' }} />

        <button className="btn-icon" title="Notifications">
          <Icon name="notifications" />
        </button>
        <button className="btn-icon" title="Help">
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
};

const Layout = ({ children }) => (
  <div style={{ minHeight: '100vh', backgroundColor: 'var(--surface)' }}>
    <Sidebar />
    <TopBar />
    <main className="main-content">
      {children}
    </main>
  </div>
);

export default Layout;
