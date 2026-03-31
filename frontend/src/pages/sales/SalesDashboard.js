import React, { useState } from 'react';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const Chip = ({ status }) => {
  const map = {
    new: 'chip-new', contacted: 'chip-contacted', called: 'chip-called',
    interested: 'chip-interested', closed: 'chip-closed',
    'follow-up': 'chip-follow-up', rejected: 'chip-rejected', lost: 'chip-lost',
  };
  return <span className={`chip ${map[status] || 'chip-new'}`}>{status}</span>;
};

const kpis = [
  { label: 'Total Leads', value: '1,284', delta: '+12.5%', up: true, icon: 'group', color: 'var(--primary)' },
  { label: 'Conversion Rate', value: '24.8%', delta: '-2.1%', up: false, icon: 'trending_up', color: 'var(--tertiary)' },
  { label: 'Follow-ups Today', value: '18', delta: '+3', up: true, icon: 'schedule', color: 'var(--amber)' },
  { label: 'Closed This Month', value: '64', delta: '+8', up: true, icon: 'check_circle', color: 'var(--tertiary)' },
];

const recentLeads = [
  { id: 1, name: 'Priya Sharma', company: 'Infosys Ltd', title: 'CTO', status: 'interested', followUp: 'Today', source: 'Apollo' },
  { id: 2, name: 'Rahul Mehta', company: 'TCS',         title: 'VP Sales', status: 'contacted', followUp: 'Tomorrow', source: 'CSV Import' },
  { id: 3, name: 'Anika Patel', company: 'Wipro',       title: 'Director', status: 'called', followUp: 'Apr 2', source: 'Manual' },
  { id: 4, name: 'Vikram Singh', company: 'HCL Tech',   title: 'CISO', status: 'new', followUp: 'Apr 3', source: 'Apollo' },
  { id: 5, name: 'Deepa Nair',  company: 'Mindtree',    title: 'Head AI', status: 'follow-up', followUp: 'Overdue', source: 'LinkedIn' },
];

const todayTasks = [
  { id: 1, title: 'Follow up with Priya Sharma', time: '10:00 AM', type: 'call', done: false },
  { id: 2, title: 'Send proposal to Rahul Mehta', time: '12:00 PM', type: 'email', done: true },
  { id: 3, title: 'Demo call — Wipro AI Suite', time: '3:00 PM', type: 'meeting', done: false },
  { id: 4, title: 'Update lead notes — HCL', time: '4:30 PM', type: 'note', done: false },
];

const pipelineStages = [
  { label: 'New',         count: 312, pct: 100, color: 'var(--outline-variant)' },
  { label: 'Contacted',   count: 248, pct: 79,  color: 'var(--secondary)' },
  { label: 'Interested',  count: 185, pct: 59,  color: 'var(--primary)' },
  { label: 'Closed',      count: 64,  pct: 20,  color: 'var(--tertiary)' },
];

export default function SalesDashboard() {
  const [period, setPeriod] = useState('weekly');
  const [tasks, setTasks] = useState(todayTasks);

  const toggleTask = (id) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const taskIcon = { call: 'phone', email: 'mail', meeting: 'video_call', note: 'edit_note' };

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem' }}>Sales Overview</p>
          <h1 className="headline-sm">Good morning 👋</h1>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'var(--surface-container-low)', padding: '4px', borderRadius: '0.625rem',
        }}>
          {['today', 'weekly', 'monthly'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '0.375rem 0.875rem', borderRadius: '0.5rem', border: 'none',
                cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif',
                fontWeight: period === p ? 600 : 400,
                background: period === p ? 'var(--surface-container-lowest)' : 'transparent',
                color: period === p ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                boxShadow: period === p ? 'var(--ambient-shadow)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '1.75rem' }}>
        {kpis.map(k => (
          <div key={k.label} className="card fade-in hover-lift" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 12, right: 12, opacity: 0.07 }}>
              <Icon name={k.icon} style={{ fontSize: '3.5rem', color: k.color }} />
            </div>
            <p className="label-sm" style={{ marginBottom: '1rem' }}>{k.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--on-surface)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {k.value}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 4,
                background: k.up ? 'rgba(0,125,87,0.1)' : 'rgba(186,26,26,0.08)',
                color: k.up ? 'var(--tertiary)' : 'var(--error)',
              }}>
                <Icon name={k.up ? 'trending_up' : 'trending_down'} style={{ fontSize: '0.875rem', color: 'inherit' }} />
                {k.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid — Bento Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '1.25rem', marginBottom: '1.75rem' }}>

        {/* Pipeline Funnel */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--on-surface)' }}>Sales Pipeline</h2>
            <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>
              View All
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {pipelineStages.map(s => (
              <div key={s.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--on-surface)' }}>{s.label}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--on-surface)' }}>{s.count}</span>
                </div>
                <div style={{ height: 8, background: 'var(--surface-container-low)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 9999, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Tasks */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--on-surface)' }}>Today's Tasks</h2>
            <span style={{
              background: 'var(--primary)', color: '#fff', fontSize: '0.6875rem',
              fontWeight: 700, padding: '0.125rem 0.5rem', borderRadius: 9999,
            }}>
              {tasks.filter(t => !t.done).length} left
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {tasks.map(t => (
              <div
                key={t.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
                  background: t.done ? 'transparent' : 'var(--surface-container-low)',
                  opacity: t.done ? 0.5 : 1, transition: 'all 0.2s ease',
                }}
              >
                <button
                  onClick={() => toggleTask(t.id)}
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: `2px solid ${t.done ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                    background: t.done ? 'var(--tertiary)' : 'transparent',
                    cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {t.done && <Icon name="check" style={{ fontSize: '0.75rem', color: '#fff' }} />}
                </button>
                <Icon name={taskIcon[t.type]} style={{ fontSize: '1rem', color: 'var(--on-surface-variant)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--on-surface)', textDecoration: t.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{t.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Leads Table */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--on-surface)' }}>Recent Leads</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>Export</button>
            <a href="/sales/leads" className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.875rem' }}>
              View All
            </a>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Title</th>
              <th>Source</th>
              <th>Status</th>
              <th>Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {recentLeads.map(lead => (
              <tr key={lead.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div
                      className="avatar"
                      style={{ width: 32, height: 32, fontSize: '0.6875rem', background: 'var(--surface-container)', color: 'var(--primary)', fontWeight: 700 }}
                    >
                      {lead.name.split(' ').map(w => w[0]).join('')}
                    </div>
                    <span style={{ fontWeight: 500 }}>{lead.name}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--on-surface-variant)' }}>{lead.company}</td>
                <td style={{ color: 'var(--on-surface-variant)' }}>{lead.title}</td>
                <td>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', background: 'var(--surface-container-low)', padding: '0.125rem 0.5rem', borderRadius: 4 }}>
                    {lead.source}
                  </span>
                </td>
                <td><Chip status={lead.status} /></td>
                <td>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: lead.followUp === 'Overdue' ? 'var(--error)' : lead.followUp === 'Today' ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
                    {lead.followUp}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
