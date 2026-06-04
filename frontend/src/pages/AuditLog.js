import React, { useState, useEffect, useCallback } from 'react';
import { auditLogsAPI, usersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize:'1.25rem', verticalAlign:'middle', ...style }}>{name}</span>
);

const ACTION_COLOR = {
  login:'#10b981', login_failed:'#ef4444', logout:'#6b7280',
  view:'#3b82f6', create:'#8b5cf6', update:'#f59e0b', delete:'#ef4444',
  export:'#f97316', import:'#0891b2', email_sent:'#db2777', bulk_email_sent:'#9333ea', resume_download:'#0891b2',
  timesheet_saved:'#6b7280', timesheet_submitted:'#3b82f6',
  timesheet_approved:'#10b981', timesheet_rejected:'#ef4444',
};
const ACTION_ICON = {
  login:'login', login_failed:'block', logout:'logout',
  view:'visibility', create:'add_circle', update:'edit', delete:'delete',
  export:'download', import:'upload_file', email_sent:'mail', bulk_email_sent:'mark_email_read', resume_download:'picture_as_pdf',
  timesheet_saved:'save', timesheet_submitted:'send', timesheet_approved:'check_circle', timesheet_rejected:'cancel',
};
const ALL_ACTIONS = [
  'login','login_failed','logout',
  'create','update','delete','view',
  'import','export',
  'email_sent','bulk_email_sent',
  'timesheet_saved','timesheet_submitted','timesheet_approved','timesheet_rejected',
];
const ALL_ENTITY_TYPES = ['lead','candidate','job','user','email','bulk_email','timesheet','interview','submission','deal','expense'];

export default function AuditLog() {
  const { user } = useAuth();

  // ── Tab ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('events'); // 'events' | 'activity'

  // ── Event log state ──────────────────────────────────────────
  const [logs,     setLogs]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(0);
  const [expanded, setExpanded] = useState(null);
  const PER = 50;

  // Users list for dropdown
  const [users,    setUsers]    = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Filters
  const [action,     setAction]     = useState('');
  const [entity,     setEntity]     = useState('');
  const [userId,     setUserId]     = useState('');
  const [entityName, setEntityName] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  // ── User Activity tab state ───────────────────────────────────
  const [activity,        setActivity]        = useState([]);
  const [actLoading,      setActLoading]      = useState(false);
  const [actError,        setActError]        = useState('');
  const [actFrom,         setActFrom]         = useState('');
  const [actTo,           setActTo]           = useState('');

  const fmtDuration = (mins) => {
    if (mins < 1)  return '< 1 min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0)   return `${m}m`;
    if (m === 0)   return `${h}h`;
    return `${h}h ${m}m`;
  };

  const durationColor = (mins) => {
    if (mins >= 180) return { bg:'rgba(16,185,129,0.1)',  text:'#059669' }; // 3h+   green
    if (mins >= 30)  return { bg:'rgba(245,158,11,0.1)',  text:'#D97706' }; // 30m+  amber
    return               { bg:'var(--surface-container)', text:'var(--on-surface-variant)' };
  };

  const fetchActivity = useCallback(async () => {
    setActLoading(true);
    setActError('');
    try {
      const params = {};
      if (actFrom) params.date_from = actFrom;
      if (actTo)   params.date_to   = actTo;
      if (!actFrom && !actTo) params.days = 14;
      const res = await auditLogsAPI.getUserActivity(params);
      setActivity(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setActError('Failed to load activity data.');
    } finally {
      setActLoading(false);
    }
  }, [actFrom, actTo]);

  const selectedUser = users.find(u => u.id === userId);
  const hasFilters = action || entity || userId || entityName || dateFrom || dateTo;

  const clearAll = () => {
    setAction(''); setEntity(''); setUserId(''); setEntityName('');
    setDateFrom(''); setDateTo(''); setPage(0);
  };

  // Fetch users list once on mount
  useEffect(() => {
    usersAPI.getAll()
      .then(r => setUsers(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditLogsAPI.getAll({
        limit:       PER,
        skip:        page * PER,
        action:      action      || undefined,
        entity_type: entity      || undefined,
        user_id:     userId      || undefined,   // exact match via UUID
        entity_name: entityName  || undefined,
        date_from:   dateFrom    || undefined,
        date_to:     dateTo      || undefined,
      });
      setLogs(res.data?.logs || []);
      setTotal(res.data?.total || 0);
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, [page, action, entity, userId, entityName, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { if (activeTab === 'activity') fetchActivity(); }, [activeTab, fetchActivity]);

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
  const inputStyle = { padding:'0.4rem 0.75rem', borderRadius:'0.375rem', border:'1px solid var(--outline-variant)', background:'var(--surface)', color:'var(--on-surface)', fontFamily:'var(--font-display)', fontSize:'0.8125rem', outline:'none' };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Admin · Read-Only</p>
          <h1 className="headline-sm">Audit & Access Log</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>
            Tamper-proof record of every login, access, edit, email and export. {total.toLocaleString()} total entries.
          </p>
        </div>
        <button onClick={activeTab === 'events' ? fetchLogs : fetchActivity} className="btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
          <Icon name="refresh" style={{ fontSize:'1rem' }} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--outline-variant)', marginBottom:'1.25rem' }}>
        {[
          { id:'events',   label:'Event Log',      icon:'history' },
          { id:'activity', label:'User Activity',  icon:'access_time' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            display:'inline-flex', alignItems:'center', gap:'0.375rem',
            padding:'0.625rem 1.125rem', background:'none', border:'none', cursor:'pointer',
            fontFamily:'var(--font-display)', fontWeight: activeTab===t.id ? 700 : 500,
            fontSize:'0.875rem',
            color: activeTab===t.id ? 'var(--tertiary)' : 'var(--on-surface-variant)',
            borderBottom: activeTab===t.id ? '2px solid var(--tertiary)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            <Icon name={t.icon} style={{ fontSize:'1rem' }} />{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* USER ACTIVITY TAB                                         */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <div>
          {/* Controls */}
          <div className="card" style={{ marginBottom:'1.25rem', padding:'1rem 1.25rem' }}>
            <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'flex-end' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
                <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Date From</label>
                <input type="date" value={actFrom} onChange={e => setActFrom(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
                <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Date To</label>
                <input type="date" value={actTo} onChange={e => setActTo(e.target.value)} style={inputStyle} />
              </div>
              <button onClick={fetchActivity} className="btn-secondary" style={{ alignSelf:'flex-end', display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
                <Icon name="search" style={{ fontSize:'1rem' }} /> Apply
              </button>
              {(actFrom || actTo) && (
                <button onClick={() => { setActFrom(''); setActTo(''); }} className="btn-ghost" style={{ alignSelf:'flex-end', fontSize:'0.8125rem' }}>
                  <Icon name="filter_alt_off" style={{ fontSize:'1rem' }} /> Clear
                </button>
              )}
              <p style={{ marginLeft:'auto', fontSize:'0.8125rem', color:'var(--on-surface-variant)', alignSelf:'flex-end' }}>
                {!actFrom && !actTo ? 'Showing last 14 days' : `${actFrom || '…'} → ${actTo || '…'}`}
              </p>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display:'flex', gap:'1rem', marginBottom:'0.875rem', fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem' }}>
              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#059669' }} /> 3h+ active
            </span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem' }}>
              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#D97706' }} /> 30m – 3h
            </span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem' }}>
              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'var(--outline-variant)' }} /> &lt; 30m
            </span>
            <span style={{ marginLeft:'auto', fontStyle:'italic' }}>Active window = first to last event of the day (UTC). Does not count idle time.</span>
          </div>

          {/* Table */}
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            {actLoading && (
              <div style={{ textAlign:'center', padding:'3rem', color:'var(--on-surface-variant)' }}>
                <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} />Loading…
              </div>
            )}
            {!actLoading && actError && (
              <div style={{ textAlign:'center', padding:'3rem', color:'var(--error)' }}>{actError}</div>
            )}
            {!actLoading && !actError && activity.length === 0 && (
              <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
                <Icon name="event_busy" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.3 }} />
                <p style={{ fontWeight:600 }}>No activity found for this period</p>
              </div>
            )}
            {!actLoading && !actError && activity.length > 0 && (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                  <thead style={{ position:'sticky', top:0, background:'var(--surface-container-low)', zIndex:1 }}>
                    <tr>
                      {['User','Date','First Seen','Last Seen','Active Window','Events'].map(h => (
                        <th key={h} style={{ padding:'0.625rem 1rem', textAlign:'left', fontWeight:700, fontSize:'0.75rem', textTransform:'uppercase', color:'var(--on-surface-variant)', letterSpacing:'0.05em', borderBottom:'1px solid var(--outline-variant)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((row, i) => {
                      const dc = durationColor(row.duration_minutes);
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid var(--surface-container)' }}
                            onMouseEnter={e => e.currentTarget.style.background='var(--surface-container-low)'}
                            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <td style={{ padding:'0.625rem 1rem' }}>
                            <p style={{ fontWeight:600 }}>{row.user_name}</p>
                            <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{row.user_email}</p>
                          </td>
                          <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface)', whiteSpace:'nowrap' }}>
                            {new Date(row.date).toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' })}
                          </td>
                          <td style={{ padding:'0.625rem 1rem', fontFamily:'monospace', fontSize:'0.8125rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>
                            {row.first_action} <span style={{ fontSize:'0.7rem' }}>UTC</span>
                          </td>
                          <td style={{ padding:'0.625rem 1rem', fontFamily:'monospace', fontSize:'0.8125rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>
                            {row.last_action} <span style={{ fontSize:'0.7rem' }}>UTC</span>
                          </td>
                          <td style={{ padding:'0.625rem 1rem' }}>
                            <span style={{ display:'inline-block', padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.8125rem', fontWeight:700, background:dc.bg, color:dc.text }}>
                              {fmtDuration(row.duration_minutes)}
                            </span>
                          </td>
                          <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', textAlign:'center' }}>
                            {row.event_count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* EVENT LOG TAB (existing content)                          */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'events' && (
        <div>

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

          {/* User dropdown */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>User</label>
            <select
              value={userId}
              onChange={e => { setUserId(e.target.value); setPage(0); }}
              style={{ ...inputStyle, minWidth:180 }}
              disabled={usersLoading}
            >
              <option value="">All users</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email}{u.role ? ` (${u.role})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Action */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Action</label>
            <select value={action} onChange={e => { setAction(e.target.value); setPage(0); }} style={{ ...inputStyle, minWidth:170 }}>
              <option value="">All actions</option>
              <optgroup label="Auth">
                {['login','login_failed','logout'].map(a => <option key={a} value={a}>{a}</option>)}
              </optgroup>
              <optgroup label="Data">
                {['create','update','delete','view','import','export','resume_download','resume_upload','resume_delete'].map(a => <option key={a} value={a}>{a}</option>)}
              </optgroup>
              <optgroup label="Email">
                {['email_sent','bulk_email_sent'].map(a => <option key={a} value={a}>{a}</option>)}
              </optgroup>
              <optgroup label="Timesheet">
                {['timesheet_saved','timesheet_submitted','timesheet_approved','timesheet_rejected'].map(a => <option key={a} value={a}>{a}</option>)}
              </optgroup>
            </select>
          </div>

          {/* Record Type */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <label style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>Record Type</label>
            <select value={entity} onChange={e => { setEntity(e.target.value); setPage(0); }} style={{ ...inputStyle, minWidth:140 }}>
              <option value="">All types</option>
              {ALL_ENTITY_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
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
            {dateFrom && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'rgba(68,104,176,0.1)', color:'var(--primary)' }}>From: {dateFrom}</span>}
            {dateTo   && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'rgba(68,104,176,0.1)', color:'var(--primary)' }}>To: {dateTo}</span>}
            {userId   && <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'rgba(124,58,237,0.1)', color:'#7c3aed' }}>User: {selectedUser?.name || selectedUser?.email || userId}</span>}
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
                  const actionColor = ACTION_COLOR[log.action] || '#6b7280';
                  return (
                    <React.Fragment key={log.id}>
                      <tr style={{ borderBottom:'1px solid var(--surface-container)', background: isExpanded?'var(--surface-container-low)':'transparent' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--surface-container-low)'}
                          onMouseLeave={e=>e.currentTarget.style.background=isExpanded?'var(--surface-container-low)':'transparent'}>
                        <td style={{ padding:'0.625rem 1rem', whiteSpace:'nowrap' }}>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:700, padding:'0.15rem 0.55rem', borderRadius:9999, color:actionColor, background:`${actionColor}14` }}>
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
      )}{/* end events tab */}
    </div>
  );
}
