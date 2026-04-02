import React, { useState, useEffect, useCallback } from 'react';
import { dashboardAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const STAGE_COLORS = {
  sourced:             { bg:'var(--surface-container)',       color:'var(--on-surface-variant)' },
  screened:            { bg:'var(--secondary-container)',     color:'#2b3a4e' },
  shortlisted:         { bg:'rgba(217,119,6,0.12)',           color:'#92400e' },
  interview_scheduled: { bg:'rgba(0,74,198,0.1)',             color:'var(--primary)' },
  interviewed:         { bg:'rgba(0,74,198,0.15)',            color:'var(--primary)' },
  selected:            { bg:'rgba(0,98,67,0.12)',             color:'var(--tertiary)' },
  rejected:            { bg:'var(--error-container)',         color:'var(--on-error-container)' },
  onboarded:           { bg:'rgba(0,98,67,0.22)',             color:'var(--tertiary)' },
};

const STAGE_LABEL = {
  sourced:'Sourced', screened:'Screened', shortlisted:'Shortlisted',
  interview_scheduled:'Interview Scheduled', interviewed:'Interviewed',
  selected:'Selected', rejected:'Rejected', onboarded:'Onboarded',
};

export default function RecruitmentDashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('weekly');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardAPI.getRecruitment();
      setData(res.data);
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] || 'there';

  const stats       = data?.candidate_stats || {};
  const total       = data?.total_candidates || 0;
  const now     = new Date();
  const startDate = period === 'today'  ? new Date(now.toISOString().slice(0,10))
                  : period === 'weekly' ? new Date(now - 7*86400000)
                  :                       new Date(now - 30*86400000);
  const startStr = startDate.toISOString().slice(0,10);
  const activeJobs  = data?.active_jobs || 0;
  const allUpcoming = data?.upcoming_interviews || [];
  const upcoming = allUpcoming.filter(iv =>
    !iv.scheduled_at || iv.scheduled_at.slice(0,10) >= startStr
  );
  const allRecentCands = data?.recent_candidates || [];
  const recentCands = allRecentCands.filter(c =>
    !c.created_at || c.created_at.slice(0,10) >= startStr
  );
  const todayTasks  = data?.today_tasks || [];
  const inPipeline  = total - (stats.rejected||0) - (stats.onboarded||0);
  const interviews  = stats.interview_scheduled || 0;

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">{greeting}, {firstName} 👋</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'2px', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.625rem' }}>
          {['today','weekly','monthly'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding:'0.375rem 0.875rem', borderRadius:'0.5rem', border:'none', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Inter,sans-serif', fontWeight:period===p?600:400, background:period===p?'var(--surface-container-lowest)':'transparent', color:period===p?'var(--on-surface)':'var(--on-surface-variant)' }}>
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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1.25rem', marginBottom:'1.75rem' }}>
            {[
              { label:'Total Candidates', value:total,      icon:'group',      color:'var(--tertiary)' },
              { label:'In Pipeline',      value:inPipeline, icon:'pending',    color:'var(--tertiary)' },
              { label:'Interviews Set',   value:interviews, icon:'event',      color:'var(--primary)' },
              { label:'Active Jobs',      value:activeJobs, icon:'work',       color:'var(--tertiary)' },
            ].map(k => (
              <div key={k.label} className="card hover-lift" style={{ position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:12, right:12, opacity:0.07 }}>
                  <Icon name={k.icon} style={{ fontSize:'3.5rem', color:k.color }} />
                </div>
                <p className="label-sm" style={{ marginBottom:'1rem' }}>{k.label}</p>
                <span style={{ fontSize:'2.5rem', fontWeight:800, color:'var(--on-surface)', letterSpacing:'-0.03em', lineHeight:1 }}>{k.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem' }}>
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
                <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Recent Candidates</h2>
                <a href="/recruitment/candidates" className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>View All</a>
              </div>
              {recentCands.length === 0 ? (
                <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem 0' }}>No candidates yet — <a href="/recruitment/candidates" style={{ color:'var(--tertiary)' }}>add your first</a></p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {recentCands.map(c => {
                    const stage = STAGE_COLORS[c.status] || STAGE_COLORS.sourced;
                    const initials = c.full_name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                    return (
                      <div key={c.id} onClick={() => window.location.href=`/recruitment/candidates/${c.id}`} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.625rem 0.75rem', borderRadius:'0.5rem', background:'var(--surface-container-low)', cursor:'pointer' }}>
                        <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(0,98,67,0.1)', color:'var(--tertiary)', fontWeight:700, fontSize:'0.75rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{initials}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontWeight:600, fontSize:'0.875rem' }}>{c.full_name}</p>
                          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{c.candidate_role||'—'} · {c.job?.title||'—'}</p>
                        </div>
                        <span style={{ display:'inline-flex', padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.6875rem', fontWeight:700, background:stage.bg, color:stage.color, whiteSpace:'nowrap' }}>
                          {STAGE_LABEL[c.status]||c.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div className="card">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
                  <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Upcoming Interviews</h2>
                  <a href="/recruitment/interviews" className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>View All</a>
                </div>
                {upcoming.length === 0 ? (
                  <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', textAlign:'center', padding:'1.5rem 0' }}>No interviews scheduled</p>
                ) : upcoming.slice(0,5).map(iv => (
                  <div key={iv.id} style={{ padding:'0.625rem 0.75rem', borderRadius:'0.5rem', background:'var(--surface-container-low)', marginBottom:'0.375rem' }}>
                    <p style={{ fontSize:'0.875rem', fontWeight:600 }}>{iv.candidate?.full_name||'—'}</p>
                    <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{iv.interview_type} · {iv.scheduled_at?.slice(0,10)}</p>
                  </div>
                ))}
              </div>

              <div className="card">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
                  <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Today's Tasks</h2>
                  <span style={{ background:'var(--tertiary)', color:'#fff', fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999 }}>{todayTasks.length}</span>
                </div>
                {todayTasks.length === 0 ? (
                  <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', textAlign:'center', padding:'1rem 0' }}>No tasks today 🎉</p>
                ) : todayTasks.slice(0,5).map(t => (
                  <div key={t.id} style={{ display:'flex', gap:'0.5rem', alignItems:'flex-start', padding:'0.5rem 0.625rem', borderRadius:'0.375rem', background:'var(--surface-container-low)', marginBottom:'0.375rem' }}>
                    <Icon name="task_alt" style={{ fontSize:'1rem', color:'var(--tertiary)', flexShrink:0 }} />
                    <p style={{ fontSize:'0.8125rem', lineHeight:1.4 }}>{t.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
