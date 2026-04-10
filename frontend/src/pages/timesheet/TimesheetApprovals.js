import React, { useState, useEffect, useCallback } from 'react';
import { timesheetAPI, formatApiError } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function weekLabel(monday) {
  if (!monday) return '—';
  const d = new Date(monday + 'T00:00:00');
  const sun = addDays(d, 6);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeeksInMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  let cur = getMondayOf(firstDay);
  if (cur.getMonth() < month) cur = addDays(cur, 7);
  const lastDay = new Date(year, month + 1, 0);
  while (cur <= lastDay) { weeks.push(cur.toISOString().split('T')[0]); cur = addDays(cur, 7); }
  return weeks;
}

// Supabase returns the joined user under the FK hint key
function getUser(ts) {
  return ts['users!timesheets_user_id_fkey'] || ts.users || {};
}

const StatusBadge = ({ status }) => {
  const cfg = {
    draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#64748b' },
    submitted: { label: 'Submitted', bg: '#eff6ff', color: '#2563eb' },
    approved:  { label: 'Approved',  bg: '#f0fdf4', color: '#16a34a' },
    rejected:  { label: 'Rejected',  bg: '#fef2f2', color: '#dc2626' },
  };
  const s = cfg[status] || cfg.draft;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
};

// ── Detail modal ─────────────────────────────────────────────
const DetailModal = ({ ts, onClose, onReviewed }) => {
  const [note, setNote]   = useState('');
  const [acting, setActing] = useState(false);
  const [err, setErr]     = useState(null);
  if (!ts) return null;

  const emp = getUser(ts);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(ts.week_start + 'T00:00:00'), i).toISOString().split('T')[0]);
  const entriesMap = {};
  (ts.entries || []).forEach(e => { entriesMap[e.entry_date] = e; });
  const totalH = parseFloat(ts.total_hours || 0);
  const initials = (emp.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const doReview = async (action) => {
    setActing(true); setErr(null);
    try { await timesheetAPI.review(ts.id, action, note); if (onReviewed) onReviewed(); onClose(); }
    catch (e) { setErr(formatApiError(e)); }
    finally { setActing(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#ea580c,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9375rem' }}>{initials}</div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem', color: 'var(--on-surface)' }}>{emp.name}</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>{emp.email} · {weekLabel(ts.week_start)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={ts.status} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', padding: 4 }}><Icon name="close" /></button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ padding: '12px 20px', background: 'rgba(234,88,12,0.04)', borderBottom: '1px solid var(--surface-container-high)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#ea580c', fontWeight: 700 }}>Total Hours</p>
            <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#ea580c' }}>{totalH.toFixed(1)}h</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', fontWeight: 700 }}>Days Worked</p>
            <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--on-surface)' }}>{(ts.entries || []).filter(e => parseFloat(e.hours) > 0).length}</p>
          </div>
          {ts.submitted_at && (
            <div>
              <p style={{ margin: 0, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', fontWeight: 700 }}>Submitted</p>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--on-surface)', marginTop: 6 }}>{new Date(ts.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          )}
        </div>

        {/* Daily breakdown — what CEO sees */}
        <div style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: '0.875rem', color: 'var(--on-surface)' }}>Daily Breakdown</p>
          {weekDays.map((date, i) => {
            const e = entriesMap[date];
            const hrs = parseFloat(e?.hours || 0);
            return (
              <div key={date} style={{ display: 'grid', gridTemplateColumns: '80px 55px 1fr', padding: '9px 0', borderBottom: '1px solid var(--surface-container-high)', alignItems: 'start', gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8125rem', color: 'var(--on-surface)' }}>{DAY_NAMES[i]}</p>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>{new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                </div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem', color: hrs > 0 ? '#ea580c' : 'var(--on-surface-variant)', paddingTop: 2 }}>{hrs > 0 ? `${hrs}h` : '—'}</p>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--on-surface-variant)', paddingTop: 2 }}>{e?.comments || <em style={{ opacity: 0.45 }}>No notes</em>}</p>
              </div>
            );
          })}
        </div>

        {/* Review panel */}
        {ts.status === 'submitted' && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--surface-container-high)', background: 'var(--surface-container)' }}>
            <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: '0.875rem', color: 'var(--on-surface)' }}>Your Decision</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note for the employee…" rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--surface-container-high)', borderRadius: 10, fontSize: '0.875rem', resize: 'vertical', background: 'var(--surface)', color: 'var(--on-surface)', outline: 'none' }}
            />
            {err && <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: '6px 0 0' }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={() => doReview('reject')} disabled={acting} style={{ flex: 1, padding: '11px', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', border: '2px solid #dc2626', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                {acting ? '…' : '❌ Reject'}
              </button>
              <button onClick={() => doReview('approve')} disabled={acting} style={{ flex: 2, padding: '11px', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', border: 'none', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', cursor: 'pointer' }}>
                {acting ? '…' : '✅ Approve'}
              </button>
            </div>
          </div>
        )}
        {ts.status !== 'submitted' && ts.note && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--surface-container-high)', background: ts.status === 'approved' ? '#f0fdf4' : '#fef2f2' }}>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: ts.status === 'approved' ? '#16a34a' : '#dc2626' }}>
              {ts.status === 'approved' ? '✅ Approved' : '❌ Rejected'} · Note: {ts.note}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main ─────────────────────────────────────────────────────
const TimesheetApprovals = () => {
  const [view, setView]           = useState('pending');
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser]     = useState('');
  const [monthDate, setMonthDate] = useState(new Date());
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const load = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      const res = await timesheetAPI.getAll(params);
      setTimesheets(res.data.timesheets || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(view === 'pending' ? 'submitted' : ''); }, [view, load]);

  const filtered = timesheets.filter(ts => {
    const emp = getUser(ts);
    if (filterUser && !emp.name?.toLowerCase().includes(filterUser.toLowerCase()) && !emp.email?.toLowerCase().includes(filterUser.toLowerCase())) return false;
    if (filterStatus && ts.status !== filterStatus) return false;
    if (view === 'monthly') {
      const tsDate = new Date(ts.week_start + 'T00:00:00');
      return tsDate.getMonth() === monthDate.getMonth() && tsDate.getFullYear() === monthDate.getFullYear();
    }
    return true;
  });

  const pendingCount = timesheets.filter(ts => ts.status === 'submitted').length;
  const stats = {
    submitted: timesheets.filter(t => t.status === 'submitted').length,
    approved:  timesheets.filter(t => t.status === 'approved').length,
    rejected:  timesheets.filter(t => t.status === 'rejected').length,
    totalHours: timesheets.filter(t => t.status === 'approved').reduce((s,t) => s + parseFloat(t.total_hours||0), 0),
  };

  const navBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--surface-container-high)', background: 'var(--surface-container-lowest)', color: 'var(--on-surface)', cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 1rem 3rem' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontWeight: 800, fontSize: '1.625rem', color: 'var(--on-surface)', margin: 0 }}>Timesheet Approvals</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>Review and approve employee timesheets</p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Pending', value: stats.submitted, color: '#2563eb', bg: '#eff6ff', icon: 'hourglass_empty' },
          { label: 'Approved', value: stats.approved, color: '#16a34a', bg: '#f0fdf4', icon: 'check_circle' },
          { label: 'Rejected', value: stats.rejected, color: '#dc2626', bg: '#fef2f2', icon: 'cancel' },
          { label: 'Hours OK\'d', value: `${stats.totalHours.toFixed(0)}h`, color: '#ea580c', bg: 'rgba(234,88,12,0.07)', icon: 'schedule' },
        ].map(kpi => (
          <div key={kpi.label} style={{ padding: '12px 14px', borderRadius: 12, background: kpi.bg, border: `1px solid ${kpi.color}22`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name={kpi.icon} style={{ color: kpi.color, fontSize: '1.375rem' }} />
            <div>
              <p style={{ margin: 0, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: kpi.color, fontWeight: 700 }}>{kpi.label}</p>
              <p style={{ margin: 0, fontSize: '1.375rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface-container-high)', borderRadius: 10, padding: 4, marginBottom: 14, width: 'fit-content', flexWrap: 'wrap' }}>
        {[
          { key: 'pending', label: `Pending (${pendingCount})` },
          { key: 'all',     label: 'All' },
          { key: 'monthly', label: 'Monthly' },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setView(tab.key); setFilterStatus(''); setFilterUser(''); }}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: '0.8125rem', fontWeight: view === tab.key ? 700 : 500, background: view === tab.key ? 'var(--surface)' : 'transparent', color: view === tab.key ? '#ea580c' : 'var(--on-surface-variant)', boxShadow: view === tab.key ? 'var(--ambient-shadow)' : 'none', transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {view === 'all' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search by name or email…" value={filterUser} onChange={e => setFilterUser(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--surface-container-high)', fontSize: '0.875rem', background: 'var(--surface)', color: 'var(--on-surface)', outline: 'none', minWidth: 180 }}
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--surface-container-high)', fontSize: '0.875rem', background: 'var(--surface)', color: 'var(--on-surface)', outline: 'none' }}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      )}

      {/* Monthly nav */}
      {view === 'monthly' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={navBtn}><Icon name="chevron_left" /></button>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--on-surface)', minWidth: 130, textAlign: 'center' }}>{MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}</span>
          <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={navBtn}><Icon name="chevron_right" /></button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--on-surface-variant)' }}>
          <Icon name="hourglass_empty" style={{ fontSize: '2rem' }} /><p>Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--surface-container-lowest)', borderRadius: 16, border: '1px solid var(--surface-container-high)', color: 'var(--on-surface-variant)' }}>
          <Icon name={view === 'pending' ? 'task_alt' : 'inbox'} style={{ fontSize: '2.5rem', marginBottom: 8 }} />
          <p style={{ fontWeight: 600 }}>{view === 'pending' ? '🎉 No pending timesheets!' : 'No timesheets found'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(ts => {
            const emp = getUser(ts);
            const initials = (emp.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const totalH = parseFloat(ts.total_hours || 0);
            const isPending = ts.status === 'submitted';
            return (
              <div key={ts.id} onClick={() => setSelected(ts)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 12, cursor: 'pointer', background: isPending ? 'rgba(37,99,235,0.03)' : 'var(--surface-container-lowest)', border: isPending ? '1px solid rgba(37,99,235,0.2)' : '1px solid var(--surface-container-high)', transition: 'background 0.15s', flexWrap: 'wrap' }}
                onMouseEnter={e => e.currentTarget.style.background = isPending ? 'rgba(37,99,235,0.07)' : 'var(--surface-container)'}
                onMouseLeave={e => e.currentTarget.style.background = isPending ? 'rgba(37,99,235,0.03)' : 'var(--surface-container-lowest)'}
              >
                <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#ea580c,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.875rem' }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--on-surface)' }}>{emp.name}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{weekLabel(ts.week_start)}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: '#ea580c' }}>{totalH.toFixed(1)}h</p>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>{(ts.entries||[]).filter(e => parseFloat(e.hours)>0).length} days</p>
                </div>
                <StatusBadge status={ts.status} />
                {isPending && <div style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', flexShrink: 0 }}>Review →</div>}
              </div>
            );
          })}
        </div>
      )}

      {selected && <DetailModal ts={selected} onClose={() => setSelected(null)} onReviewed={() => load(view === 'pending' ? 'submitted' : '')} />}
    </div>
  );
};

export default TimesheetApprovals;
