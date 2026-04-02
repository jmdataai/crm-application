import React, { useState, useEffect, useCallback } from 'react';
import { dashboardAPI, tasksAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const Chip = ({ status }) => {
  const map = {
    new: 'chip-new', contacted: 'chip-contacted', called: 'chip-called',
    interested: 'chip-interested', closed: 'chip-closed', completed: 'chip-completed',
    follow_up_needed: 'chip-follow-up', rejected: 'chip-rejected', lost: 'chip-lost',
  };
  const labels = {
    new:'New', contacted:'Contacted', called:'Called', interested:'Interested',
    closed:'Closed', completed:'Completed', follow_up_needed:'Follow-up',
    rejected:'Rejected', lost:'Lost',
  };
  return <span className={`chip ${map[status] || 'chip-new'}`}>{labels[status] || status}</span>;
};

const TASK_ICON = { call:'phone', email:'mail', meeting:'video_call', note:'edit_note', follow_up:'schedule', demo:'present_to_all', outreach:'person_search' };

export default function SalesDashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('weekly');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardAPI.getSales();
      setData(res.data);
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const toggleTask = async (taskId, done) => {
    try {
      await tasksAPI.update(taskId, { completed: !done });
      setData(prev => prev ? {
        ...prev,
        today_tasks: prev.today_tasks.map(t => t.id === taskId ? { ...t, completed: !done } : t)
      } : prev);
    } catch {}
  };

  const stats = data?.lead_stats || {};
  const totalLeads     = data?.total_leads || 0;
  const todayFollowups = data?.today_followups?.length || 0;
  const closedCount    = (stats.closed || 0) + (stats.completed || 0);
  const convRate       = totalLeads > 0 ? ((closedCount / totalLeads) * 100).toFixed(1) : '0';

  // Filter data by selected period
  const now   = new Date();
  const start = period === 'today'   ? new Date(now.toISOString().slice(0,10))
              : period === 'weekly'  ? new Date(now - 7*86400000)
              :                        new Date(now - 30*86400000);
  const startStr = start.toISOString().slice(0,10);
  const periodLeads = recentLeads.filter(l => !l.created_at || l.created_at.slice(0,10) >= startStr);
  const periodTasks = todayTasks.filter(t =>
    period === 'today'  ? t.due_date === new Date().toISOString().slice(0,10)
    : period === 'weekly' ? (t.due_date >= startStr)
    : true
  );

  const kpis = [
    { label:'Total Leads',       value: totalLeads.toLocaleString(), icon:'group',         color:'var(--primary)' },
    { label:'Conversion Rate',   value: `${convRate}%`,              icon:'trending_up',   color:'var(--tertiary)' },
    { label:'Follow-ups Today',  value: todayFollowups,              icon:'schedule',       color:'var(--amber)' },
    { label:'Closed This Month', value: closedCount,                 icon:'check_circle',   color:'var(--tertiary)' },
  ];

  const maxCount = Math.max(...Object.values(stats), 1);
  const pipelineStages = [
    { label:'New',        count: stats.new || 0,         color:'var(--outline-variant)' },
    { label:'Contacted',  count: stats.contacted || 0,   color:'var(--secondary)' },
    { label:'Interested', count: stats.interested || 0,  color:'var(--primary)' },
    { label:'Closed',     count: closedCount,            color:'var(--tertiary)' },
  ].map(s => ({ ...s, pct: Math.round((s.count / maxCount) * 100) }));

  const recentLeads = data?.recent_leads || [];
  const todayTasks  = data?.today_tasks  || [];

  const firstName = user?.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'2rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Sales Overview</p>
          <h1 className="headline-sm">{greeting}, {firstName} 👋</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'2px', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.625rem' }}>
          {['today','weekly','monthly'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding:'0.375rem 0.875rem', borderRadius:'0.5rem', border:'none', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Inter,sans-serif', fontWeight:period===p?600:400, background:period===p?'var(--surface-container-lowest)':'transparent', color:period===p?'var(--on-surface)':'var(--on-surface-variant)', boxShadow:period===p?'var(--ambient-shadow)':'none', transition:'all 0.2s ease' }}>
              {p.charAt(0).toUpperCase()+p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />
          Loading dashboard…
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Strip */}
          <div className="stagger-children" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1.25rem', marginBottom:'1.75rem' }}>
            {kpis.map(k => (
              <div key={k.label} className="card fade-in hover-lift" style={{ position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:12, right:12, opacity:0.07 }}>
                  <Icon name={k.icon} style={{ fontSize:'3.5rem', color:k.color }} />
                </div>
                <p className="label-sm" style={{ marginBottom:'1rem' }}>{k.label}</p>
                <span style={{ fontSize:'2.5rem', fontWeight:800, color:'var(--on-surface)', letterSpacing:'-0.03em', lineHeight:1 }}>{k.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem', marginBottom:'1.75rem' }}>
            {/* Pipeline Funnel */}
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
                <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Sales Pipeline</h2>
                <a href="/sales/leads" className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>View All</a>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
                {pipelineStages.map(s => (
                  <div key={s.label}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.375rem' }}>
                      <span style={{ fontSize:'0.875rem', fontWeight:500 }}>{s.label}</span>
                      <span style={{ fontSize:'0.875rem', fontWeight:700 }}>{s.count}</span>
                    </div>
                    <div style={{ height:8, background:'var(--surface-container-low)', borderRadius:9999, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${s.pct}%`, background:s.color, borderRadius:9999, transition:'width 0.6s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Today's Tasks */}
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
                <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Today's Tasks</h2>
                <span style={{ background:'var(--primary)', color:'#fff', fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999 }}>
                  {periodTasks.filter(t => !t.completed).length} left
                </span>
              </div>
              {periodTasks.length === 0 && (
                <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', textAlign:'center', padding:'1.5rem 0' }}>No tasks due today 🎉</p>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {periodTasks.slice(0,6).map(t => (
                  <div key={t.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.625rem 0.75rem', borderRadius:'0.5rem', background:t.completed?'transparent':'var(--surface-container-low)', opacity:t.completed?0.5:1, transition:'all 0.2s ease' }}>
                    <button onClick={() => toggleTask(t.id, t.completed)} style={{ width:20, height:20, borderRadius:4, border:`2px solid ${t.completed?'var(--tertiary)':'var(--outline-variant)'}`, background:t.completed?'var(--tertiary)':'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {t.completed && <Icon name="check" style={{ fontSize:'0.75rem', color:'#fff' }} />}
                    </button>
                    <Icon name={TASK_ICON[t.task_type] || 'task_alt'} style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:'0.875rem', fontWeight:500, textDecoration:t.completed?'line-through':'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</p>
                      {t.due_time && <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{t.due_time.slice(0,5)}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {periodTasks.length > 0 && <a href="/sales/tasks" style={{ display:'block', textAlign:'center', fontSize:'0.8125rem', color:'var(--primary)', marginTop:'0.75rem', textDecoration:'none' }}>View all tasks →</a>}
            </div>
          </div>

          {/* Recent Leads */}
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
              <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Recent Leads</h2>
              <a href="/sales/leads" className="btn-primary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.875rem' }}>View All</a>
            </div>
            {periodLeads.length === 0 ? (
              <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem 0' }}>No leads yet — <a href="/sales/leads" style={{ color:'var(--primary)' }}>add your first lead</a></p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Company</th><th>Title</th><th>Source</th><th>Status</th><th>Follow-up</th></tr>
                </thead>
                <tbody>
                  {periodLeads.map(lead => {
                    const today = new Date().toISOString().slice(0,10);
                    const isOverdue = lead.next_follow_up && lead.next_follow_up < today;
                    const isToday   = lead.next_follow_up === today;
                    return (
                      <tr key={lead.id} onClick={() => window.location.href=`/sales/leads/${lead.id}`} style={{ cursor:'pointer' }}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                            <div className="avatar" style={{ width:32, height:32, fontSize:'0.6875rem', background:'var(--surface-container)', color:'var(--primary)', fontWeight:700 }}>
                              {lead.full_name?.split(' ').map(w=>w[0]).join('').slice(0,2)}
                            </div>
                            <span style={{ fontWeight:500 }}>{lead.full_name}</span>
                          </div>
                        </td>
                        <td style={{ color:'var(--on-surface-variant)' }}>{lead.company || '—'}</td>
                        <td style={{ color:'var(--on-surface-variant)' }}>{lead.job_title || '—'}</td>
                        <td><span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', background:'var(--surface-container-low)', padding:'0.125rem 0.5rem', borderRadius:4 }}>{lead.source || '—'}</span></td>
                        <td><Chip status={lead.status} /></td>
                        <td>
                          <span style={{ fontSize:'0.8125rem', fontWeight:500, color: isOverdue?'var(--error)':isToday?'var(--primary)':'var(--on-surface-variant)' }}>
                            {lead.next_follow_up || '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
