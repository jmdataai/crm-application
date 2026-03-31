import React, { useState } from 'react';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const STAGE_COLORS = {
  sourced:             { bg:'var(--surface-container)',          color:'var(--on-surface-variant)' },
  screened:            { bg:'var(--secondary-container)',        color:'#2b3a4e' },
  shortlisted:         { bg:'rgba(217,119,6,0.12)',              color:'#92400e' },
  interview_scheduled: { bg:'rgba(0,74,198,0.1)',                color:'var(--primary)' },
  interviewed:         { bg:'rgba(0,74,198,0.15)',               color:'var(--primary)' },
  selected:            { bg:'rgba(0,98,67,0.12)',                color:'var(--tertiary)' },
  rejected:            { bg:'var(--error-container)',            color:'var(--on-error-container)' },
  onboarded:           { bg:'rgba(0,98,67,0.22)',                color:'var(--tertiary)' },
};

const STAGE_LABEL = {
  sourced:'Sourced', screened:'Screened', shortlisted:'Shortlisted',
  interview_scheduled:'Interview Scheduled', interviewed:'Interviewed',
  selected:'Selected', rejected:'Rejected', onboarded:'Onboarded',
};

const Chip = ({ status }) => {
  const s = STAGE_COLORS[status] || STAGE_COLORS.sourced;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.6875rem', fontWeight:700, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {STAGE_LABEL[status] || status}
    </span>
  );
};

/* ── Data ───────────────────────────────────────────── */
const kpis = [
  { label:'Open Positions',     value:'14',   delta:'+3',    up:true,  icon:'work',           color:'var(--tertiary)' },
  { label:'Active Candidates',  value:'392',  delta:'+28',   up:true,  icon:'person_search',  color:'var(--tertiary)' },
  { label:'Interviews This Week',value:'12',  delta:'+4',    up:true,  icon:'event',          color:'var(--tertiary)' },
  { label:'Hired This Month',   value:'7',    delta:'+2',    up:true,  icon:'how_to_reg',     color:'var(--tertiary)' },
];

const pipeline = [
  { stage:'Sourced',    count:142, pct:100, color:'var(--outline-variant)' },
  { stage:'Screened',   count:98,  pct:69,  color:'var(--secondary)' },
  { stage:'Shortlisted',count:61,  pct:43,  color:'var(--amber)' },
  { stage:'Interviewed',count:34,  pct:24,  color:'var(--tertiary)' },
  { stage:'Selected',   count:12,  pct:8.5, color:'#009966' },
];

const recentCandidates = [
  { id:'c1', name:'Arjun Mehta',    role:'AI Engineer',         job:'Senior ML Engineer',   status:'interview_scheduled', updated:'Today' },
  { id:'c2', name:'Sneha Iyer',     role:'Data Scientist',      job:'Lead Data Scientist',  status:'shortlisted',         updated:'Today' },
  { id:'c3', name:'Karan Bose',     role:'Product Manager',     job:'Product Lead – AI',    status:'screened',            updated:'Yesterday' },
  { id:'c4', name:'Divya Rao',      role:'ML Research',         job:'Research Scientist',   status:'selected',            updated:'Yesterday' },
  { id:'c5', name:'Rohit Nair',     role:'Backend Engineer',    job:'Backend Engineer',     status:'rejected',            updated:'Mar 29' },
];

const upcomingInterviews = [
  { id:'i1', candidate:'Arjun Mehta',  job:'Senior ML Engineer',  time:'10:00 AM', date:'Today',     type:'Technical' },
  { id:'i2', candidate:'Sneha Iyer',   job:'Lead Data Scientist',  time:'2:00 PM',  date:'Today',     type:'HR Round' },
  { id:'i3', candidate:'Prerna Shah',  job:'Product Lead – AI',    time:'11:00 AM', date:'Tomorrow',  type:'Final Round' },
  { id:'i4', candidate:'Amit Gupta',   job:'DevOps Lead',          time:'3:30 PM',  date:'Apr 2',     type:'Technical' },
];

const openJobs = [
  { id:'j1', title:'Senior ML Engineer',  dept:'Engineering', apps:28, urgent:true  },
  { id:'j2', title:'Lead Data Scientist', dept:'AI Research',  apps:19, urgent:false },
  { id:'j3', title:'Product Lead – AI',   dept:'Product',      apps:14, urgent:true  },
  { id:'j4', title:'DevOps Lead',         dept:'Platform',     apps:9,  urgent:false },
];

const TYPE_COLOR = { Technical:'var(--primary)', 'HR Round':'var(--tertiary)', 'Final Round':'#7c3aed' };

export default function RecruitmentDashboard() {
  const [period, setPeriod] = useState('weekly');

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'2rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Good morning 👋</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'2px', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.625rem' }}>
            {['today','weekly','monthly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding:'0.375rem 0.875rem', borderRadius:'0.5rem', border:'none', cursor:'pointer',
                fontSize:'0.8125rem', fontFamily:'Inter,sans-serif', fontWeight: period===p ? 600 : 400,
                background: period===p ? 'var(--surface-container-lowest)' : 'transparent',
                color: period===p ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                boxShadow: period===p ? 'var(--ambient-shadow)' : 'none', transition:'all 0.2s',
              }}>{p.charAt(0).toUpperCase()+p.slice(1)}</button>
            ))}
          </div>
          <a href="/recruitment/candidates" className="btn-primary" style={{ background:'linear-gradient(135deg,var(--tertiary),#009966)', boxShadow:'0 2px 8px rgba(0,98,67,0.25)' }}>
            <Icon name="person_add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Candidate
          </a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="stagger-children" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1.25rem', marginBottom:'1.75rem' }}>
        {kpis.map(k => (
          <div key={k.label} className="card fade-in hover-lift" style={{ position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:12, right:12, opacity:0.07 }}>
              <Icon name={k.icon} style={{ fontSize:'3.5rem', color:k.color }} />
            </div>
            <p className="label-sm" style={{ marginBottom:'1rem', color:'var(--on-surface-variant)' }}>{k.label}</p>
            <div style={{ display:'flex', alignItems:'baseline', gap:'0.75rem' }}>
              <span style={{ fontSize:'2.5rem', fontWeight:800, color:'var(--on-surface)', letterSpacing:'-0.03em', lineHeight:1 }}>{k.value}</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap:2, fontSize:'0.75rem', fontWeight:700, padding:'0.2rem 0.5rem', borderRadius:4, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)' }}>
                <Icon name="trending_up" style={{ fontSize:'0.875rem', color:'inherit' }} /> {k.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 — Pipeline + Upcoming Interviews */}
      <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem', marginBottom:'1.75rem' }}>

        {/* Hiring funnel */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Hiring Pipeline</h2>
            <a href="/recruitment/pipeline" className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>Full View</a>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {pipeline.map(s => (
              <div key={s.stage}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.375rem' }}>
                  <span style={{ fontSize:'0.875rem', fontWeight:500 }}>{s.stage}</span>
                  <span style={{ fontSize:'0.875rem', fontWeight:700 }}>{s.count}</span>
                </div>
                <div style={{ height:8, background:'var(--surface-container-low)', borderRadius:9999, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${s.pct}%`, background:s.color, borderRadius:9999, transition:'width 0.6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming interviews */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Upcoming Interviews</h2>
            <a href="/recruitment/interviews" className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>View All</a>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
            {upcomingInterviews.map(iv => (
              <div key={iv.id} style={{ display:'flex', gap:'0.875rem', padding:'0.75rem', background:'var(--surface-container-low)', borderRadius:'0.625rem', alignItems:'flex-start' }}>
                <div style={{
                  width:40, height:40, borderRadius:'0.625rem', flexShrink:0,
                  background: `${TYPE_COLOR[iv.type]}14`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <Icon name="video_call" style={{ fontSize:'1.125rem', color:TYPE_COLOR[iv.type] }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--on-surface)' }}>{iv.candidate}</p>
                  <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{iv.job}</p>
                  <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.25rem', alignItems:'center' }}>
                    <span style={{ fontSize:'0.75rem', fontWeight:600, color:TYPE_COLOR[iv.type], background:`${TYPE_COLOR[iv.type]}14`, padding:'0.1rem 0.375rem', borderRadius:4 }}>{iv.type}</span>
                    <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>
                      {iv.date === 'Today' ? <strong style={{ color:'var(--primary)' }}>Today</strong> : iv.date} · {iv.time}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 — Recent Candidates + Open Jobs */}
      <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem' }}>

        {/* Recent candidates */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Recent Candidates</h2>
            <a href="/recruitment/candidates" className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>View All</a>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Applied For</th>
                <th>Stage</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentCandidates.map(c => {
                const initials = c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                        <div className="avatar" style={{ width:34, height:34, fontSize:'0.6875rem', background:'rgba(0,98,67,0.1)', color:'var(--tertiary)', fontWeight:700 }}>{initials}</div>
                        <div>
                          <p style={{ fontWeight:600, fontSize:'0.875rem' }}>{c.name}</p>
                          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{c.role}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{c.job}</td>
                    <td><Chip status={c.status} /></td>
                    <td style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{c.updated}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Open jobs */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Open Positions</h2>
            <a href="/recruitment/jobs" className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>View All</a>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
            {openJobs.map(j => (
              <div key={j.id} style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.75rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
                <div style={{ width:40, height:40, borderRadius:'0.625rem', background:'rgba(0,98,67,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name="work" style={{ fontSize:'1.125rem', color:'var(--tertiary)' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                    <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--on-surface)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{j.title}</p>
                    {j.urgent && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.1rem 0.375rem', borderRadius:9999, background:'var(--error-container)', color:'var(--on-error-container)', flexShrink:0 }}>Urgent</span>}
                  </div>
                  <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{j.dept}</p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--on-surface)' }}>{j.apps}</p>
                  <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em' }}>apps</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
