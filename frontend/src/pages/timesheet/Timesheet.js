import React, { useState, useEffect, useCallback } from 'react';
import { timesheetAPI, formatApiError } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

// ── Helpers ──────────────────────────────────────────────────
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toISODate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDisplay(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function weekLabel(monday) {
  const fri = addDays(new Date(monday), 4);
  return `${new Date(monday + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${fri.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function getWeeksInMonth(year, month) {
  // Returns array of Monday ISO strings for weeks that overlap this month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks = [];
  let cur = getMondayOf(firstDay);
  while (cur <= lastDay) {
    weeks.push(toISODate(cur));
    cur = addDays(cur, 7);
  }
  return weeks;
}

// Status badge
const StatusBadge = ({ status }) => {
  const cfg = {
    draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#64748b', icon: 'edit_note' },
    submitted: { label: 'Submitted', bg: '#eff6ff', color: '#2563eb', icon: 'hourglass_empty' },
    approved:  { label: 'Approved',  bg: '#f0fdf4', color: '#16a34a', icon: 'check_circle' },
    rejected:  { label: 'Rejected',  bg: '#fef2f2', color: '#dc2626', icon: 'cancel' },
  };
  const s = cfg[status] || cfg.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      <Icon name={s.icon} style={{ fontSize: '0.875rem' }} />
      {s.label}
    </span>
  );
};

// ── Week Entry Form ──────────────────────────────────────────
const WeekForm = ({ weekStart, onSaved }) => {
  const [ts, setTs]           = useState(null);
  const [entries, setEntries] = useState({});
  const [saving, setSaving]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]         = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await timesheetAPI.getWeek(weekStart);
      setTs(res.data);
      const map = {};
      (res.data.entries || []).forEach(e => {
        map[e.entry_date] = { hours: e.hours ?? 0, comments: e.comments ?? '' };
      });
      setEntries(map);
    } catch (e) { setMsg({ type: 'error', text: formatApiError(e) }); }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const weekDays = Array.from({ length: 7 }, (_, i) => toISODate(addDays(new Date(weekStart), i)));
  const totalHours = weekDays.reduce((sum, d) => sum + parseFloat(entries[d]?.hours || 0), 0);

  const handleChange = (date, field, value) => {
    setEntries(prev => ({ ...prev, [date]: { ...prev[date], [field]: value } }));
  };

  const handleSave = async () => {
    if (!ts) return;
    setSaving(true); setMsg(null);
    try {
      const payload = weekDays
        .filter(d => parseFloat(entries[d]?.hours || 0) > 0 || entries[d]?.comments)
        .map(d => ({ entry_date: d, hours: parseFloat(entries[d]?.hours || 0), comments: entries[d]?.comments || '' }));
      await timesheetAPI.saveEntries(ts.id, payload);
      await load();
      setMsg({ type: 'success', text: 'Saved successfully!' });
      if (onSaved) onSaved();
    } catch (e) { setMsg({ type: 'error', text: formatApiError(e) }); }
    finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!ts) return;
    if (!window.confirm('Submit this timesheet for CEO approval? You won\'t be able to edit it after submission.')) return;
    setSubmitting(true); setMsg(null);
    try {
      await handleSave();
      await timesheetAPI.submit(ts.id);
      await load();
      setMsg({ type: 'success', text: '✅ Timesheet submitted! The CEO has been notified.' });
      if (onSaved) onSaved();
    } catch (e) { setMsg({ type: 'error', text: formatApiError(e) }); }
    finally { setSubmitting(false); }
  };

  if (!ts) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading…</div>;

  const isEditable = ts.status === 'draft';
  const isSubmitted = ts.status === 'submitted';
  const isApproved  = ts.status === 'approved';
  const isRejected  = ts.status === 'rejected';

  return (
    <div>
      {/* Week header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '0.75rem', flexShrink: 0,
            background: 'linear-gradient(135deg,#ea580c,#f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="schedule" style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--on-surface)', margin: 0 }}>
              Week of {weekLabel(weekStart)}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: 0 }}>
              Standard 40h week
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge status={ts.status} />
          {ts.note && (
            <span style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 8 }}>
              Note: {ts.note}
            </span>
          )}
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem',
          background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color: msg.type === 'error' ? '#dc2626' : '#16a34a',
          border: `1px solid ${msg.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
        }}>
          {msg.text}
        </div>
      )}

      {/* Rejected notice */}
      {isRejected && (
        <div style={{ padding: 12, background: '#fef2f2', borderRadius: 10, marginBottom: 16, border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, color: '#dc2626', fontWeight: 600 }}>❌ This timesheet was rejected. Please update and resubmit.</p>
        </div>
      )}

      {/* Daily entry rows */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--surface-container-high)', background: 'var(--surface-container-lowest)' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 90px 1fr',
          padding: '10px 16px', background: 'var(--surface-container)',
          fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--on-surface-variant)', gap: 12,
        }}>
          <span>Day / Date</span>
          <span>Hours</span>
          <span>What I worked on</span>
        </div>

        {weekDays.map((date, i) => {
          const isWeekend = i >= 5;
          const dayEntry = entries[date] || { hours: 0, comments: '' };
          const hasData  = parseFloat(dayEntry.hours) > 0 || dayEntry.comments;

          return (
            <div key={date} style={{
              display: 'grid', gridTemplateColumns: '160px 90px 1fr',
              padding: '12px 16px', gap: 12, alignItems: 'center',
              borderTop: '1px solid var(--surface-container-high)',
              background: isWeekend ? 'var(--surface-container)' : (hasData ? 'rgba(234,88,12,0.02)' : 'transparent'),
              opacity: isWeekend && !isEditable ? 0.6 : 1,
            }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--on-surface)', margin: 0 }}>
                  {DAY_NAMES[i]}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', margin: 0 }}>
                  {formatDisplay(date)}
                </p>
              </div>

              {isWeekend && !hasData ? (
                <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', fontStyle: 'italic', gridColumn: '2 / -1' }}>
                  Day off
                </span>
              ) : (
                <>
                  <input
                    type="number"
                    min="0" max="24" step="0.5"
                    value={dayEntry.hours}
                    disabled={!isEditable && !isRejected}
                    onChange={e => handleChange(date, 'hours', e.target.value)}
                    placeholder="0.0"
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--surface-container-high)',
                      fontSize: '0.9375rem', fontWeight: 600, textAlign: 'center',
                      background: !isEditable && !isRejected ? 'var(--surface-container)' : 'var(--surface)',
                      color: 'var(--on-surface)',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="text"
                    value={dayEntry.comments}
                    disabled={!isEditable && !isRejected}
                    onChange={e => handleChange(date, 'comments', e.target.value)}
                    placeholder={isEditable || isRejected ? "Add activity notes..." : "—"}
                    style={{
                      width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--surface-container-high)',
                      fontSize: '0.875rem',
                      background: !isEditable && !isRejected ? 'var(--surface-container)' : 'var(--surface)',
                      color: 'var(--on-surface)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary + Actions */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        {/* Total hours */}
        <div style={{
          padding: '12px 20px', borderRadius: 12,
          background: 'linear-gradient(135deg,rgba(234,88,12,0.08),rgba(249,115,22,0.05))',
          border: '1px solid rgba(234,88,12,0.15)',
        }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#ea580c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Hours</p>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#ea580c', lineHeight: 1.1 }}>
            {totalHours.toFixed(1)}
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          {(isEditable || isRejected) && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 20px', borderRadius: 10, border: '1px solid var(--surface-container-high)',
                background: 'var(--surface)', color: 'var(--on-surface)',
                fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {saving ? 'Saving…' : '💾 Save Draft'}
            </button>
          )}
          {(isEditable || isRejected) && (
            <button
              onClick={handleSubmit}
              disabled={submitting || totalHours === 0}
              style={{
                padding: '10px 24px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#ea580c,#f97316)',
                color: '#fff', fontSize: '0.875rem', fontWeight: 700,
                cursor: totalHours === 0 ? 'not-allowed' : 'pointer',
                opacity: totalHours === 0 ? 0.5 : 1,
              }}
            >
              {submitting ? 'Submitting…' : '✈️ Submit for Approval'}
            </button>
          )}
          {isSubmitted && (
            <div style={{ padding: '10px 16px', borderRadius: 10, background: '#eff6ff', color: '#2563eb', fontSize: '0.875rem', fontWeight: 600 }}>
              ⏳ Awaiting CEO approval
            </div>
          )}
          {isApproved && (
            <div style={{ padding: '10px 16px', borderRadius: 10, background: '#f0fdf4', color: '#16a34a', fontSize: '0.875rem', fontWeight: 600 }}>
              ✅ Approved by CEO
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Monthly Overview ─────────────────────────────────────────
const MonthlyView = ({ year, month }) => {
  const [data, setData]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await timesheetAPI.getMyAll();
        setData(res.data.timesheets || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const weeks = getWeeksInMonth(year, month);
  const monthTs = data.filter(ts => weeks.includes(ts.week_start));
  const totalHours = monthTs.reduce((s, ts) => s + parseFloat(ts.total_hours || 0), 0);

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--on-surface)' }}>{MONTH_NAMES[month]} {year}</h3>
        <div style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.15)' }}>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#ea580c' }}>{totalHours.toFixed(1)}h</span>
          <span style={{ fontSize: '0.8125rem', color: '#ea580c', marginLeft: 4 }}>total</span>
        </div>
      </div>

      {weeks.length === 0 ? (
        <p style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 20 }}>No weeks found for this month.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {weeks.map(ws => {
            const ts = monthTs.find(t => t.week_start === ws);
            const hrs = parseFloat(ts?.total_hours || 0);
            return (
              <div key={ws} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderRadius: 10,
                background: 'var(--surface-container-lowest)',
                border: '1px solid var(--surface-container-high)',
                flexWrap: 'wrap', gap: 10,
              }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--on-surface)' }}>
                    Week of {weekLabel(ws)}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                    {ts ? `${(ts.entries || []).filter(e => parseFloat(e.hours) > 0).length} days logged` : 'Not started'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: hrs > 0 ? '#ea580c' : 'var(--on-surface-variant)' }}>
                    {hrs.toFixed(1)}h
                  </span>
                  {ts ? <StatusBadge status={ts.status} /> : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────
const Timesheet = () => {
  const { user } = useAuth();
  const [view, setView]         = useState('weekly');   // 'weekly' | 'monthly'
  const [weekStart, setWeekStart] = useState(toISODate(getMondayOf(new Date())));
  const [monthDate, setMonthDate] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);

  const goWeek = (dir) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(toISODate(d));
  };

  const isCurrentWeek = weekStart === toISODate(getMondayOf(new Date()));
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 1rem 2rem' }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: '1.625rem', color: 'var(--on-surface)', margin: 0 }}>
          Timesheets
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>
          Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.name?.split(' ')[0]}! Log your hours below.
        </p>
      </div>

      {/* View toggle + navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        {/* View tabs */}
        <div style={{
          display: 'flex', background: 'var(--surface-container-high)',
          borderRadius: 10, padding: 4, gap: 4,
        }}>
          {['weekly', 'monthly'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'Inter,sans-serif', fontSize: '0.875rem',
                fontWeight: view === v ? 700 : 500,
                background: view === v ? 'var(--surface)' : 'transparent',
                color: view === v ? '#ea580c' : 'var(--on-surface-variant)',
                boxShadow: view === v ? 'var(--ambient-shadow)' : 'none',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Navigation */}
        {view === 'weekly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => goWeek(-1)} style={navBtnStyle}>
              <Icon name="chevron_left" />
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--on-surface)', minWidth: 180, textAlign: 'center' }}>
              {weekLabel(weekStart)}
            </span>
            <button onClick={() => goWeek(1)} style={navBtnStyle} disabled={isCurrentWeek}>
              <Icon name="chevron_right" />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekStart(toISODate(getMondayOf(new Date())))}
                style={{ ...navBtnStyle, fontSize: '0.75rem', padding: '6px 12px', color: '#ea580c', border: '1px solid rgba(234,88,12,0.3)' }}
              >
                Current Week
              </button>
            )}
          </div>
        )}
        {view === 'monthly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={navBtnStyle}>
              <Icon name="chevron_left" />
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--on-surface)', minWidth: 140, textAlign: 'center' }}>
              {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
            </span>
            <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={navBtnStyle}>
              <Icon name="chevron_right" />
            </button>
          </div>
        )}
      </div>

      {/* Policy reminder */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px',
        background: 'rgba(234,88,12,0.05)', border: '1px solid rgba(234,88,12,0.15)',
        borderRadius: 10, marginBottom: 20, fontSize: '0.8125rem', color: '#92400e',
      }}>
        <Icon name="info" style={{ fontSize: '1rem', color: '#ea580c', marginTop: 1 }} />
        <span>
          Please submit your timesheet every <strong>Friday</strong> for CEO approval.
          You'll receive an automatic email reminder. Overtime exceeding 5h/day requires pre-authorization.
        </span>
      </div>

      {/* Main content */}
      <div style={{
        background: 'var(--surface-container-lowest)',
        borderRadius: 16,
        border: '1px solid var(--surface-container-high)',
        padding: 24,
      }}>
        {view === 'weekly' && (
          <WeekForm
            key={weekStart + refreshKey}
            weekStart={weekStart}
            onSaved={() => setRefreshKey(k => k + 1)}
          />
        )}
        {view === 'monthly' && (
          <MonthlyView
            key={monthDate.toISOString() + refreshKey}
            year={monthDate.getFullYear()}
            month={monthDate.getMonth()}
          />
        )}
      </div>
    </div>
  );
};

const navBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, borderRadius: 8,
  border: '1px solid var(--surface-container-high)',
  background: 'var(--surface-container-lowest)',
  color: 'var(--on-surface)', cursor: 'pointer',
};

export default Timesheet;
