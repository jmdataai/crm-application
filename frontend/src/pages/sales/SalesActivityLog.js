import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { salesTrackerAPI } from '../../services/api';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../contexts/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TARGETS = {
  emails_sent:   { min: 10, max: 15, label: 'Cold Emails' },
  linkedin_sent: { min: 8,  max: 10, label: 'LinkedIn Msgs' },
  calls_made:    { min: 3,  max: 5,  label: 'Cold Calls' },
  followups_done:{ min: 3,  max: 5,  label: 'Follow-ups' },
};

const fmtDate = (d) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
};

const toISODate = (d) => {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const parseISODate   = (iso) => new Date(`${iso}T00:00:00`);
const shiftISODate   = (iso, days) => { const d = parseISODate(iso); d.setDate(d.getDate() + days); return toISODate(d); };
const getWeekStartISO = (iso) => { const d = parseISODate(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISODate(d); };
const getWeekEndISO   = (iso) => shiftISODate(getWeekStartISO(iso), 6);

const getStatusPill = (val, min, max) => {
  const n = parseInt(val) || 0;
  if (n === 0) return null;
  if (n >= max)   return { label: 'Above target', color: '#006633', bg: 'rgba(0,98,67,0.12)' };
  if (n >= min)   return { label: 'On target',    color: '#006633', bg: 'rgba(0,98,67,0.12)' };
  return { label: 'Below target', color: 'var(--error)', bg: 'var(--error-container)' };
};

const EMPTY_FORM = {
  emails_sent: '', linkedin_sent: '', calls_made: '', replies_received: '',
  meetings_booked: '', meetings_done: '', proposals_sent: '', followups_done: '',
  new_leads_added: '', hours_worked: '', mood: null,
  biggest_win: '', biggest_blocker: '',
};

// ── Team View line chart colours (one per team member) ────────
const TEAM_COLORS = ['#4468B0', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#f97316'];

// ── Team View daily target minimum for pct calculation ────────
const DAILY_MIN = 10 + 8 + 3 + 3; // emails + linkedin + calls + followups

export default function SalesActivityLog() {
  const { isMobile } = useBreakpoint();
  const { user }     = useAuth();

  // Only admin and viewer (CEO) can see team view
  const isPrivileged = user?.role === 'admin' || user?.role === 'viewer';

  // ── NEW: team view toggle ─────────────────────────────────────
  const [teamView, setTeamView] = useState(false);
  const [teamLogs, setTeamLogs]     = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // ── Date controls for Team View ───────────────────────────────
  const [leaderboardDate, setLeaderboardDate] = useState(todayISO);
  const [chartDays, setChartDays]             = useState(30);

  const today    = useMemo(() => new Date(), []);
  const todayISO = toISODate(today);

  // ── Load 30-day team logs when Team View is activated ─────────
  useEffect(() => {
    if (!teamView || !isPrivileged) return;
    setTeamLoading(true);
    const from = shiftISODate(leaderboardDate, -(chartDays - 1));
    salesTrackerAPI.getLogs({ from_date: from, to_date: leaderboardDate, limit: 500 })
      .then(res => setTeamLogs(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTeamLogs([]))
      .finally(() => setTeamLoading(false));
  }, [teamView, isPrivileged, leaderboardDate, chartDays]);

  // ── Derived: today's leaderboard ─────────────────────────────
  const leaderboard = useMemo(() => {
    const dayLogs = teamLogs.filter(l => l.log_date === leaderboardDate);
    const byUser = {};
    for (const log of dayLogs) {
      const key = log.logged_by_name || log.logged_by || 'Unknown';
      if (!byUser[key]) byUser[key] = { name: key, uid: log.logged_by, emails: 0, linkedin: 0, calls: 0, followups: 0, hours: 0, meetings: 0 };
      byUser[key].emails    += log.emails_sent    || 0;
      byUser[key].linkedin  += log.linkedin_sent  || 0;
      byUser[key].calls     += log.calls_made     || 0;
      byUser[key].followups += log.followups_done || 0;
      byUser[key].meetings  += log.meetings_done  || 0;
      byUser[key].hours     += log.hours_worked   || 0;
    }
    return Object.values(byUser).map(p => {
      const actual = p.emails + p.linkedin + p.calls + p.followups;
      const pct    = Math.min(Math.round((actual / DAILY_MIN) * 100), 150);
      return { ...p, pct };
    }).sort((a, b) => b.pct - a.pct);
  }, [teamLogs, leaderboardDate]);

  // ── Derived: 30-day chart series ─────────────────────────────
  const chartData = useMemo(() => {
    // Build map of all dates in range
    const dateMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = shiftISODate(todayISO, -i);
      dateMap[d] = { date: d };
    }
    // Aggregate per user per date
    const userNames = [...new Set(teamLogs.map(l => l.logged_by_name || l.logged_by || 'Unknown'))];
    for (const log of teamLogs) {
      const name = log.logged_by_name || log.logged_by || 'Unknown';
      const d    = log.log_date;
      if (!dateMap[d]) continue;
      const total = (log.emails_sent || 0) + (log.linkedin_sent || 0) + (log.calls_made || 0) + (log.followups_done || 0);
      dateMap[d][name] = (dateMap[d][name] || 0) + total;
    }
    return { series: Object.values(dateMap), userNames };
  }, [teamLogs, todayISO]);

  // ── Derived: streak per user (consecutive days ending today with a log) ──
  const streaks = useMemo(() => {
    const loggedByUser = {};
    for (const log of teamLogs) {
      const name = log.logged_by_name || log.logged_by || 'Unknown';
      if (!loggedByUser[name]) loggedByUser[name] = new Set();
      loggedByUser[name].add(log.log_date);
    }
    const result = {};
    for (const [name, days] of Object.entries(loggedByUser)) {
      let streak = 0;
      let d = todayISO;
      while (days.has(d)) {
        streak++;
        d = shiftISODate(d, -1);
      }
      result[name] = streak;
    }
    return result;
  }, [teamLogs, leaderboardDate]);

  // ─────────────────────────────────────────────────────────────
  // ── ORIGINAL My Log state (100% untouched) ───────────────────
  // ─────────────────────────────────────────────────────────────
  const [selectedDateISO, setSelectedDateISO] = useState(todayISO);
  const selectedDate = useMemo(() => parseISODate(selectedDateISO), [selectedDateISO]);
  const [historyFromISO, setHistoryFromISO] = useState(() => shiftISODate(todayISO, -13));
  const [historyToISO, setHistoryToISO]     = useState(todayISO);

  const [form, setForm]               = useState(EMPTY_FORM);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [error, setError]             = useState('');
  const [recentLogs, setRecentLogs]   = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [weeklyTab, setWeeklyTab]     = useState(null);
  const [weeklyForm, setWeeklyForm]   = useState({
    new_leads: '', leads_qualified: '', deals_lost: '', loss_reason: '',
    clients_signed: '', contract_value: '',
    what_worked: '', what_didnt: '', what_to_change: '', help_needed: '', top_priorities: '',
  });
  const [weeklySubmitting, setWeeklySubmitting] = useState(false);
  const [weeklySuccess, setWeeklySuccess]       = useState(false);
  const isFriday = today.getDay() === 5;
  const [loadError, setLoadError] = useState('');

  const loadRecentLogs = useCallback(async () => {
    try {
      setLoadingLogs(true);
      setLoadError('');
      setForm(EMPTY_FORM);
      setSubmitted(false);
      const selectedWeekStartISO = getWeekStartISO(selectedDateISO);
      const selectedWeekEndISO   = getWeekEndISO(selectedDateISO);
      const fromISO = historyFromISO < selectedWeekStartISO ? historyFromISO : selectedWeekStartISO;
      const toISO   = historyToISO > selectedWeekEndISO ? historyToISO : selectedWeekEndISO;
      const res  = await salesTrackerAPI.getLogs({ from_date: fromISO, to_date: toISO });
      const logs = res.data || [];
      setRecentLogs(logs);
      const selectedLog = logs.find(l => l.log_date === selectedDateISO);
      if (selectedLog) {
        setForm({
          emails_sent:      String(selectedLog.emails_sent      || ''),
          linkedin_sent:    String(selectedLog.linkedin_sent    || ''),
          calls_made:       String(selectedLog.calls_made       || ''),
          replies_received: String(selectedLog.replies_received || ''),
          meetings_booked:  String(selectedLog.meetings_booked  || ''),
          meetings_done:    String(selectedLog.meetings_done    || ''),
          proposals_sent:   String(selectedLog.proposals_sent   || ''),
          followups_done:   String(selectedLog.followups_done   || ''),
          new_leads_added:  String(selectedLog.new_leads_added  || ''),
          hours_worked:     String(selectedLog.hours_worked     || ''),
          mood:             selectedLog.mood || null,
          biggest_win:      selectedLog.biggest_win     || '',
          biggest_blocker:  selectedLog.biggest_blocker || '',
        });
        setSubmitted(true);
      }
    } catch (e) {
      setLoadError(e?.response?.data?.detail || 'Failed to load logs. Check your connection and try again.');
    } finally { setLoadingLogs(false); }
  }, [historyFromISO, historyToISO, selectedDateISO]);

  useEffect(() => { loadRecentLogs(); }, [loadRecentLogs]);

  const historyLogs = useMemo(() => {
    const fromISO = historyFromISO <= historyToISO ? historyFromISO : historyToISO;
    const toISO   = historyFromISO <= historyToISO ? historyToISO   : historyFromISO;
    return recentLogs.filter(log => log.log_date >= fromISO && log.log_date <= toISO);
  }, [recentLogs, historyFromISO, historyToISO]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    const anyFilled = Object.entries(form).some(([k, v]) =>
      k !== 'mood' && k !== 'biggest_win' && k !== 'biggest_blocker' && v !== '' && v !== null && Number(v) > 0
    ) || form.biggest_win?.trim() || form.biggest_blocker?.trim() || form.mood !== null;
    if (!anyFilled) { setError('Please fill in at least one field before saving.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await salesTrackerAPI.submitLog({
        log_date:          selectedDateISO,
        emails_sent:       parseInt(form.emails_sent)      || 0,
        linkedin_sent:     parseInt(form.linkedin_sent)    || 0,
        calls_made:        parseInt(form.calls_made)       || 0,
        replies_received:  parseInt(form.replies_received) || 0,
        meetings_booked:   parseInt(form.meetings_booked)  || 0,
        meetings_done:     parseInt(form.meetings_done)    || 0,
        proposals_sent:    parseInt(form.proposals_sent)   || 0,
        followups_done:    parseInt(form.followups_done)   || 0,
        new_leads_added:   parseInt(form.new_leads_added)  || 0,
        hours_worked:      parseFloat(form.hours_worked)   || 0,
        mood:              form.mood,
        biggest_win:       form.biggest_win     || null,
        biggest_blocker:   form.biggest_blocker || null,
      });
      const savedRow = res.data?.data || null;
      if (savedRow) {
        setRecentLogs(prev => {
          const others = prev.filter(l => l.log_date !== selectedDateISO);
          return [savedRow, ...others].sort((a, b) => (b.log_date > a.log_date ? 1 : -1));
        });
      }
      setSubmitted(true);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save. Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleWeeklySubmit = async () => {
    setWeeklySubmitting(true);
    try {
      const wn  = getISOWeek(today);
      const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const fri = new Date(mon);   fri.setDate(mon.getDate() + 4);
      await salesTrackerAPI.submitWeeklyReview({
        week_number:     wn,
        year:            today.getFullYear(),
        date_range:      `${fmtDate(mon)} – ${fmtDate(fri)}`,
        new_leads:       parseInt(weeklyForm.new_leads)       || 0,
        leads_qualified: parseInt(weeklyForm.leads_qualified) || 0,
        deals_lost:      parseInt(weeklyForm.deals_lost)      || 0,
        loss_reason:     weeklyForm.loss_reason   || null,
        clients_signed:  parseInt(weeklyForm.clients_signed)  || 0,
        contract_value:  parseFloat(weeklyForm.contract_value) || 0,
        what_worked:     weeklyForm.what_worked    || null,
        what_didnt:      weeklyForm.what_didnt     || null,
        what_to_change:  weeklyForm.what_to_change || null,
        help_needed:     weeklyForm.help_needed    || null,
        top_priorities:  weeklyForm.top_priorities || null,
      });
      setWeeklySuccess(true);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save weekly review.');
    } finally { setWeeklySubmitting(false); }
  };

  const getISOWeek = (d) => {
    const date = new Date(d); date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  const weekDaysMap = {};
  const mon = new Date(selectedDate); mon.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
  for (let i = 0; i < 5; i++) {
    const d   = new Date(mon); d.setDate(mon.getDate() + i);
    const iso = toISODate(d);
    const log = recentLogs.find(l => l.log_date === iso);
    weekDaysMap[DAYS[i]] = { date: d, iso, log };
  }

  const numInput = (key, label, hint) => {
    const tgt  = TARGETS[key];
    const pill = tgt ? getStatusPill(form[key], tgt.min, tgt.max) : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="label" style={{ fontSize: '0.8125rem' }}>{label}</label>
          {pill && (
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: 9999, background: pill.bg, color: pill.color }}>
              {pill.label}
            </span>
          )}
        </div>
        <input
          type="number" min="0" className="input"
          value={form[key]}
          onChange={e => setF(key, e.target.value)}
          placeholder="0"
          style={{ width: '100%' }}
        />
        {hint && <p style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', margin: 0 }}>{hint}</p>}
      </div>
    );
  };

  const quickPickers = [
    { label: 'Today',     dateISO: todayISO },
    { label: 'Yesterday', dateISO: shiftISODate(todayISO, -1) },
    { label: 'This Week', dateISO: getWeekStartISO(todayISO) },
  ];

  const pctColor = (pct) => pct >= 80 ? '#006243' : pct >= 50 ? '#B45309' : '#BA1A1A';
  const pctBg    = (pct) => pct >= 80 ? 'rgba(0,98,67,0.10)' : pct >= 50 ? 'rgba(180,83,9,0.09)' : 'rgba(186,26,26,0.09)';

  return (
    <div className="fade-in">
      {/* ── Header — with NEW toggle for admin/viewer ─────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p className="label-sm" style={{ color: 'var(--tertiary)', marginBottom: '0.25rem' }}>Sales Tracker</p>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 className="headline-sm">Daily Activity Log</h1>

          {/* NEW: toggle — only shown to admin/viewer */}
          {isPrivileged && (
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface-container-low)', padding: 3, borderRadius: '0.75rem', flexShrink: 0 }}>
              {['My Log', 'Team View'].map(label => (
                <button
                  key={label}
                  onClick={() => setTeamView(label === 'Team View')}
                  style={{
                    padding: '0.4rem 0.875rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer',
                    fontSize: '0.8125rem', fontWeight: (teamView ? label === 'Team View' : label === 'My Log') ? 700 : 400,
                    background: (teamView ? label === 'Team View' : label === 'My Log') ? 'var(--surface-container-lowest)' : 'transparent',
                    color:      (teamView ? label === 'Team View' : label === 'My Log') ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                    fontFamily: 'var(--font-display)', transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date picker row — only shown in My Log view */}
        {!teamView && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', margin: 0 }}>
                {selectedDate.toLocaleDateString('en-IE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--on-surface-variant)' }}>
                Backfill date
                <input
                  type="date" value={selectedDateISO} max={todayISO}
                  onChange={e => setSelectedDateISO(e.target.value)}
                  className="input" style={{ width: 'auto', minWidth: 160 }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {quickPickers.map(({ label, dateISO }) => (
                <button key={label} type="button" onClick={() => setSelectedDateISO(dateISO)} style={{
                  padding: '0.45rem 0.75rem', borderRadius: '9999px',
                  border: `1px solid ${selectedDateISO === dateISO ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                  background: selectedDateISO === dateISO ? 'rgba(0,98,67,0.1)' : 'var(--surface)',
                  color:      selectedDateISO === dateISO ? 'var(--tertiary)' : 'var(--on-surface-variant)',
                  fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TEAM VIEW — rendered only when teamView === true
      ══════════════════════════════════════════════════════════ */}
      {teamView && (
        <div>
          {teamLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--on-surface-variant)' }}>
              <Icon name="progress_activity" style={{ fontSize: '2rem', display: 'block', margin: '0 auto 0.75rem' }} />
              Loading team data…
            </div>
          ) : (
            <>
              {/* ── Leaderboard table ───────────────────────── */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.625rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Icon name="leaderboard" style={{ color: 'var(--primary)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Team Leaderboard</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[{ label: 'Today', date: todayISO }, { label: 'Yesterday', date: shiftISODate(todayISO, -1) }].map(q => (
                      <button key={q.label} onClick={() => setLeaderboardDate(q.date)} style={{ padding: '0.2rem 0.6rem', borderRadius: 9999, border: `1px solid ${leaderboardDate === q.date ? 'var(--primary)' : 'var(--outline-variant)'}`, background: leaderboardDate === q.date ? 'rgba(68,104,176,0.1)' : 'transparent', color: leaderboardDate === q.date ? 'var(--primary)' : 'var(--on-surface-variant)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>{q.label}</button>
                    ))}
                    <input type="date" value={leaderboardDate} max={todayISO} onChange={e => setLeaderboardDate(e.target.value)} className="input" style={{ width: 'auto', minWidth: 140, fontSize: '0.8125rem', padding: '0.2rem 0.5rem' }} />
                  </div>
                </div>

                {leaderboard.length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--on-surface-variant)' }}>
                    <Icon name="edit_note" style={{ fontSize: '2rem', display: 'block', margin: '0 auto 0.5rem', opacity: 0.3 }} />
                    <p style={{ fontSize: '0.875rem' }}>No activity logged today yet</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: 600 }}>
                      <thead style={{ background: 'var(--surface-container-low)' }}>
                        <tr>
                          {['Rank', 'Name', 'Emails', 'LinkedIn', 'Calls', 'Follow-ups', 'Meetings', 'Hours', 'Target %', 'Streak'].map(h => (
                            <th key={h} style={{ padding: '0.625rem 0.875rem', textAlign: h === 'Name' || h === 'Rank' ? 'left' : 'center', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--on-surface-variant)', letterSpacing: '0.05em', borderBottom: '1px solid var(--outline-variant)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((p, i) => {
                          const streak = streaks[p.name] || 0;
                          return (
                            <tr key={p.name} style={{ background: i === 0 ? 'rgba(0,98,67,0.06)' : p.pct < 50 ? 'rgba(186,26,26,0.04)' : 'transparent', borderBottom: '1px solid var(--surface-container)' }}>
                              <td style={{ padding: '0.75rem 0.875rem', fontWeight: 700, fontSize: '1rem' }}>
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                              </td>
                              <td style={{ padding: '0.75rem 0.875rem', fontWeight: 600 }}>{p.name}</td>
                              {[p.emails, p.linkedin, p.calls, p.followups, p.meetings].map((v, j) => (
                                <td key={j} style={{ padding: '0.75rem 0.875rem', textAlign: 'center', fontWeight: 500, color: v === 0 ? 'var(--on-surface-variant)' : 'var(--on-surface)' }}>{v}</td>
                              ))}
                              <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center', color: 'var(--on-surface-variant)' }}>{p.hours > 0 ? `${p.hours.toFixed(1)}h` : '—'}</td>
                              <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                                  <div style={{ width: 56, height: 6, background: 'var(--surface-container)', borderRadius: 9999, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(p.pct, 100)}%`, background: pctColor(p.pct), borderRadius: 9999 }} />
                                  </div>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: pctColor(p.pct), minWidth: 34 }}>{p.pct}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem 0.875rem', textAlign: 'center' }}>
                                {streak >= 3
                                  ? <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f97316' }}>🔥 {streak}d</span>
                                  : streak > 0
                                    ? <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>{streak}d</span>
                                    : <span style={{ color: 'var(--on-surface-variant)', opacity: 0.4 }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── 30-day outreach trend chart ─────────────── */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>30-Day Outreach Activity</h2>
                {chartData.series.length > 0 && chartData.userNames.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData.series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={d => {
                          const parts = d.split('-');
                          return `${parts[2]}/${parts[1]}`;
                        }}
                        interval={4}
                      />
                      <YAxis tick={{ fontSize: 11 }} width={30} />
                      <Tooltip
                        labelFormatter={d => {
                          const parts = d.split('-');
                          return `${parts[2]}/${parts[1]}/${parts[0]}`;
                        }}
                        formatter={(v, name) => [v, name]}
                        contentStyle={{ fontSize: '0.8125rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.8125rem', paddingTop: '0.75rem' }} />
                      {chartData.userNames.map((name, i) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={TEAM_COLORS[i % TEAM_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                    No 30-day data available
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MY LOG VIEW — 100% original code, rendered only when teamView === false
      ══════════════════════════════════════════════════════════ */}
      {!teamView && (
        <>
          {/* Load error banner */}
          {loadError && (
            <div style={{ marginBottom: '1rem', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', background: 'var(--error-container)', color: 'var(--error)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="error_outline" style={{ fontSize: '1rem' }} /> {loadError}
            </div>
          )}

          {/* Target banner */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', padding: '0.75rem 1rem', borderRadius: '0.625rem', marginBottom: '1.5rem', background: 'rgba(68,104,176,0.08)', border: '1px solid rgba(68,104,176,0.15)', alignItems: 'center' }}>
            <Icon name="target" style={{ fontSize: '1rem', color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)' }}>Daily targets:</span>
            {Object.entries(TARGETS).map(([k, t]) => (
              <span key={k} style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                {t.label}: <strong style={{ color: 'var(--on-surface)' }}>{t.min}–{t.max}</strong>
              </span>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: '1.25rem', alignItems: 'start' }}>

            {/* ── Log Form ── */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>
                  {submitted
                    ? (selectedDateISO === todayISO ? "Today's Log" : 'Backfilled Log')
                    : (selectedDateISO === todayISO ? "Log Today's Activity" : "Log This Day's Activity")}
                </h2>
                {submitted && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', color: '#006633', fontWeight: 600 }}>
                    <Icon name="check_circle" style={{ fontSize: '1rem', color: '#006633' }} /> Saved
                  </span>
                )}
              </div>

              <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: '0.875rem' }}>Outreach</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
                {numInput('emails_sent',    'Cold Emails Sent',  'Target: 10–15')}
                {numInput('linkedin_sent',  'LinkedIn Messages', 'Target: 8–10')}
                {numInput('calls_made',     'Cold Calls Made',   'Target: 3–5')}
                {numInput('replies_received', 'Replies Received', '')}
              </div>

              <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: '0.875rem' }}>Meetings & Pipeline</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
                {numInput('meetings_booked', 'Meetings Booked', '')}
                {numInput('meetings_done',   'Meetings Done',   '')}
                {numInput('proposals_sent',  'Proposals Sent',  '')}
                {numInput('followups_done',  'Follow-ups Done', 'Target: 3–5')}
                {numInput('new_leads_added', 'New Leads Added', '')}
                {numInput('hours_worked',    'Hours Worked',    '')}
              </div>

              <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>Mood & Energy</p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: form.mood <= 2 && form.mood ? '0.5rem' : '1.25rem' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setF('mood', form.mood === n ? null : n)} style={{ width: 44, height: 44, borderRadius: '0.5rem', border: '1.5px solid', borderColor: form.mood === n ? 'var(--tertiary)' : 'var(--outline-variant)', background: form.mood === n ? 'rgba(0,98,67,0.1)' : 'transparent', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', color: form.mood === n ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}>{n}</button>
                ))}
                <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', alignSelf: 'center', marginLeft: '0.25rem' }}>
                  {form.mood === 1 ? '😔 Rough' : form.mood === 2 ? '😟 Below average' : form.mood === 3 ? '😐 Average' : form.mood === 4 ? '🙂 Good' : form.mood === 5 ? '🤩 Brilliant!' : ''}
                </span>
              </div>
              {form.mood !== null && form.mood <= 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'var(--error-container)', marginBottom: '1.25rem' }}>
                  <Icon name="warning" style={{ fontSize: '1rem', color: 'var(--error)' }} />
                  <p style={{ fontSize: '0.8125rem', color: 'var(--error)', margin: 0 }}>Burnout alert — this will be flagged for Jayant's attention.</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.5rem' }}>
                <div>
                  <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>Biggest Win Today <span style={{ color: 'var(--on-surface-variant)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea className="textarea" rows={2} value={form.biggest_win} onChange={e => setF('biggest_win', e.target.value)} placeholder="e.g. Booked a discovery call with Pixel Studio" style={{ width: '100%', resize: 'none' }} />
                </div>
                <div>
                  <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>Biggest Blocker Today <span style={{ color: 'var(--on-surface-variant)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea className="textarea" rows={2} value={form.biggest_blocker} onChange={e => setF('biggest_blocker', e.target.value)} placeholder="e.g. Decision maker on leave all week" style={{ width: '100%', resize: 'none' }} />
                </div>
              </div>

              {error && (
                <div style={{ padding: '0.625rem 0.875rem', background: 'var(--error-container)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>
                </div>
              )}

              <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9375rem', color: '#fff', background: submitting ? 'var(--outline-variant)' : 'linear-gradient(135deg,var(--tertiary),#009966)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                {submitting
                  ? <><Icon name="progress_activity" style={{ animation: 'spin 1s linear infinite', color: '#fff' }} /> Saving…</>
                  : <><Icon name={submitted ? 'sync' : 'save'} style={{ color: '#fff' }} /> {submitted ? 'Update Log' : (selectedDateISO === todayISO ? "Log Today's Activity" : 'Save Backfilled Log')}</>}
              </button>
            </div>

            {/* ── Right panel: this week mini-view ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* This week at a glance */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>This Week</h3>
                {loadingLogs ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>Loading…</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {DAYS.map(day => {
                      const { date: d, iso, log } = weekDaysMap[day] || {};
                      const isFuture = d > today;
                      const isToday  = iso === todayISO;
                      return (
                        <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: isToday ? 'rgba(68,104,176,0.08)' : 'var(--surface-container-low)', border: isToday ? '1px solid rgba(68,104,176,0.2)' : '1px solid transparent', opacity: isFuture ? 0.45 : 1 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, width: 28, color: isToday ? 'var(--primary)' : 'var(--on-surface-variant)' }}>{day.slice(0, 3)}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', width: 60 }}>{d ? d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short' }) : ''}</span>
                          <div style={{ flex: 1 }}>
                            {log ? (
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {[{ label: 'E', val: log.emails_sent, color: '#4468B0' }, { label: 'L', val: log.linkedin_sent, color: '#7C3AED' }, { label: 'C', val: log.calls_made, color: '#D97706' }].map(({ label, val, color }) => (
                                  <span key={label} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: 4, background: `${color}18`, color }}>{label}:{val || 0}</span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>{isFuture ? '—' : 'Not logged'}</span>
                            )}
                          </div>
                          {log && <Icon name="check_circle" style={{ fontSize: '0.875rem', color: '#006633' }} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* History & Backfill */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>History & Backfill</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', margin: '0.25rem 0 0' }}>Click a row to load that day into the form.</p>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--on-surface-variant)' }}>{historyLogs.length} log{historyLogs.length === 1 ? '' : 's'}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem', display: 'block' }}>From</label>
                    <input type="date" value={historyFromISO} max={todayISO} onChange={e => setHistoryFromISO(e.target.value)} className="input" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem', display: 'block' }}>To</label>
                    <input type="date" value={historyToISO} max={todayISO} onChange={e => setHistoryToISO(e.target.value)} className="input" style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <button type="button" onClick={() => { setHistoryFromISO(shiftISODate(todayISO, -13)); setHistoryToISO(todayISO); }} style={{ padding: '0.4rem 0.65rem', borderRadius: '9999px', border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Last 14 days</button>
                  <button type="button" onClick={() => { setHistoryFromISO(getWeekStartISO(selectedDateISO)); setHistoryToISO(getWeekEndISO(selectedDateISO)); }} style={{ padding: '0.4rem 0.65rem', borderRadius: '9999px', border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--on-surface-variant)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Selected week</button>
                </div>

                {loadingLogs ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>Loading…</p>
                ) : historyLogs.length === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', fontStyle: 'italic', margin: 0 }}>No logs in this range.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 320, overflow: 'auto', paddingRight: 2 }}>
                    {historyLogs.map(log => {
                      const isSelected = log.log_date === selectedDateISO;
                      const moodLabel  = log.mood ? `Mood ${log.mood}` : 'No mood';
                      return (
                        <button key={`${log.log_date}-${log.logged_by || 'me'}`} type="button" onClick={() => setSelectedDateISO(log.log_date)} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: '0.75rem', width: '100%', textAlign: 'left', padding: '0.7rem 0.8rem', borderRadius: '0.75rem', border: `1px solid ${isSelected ? 'rgba(0,98,67,0.25)' : 'var(--outline-variant)'}`, background: isSelected ? 'rgba(0,98,67,0.06)' : 'var(--surface)', cursor: 'pointer' }}>
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--on-surface)' }}>{fmtDate(new Date(`${log.log_date}T00:00:00`))}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>{log.day_of_week || ''} {isSelected ? '· Selected' : ''}</div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: 4, background: 'rgba(68,104,176,0.12)', color: '#4468B0' }}>E:{log.emails_sent || 0}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: 4, background: 'rgba(124,58,237,0.12)', color: '#7C3AED' }}>L:{log.linkedin_sent || 0}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: 4, background: 'rgba(217,119,6,0.12)', color: '#D97706' }}>C:{log.calls_made || 0}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.35rem', borderRadius: 4, background: 'rgba(0,98,67,0.12)', color: '#006633' }}>{moodLabel}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Friday — Weekly Review nudge */}
              {isFriday && (
                <div className="card" style={{ padding: '1.25rem', border: '1px solid rgba(68,104,176,0.2)', background: 'rgba(68,104,176,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Icon name="event_note" style={{ color: 'var(--primary)' }} />
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>It's Friday — Weekly Review</h3>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: '0.875rem' }}>Fill your weekly review before you leave today.</p>
                  {weeklyTab === null && (
                    <button onClick={() => setWeeklyTab('open')} className="btn-primary" style={{ width: '100%', padding: '0.625rem' }}>Start Weekly Review</button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Weekly Review form */}
          {weeklyTab === 'open' && (
            <div className="card" style={{ padding: '1.5rem', marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Weekly Review — Week {getISOWeek(today)}</h2>
                <button onClick={() => setWeeklyTab(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="close" /></button>
              </div>

              {weeklySuccess ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <Icon name="check_circle" style={{ fontSize: '2.5rem', color: 'var(--tertiary)', display: 'block', margin: '0 auto 0.75rem' }} />
                  <p style={{ fontWeight: 700 }}>Weekly review saved! Great work this week, Kajal.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
                    {[{ k: 'new_leads', label: 'New Leads Added' }, { k: 'leads_qualified', label: 'Leads Qualified' }, { k: 'deals_lost', label: 'Deals Lost' }, { k: 'clients_signed', label: 'Clients Signed' }, { k: 'contract_value', label: 'Contract Value Won (€)' }].map(({ k, label }) => (
                      <div key={k}>
                        <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>{label}</label>
                        <input type="number" min="0" className="input" value={weeklyForm[k]} onChange={e => setWeeklyForm(f => ({ ...f, [k]: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
                    {[{ k: 'loss_reason', label: 'Reason for Deals Lost', ph: 'e.g. Price too high, no budget' }, { k: 'what_worked', label: 'What worked this week?', ph: 'e.g. LinkedIn outreach to fintech sector' }, { k: 'what_didnt', label: "What didn't work?", ph: 'e.g. Cold emails to HR departments' }, { k: 'what_to_change', label: 'What will you change?', ph: 'e.g. Try video messages on LinkedIn' }, { k: 'help_needed', label: 'Help needed from Jayant?', ph: 'e.g. Intro to Stripe contact' }, { k: 'top_priorities', label: 'Top 3 priorities next week', ph: '1. Follow up with Pixel Studio...' }].map(({ k, label, ph }) => (
                      <div key={k}>
                        <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>{label}</label>
                        <textarea className="textarea" rows={2} value={weeklyForm[k]} onChange={e => setWeeklyForm(f => ({ ...f, [k]: e.target.value }))} placeholder={ph} style={{ width: '100%', resize: 'none' }} />
                      </div>
                    ))}
                  </div>
                  <button onClick={handleWeeklySubmit} disabled={weeklySubmitting} style={{ padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none', cursor: weeklySubmitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9375rem', color: '#fff', background: weeklySubmitting ? 'var(--outline-variant)' : 'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                    {weeklySubmitting ? 'Saving…' : 'Save Weekly Review'}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
