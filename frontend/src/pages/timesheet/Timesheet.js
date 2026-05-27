import React, { useState, useEffect, useCallback } from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { timesheetAPI, formatApiError } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import NexusTutorial from '../../components/NexusTutorial';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DAY_NAMES = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFridayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - 5 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatShortDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function weekLabel(weekStart) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = addDays(start, 6);
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function sanitizeWholeNumberInput(value, max = null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const parsed = parseInt(digits, 10);
  if (!Number.isFinite(parsed)) return '';
  return String(max == null ? parsed : Math.min(parsed, max));
}

function decimalToEntryParts(decimal, comments = '') {
  const totalMinutes = Math.round((parseFloat(decimal) || 0) * 60);
  const hoursValue = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hoursValue: totalMinutes > 0 ? String(hoursValue) : '',
    minutes: minutes > 0 ? String(minutes) : '',
    comments,
  };
}

function parseEntryHours(entry) {
  const hoursValue = parseInt(entry?.hoursValue || '0', 10) || 0;
  const minutes = parseInt(entry?.minutes || '0', 10) || 0;
  return hoursValue + (minutes / 60);
}

function toHHMM(decimal) {
  if (!decimal && decimal !== 0) return '';
  const total = Math.round(parseFloat(decimal) * 60);
  if (total <= 0) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${h}`;
}

function formatHoursLabel(decimal) {
  return `${parseFloat(decimal || 0).toFixed(2)}h`;
}

const StatusBadge = ({ status }) => {
  const cfg = {
    draft: { label: 'Draft', bg: '#f1f5f9', color: '#64748b', icon: 'edit_note' },
    submitted: { label: 'Submitted', bg: '#eff6ff', color: 'var(--primary-container)', icon: 'hourglass_empty' },
    approved: { label: 'Approved', bg: '#f0fdf4', color: '#16a34a', icon: 'check_circle' },
    rejected: { label: 'Rejected', bg: '#fef2f2', color: '#dc2626', icon: 'cancel' },
  };
  const s = cfg[status] || cfg.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600, background: s.bg, color: s.color }}>
      <Icon name={s.icon} style={{ fontSize: '0.875rem' }} />
      {s.label}
    </span>
  );
};

const WeekForm = ({ weekStart, onSaved }) => {
  const { isMobile } = useBreakpoint();
  const [ts, setTs] = useState(null);
  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await timesheetAPI.getWeek(weekStart);
      setTs(res.data);
      const map = {};
      (res.data.entries || []).forEach((entry) => {
        map[entry.entry_date] = decimalToEntryParts(entry.hours ?? 0, entry.comments ?? '');
      });
      setEntries(map);
    } catch (e) {
      setMsg({ type: 'error', text: formatApiError(e) });
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const weekDays = Array.from({ length: 7 }, (_, i) => toISODate(addDays(new Date(`${weekStart}T00:00:00`), i)));
  const totalHours = weekDays.reduce((sum, date) => sum + parseEntryHours(entries[date]), 0);

  const handleChange = (date, field, value) => {
    setEntries((prev) => {
      const current = prev[date] || { hoursValue: '', minutes: '', comments: '' };
      let nextValue = value;
      if (field === 'hoursValue') nextValue = sanitizeWholeNumberInput(value);
      if (field === 'minutes') nextValue = sanitizeWholeNumberInput(value, 59);
      return { ...prev, [date]: { ...current, [field]: nextValue } };
    });
  };

  const buildPayload = () =>
    weekDays
      .filter((date) => parseEntryHours(entries[date]) > 0 || entries[date]?.comments)
      .map((date) => ({
        entry_date: date,
        hours_value: parseInt(entries[date]?.hoursValue || '0', 10) || 0,
        minutes: parseInt(entries[date]?.minutes || '0', 10) || 0,
        comments: entries[date]?.comments || '',
      }));

  const handleSave = async () => {
    if (!ts) return;
    setSaving(true);
    setMsg(null);
    try {
      await timesheetAPI.saveEntries(ts.id, buildPayload());
      await load();
      setMsg({ type: 'success', text: 'Saved successfully.' });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: 'error', text: formatApiError(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!ts) return;
    if (!window.confirm("Submit this timesheet for CEO approval? You won't be able to edit it after submission.")) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await timesheetAPI.saveEntries(ts.id, buildPayload());
      await timesheetAPI.submit(ts.id);
      await load();
      setMsg({ type: 'success', text: 'Submitted. The CEO has been notified by email.' });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: 'error', text: formatApiError(e) });
    } finally {
      setSubmitting(false);
    }
  };

  if (!ts) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>;
  }

  const isEditable = ts.status === 'draft' || ts.status === 'rejected';
  const isSubmitted = ts.status === 'submitted';
  const isApproved = ts.status === 'approved';
  const isRejected = ts.status === 'rejected';

  return (
    <div>
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
          Rejected. Please update and resubmit.{ts.note && ` Reason: ${ts.note}`}
        </div>
      )}

      {(isSubmitted || isApproved) && (
        <div style={{ padding: '10px 14px', background: isApproved ? '#f0fdf4' : '#eff6ff', borderRadius: 10, marginBottom: 12, border: `1px solid ${isApproved ? '#bbf7d0' : '#bfdbfe'}`, fontSize: '0.875rem', color: isApproved ? '#16a34a' : 'var(--primary-container)', fontWeight: 600 }}>
          {isApproved ? 'Approved by CEO.' : 'Submitted and awaiting CEO approval. Cannot be edited.'}
        </div>
      )}

      <div style={{ overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch' }}>
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--surface-container-high)', minWidth: isMobile ? 560 : undefined }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 180px 1fr', minWidth: isMobile ? 560 : undefined, padding: '8px 14px', background: 'var(--surface-container)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', gap: 10 }}>
            <span>Day / Date</span>
            <span>Time Logged</span>
            <span>What I worked on</span>
          </div>

          {weekDays.map((date, i) => {
            const entry = entries[date] || { hoursValue: '', minutes: '', comments: '' };
            const decimalHours = parseEntryHours(entry);

            return (
              <div key={date} style={{ borderTop: '1px solid var(--surface-container-high)', background: 'var(--surface-container-lowest)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 180px 1fr', minWidth: isMobile ? 560 : undefined, padding: '10px 14px', gap: 10, alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--on-surface)', margin: 0 }}>{DAY_NAMES[i]}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', margin: 0 }}>{formatShortDate(date)}</p>
                  </div>

                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--on-surface-variant)', marginBottom: 4 }}>Hours</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={entry.hoursValue}
                          disabled={!isEditable}
                          onChange={(ev) => handleChange(date, 'hoursValue', ev.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: isEditable ? '1px solid var(--surface-container-high)' : '1px solid transparent', fontSize: '0.9375rem', fontWeight: 600, textAlign: 'center', background: isEditable ? 'var(--surface)' : 'transparent', color: 'var(--on-surface)', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--on-surface-variant)', marginBottom: 4 }}>Minutes</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={entry.minutes}
                          disabled={!isEditable}
                          onChange={(ev) => handleChange(date, 'minutes', ev.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: isEditable ? '1px solid var(--surface-container-high)' : '1px solid transparent', fontSize: '0.9375rem', fontWeight: 600, textAlign: 'center', background: isEditable ? 'var(--surface)' : 'transparent', color: 'var(--on-surface)', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '0.68rem', color: 'var(--on-surface-variant)' }}>{formatHoursLabel(decimalHours)}</p>
                  </div>

                  <input
                    type="text"
                    value={entry.comments}
                    disabled={!isEditable}
                    onChange={(ev) => handleChange(date, 'comments', ev.target.value)}
                    placeholder={isEditable ? 'Add activity notes...' : '-'}
                    style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: isEditable ? '1px solid var(--surface-container-high)' : '1px solid transparent', fontSize: '0.875rem', background: isEditable ? 'var(--surface)' : 'transparent', color: 'var(--on-surface)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ padding: '10px 18px', borderRadius: 12, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.15)' }}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#ea580c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Hours</p>
          <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#ea580c', lineHeight: 1.1 }}>{toHHMM(totalHours) || '0'}</p>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#ea580c', opacity: 0.7 }}>{totalHours.toFixed(2)} decimal</p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isEditable && (
            <button
              data-tour="timesheet-save-draft"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid var(--surface-container-high)', background: 'var(--surface)', color: 'var(--on-surface)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
          )}

          {isEditable && (
            <button
              data-tour="timesheet-submit"
              onClick={handleSubmit}
              disabled={submitting || totalHours === 0}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: totalHours === 0 ? '#e2e8f0' : 'linear-gradient(135deg,#ea580c,#f97316)', color: totalHours === 0 ? '#94a3b8' : '#fff', fontSize: '0.875rem', fontWeight: 700, cursor: totalHours === 0 ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          )}

          {isSubmitted && <div style={{ padding: '10px 16px', borderRadius: 10, background: '#eff6ff', color: 'var(--primary-container)', fontSize: '0.875rem', fontWeight: 600 }}>Awaiting CEO approval</div>}
          {isApproved && <div style={{ padding: '10px 16px', borderRadius: 10, background: '#f0fdf4', color: '#16a34a', fontSize: '0.875rem', fontWeight: 600 }}>Approved by CEO</div>}
        </div>
      </div>
    </div>
  );
};

const MonthlyView = ({ year, month }) => {
  const { isMobile } = useBreakpoint();
  const [data, setData] = useState([]);
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

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>;
  }

  const entriesMap = {};
  data.forEach((ts) => {
    (ts.entries || []).forEach((entry) => {
      entriesMap[entry.entry_date] = {
        hours: parseFloat(entry.hours || 0),
        comments: entry.comments || '',
        status: ts.status,
      };
    });
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const allDays = Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(year, month, i + 1)));
  const totalHours = allDays.reduce((sum, date) => sum + (entriesMap[date]?.hours || 0), 0);
  const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--on-surface)' }}>{MONTH_NAMES[month]} {year}</h3>
        <div style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.15)' }}>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#ea580c' }}>{totalHours.toFixed(1)}h</span>
          <span style={{ fontSize: '0.8125rem', color: '#ea580c', marginLeft: 4 }}>total this month</span>
        </div>
      </div>

      <div style={{ overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 65px 1fr auto', minWidth: isMobile ? 360 : undefined, padding: '7px 14px', background: 'var(--surface-container)', borderRadius: '10px 10px 0 0', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', gap: 10, border: '1px solid var(--surface-container-high)', borderBottom: 'none' }}>
          <span>Date</span>
          <span>Hours</span>
          <span>Notes</span>
          <span>Status</span>
        </div>

        <div style={{ borderRadius: '0 0 10px 10px', overflow: 'hidden', border: '1px solid var(--surface-container-high)' }}>
          {allDays.map((date, i) => {
            const entry = entriesMap[date];
            const hrs = entry?.hours || 0;
            const d = new Date(`${date}T00:00:00`);
            const dayNum = d.getDay();
            const isWeekend = dayNum === 0 || dayNum === 6;

            return (
              <div
                key={date}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 65px 1fr auto',
                  minWidth: isMobile ? 360 : undefined,
                  padding: '8px 14px',
                  gap: 10,
                  alignItems: 'center',
                  borderTop: i === 0 ? 'none' : '1px solid var(--surface-container-high)',
                  background: isWeekend ? 'var(--surface-container)' : (hrs > 0 ? 'rgba(234,88,12,0.02)' : 'var(--surface-container-lowest)'),
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: isWeekend ? 'var(--on-surface-variant)' : 'var(--on-surface)' }}>
                    {dayShort[dayNum]} {d.getDate()}
                  </span>
                </div>
                <span style={{ fontWeight: hrs > 0 ? 700 : 400, fontSize: '0.875rem', color: hrs > 0 ? '#ea580c' : 'var(--on-surface-variant)' }}>
                  {hrs > 0 ? `${hrs}h` : (isWeekend ? '' : '-')}
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry?.comments || ''}
                </span>
                <span style={{ fontSize: '0.7rem' }}>
                  {entry?.status ? <StatusBadge status={entry.status} /> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const navBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid var(--surface-container-high)',
  background: 'var(--surface-container-lowest)',
  color: 'var(--on-surface)',
  cursor: 'pointer',
};

const Timesheet = () => {
  const { user } = useAuth();
  const [view, setView] = useState('weekly');
  const [weekStart, setWeekStart] = useState(toISODate(getFridayOf(new Date())));
  const [monthDate, setMonthDate] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const currentWeekStart = toISODate(getFridayOf(new Date()));
  const isCurrentWeek = weekStart === currentWeekStart;

  const goWeek = (dir) => {
    const d = addDays(new Date(`${weekStart}T00:00:00`), dir * 7);
    setWeekStart(toISODate(d));
  };

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '0 1rem 3rem' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontWeight: 800, fontSize: '1.625rem', color: 'var(--on-surface)', margin: 0 }}>Timesheets</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>
          {getGreeting()}, {user?.name?.split(' ')[0]}! Log your hours below.
        </p>
      </div>

      <div data-tour="timesheet-history" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', background: 'var(--surface-container-high)', borderRadius: 10, padding: 4, gap: 4 }}>
          {['weekly', 'monthly'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: view === v ? 700 : 500, background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? '#ea580c' : 'var(--on-surface-variant)', boxShadow: view === v ? 'var(--ambient-shadow)' : 'none', transition: 'all 0.15s', textTransform: 'capitalize' }}
            >
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
            <button onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={navBtnStyle}><Icon name="chevron_left" /></button>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--on-surface)', minWidth: 120, textAlign: 'center' }}>{MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}</span>
            <button onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={navBtnStyle}><Icon name="chevron_right" /></button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(234,88,12,0.05)', border: '1px solid rgba(234,88,12,0.12)', borderRadius: 10, marginBottom: 14, fontSize: '0.8125rem', color: '#92400e' }}>
        <Icon name="info" style={{ fontSize: '1rem', color: '#ea580c' }} />
        <span>Please submit your timesheet every <strong>Friday</strong> - you will receive an automatic email reminder.</span>
      </div>

      <div data-tour="timesheet-week" style={{ background: 'var(--surface-container-lowest)', borderRadius: 16, border: '1px solid var(--surface-container-high)', padding: 20 }}>
        {view === 'weekly' && <WeekForm key={`${weekStart}-${refreshKey}`} weekStart={weekStart} onSaved={() => setRefreshKey((k) => k + 1)} />}
        {view === 'monthly' && <MonthlyView key={`${monthDate.toISOString()}-${refreshKey}`} year={monthDate.getFullYear()} month={monthDate.getMonth()} />}
      </div>

      <NexusTutorial page="timesheet" />
    </div>
  );
};

export default Timesheet;
