import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { remindersAPI } from '../services/api';

const Icon = ({ name, style }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

/* ── Notifications Panel ─────────────────────────────── */
const NotificationsPanel = ({ onClose }) => {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    remindersAPI.getAll({ upcoming: true })
      .then(res => {
        const data = Array.isArray(res.data) ? res.data
          : Array.isArray(res.data?.data) ? res.data.data : [];
        // Show reminders due today or overdue, not dismissed
        const relevant = data.filter(r => !r.dismissed && r.due_date <= today)
          .sort((a,b) => a.due_date.localeCompare(b.due_date))
          .slice(0, 8);
        setReminders(relevant);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0,10);

  return (
    <div ref={ref} style={{
      position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:200,
      background:'var(--surface-container-lowest)', border:'1px solid var(--outline-variant)',
      borderRadius:'0.875rem', boxShadow:'0 8px 32px rgba(0,0,0,0.14)',
      width:340, maxHeight:460, overflow:'hidden', display:'flex', flexDirection:'column',
    }}>
      <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--on-surface)' }}>Notifications</p>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--on-surface-variant)' }}>
          <Icon name="close" style={{ fontSize:'1rem' }} />
        </button>
      </div>

      <div style={{ overflowY:'auto', flex:1 }}>
        {loading && <p style={{ textAlign:'center', padding:'2rem', color:'var(--on-surface-variant)', fontSize:'0.875rem' }}>Loading…</p>}
        {!loading && reminders.length === 0 && (
          <div style={{ textAlign:'center', padding:'2.5rem 1rem', color:'var(--on-surface-variant)' }}>
            <Icon name="notifications_none" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.5rem', opacity:0.3 }} />
            <p style={{ fontSize:'0.875rem', fontWeight:500 }}>All caught up!</p>
            <p style={{ fontSize:'0.8125rem', opacity:0.7 }}>No pending reminders</p>
          </div>
        )}
        {reminders.map(r => {
          const isOverdue = r.due_date < today;
          return (
            <div key={r.id} style={{ padding:'0.875rem 1.25rem', borderBottom:'1px solid var(--surface-container)', display:'flex', gap:'0.75rem', alignItems:'flex-start' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background: isOverdue ? 'var(--error-container)' : 'rgba(0,74,198,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon name="alarm" style={{ fontSize:'1rem', color: isOverdue ? 'var(--error)' : 'var(--primary)' }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)', marginBottom:'0.2rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</p>
                <p style={{ fontSize:'0.75rem', color: isOverdue ? 'var(--error)' : 'var(--on-surface-variant)', fontWeight: isOverdue ? 600 : 400 }}>
                  {isOverdue ? '⚠ Overdue · ' : ''}{r.due_date}{r.due_time ? ' at ' + r.due_time.slice(0,5) : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding:'0.75rem 1.25rem', borderTop:'1px solid var(--outline-variant)' }}>
        <a href="/sales/reminders" style={{ fontSize:'0.8125rem', color:'var(--primary)', fontWeight:600, textDecoration:'none' }}>
          View all reminders →
        </a>
      </div>
    </div>
  );
};

/* ── Help Panel ──────────────────────────────────────── */
const HelpPanel = ({ onClose }) => {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    { icon:'person_add',    label:'Add a Lead',          href:'/sales/leads' },
    { icon:'upload_file',   label:'Import Leads (CSV)',   href:'/sales/import' },
    { icon:'task_alt',      label:'Create a Task',        href:'/sales/tasks' },
    { icon:'alarm',         label:'Set a Reminder',       href:'/sales/reminders' },
    { icon:'group',         label:'Add a Candidate',      href:'/recruitment/candidates' },
    { icon:'work',          label:'Post a Job',           href:'/recruitment/jobs' },
    { icon:'settings',      label:'Manage Users',         href:'/settings' },
  ];

  return (
    <div ref={ref} style={{
      position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:200,
      background:'var(--surface-container-lowest)', border:'1px solid var(--outline-variant)',
      borderRadius:'0.875rem', boxShadow:'0 8px 32px rgba(0,0,0,0.14)', width:260,
    }}>
      <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--on-surface)' }}>Quick Help</p>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--on-surface-variant)' }}>
          <Icon name="close" style={{ fontSize:'1rem' }} />
        </button>
      </div>
      <div style={{ padding:'0.5rem 0' }}>
        {items.map(item => (
          <a key={item.label} href={item.href} onClick={onClose} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.625rem 1.25rem', textDecoration:'none', color:'var(--on-surface)', fontSize:'0.875rem', transition:'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--surface-container-low)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <Icon name={item.icon} style={{ fontSize:'1.1rem', color:'var(--primary)' }} />
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
};

/* ── Top Bar ─────────────────────────────────────────── */
const TopBar = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const isRecruit = location.pathname.startsWith('/recruitment');

  const [search, setSearch]       = useState('');
  const [showNotifs, setNotifs]   = useState(false);
  const [showHelp, setHelp]       = useState(false);

  const handleSearch = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      const q = encodeURIComponent(search.trim());
      navigate(isRecruit ? `/recruitment/candidates?q=${q}` : `/sales/leads?q=${q}`);
      setSearch('');
    }
  };

  return (
    <header className="topbar">
      {/* Search */}
      <div className="search-bar" style={{ maxWidth: 340 }}>
        <Icon name="search" style={{ position:'absolute', left:'0.625rem', top:'50%', transform:'translateY(-50%)', color:'var(--on-surface-variant)', fontSize:'1.1rem' }} />
        <input
          placeholder={`Search ${isRecruit ? 'candidates, jobs' : 'leads, tasks'}… (Enter)`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearch}
          style={{ paddingLeft:'2.25rem' }}
        />
      </div>

      {/* Right Actions */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <button
          className="btn-primary"
          onClick={() => navigate(isRecruit ? '/recruitment/candidates' : '/sales/leads')}
          style={{ fontSize:'0.8125rem', padding:'0.4rem 1rem' }}
        >
          <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Quick Add
        </button>

        <div style={{ width:1, height:24, background:'var(--ghost-border)', margin:'0 0.25rem' }} />

        {/* Notifications */}
        <div style={{ position:'relative' }}>
          <button className="btn-icon" title="Notifications" onClick={() => { setNotifs(v=>!v); setHelp(false); }}>
            <Icon name="notifications" />
          </button>
          {showNotifs && <NotificationsPanel onClose={() => setNotifs(false)} />}
        </div>

        {/* Help */}
        <div style={{ position:'relative' }}>
          <button className="btn-icon" title="Help" onClick={() => { setHelp(v=>!v); setNotifs(false); }}>
            <Icon name="help" />
          </button>
          {showHelp && <HelpPanel onClose={() => setHelp(false)} />}
        </div>
      </div>
    </header>
  );
};

/* ── Layout ──────────────────────────────────────────── */
const Layout = ({ children }) => (
  <div style={{ minHeight:'100vh', backgroundColor:'var(--surface)' }}>
    <Sidebar />
    <TopBar />
    <main className="main-content">
      {children}
    </main>
  </div>
);

export default Layout;
