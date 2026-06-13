import { useBreakpoint } from '../hooks/useBreakpoint';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ceoDashboardAPI,
  salesTrackerAPI,
  tasksAPI,
} from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

// ── Shared helpers (identical to original) ────────────────────
const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const fmt = (v) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr`
    : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L`
    : `₹${v.toLocaleString('en-IN')}`;

const fmtEur = (v) => `€${Number(v || 0).toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const STAGE_COLOR = {
  new: '#3b82f6', contacted: '#8b5cf6', called: '#f59e0b', interested: '#10b981',
  closed: '#059669', completed: '#047857', rejected: '#ef4444', lost: '#6b7280', follow_up_needed: '#f97316',
};

const ACTION_COLOR = {
  login: '#10b981', login_failed: '#ef4444', logout: '#6b7280',
  view: '#3b82f6', create: '#8b5cf6', update: '#f59e0b', delete: '#ef4444', export: '#f97316',
};
const ACTION_ICON = {
  login: 'login', login_failed: 'block', logout: 'logout',
  view: 'visibility', create: 'add_circle', update: 'edit', delete: 'delete', export: 'download',
};

// ── Existing KPI card (identical to original) ─────────────────
const KPI = ({ label, value, sub, icon, color, onClick }) => (
  <div className="card hover-lift" onClick={onClick}
    style={{ cursor: onClick ? 'pointer' : 'default', position: 'relative', overflow: 'hidden', padding: '1.25rem' }}>
    <div style={{ position: 'absolute', top: 10, right: 12, opacity: 0.07 }}>
      <Icon name={icon} style={{ fontSize: '3.5rem', color }} />
    </div>
    <p className="label-sm" style={{ marginBottom: '0.5rem' }}>{label}</p>
    <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--on-surface)', lineHeight: 1 }}>{value}</p>
    {sub && <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>{sub}</p>}
  </div>
);

// ── NEW: Circular target progress ring ────────────────────────
const TargetRing = ({ pct, size = 52, stroke = 5, color }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  const ringColor = pct >= 80 ? '#006243' : pct >= 50 ? '#B45309' : '#BA1A1A';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-container)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || ringColor} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
    </svg>
  );
};

// ── NEW: Salesperson performance row ──────────────────────────
const DAILY_TARGETS = { emails: 10, linkedin: 8, calls: 3, followups: 3 }; // minimums
const ROW_BG = (pct) =>
  pct >= 80 ? 'rgba(0,98,67,0.07)' : pct >= 50 ? 'rgba(180,83,9,0.06)' : 'rgba(186,26,26,0.06)';
const ROW_BADGE_COLOR = (pct) =>
  pct >= 80 ? '#006243' : pct >= 50 ? '#B45309' : '#BA1A1A';
const ROW_BADGE_BG = (pct) =>
  pct >= 80 ? 'rgba(0,98,67,0.12)' : pct >= 50 ? 'rgba(180,83,9,0.10)' : 'rgba(186,26,26,0.10)';

// ── Component ─────────────────────────────────────────────────
export default function CEODashboard() {
  const { isMobile, isTablet } = useBreakpoint();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('overview');

  // NEW state for extra data
  const [todayLogs, setTodayLogs]             = useState([]);
  const [taskOverdueCount, setTaskOverdueCount] = useState(0);
  const [extraLoading, setExtraLoading]         = useState(false);

  const todayISO = new Date().toISOString().slice(0, 10);

  // ── Date selector for performance table ──────────────────────
  const [perfDate, setPerfDate] = useState(todayISO);

  // ── Primary fetch (identical logic to original) ───────────────
  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await ceoDashboardAPI.get(); setData(r.data); }
    catch { /* stay empty */ }
    finally { setLoading(false); }
  }, []);

  // ── Secondary fetch: today's team logs + overdue tasks ────────
  const fetchExtra = useCallback(async () => {
    setExtraLoading(true);
    try {
      const [logsResult, tasksResult] = await Promise.allSettled([
        salesTrackerAPI.getLogs({ from_date: perfDate, to_date: perfDate, limit: 100 }),
        tasksAPI.getAll({ status: 'pending' }),
      ]);
      if (logsResult.status === 'fulfilled') {
        setTodayLogs(Array.isArray(logsResult.value?.data) ? logsResult.value.data : []);
      }
      if (tasksResult.status === 'fulfilled') {
        const tasks = Array.isArray(tasksResult.value?.data) ? tasksResult.value.data : [];
        const overdue = tasks.filter(t => t.due_date && t.due_date < todayISO && !t.completed).length;
        setTaskOverdueCount(overdue);
      }
    } catch { /* non-blocking */ }
    finally { setExtraLoading(false); }
  }, [todayISO, perfDate]);

  useEffect(() => { fetch(); fetchExtra(); }, [fetch, fetchExtra]);

  // ── Derived values (existing, untouched) ──────────────────────
  const pv     = data?.pipeline_value  || 0;
  const cv     = data?.closed_value    || 0;
  const stages = useMemo(() => data?.stage_counts || {}, [data]);  // memoised — prevents useMemo deps thrashing
  const stale  = data?.stale_leads     || [];
  const audit  = data?.recent_audit    || [];

  // ── NEW: Team performance derived from today's logs ───────────
  const teamPerf = useMemo(() => {
    const byUser = {};
    for (const log of todayLogs) {
      const key = log.logged_by_name || log.logged_by || 'Unknown';
      if (!byUser[key]) byUser[key] = { name: key, emails: 0, linkedin: 0, calls: 0, followups: 0, meetings: 0 };
      byUser[key].emails    += (log.emails_sent    || 0);
      byUser[key].linkedin  += (log.linkedin_sent  || 0);
      byUser[key].calls     += (log.calls_made     || 0);
      byUser[key].followups += (log.followups_done || 0);
      byUser[key].meetings  += (log.meetings_done  || 0);
    }
    return Object.values(byUser).map(p => {
      const totalMin = DAILY_TARGETS.emails + DAILY_TARGETS.linkedin + DAILY_TARGETS.calls + DAILY_TARGETS.followups;
      const actual   = p.emails + p.linkedin + p.calls + p.followups;
      const pct      = Math.min(Math.round((actual / totalMin) * 100), 150);
      return { ...p, pct };
    }).sort((a, b) => b.pct - a.pct);
  }, [todayLogs]);

  // ── NEW: Sales funnel data from stage_counts ──────────────────
  const salesFunnelData = useMemo(() => {
    const ORDER = ['new', 'contacted', 'called', 'interested', 'closed', 'completed'];
    const LABELS = { new: 'New', contacted: 'Contacted', called: 'Called', interested: 'Interested', closed: 'Closed', completed: 'Won' };
    return ORDER.filter(s => stages[s]).map(s => ({ stage: LABELS[s] || s, count: stages[s] || 0, color: STAGE_COLOR[s] || '#6b7280' }));
  }, [stages]);

  // ── NEW: Monthly target progress ──────────────────────────────
  const MONTHLY_TARGET = 25000; // EUR — can be made configurable later
  const targetPct = MONTHLY_TARGET > 0 ? Math.round((cv / MONTHLY_TARGET) * 100) : 0;

  return (
    <div className="fade-in">
      {/* ── Header (identical to original) ─────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem' }}>Admin View</p>
          <h1 className="headline-sm">CEO Dashboard</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.125rem' }}>Business health at a glance — refreshes every load</p>
        </div>
        <button onClick={() => { fetch(); fetchExtra(); }} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
          <Icon name="refresh" style={{ fontSize: '1rem' }} /> Refresh
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" style={{ fontSize: '2.5rem', display: 'block', margin: '0 auto 0.75rem' }} />
          Loading dashboard…
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── KPI strip — original 5 + NEW Monthly Target card ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(3,1fr)' : 'repeat(6,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <KPI label="Pipeline Value"   value={fmt(pv)}                  sub={`${data.pipeline_leads} active deals`}    icon="trending_up"   color="var(--primary)" />
            <KPI label="Closed Value"     value={fmt(cv)}                  sub={`${data.closed_leads} deals closed`}       icon="check_circle"  color="var(--tertiary)" />
            <KPI label="Total Leads"      value={data.total_leads}         sub={`${data.leads_this_week} this week`}        icon="group"         color="var(--primary)" />
            <KPI label="Total Candidates" value={data.total_candidates}    sub="active in ATS"                              icon="person_search" color="var(--tertiary)" />
            <KPI label="Submissions / Mo" value={data.submissions_month}   sub={`${data.submissions_week} this week`}       icon="send"          color="#8b5cf6" />
            {/* NEW: Monthly target ring */}
            <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
              <p className="label-sm" style={{ marginBottom: '0.75rem' }}>Monthly Target</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TargetRing pct={targetPct} />
                  <span style={{ position: 'absolute', fontSize: '0.6875rem', fontWeight: 800, color: ROW_BADGE_COLOR(targetPct) }}>
                    {targetPct}%
                  </span>
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1.2 }}>{fmtEur(cv)}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>of {fmtEur(MONTHLY_TARGET)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stale alert banner (identical to original) ───────── */}
          {data.stale_count > 0 && (
            <div style={{ marginBottom: '1.5rem', padding: '0.875rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <Icon name="warning" style={{ fontSize: '1.5rem', color: '#ef4444', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, color: '#ef4444' }}>{data.stale_count} lead{data.stale_count !== 1 ? 's' : ''} going cold</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>No activity for 5+ days. See Stale Leads tab below.</p>
              </div>
              <button onClick={() => setTab('stale')} style={{ marginLeft: 'auto', padding: '0.375rem 1rem', borderRadius: '0.5rem', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                View →
              </button>
            </div>
          )}

          {/* ── Tabs (identical to original) ─────────────────────── */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-container-low)', padding: 4, borderRadius: '0.75rem', marginBottom: '1.5rem', width: 'fit-content' }}>
            {[
              { key: 'overview',  label: 'Overview',                        icon: 'dashboard' },
              { key: 'stale',     label: `Stale (${data.stale_count})`,     icon: 'warning' },
              { key: 'activity',  label: 'Activity Log',                    icon: 'history' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: tab === t.key ? 700 : 400, background: tab === t.key ? 'var(--surface-container-lowest)' : 'transparent', color: tab === t.key ? 'var(--on-surface)' : 'var(--on-surface-variant)', fontFamily: 'var(--font-display)', transition: 'all 0.15s' }}>
                <Icon name={t.icon} style={{ fontSize: '1rem' }} />{t.label}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════
              TAB: OVERVIEW — original content + NEW sections appended
          ══════════════════════════════════════════════════════════ */}
          {tab === 'overview' && (
            <>
              {/* ── EXISTING: Pipeline funnel + right column ─────── */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '7fr 5fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                {/* Pipeline funnel — untouched */}
                <div className="card">
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Pipeline by Stage</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Object.entries(stages).sort((a, b) => b[1] - a[1]).map(([stage, count]) => {
                      const pct = data.total_leads ? Math.round((count / data.total_leads) * 100) : 0;
                      const color = STAGE_COLOR[stage] || '#6b7280';
                      return (
                        <div key={stage}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, textTransform: 'capitalize' }}>{stage.replace('_', ' ')}</span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>{count}</span>
                          </div>
                          <div style={{ height: 8, background: 'var(--surface-container-low)', borderRadius: 9999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999, transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right column — untouched */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Stale preview */}
                  <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                      <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>⚠ Stale Leads</h2>
                      <button onClick={() => setTab('stale')} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>View all →</button>
                    </div>
                    {stale.length === 0 ? (
                      <p style={{ fontSize: '0.875rem', color: 'var(--tertiary)', fontWeight: 500 }}>✅ Nothing going cold</p>
                    ) : stale.slice(0, 4).map(l => (
                      <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--surface-container)' }}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{l.full_name}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{l.company || '—'}</p>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '0.15rem 0.5rem', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                          {l.days_stale}d stale
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Recent audit */}
                  <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                      <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Recent Activity</h2>
                      <button onClick={() => setTab('activity')} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Full log →</button>
                    </div>
                    {audit.slice(0, 6).map(log => (
                      <div key={log.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.5rem 0', borderBottom: '1px solid var(--surface-container)' }}>
                        <Icon name={ACTION_ICON[log.action] || 'info'} style={{ fontSize: '1rem', color: ACTION_COLOR[log.action] || 'var(--primary)', flexShrink: 0, marginTop: '0.1rem' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--on-surface)' }}>{log.user_name || log.user_email || 'System'} · <span style={{ fontWeight: 400, color: 'var(--on-surface-variant)' }}>{log.action}</span> {log.entity_name && `· ${log.entity_name}`}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{new Date(log.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════
                  NEW: Salesperson Performance Table — Today
              ══════════════════════════════════════════════════ */}
              <div className="card" style={{ marginBottom: '1.25rem', padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.625rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <Icon name="leaderboard" style={{ color: 'var(--primary)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Salesperson Performance</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[{ label: 'Today', date: todayISO }, { label: 'Yesterday', date: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })() }].map(q => (
                      <button key={q.label} onClick={() => setPerfDate(q.date)} style={{ padding: '0.2rem 0.6rem', borderRadius: 9999, border: `1px solid ${perfDate === q.date ? 'var(--primary)' : 'var(--outline-variant)'}`, background: perfDate === q.date ? 'rgba(68,104,176,0.1)' : 'transparent', color: perfDate === q.date ? 'var(--primary)' : 'var(--on-surface-variant)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>{q.label}</button>
                    ))}
                    <input type="date" value={perfDate} max={todayISO} onChange={e => setPerfDate(e.target.value)} className="input" style={{ width: 'auto', minWidth: 140, fontSize: '0.8125rem', padding: '0.2rem 0.5rem' }} />
                    {extraLoading && <Icon name="progress_activity" style={{ fontSize: '1rem', color: 'var(--on-surface-variant)' }} />}
                  </div>
                </div>
                {teamPerf.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--on-surface-variant)' }}>
                    <Icon name="edit_note" style={{ fontSize: '2rem', display: 'block', margin: '0 auto 0.5rem', opacity: 0.3 }} />
                    <p style={{ fontSize: '0.875rem' }}>No activity logged yet today</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: 540 }}>
                      <thead style={{ background: 'var(--surface-container-low)' }}>
                        <tr>
                          {['Name', 'Emails', 'LinkedIn', 'Calls', 'Follow-ups', 'Meetings', 'Target %'].map(h => (
                            <th key={h} style={{ padding: '0.625rem 1rem', textAlign: h === 'Name' ? 'left' : 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--on-surface-variant)', letterSpacing: '0.05em', borderBottom: '1px solid var(--outline-variant)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamPerf.map((p, i) => (
                          <tr key={p.name} style={{ background: ROW_BG(p.pct), borderBottom: '1px solid var(--surface-container)' }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                              <span style={{ marginRight: '0.375rem' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                              {p.name}
                            </td>
                            {[p.emails, p.linkedin, p.calls, p.followups, p.meetings].map((v, j) => (
                              <td key={j} style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 500 }}>{v}</td>
                            ))}
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                                <div style={{ width: 60, height: 6, background: 'var(--surface-container)', borderRadius: 9999, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.min(p.pct, 100)}%`, background: ROW_BADGE_COLOR(p.pct), borderRadius: 9999 }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ROW_BADGE_COLOR(p.pct), minWidth: 36 }}>{p.pct}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ══════════════════════════════════════════════════
                  NEW: Sales Funnel Chart + Alert Center (side by side)
              ══════════════════════════════════════════════════ */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
                {/* Sales Funnel — Recharts BarChart (horizontal) */}
                <div className="card">
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Sales Funnel</h2>
                  {salesFunnelData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={salesFunnelData} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="stage" type="category" tick={{ fontSize: 12, fontWeight: 500 }} width={80} />
                        <Tooltip
                          formatter={(v) => [v, 'Leads']}
                          contentStyle={{ fontSize: '0.8125rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)' }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {salesFunnelData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem', fontStyle: 'italic' }}>No pipeline data yet</p>
                  )}
                </div>

                {/* Alert Center */}
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Icon name="campaign" style={{ color: 'var(--primary)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Alert Centre</h2>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {[
                      {
                        label:  'Stale Leads',
                        count:  data.stale_count,
                        icon:   'person_off',
                        color:  data.stale_count > 0 ? '#BA1A1A' : '#006243',
                        bg:     data.stale_count > 0 ? 'rgba(186,26,26,0.06)' : 'rgba(0,98,67,0.06)',
                        border: data.stale_count > 0 ? '#BA1A1A' : '#006243',
                        href:   null,
                        onClick: () => setTab('stale'),
                      },
                      {
                        label:  'Tasks Overdue',
                        count:  taskOverdueCount,
                        icon:   'task_alt',
                        color:  taskOverdueCount > 0 ? '#B45309' : '#006243',
                        bg:     taskOverdueCount > 0 ? 'rgba(180,83,9,0.06)' : 'rgba(0,98,67,0.06)',
                        border: taskOverdueCount > 0 ? '#B45309' : '#006243',
                        href:   '/sales/tasks',
                      },
                      {
                        label:  'Candidates in Pipeline',
                        count:  data.total_candidates,
                        icon:   'person_search',
                        color:  'var(--primary)',
                        bg:     'rgba(68,104,176,0.06)',
                        border: 'var(--primary)',
                        href:   '/recruitment/candidates',
                      },
                      {
                        label:  'Submissions This Month',
                        count:  data.submissions_month,
                        icon:   'send',
                        color:  '#8b5cf6',
                        bg:     'rgba(139,92,246,0.06)',
                        border: '#8b5cf6',
                        href:   null,
                      },
                    ].map(alert => (
                      <div
                        key={alert.label}
                        onClick={alert.onClick || (alert.href ? () => window.location.href = alert.href : undefined)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.625rem 0.875rem',
                          borderRadius: '0.625rem',
                          background: alert.bg,
                          borderLeft: `4px solid ${alert.border}`,
                          cursor: (alert.onClick || alert.href) ? 'pointer' : 'default',
                        }}
                      >
                        <Icon name={alert.icon} style={{ fontSize: '1.1rem', color: alert.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: 'var(--on-surface)' }}>{alert.label}</span>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: alert.color }}>{alert.count}</span>
                        {(alert.onClick || alert.href) && <Icon name="chevron_right" style={{ fontSize: '1rem', color: alert.color, opacity: 0.6 }} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB: STALE — identical to original
          ══════════════════════════════════════════════════════════ */}
          {tab === 'stale' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon name="warning" style={{ fontSize: '1.25rem', color: '#ef4444' }} />
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Stale Leads — No activity for 5+ days</h2>
                <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#ef4444', fontSize: '0.875rem' }}>{data.stale_count} leads</span>
              </div>
              {stale.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--tertiary)' }}>
                  <Icon name="check_circle" style={{ fontSize: '2.5rem', display: 'block', margin: '0 auto 0.75rem' }} />
                  <p style={{ fontWeight: 700 }}>All leads are active!</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead style={{ background: 'var(--surface-container-low)' }}>
                    <tr>
                      {['Lead', 'Company', 'Status', 'Deal Value', 'Last Activity', 'Days Stale', 'Action'].map(h => (
                        <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--on-surface-variant)', letterSpacing: '0.05em', borderBottom: '1px solid var(--outline-variant)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stale.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--surface-container)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{l.full_name}</td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--on-surface-variant)' }}>{l.company || '—'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}><span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'var(--surface-container)', padding: '0.15rem 0.5rem', borderRadius: 9999, textTransform: 'capitalize' }}>{l.status}</span></td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--tertiary)' }}>{l.deal_value ? fmt(Number(l.deal_value)) : '—'}</td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--on-surface-variant)' }}>{l.last_activity || 'Never'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}><span style={{ fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '0.15rem 0.5rem', borderRadius: 9999 }}>{l.days_stale} days</span></td>
                        <td style={{ padding: '0.75rem 1rem' }}><a href={`/sales/leads/${l.id}`} style={{ color: 'var(--primary)', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'none' }}>Open →</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB: ACTIVITY LOG — identical to original
          ══════════════════════════════════════════════════════════ */}
          {tab === 'activity' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Recent Activity (last 20 events)</h2>
                <a href="/audit-log" style={{ fontSize: '0.8125rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Full Audit Log →</a>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead style={{ background: 'var(--surface-container-low)' }}>
                  <tr>
                    {['Action', 'User', 'Record', 'IP Address', 'Time'].map(h => (
                      <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--on-surface-variant)', letterSpacing: '0.05em', borderBottom: '1px solid var(--outline-variant)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--surface-container)' }}>
                      <td style={{ padding: '0.625rem 1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 9999, color: ACTION_COLOR[log.action] || 'var(--primary)', background: `${ACTION_COLOR[log.action] || '#3b82f6'}14` }}>
                          <Icon name={ACTION_ICON[log.action] || 'info'} style={{ fontSize: '0.875rem' }} />
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '0.625rem 1rem', fontWeight: 500 }}>{log.user_name || log.user_email || '—'}</td>
                      <td style={{ padding: '0.625rem 1rem', color: 'var(--on-surface-variant)' }}>{log.entity_type && log.entity_name ? `${log.entity_type}: ${log.entity_name}` : log.entity_type || '—'}</td>
                      <td style={{ padding: '0.625rem 1rem', color: 'var(--on-surface-variant)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.ip_address || '—'}</td>
                      <td style={{ padding: '0.625rem 1rem', color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
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
