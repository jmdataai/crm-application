import React, { useState, useEffect, useCallback } from 'react';
import { ceoDashboardAPI } from '../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize:'1.25rem', verticalAlign:'middle', ...style }}>{name}</span>
);

const fmt = (v) => v >= 10000000 ? `₹${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${v.toLocaleString('en-IN')}`;

const STAGE_COLOR = {
  new:'#3b82f6', contacted:'#8b5cf6', called:'#f59e0b', interested:'#10b981',
  closed:'#059669', completed:'#047857', rejected:'#ef4444', lost:'#6b7280', follow_up_needed:'#f97316',
};

const KPI = ({ label, value, sub, icon, color, onClick }) => (
  <div className="card hover-lift" onClick={onClick} style={{ cursor:onClick?'pointer':'default', position:'relative', overflow:'hidden', padding:'1.25rem' }}>
    <div style={{ position:'absolute', top:10, right:12, opacity:0.07 }}>
      <Icon name={icon} style={{ fontSize:'3.5rem', color }} />
    </div>
    <p className="label-sm" style={{ marginBottom:'0.5rem' }}>{label}</p>
    <p style={{ fontSize:'2rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{value}</p>
    {sub && <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>{sub}</p>}
  </div>
);

export default function CEODashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await ceoDashboardAPI.get(); setData(r.data); }
    catch { /* stay empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const pv     = data?.pipeline_value  || 0;
  const cv     = data?.closed_value    || 0;
  const stages = data?.stage_counts    || {};
  const stale  = data?.stale_leads     || [];
  const audit  = data?.recent_audit    || [];

  const ACTION_COLOR = { login:'#10b981', login_failed:'#ef4444', logout:'#6b7280', view:'#3b82f6', create:'#8b5cf6', update:'#f59e0b', delete:'#ef4444', export:'#f97316' };
  const ACTION_ICON  = { login:'login', login_failed:'block', logout:'logout', view:'visibility', create:'add_circle', update:'edit', delete:'delete', export:'download' };

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Admin View</p>
          <h1 className="headline-sm">CEO Dashboard</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>Business health at a glance — refreshes every load</p>
        </div>
        <button onClick={fetch} className="btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
          <Icon name="refresh" style={{ fontSize:'1rem' }} /> Refresh
        </button>
      </div>

      {loading && (
        <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem' }} />
          Loading dashboard…
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI strip */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
            <KPI label="Pipeline Value"    value={fmt(pv)}                         sub={`${data.pipeline_leads} active deals`}   icon="trending_up"   color="var(--primary)" />
            <KPI label="Closed Value"      value={fmt(cv)}                         sub={`${data.closed_leads} deals closed`}     icon="check_circle"  color="var(--tertiary)" />
            <KPI label="Total Leads"       value={data.total_leads}                sub={`${data.leads_this_week} this week`}     icon="group"         color="var(--primary)" />
            <KPI label="Total Candidates"  value={data.total_candidates}           sub="active in ATS"                           icon="person_search" color="var(--tertiary)" />
            <KPI label="Submissions / Mo"  value={data.submissions_month}          sub={`${data.submissions_week} this week`}    icon="send"          color="#8b5cf6" />
          </div>

          {/* Stale alert banner */}
          {data.stale_count > 0 && (
            <div style={{ marginBottom:'1.5rem', padding:'0.875rem 1.25rem', borderRadius:'0.75rem', background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.25)', display:'flex', alignItems:'center', gap:'0.875rem' }}>
              <Icon name="warning" style={{ fontSize:'1.5rem', color:'#ef4444', flexShrink:0 }} />
              <div>
                <p style={{ fontWeight:700, color:'#ef4444' }}>{data.stale_count} lead{data.stale_count!==1?'s':''} going cold</p>
                <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>No activity for 5+ days. See Stale Leads tab below.</p>
              </div>
              <button onClick={() => setTab('stale')} style={{ marginLeft:'auto', padding:'0.375rem 1rem', borderRadius:'0.5rem', background:'#ef4444', color:'#fff', border:'none', cursor:'pointer', fontSize:'0.8125rem', fontWeight:600 }}>
                View →
              </button>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', gap:2, background:'var(--surface-container-low)', padding:4, borderRadius:'0.75rem', marginBottom:'1.5rem', width:'fit-content' }}>
            {[
              {key:'overview', label:'Overview',   icon:'dashboard'},
              {key:'stale',    label:`Stale (${data.stale_count})`, icon:'warning'},
              {key:'activity', label:'Activity Log', icon:'history'},
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1rem', borderRadius:'0.625rem', border:'none', cursor:'pointer', fontSize:'0.8125rem', fontWeight:tab===t.key?700:400, background:tab===t.key?'var(--surface-container-lowest)':'transparent', color:tab===t.key?'var(--on-surface)':'var(--on-surface-variant)', fontFamily:'var(--font-display)', transition:'all 0.15s' }}>
                <Icon name={t.icon} style={{ fontSize:'1rem' }} />{t.label}
              </button>
            ))}
          </div>

          {/* TAB: OVERVIEW */}
          {tab === 'overview' && (
            <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem' }}>
              {/* Pipeline funnel */}
              <div className="card">
                <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem' }}>Pipeline by Stage</h2>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  {Object.entries(stages).sort((a,b) => b[1]-a[1]).map(([stage, count]) => {
                    const pct = data.total_leads ? Math.round((count/data.total_leads)*100) : 0;
                    const color = STAGE_COLOR[stage] || '#6b7280';
                    return (
                      <div key={stage}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                          <span style={{ fontSize:'0.875rem', fontWeight:500, textTransform:'capitalize' }}>{stage.replace('_',' ')}</span>
                          <span style={{ fontSize:'0.875rem', fontWeight:700 }}>{count}</span>
                        </div>
                        <div style={{ height:8, background:'var(--surface-container-low)', borderRadius:9999, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:9999, transition:'width 0.6s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right column */}
              <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
                {/* Stale preview */}
                <div className="card">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.875rem' }}>
                    <h2 style={{ fontSize:'1rem', fontWeight:700 }}>⚠ Stale Leads</h2>
                    <button onClick={() => setTab('stale')} style={{ fontSize:'0.75rem', color:'var(--primary)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>View all →</button>
                  </div>
                  {stale.length === 0 ? (
                    <p style={{ fontSize:'0.875rem', color:'var(--tertiary)', fontWeight:500 }}>✅ Nothing going cold</p>
                  ) : stale.slice(0,4).map(l => (
                    <div key={l.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 0', borderBottom:'1px solid var(--surface-container)' }}>
                      <div>
                        <p style={{ fontWeight:600, fontSize:'0.875rem' }}>{l.full_name}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{l.company||'—'}</p>
                      </div>
                      <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#ef4444', background:'rgba(239,68,68,0.08)', padding:'0.15rem 0.5rem', borderRadius:9999, whiteSpace:'nowrap' }}>
                        {l.days_stale}d stale
                      </span>
                    </div>
                  ))}
                </div>

                {/* Recent audit */}
                <div className="card">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.875rem' }}>
                    <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Recent Activity</h2>
                    <button onClick={() => setTab('activity')} style={{ fontSize:'0.75rem', color:'var(--primary)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Full log →</button>
                  </div>
                  {audit.slice(0,6).map(log => (
                    <div key={log.id} style={{ display:'flex', gap:'0.625rem', alignItems:'flex-start', padding:'0.5rem 0', borderBottom:'1px solid var(--surface-container)' }}>
                      <Icon name={ACTION_ICON[log.action]||'info'} style={{ fontSize:'1rem', color:ACTION_COLOR[log.action]||'var(--primary)', flexShrink:0, marginTop:'0.1rem' }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:'0.8125rem', fontWeight:500, color:'var(--on-surface)' }}>{log.user_name||log.user_email||'System'} · <span style={{ fontWeight:400, color:'var(--on-surface-variant)' }}>{log.action}</span> {log.entity_name && `· ${log.entity_name}`}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{new Date(log.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: STALE */}
          {tab === 'stale' && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', gap:'0.75rem' }}>
                <Icon name="warning" style={{ fontSize:'1.25rem', color:'#ef4444' }} />
                <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Stale Leads — No activity for 5+ days</h2>
                <span style={{ marginLeft:'auto', fontWeight:700, color:'#ef4444', fontSize:'0.875rem' }}>{data.stale_count} leads</span>
              </div>
              {stale.length === 0 ? (
                <div style={{ textAlign:'center', padding:'3rem', color:'var(--tertiary)' }}>
                  <Icon name="check_circle" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem' }} />
                  <p style={{ fontWeight:700 }}>All leads are active!</p>
                </div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                  <thead style={{ background:'var(--surface-container-low)' }}>
                    <tr>
                      {['Lead','Company','Status','Deal Value','Last Activity','Days Stale','Action'].map(h => (
                        <th key={h} style={{ padding:'0.625rem 1rem', textAlign:'left', fontWeight:700, fontSize:'0.75rem', textTransform:'uppercase', color:'var(--on-surface-variant)', letterSpacing:'0.05em', borderBottom:'1px solid var(--outline-variant)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stale.map(l => (
                      <tr key={l.id} style={{ borderBottom:'1px solid var(--surface-container)' }}>
                        <td style={{ padding:'0.75rem 1rem', fontWeight:600 }}>{l.full_name}</td>
                        <td style={{ padding:'0.75rem 1rem', color:'var(--on-surface-variant)' }}>{l.company||'—'}</td>
                        <td style={{ padding:'0.75rem 1rem' }}><span style={{ fontSize:'0.75rem', fontWeight:700, background:'var(--surface-container)', padding:'0.15rem 0.5rem', borderRadius:9999, textTransform:'capitalize' }}>{l.status}</span></td>
                        <td style={{ padding:'0.75rem 1rem', fontWeight:600, color:'var(--tertiary)' }}>{l.deal_value ? fmt(Number(l.deal_value)) : '—'}</td>
                        <td style={{ padding:'0.75rem 1rem', color:'var(--on-surface-variant)' }}>{l.last_activity||'Never'}</td>
                        <td style={{ padding:'0.75rem 1rem' }}><span style={{ fontWeight:700, color:'#ef4444', background:'rgba(239,68,68,0.08)', padding:'0.15rem 0.5rem', borderRadius:9999 }}>{l.days_stale} days</span></td>
                        <td style={{ padding:'0.75rem 1rem' }}><a href={`/sales/leads/${l.id}`} style={{ color:'var(--primary)', fontSize:'0.8125rem', fontWeight:600, textDecoration:'none' }}>Open →</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB: ACTIVITY LOG (preview) */}
          {tab === 'activity' && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Recent Activity (last 20 events)</h2>
                <a href="/audit-log" style={{ fontSize:'0.8125rem', color:'var(--primary)', fontWeight:600, textDecoration:'none' }}>Full Audit Log →</a>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                <thead style={{ background:'var(--surface-container-low)' }}>
                  <tr>
                    {['Action','User','Record','IP Address','Time'].map(h => (
                      <th key={h} style={{ padding:'0.625rem 1rem', textAlign:'left', fontWeight:700, fontSize:'0.75rem', textTransform:'uppercase', color:'var(--on-surface-variant)', letterSpacing:'0.05em', borderBottom:'1px solid var(--outline-variant)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.map(log => (
                    <tr key={log.id} style={{ borderBottom:'1px solid var(--surface-container)' }}>
                      <td style={{ padding:'0.625rem 1rem' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:700, padding:'0.15rem 0.5rem', borderRadius:9999, color:ACTION_COLOR[log.action]||'var(--primary)', background:`${ACTION_COLOR[log.action]||'#3b82f6'}14` }}>
                          <Icon name={ACTION_ICON[log.action]||'info'} style={{ fontSize:'0.875rem' }} />
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding:'0.625rem 1rem', fontWeight:500 }}>{log.user_name||log.user_email||'—'}</td>
                      <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)' }}>{log.entity_type&&log.entity_name ? `${log.entity_type}: ${log.entity_name}` : log.entity_type||'—'}</td>
                      <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', fontFamily:'monospace', fontSize:'0.75rem' }}>{log.ip_address||'—'}</td>
                      <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
