import React, { useState, useEffect, useCallback } from 'react';
import { auditLogsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize:'1.25rem', verticalAlign:'middle', ...style }}>{name}</span>
);

const ACTION_COLOR = { login:'#10b981', login_failed:'#ef4444', logout:'#6b7280', view:'#3b82f6', create:'#8b5cf6', update:'#f59e0b', delete:'#ef4444', export:'#f97316' };
const ACTION_ICON  = { login:'login', login_failed:'block', logout:'logout', view:'visibility', create:'add_circle', update:'edit', delete:'delete', export:'download' };

export default function AuditLog() {
  const { user } = useAuth();
  const [logs,     setLogs]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(0);
  const [expanded, setExpanded] = useState(null);
  const PER = 50;

  // All filters
  const [action,     setAction]     = useState('');
  const [entity,     setEntity]     = useState('');
  const [userName,   setUserName]   = useState('');
  const [entityName, setEntityName] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  const hasFilters = action || entity || userName || entityName || dateFrom || dateTo;

  const clearAll = () => {
    setAction(''); setEntity(''); setUserName(''); setEntityName('');
    setDateFrom(''); setDateTo(''); setPage(0);
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditLogsAPI.getAll({
        limit:       PER,
        skip:        page * PER,
        action:      action      || undefined,
        entity_type: entity      || undefined,
        user_name:   userName    || undefined,
        entity_name: entityName  || undefined,
        date_from:   dateFrom    || undefined,
        date_to:     dateTo      || undefined,
      });
      setLogs(res.data?.logs || []);
      setTotal(res.data?.total || 0);
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, [page, action, entity, userName, entityName, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (user?.role !== 'admin' && user?.role !== 'viewer') {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4rem', textAlign:'center' }}>
        <Icon name="lock" style={{ fontSize:'3rem', color:'var(--error)', display:'block', marginBottom:'1rem' }} />
        <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'0.5rem' }}>Access Restricted</h2>
        <p style={{ color:'var(--on-surface-variant)' }}>The Audit Log is only visible to admin and CEO accounts.</p>
      </div>
    );
  }

  const pages = Math.ceil(total / PER);
  const inputStyle = { padding:'0.4rem 0.75rem', borderRadius:'0.375rem', border:'1px solid var(--outline-variant)', background:'var(--surface)', color:'var(--on-surface)', fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', outline:'none' };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.5rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Admin · Read-Only</p>
          <h1 className="headline-sm">Audit & Access Log</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>
            Tamper-proof record of every login, access, edit and export. {total.toLocaleString()} total entries.
          </p>
        </div>
        <button onClick={fetchLogs} className="btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
          <Icon name="refresh" style={{ fontSize:'1rem' }} /> Refresh
        </button>
      </div>

      {/* ── Filter Panel ── */}
      <div className="card" style={{ marginBottom:'1.25rem', padding:'1rem 1.25rem' }}>
        <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'flex-end' }}>

          {/* Date From */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Date From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} style={inputStyle}/>
          </div>

          {/* Date To */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Date To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} style={inputStyle}/>
          </div>

          {/* User Name */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>User Name</label>
            <input type="text" placeholder="Search user…" value={userName} onChange={e => { setUserName(e.target.value); setPage(0); }} style={{ ...inputStyle, minWidth:150 }}/>
          </div>

          {/* Action */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Action</label>
            <select value={action} onChange={e => { setAction(e.target.value); setPage(0); }} style={{ ...inputStyle, minWidth:140 }}>
              <option value="">All actions</option>
              {['login','login_failed','logout','view','create','update','delete','export'].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Record Type */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Record Type</label>
            <select value={entity} onChange={e => { setEntity(e.target.value); setPage(0); }} style={{ ...inputStyle, minWidth:130 }}>
              <option value="">All types</option>
              {['lead','candidate','job','user','settings'].map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>

          {/* Record Name */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Record Name</label>
            <input type="text" placeholder="Search record…" value={entityName} onChange={e => { setEntityName(e.target.value); setPage(0); }} style={{ ...inputStyle, minWidth:150 }}/>
          </div>

          {/* Clear */}
          {hasFilters && (
            <button onClick={clearAll} className="btn-ghost" style={{ fontSize:'0.8125rem', alignSelf:'flex-end' }}>
              <Icon name="filter_alt_off" style={{ fontSize:'1rem' }}/> Clear all
            </button>
          )}

          <p style={{ marginLeft:'auto', fontSize:'0.8125rem', color:'var(--on-surface-variant)', alignSelf:'flex-end' }}>
            {total > 0 ? `${page*PER+1}–${Math.min((page+1)*PER, total)} of ${total.toLocaleString()}` : '0 results'}
          </p>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', marginTop:'0.75rem', paddingTop:'0.75rem', borderTop:'1px solid var(--outline-variant)' }}>
            <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', alignSelf:'center' }}>Active filters:</span>
            {dateFrom && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'rgba(0,74,198,0.1)', color:'var(--primary)' }}>From: {dateFrom}</span>}
            {dateTo   && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'rgba(0,74,198,0.1)', color:'var(--primary)' }}>To: {dateTo}</span>}
            {userName && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'rgba(124,58,237,0.1)', color:'#7c3aed' }}>User: {userName}</span>}
            {action   && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:`${ACTION_COLOR[action]||'#6b7280'}18`, color:ACTION_COLOR[action]||'#6b7280' }}>{action}</span>}
            {entity   && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'var(--surface-container)', color:'var(--on-surface-variant)' }}>{entity}</span>}
            {entityName && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'var(--surface-container)', color:'var(--on-surface-variant)' }}>Record: {entityName}</span>}
          </div>
        )}
      </div>

      {/* Log table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading && (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--on-surface-variant)' }}>
            <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} />Loading…
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
            <Icon name="search_off" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.3 }} />
            <p style={{ fontWeight:600 }}>No log entries found</p>
            {hasFilters && <p style={{ fontSize:'0.875rem', marginTop:'0.375rem' }}>Try adjusting your filters above</p>}
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
              <thead style={{ position:'sticky', top:0, background:'var(--surface-container-low)', zIndex:1 }}>
                <tr>
                  {['Action','User','IP / Device','Record','When','Changes'].map(h => (
                    <th key={h} style={{ padding:'0.625rem 1rem', textAlign:'left', fontWeight:700, fontSize:'0.75rem', textTransform:'uppercase', color:'var(--on-surface-variant)', letterSpacing:'0.05em', borderBottom:'1px solid var(--outline-variant)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const hasChanges = log.old_value || log.new_value;
                  const isExpanded = expanded === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr style={{ borderBottom:'1px solid var(--surface-container)', background: isExpanded?'var(--surface-container-low)':'transparent' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--surface-container-low)'}
                          onMouseLeave={e=>e.currentTarget.style.background=isExpanded?'var(--surface-container-low)':'transparent'}>
                        <td style={{ padding:'0.625rem 1rem', whiteSpace:'nowrap' }}>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:700, padding:'0.15rem 0.55rem', borderRadius:9999, color:ACTION_COLOR[log.action]||'#6b7280', background:`${ACTION_COLOR[log.action]||'#6b7280'}14` }}>
                            <Icon name={ACTION_ICON[log.action]||'info'} style={{ fontSize:'0.875rem' }} />
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding:'0.625rem 1rem' }}>
                          <p style={{ fontWeight:600, color:'var(--on-surface)' }}>{log.user_name||'—'}</p>
                          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{log.user_email||'—'}</p>
                        </td>
                        <td style={{ padding:'0.625rem 1rem' }}>
                          <p style={{ fontFamily:'monospace', fontSize:'0.75rem', color:'var(--on-surface)' }}>{log.ip_address||'—'}</p>
                          <p style={{ fontSize:'0.7rem', color:'var(--on-surface-variant)', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={log.user_agent}>{log.user_agent ? log.user_agent.split(' ')[0] : '—'}</p>
                        </td>
                        <td style={{ padding:'0.625rem 1rem' }}>
                          {log.entity_type && <span style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', color:'var(--on-surface-variant)', background:'var(--surface-container)', padding:'0.1rem 0.375rem', borderRadius:4, marginRight:'0.375rem' }}>{log.entity_type}</span>}
                          <span style={{ fontWeight:500 }}>{log.entity_name||'—'}</span>
                        </td>
                        <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap', fontSize:'0.75rem' }}>
                          <p>{new Date(log.created_at).toLocaleDateString('en-IN')}</p>
                          <p style={{ fontSize:'0.7rem' }}>{new Date(log.created_at).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</p>
                        </td>
                        <td style={{ padding:'0.625rem 1rem' }}>
                          {hasChanges ? (
                            <button onClick={() => setExpanded(isExpanded ? null : log.id)} style={{ background:'none', border:'1px solid var(--outline-variant)', borderRadius:'0.375rem', cursor:'pointer', padding:'0.2rem 0.5rem', fontSize:'0.75rem', color:'var(--primary)', fontWeight:600, display:'inline-flex', alignItems:'center', gap:3 }}>
                              <Icon name={isExpanded?'expand_less':'expand_more'} style={{ fontSize:'1rem' }} />
                              {isExpanded?'Hide':'Show'}
                            </button>
                          ) : <span style={{ color:'var(--on-surface-variant)', fontSize:'0.75rem' }}>—</span>}
                        </td>
                      </tr>
                      {isExpanded && hasChanges && (
                        <tr style={{ borderBottom:'1px solid var(--surface-container)', background:'var(--surface-container-low)' }}>
                          <td colSpan={6} style={{ padding:'0.75rem 1rem 1rem 2.5rem' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', maxWidth:700 }}>
                              {log.old_value && (
                                <div>
                                  <p style={{ fontSize:'0.75rem', fontWeight:700, color:'#ef4444', marginBottom:'0.375rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Before</p>
                                  <pre style={{ fontSize:'0.75rem', background:'rgba(239,68,68,0.05)', padding:'0.625rem', borderRadius:'0.375rem', border:'1px solid rgba(239,68,68,0.15)', overflow:'auto', maxHeight:200, color:'var(--on-surface)', margin:0 }}>
                                    {JSON.stringify(log.old_value, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.new_value && (
                                <div>
                                  <p style={{ fontSize:'0.75rem', fontWeight:700, color:'#10b981', marginBottom:'0.375rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>After</p>
                                  <pre style={{ fontSize:'0.75rem', background:'rgba(16,185,129,0.05)', padding:'0.625rem', borderRadius:'0.375rem', border:'1px solid rgba(16,185,129,0.15)', overflow:'auto', maxHeight:200, color:'var(--on-surface)', margin:0 }}>
                                    {JSON.stringify(log.new_value, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'0.5rem', marginTop:'1.25rem' }}>
          <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn-secondary" style={{ padding:'0.375rem 0.75rem', opacity:page===0?0.4:1 }}>← Prev</button>
          <span style={{ padding:'0.375rem 0.75rem', fontWeight:600, fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>Page {page+1} of {pages}</span>
          <button onClick={() => setPage(p=>Math.min(pages-1,p+1))} disabled={page>=pages-1} className="btn-secondary" style={{ padding:'0.375rem 0.75rem', opacity:page>=pages-1?0.4:1 }}>Next →</button>
        </div>
      )}
    </div>
  );
}
