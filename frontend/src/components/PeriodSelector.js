import React, { useMemo } from 'react';

/**
 * Shared Day / Week / Month selector.
 *
 * Used by BOTH the CEO tracker and the unified dashboard so Jayant learns
 * one control. Week deliberately means Mon–Fri only (no weekends), matching
 * the existing tracker convention.
 *
 * Props:
 *   granularity   'day' | 'week' | 'month'
 *   anchor        ISO date string (YYYY-MM-DD) — any date inside the period
 *   onChange      ({ granularity, anchor }) => void
 *   users         optional [{ id, name }] to render the rep filter
 *   userId        selected rep id, or '' for all
 *   onUserChange  (id) => void
 */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const toISO = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  // Use local parts, not toISOString() — that shifts back a day in UTC+ zones
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const parseISO = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
};

/** Inclusive [start, end] for a period. Week = Monday..Friday. */
export const periodRange = (granularity, anchorISO) => {
  const a = parseISO(anchorISO);
  if (granularity === 'week') {
    const dow = a.getDay();                       // 0=Sun
    const back = dow === 0 ? 6 : dow - 1;         // Sunday counts as end of prev week
    const mon = new Date(a); mon.setDate(a.getDate() - back);
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    return { start: mon, end: fri };
  }
  if (granularity === 'month') {
    return {
      start: new Date(a.getFullYear(), a.getMonth(), 1),
      end:   new Date(a.getFullYear(), a.getMonth() + 1, 0),
    };
  }
  return { start: a, end: a };
};

const shift = (granularity, anchorISO, dir) => {
  const a = parseISO(anchorISO);
  if (granularity === 'week')  { a.setDate(a.getDate() + dir * 7); return toISO(a); }
  if (granularity === 'month') { a.setMonth(a.getMonth() + dir, 1); return toISO(a); }
  a.setDate(a.getDate() + dir);
  return toISO(a);
};

const labelFor = (granularity, anchorISO) => {
  const { start, end } = periodRange(granularity, anchorISO);
  if (granularity === 'day') {
    return `${String(start.getDate()).padStart(2,'0')} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }
  if (granularity === 'week') {
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]}`
      : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
};

export default function PeriodSelector({
  granularity = 'day',
  anchor,
  onChange,
  users = [],
  userId = '',
  onUserChange,
  showUserFilter = true,
  rightSlot = null,
}) {
  const todayISO = useMemo(() => toISO(new Date()), []);
  const safeAnchor = anchor || todayISO;

  // Disable "next" once the period already contains today — no future data exists
  const atPresent = useMemo(() => {
    const { end } = periodRange(granularity, safeAnchor);
    return toISO(end) >= todayISO;
  }, [granularity, safeAnchor, todayISO]);

  const pill = (g, label) => (
    <button
      key={g}
      onClick={() => onChange({ granularity: g, anchor: safeAnchor })}
      style={{
        padding: '0.375rem 0.875rem',
        borderRadius: '0.5rem',
        border: '1px solid',
        borderColor: granularity === g ? 'var(--primary)' : 'var(--outline-variant)',
        background: granularity === g ? 'rgba(68,104,176,0.1)' : 'transparent',
        color: granularity === g ? 'var(--primary)' : 'var(--on-surface-variant)',
        fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
      }}
    >{label}</button>
  );

  const arrow = (dir, disabled) => (
    <button
      onClick={() => !disabled && onChange({ granularity, anchor: shift(granularity, safeAnchor, dir) })}
      disabled={disabled}
      aria-label={dir < 0 ? 'Previous period' : 'Next period'}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1, padding: '0.25rem', display: 'flex', alignItems: 'center',
        color: 'var(--on-surface)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
        {dir < 0 ? 'chevron_left' : 'chevron_right'}
      </span>
    </button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem',
    }}>
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        {pill('day', 'Day')}
        {pill('week', 'Week')}
        {pill('month', 'Month')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {arrow(-1, false)}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 150, justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: 'var(--on-surface-variant)' }}>calendar_month</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{labelFor(granularity, safeAnchor)}</span>
        </div>

        {arrow(1, atPresent)}

        {/* Native picker — month input for month view, date input otherwise */}
        <input
          type={granularity === 'month' ? 'month' : 'date'}
          className="input"
          value={granularity === 'month' ? safeAnchor.slice(0, 7) : safeAnchor}
          max={granularity === 'month' ? todayISO.slice(0, 7) : todayISO}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onChange({ granularity, anchor: granularity === 'month' ? `${v}-01` : v });
          }}
          style={{ width: granularity === 'month' ? 130 : 150, fontSize: '0.8125rem', padding: '0.375rem 0.5rem' }}
        />

        {!atPresent && (
          <button
            onClick={() => onChange({ granularity, anchor: todayISO })}
            style={{
              padding: '0.375rem 0.75rem', borderRadius: '0.5rem',
              border: '1px solid var(--outline-variant)', background: 'transparent',
              fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', color: 'var(--on-surface-variant)',
            }}
          >Today</button>
        )}

        {showUserFilter && users.length > 0 && (
          <select
            className="input"
            value={userId}
            onChange={(e) => onUserChange && onUserChange(e.target.value)}
            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.5rem', minWidth: 130 }}
          >
            <option value="">All reps</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        {rightSlot}
      </div>
    </div>
  );
}
