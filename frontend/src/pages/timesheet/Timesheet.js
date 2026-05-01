import React, { useState, useEffect, useCallback } from 'react';
import { timesheetAPI, formatApiError } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import NexusTutorial from '../../components/NexusTutorial';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DAY_NAMES = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFridayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day - 5 + 7) % 7; // 5=Fri
  d.setDate(d.getDate() - diff);
  return d;
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function formatShortDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function weekLabel(weekStart) {
  const end = addDays(new Date(weekStart + 'T00:00:00'), 6);
  return `${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function getWeeksInMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  let cur = getFridayOf(firstDay);
  if (cur.getMonth() < month) cur = addDays(cur, 7);
  const lastDay = new Date(year, month + 1, 0);
  while (cur <= lastDay) {
    weeks.push(toISODate(cur));
    cur = addDays(cur, 7);
  }
  return weeks;
}

const StatusBadge = ({ status }) => {
  const cfg = {
    draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#64748b', icon: 'edit_note' },
    submitted: { label: 'Submitted', bg: '#eff6ff', color: 'var(--primary-container)', icon: 'hourglass_empty' },
    approved:  { label: 'Approved',  bg: '#f0fdf4', color: '#16a34a', icon: 'check_circle' },
    rejected:  { label: 'Rejected',  bg: '#fef2f2', color: '#dc2626', icon: 'cancel' },
  };
  const s = cfg[status] || cfg.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600, background: s.bg, color: s.color }}>
      <Icon name={s.icon} style={{ fontSize: '0.875rem' }} />{s.label}
    </span>
  );
};

const WeekForm = ({ weekStart, onSaved }) => {
  const [ts, setTs]             = useState(null);
  const [entries, setEntries]   = useState({});
  const [saving, setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]           = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await timesheetAPI.getWeek(weekStart);
      setTs(res.data);
      const map = {};
      (res.data.entries || []).forEach(e => { map[e.entry_date] = { hours: e.hours ?? 0, comments: e.comments ?? '' }; });
      setEntries(map);
    } catch (e) { setMsg({ type: 'error', text: formatApiError(e) }); }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const weekDays = Array.from({ length: 7 }, (_, i) => toISODate(addDays(new Date(weekStart + 'T00:00:00'), i)));
  const totalHours = weekDays.reduce((sum, d) => sum + parseFloat(entries[d]?.hours || 0), 0);

  const handleChange = (date, field, value) => {
    setEntries(prev => ({ ...prev, [date]: { ...prev[date], [field]: value } }));
  };

  const buildPayload = () => weekDays
    .filter(d => parseFloat(entries[d]?.hours || 0) > 0 || entries[d]?.comments)
    .map(d => ({ entry_date: d, hours: parseFloat(entries[d]?.hours || 0), comments: entries[d]?.comments || '' }));

  const handleSave = async () => {
    if (!ts) return;
    setSaving(true); setMsg(null);
    try {
      await timesheetAPI.saveEntries(ts.id, buildPayload());
      await load();
      setMsg({ type: 'success', text: 'Saved successfully!' });
      if (onSaved) onSaved();
    } catch (e) { setMsg({ type: 'error', text: formatApiError(e) }); }
    finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!ts) return;
    if (!window.confirm("Submit this timesheet for CEO approval? You won't be able to edit it after submission.")) return;
    setSubmitting(true); setMsg(null);
    try {
      await timesheetAPI.saveEntries(ts.id, buildPayload());
      await timesheetAPI.submit(ts.id);
      await load();
      setMsg({ type: 'success', text: '✅ Submitted! The CEO has been notified by email.' });
      if (onSaved) onSaved();
    } catch (e) { setMsg({ type: 'error', text: formatApiError(e) }); }
    finally { setSubmitting(false); }
  };

  if (!ts) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>;

  const isEditable  = ts.status === 'draft' || ts.status === 'rejected';
  const isSubmitted = ts.status === 'submitted';
  const isApproved  = ts.status === 'approved';
  const isRejected  = ts.status === 'rejected';

  return (
    <div>
      {/* Week header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '0.625rem', flexShrink: 0, background: 'linear-gradient(135deg,#ea580c,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="schedule" style={{ color: '#fff' }} />
          </div>
          <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--on-surface)', margin: 0 }}>Week of {weekLabel(weekStart)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusBadge status={ts.status} />
          {ts.note && <span style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', padding: '3px 10px', borderRadius: 8 }}>CEO: {ts.note}</span>}
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: '0.875rem', background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4', color: msg.type === 'error' ? '#dc2626' : '#16a34a', border: `1px solid ${msg.type === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
          {msg.text}
        </div>
      )}

      {isRejected && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 10, marginBottom: 12, border: '1px solid #fecaca', fontSize: '0.875rem', color: '#dc2626', fontWeight: 600 }}>
          ❌ Rejected — please update and resubmit.{ts.note && ` Reason: ${ts.note}`}
        </div>
      )}
      {(isSubmitted || isApproved) && (
        <div style={{ padding: '10px 14px', background: isApproved ? '#f0fdf4' : '#eff6ff', borderRadius: 10, marginBottom: 12, border: `1px solid ${isApproved ? '#bbf7d0' : '#bfdbfe'}`, fontSize: '0.875rem', color: isApproved ? '#16a34a' : 'var(--primary-container)', fontWeight: 600 }}>
          {isApproved ? '✅ Approved by CEO.' : '⏳ Submitted — awaiting CEO approval. Cannot be edited.'}
        </div>
      )}

      {/* Daily rows */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--surface-container-high)' }}>
        {/* Desktop header */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 75px 1fr', padding: '8px 14px', background: 'var(--surface-container)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', gap: 10 }}>
          <span>Day / Date</span><span>Hours</span><span>What I worked on</span>
        </div>

        {weekDays.map((date, i) => {
          const e = entries[date] || { hours: 0, comments: '' };
          return (
            <div key={date} style={{ borderTop: '1px solid var(--surface-container-high)', background: 'var(--surface-container-lowest)' }}>
              {/* Desktop row */}
              <div style={{ display: 'grid', gridTemplateColumns: '130px 75px 1fr', padding: '10px 14px', gap: 10, alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--on-surface)', margin: 0 }}>{DAY_NAMES[i]}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', margin: 0 }}>{formatShortDate(date)}</p>
                </div>
                <input type="number" min="0" max="24" step="0.5"
                  value={e.hours === 0 ? '' : e.hours}
                  disabled={!isEditable}
                  onChange={ev => handleChange(date, 'hours', ev.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '7px 6px', borderRadius: 8, border: isEditable ? '1px solid var(--surface-container-high)' : '1px solid transparent', fontSize: '0.9375rem', fontWeight: 600, textAlign: 'center', background: isEditable ? 'var(--surface)' : 'transparent', color: 'var(--on-surface)', outline: 'none', boxSizing: 'border-box' }}
                />
                <input type="text"
                  value={e.comments}
                  disabled={!isEditable}
                  onChange={ev => handleChange(date, 'comments', ev.target.value)}
                  placeholder={isEditable ? 'Add activity notes...' : '—'}
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: isEditable ? '1px solid var(--surface-container-high)' : '1px solid transparent', fontSize: '0.875rem', background: isEditable ? 'var(--surface)' : 'transparent', color: 'var(--on-surface)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ padding: '10px 18px', borderRadius: 12, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.15)' }}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#ea580c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Hours</p>
          <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#ea580c', lineHeight: 1.1 }}>{totalHours.toFixed(1)}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isEditable && (
            <button data-tour="timesheet-save-draft" onClick={handleSave} disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid var(--surface-container-high)', background: 'var(--surface)', color: 'var(--on-surface)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Saving...' : '💾 Save Draft'}
            </button>
          )}
          {isEditable && (
            <button data-tour="timesheet-submit" onClick={handleSubmit} disabled={submitting || totalHours === 0}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: totalHours === 0 ? '#e2e8f0' : 'linear-gradient(135deg,#ea580c,#f97316)', color: totalHours === 0 ? '#94a3b8' : '#fff', fontSize: '0.875rem', fontWeight: 700, cursor: totalHours === 0 ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Submitting...' : '✈️ Submit for Approval'}
            </button>
          )}
          {isSubmitted && <div style={{ padding: '10px 16px', borderRadius: 10, background: '#eff6ff', color: 'var(--primary-container)', fontSize: '0.875rem', fontWeight: 600 }}>⏳ Awaiting CEO approval</div>}
          {isApproved  && <div style={{ padding: '10px 16px', borderRadius: 10, background: '#f0fdf4', color: '#16a34a', fontSize: '0.875rem', fontWeight: 600 }}>✅ Approved by CEO</div>}
        </div>
      </div>
    </div>
  );
};

const MonthlyView = ({ year, month }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const res = await timesheetAPI.getMyAll(); setData(res.data.timesheets || []); } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>;

  // Build flat entries map: date -> {hours, comments, status}
  const entriesMap = {};
  data.forEach(ts => {
    (ts.entries || []).forEach(e => {
      entriesMap[e.entry_date] = { hours: parseFloat(e.hours || 0), comments: e.comments || '', status: ts.status };
    });
  });

  // All days in the month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return toISODate(d);
  });

  const totalHours = allDays.reduce((sum, d) => sum + (entriesMap[d]?.hours || 0), 0);

  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--on-surface)' }}>{MONTH_NAMES[month]} {year}</h3>
        <div style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.15)' }}>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#ea580c' }}>{totalHours.toFixed(1)}h</span>
          <span style={{ fontSize: '0.8125rem', color: '#ea580c', marginLeft: 4 }}>total this month</span>
        </div>
      </div>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '100px 65px 1fr auto', padding: '7px 14px', background: 'var(--surface-container)', borderRadius: '10px 10px 0 0', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', gap: 10, border: '1px solid var(--surface-container-high)', borderBottom: 'none' }}>
        <span>Date</span><span>Hours</span><span>Notes</span><span>Status</span>
      </div>
      <div style={{ borderRadius: '0 0 10px 10px', overflow: 'hidden', border: '1px solid var(--surface-container-high)' }}>
        {allDays.map((date, i) => {
          const e = entriesMap[date];
          const hrs = e?.hours || 0;
          const d = new Date(date + 'T00:00:00');
          const dayNum = d.getDay();
          const isWeekend = dayNum === 0 || dayNum === 6;
          return (
            <div key={date} style={{
              display: 'grid', gridTemplateColumns: '100px 65px 1fr auto',
              padding: '8px 14px', gap: 10, alignItems: 'center',
              borderTop: i === 0 ? 'none' : '1px solid var(--surface-container-high)',
              background: isWeekend ? 'var(--surface-container)' : (hrs > 0 ? 'rgba(234,88,12,0.02)' : 'var(--surface-container-lowest)'),
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: isWeekend ? 'var(--on-surface-variant)' : 'var(--on-surface)' }}>
                  {DAY_SHORT[dayNum]} {d.getDate()}
                </span>
              </div>
              <span style={{ fontWeight: hrs > 0 ? 700 : 400, fontSize: '0.875rem', color: hrs > 0 ? '#ea580c' : 'var(--on-surface-variant)' }}>
                {hrs > 0 ? `${hrs}h` : (isWeekend ? '' : '—')}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e?.comments || ''}
              </span>
              <span style={{ fontSize: '0.7rem' }}>
                {e?.status ? <StatusBadge status={e.status} /> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const navBtnStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--surface-container-high)', background: 'var(--surface-container-lowest)', color: 'var(--on-surface)', cursor: 'pointer' };

const Timesheet = () => {
  const { user } = useAuth();
  const [view, setView]           = useState('weekly');
  const [weekStart, setWeekStart] = useState(toISODate(getFridayOf(new Date())));
  const [monthDate, setMonthDate] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const currentWeekStart = toISODate(getFridayOf(new Date()));
  const isCurrentWeek = weekStart === currentWeekStart;

  const goWeek = dir => { const d = addDays(new Date(weekStart + 'T00:00:00'), dir * 7); setWeekStart(toISODate(d)); };

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '0 1rem 3rem' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontWeight: 800, fontSize: '1.625rem', color: 'var(--on-surface)', margin: 0 }}>Timesheets</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>
          {getGreeting()}, {user?.name?.split(' ')[0]}! Log your hours below.
        </p>
      </div>

      {/* Controls */}
      <div data-tour="timesheet-history" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', background: 'var(--surface-container-high)', borderRadius: 10, padding: 4, gap: 4 }}>
          {['weekly','monthly'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: view === v ? 700 : 500, background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? '#ea580c' : 'var(--on-surface-variant)', boxShadow: view === v ? 'var(--ambient-shadow)' : 'none', transition: 'all 0.15s', textTransform: 'capitalize' }}>
              {v === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>

        {view === 'weekly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => goWeek(-1)} style={navBtnStyle}><Icon name="chevron_left" /></button>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--on-surface)', minWidth: 150, textAlign: 'center' }}>{weekLabel(weekStart)}</span>
            <button onClick={() => goWeek(1)} disabled={isCurrentWeek} style={{ ...navBtnStyle, opacity: isCurrentWeek ? 0.35 : 1, cursor: isCurrentWeek ? 'not-allowed' : 'pointer' }}><Icon name="chevron_right" /></button>
            {!isCurrentWeek && (
              <button onClick={() => setWeekStart(currentWeekStart)} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid rgba(234,88,12,0.4)', background: 'rgba(234,88,12,0.06)', color: '#ea580c', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Current Week
              </button>
            )}
          </div>
        )}
        {view === 'monthly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={navBtnStyle}><Icon name="chevron_left" /></button>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--on-surface)', minWidth: 120, textAlign: 'center' }}>{MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}</span>
            <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={navBtnStyle}><Icon name="chevron_right" /></button>
          </div>
        )}
      </div>

      {/* Reminder */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(234,88,12,0.05)', border: '1px solid rgba(234,88,12,0.12)', borderRadius: 10, marginBottom: 14, fontSize: '0.8125rem', color: '#92400e' }}>
        <Icon name="info" style={{ fontSize: '1rem', color: '#ea580c' }} />
        <span>Please submit your timesheet every <strong>Friday</strong> — you'll receive an automatic email reminder.</span>
      </div>

      <div data-tour="timesheet-week" style={{ background: 'var(--surface-container-lowest)', borderRadius: 16, border: '1px solid var(--surface-container-high)', padding: 20 }}>
        {view === 'weekly' && <WeekForm key={weekStart + refreshKey} weekStart={weekStart} onSaved={() => setRefreshKey(k => k + 1)} />}
        {view === 'monthly' && <MonthlyView key={monthDate.toISOString() + refreshKey} year={monthDate.getFullYear()} month={monthDate.getMonth()} />}
      </div>

      <NexusTutorial page="timesheet" />

      <style>{`
        @media (max-width:560px) {
          div[style*="grid-template-columns: 130px"] {
            grid-template-columns: 1fr 60px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Timesheet;
