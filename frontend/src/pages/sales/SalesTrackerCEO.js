import React, { useState, useMemo, Suspense, lazy, useCallback } from 'react';
import { salesTrackerAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import useCachedPeriodData from '../../hooks/useCachedPeriodData';
import PeriodSelector, { toISO, periodRange } from '../../components/PeriodSelector';
import AIInsightPanel from '../../components/AIInsightPanel';

// Recharts (~350 KB with d3) loads only when a chart actually renders.
// Numbers and tables paint first; the chart fills in a beat later.
const TrackerCharts = lazy(() => import('../../components/TrackerCharts'));

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const fmt = (n) => new Intl.NumberFormat('en-IE', { maximumFractionDigits: 1 }).format(n || 0);

const shortDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return iso;
  return `${DOW[new Date(y, m - 1, d).getDay()]} ${d}`;
};

const ACTIVITY_COLS = [
  { key: 'linkedin_sent',         label: 'LinkedIn messages', short: 'LI msg',  color: '#7C3AED' },
  { key: 'linkedin_invites_sent', label: 'LinkedIn invites',  short: 'Invites', color: '#0891B2' },
  { key: 'calls_made',            label: 'Calls made',        short: 'Calls',   color: '#D97706' },
  { key: 'emails_sent',           label: 'Emails sent',       short: 'Emails',  color: '#4468B0' },
  { key: 'job_portal_research',   label: 'Job portals',       short: 'Portals', color: '#059669' },
];

const OUTCOME_COLS = [
  { key: 'replies_received', label: 'Replies',   icon: 'reply' },
  { key: 'meetings_booked',  label: 'Meetings',  icon: 'event_available' },
  { key: 'proposals_sent',   label: 'Proposals', icon: 'description' },
  { key: 'new_leads_added',  label: 'New leads', icon: 'person_add' },
];

const scaleTarget = (weeklyMin, granularity) => {
  if (!weeklyMin) return null;
  if (granularity === 'day')   return Math.round(weeklyMin / 5);
  if (granularity === 'month') return Math.round(weeklyMin * 4.33);
  return weeklyMin;
};

/* ── Presentational pieces ─────────────────────────────────── */

const Delta = ({ current, prior }) => {
  const c = Number(current || 0), p = Number(prior || 0);
  if (!p) return <span style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)' }}>—</span>;
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return <span style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)' }}>0%</span>;
  const up = pct > 0;
  return (
    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: up ? '#006633' : '#B91C1C', display: 'inline-flex', alignItems: 'center' }}>
      <Icon name={up ? 'arrow_upward' : 'arrow_downward'} style={{ fontSize: '0.75rem' }} />
      {Math.abs(pct)}%
    </span>
  );
};

/** Thin progress bar — reads faster at a glance than "42 / target 50". */
const TargetBar = ({ value, target, color }) => {
  if (!target) return null;
  const pct = Math.min(100, Math.round((value / target) * 100));
  const hit = value >= target;
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--outline-variant)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: hit ? '#006633' : color, transition: 'width 0.35s ease' }} />
      </div>
      <div style={{ fontSize: '0.625rem', color: hit ? '#006633' : 'var(--on-surface-variant)', fontWeight: 600, marginTop: '0.25rem' }}>
        {pct}% of {target}
      </div>
    </div>
  );
};

/** Holds layout while data loads so the page never jumps. */
const Skeleton = ({ h = 16, w = '100%', r = 6, style = {} }) => (
  <div style={{
    height: h, width: w, borderRadius: r, background: 'var(--outline-variant)',
    opacity: 0.4, animation: 'nx-pulse 1.4s ease-in-out infinite', ...style,
  }} />
);

const SkeletonCards = ({ n, min }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} style={{ background: 'var(--surface-container)', borderRadius: '0.875rem', padding: '0.875rem 1rem' }}>
        <Skeleton h={11} w="60%" />
        <Skeleton h={26} w="45%" style={{ marginTop: '0.625rem' }} />
        <Skeleton h={4} style={{ marginTop: '0.75rem' }} />
      </div>
    ))}
  </div>
);

/* ── Page ──────────────────────────────────────────────────── */

export default function SalesTrackerCEO() {
  const { isAdmin, isViewer } = useAuth();
  const { isMobile } = useBreakpoint();
  const isPrivileged = isAdmin || isViewer;

  const todayISO = useMemo(() => toISO(new Date()), []);

  const [granularity, setGranularity] = useState('day');
  const [anchor,      setAnchor]      = useState(todayISO);
  const [userId,      setUserId]      = useState('');
  const [hidden,      setHidden]      = useState(() => new Set());
  const [drillDate,   setDrillDate]   = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [insightOverride, setInsightOverride] = useState(null);
  const [genError,    setGenError]    = useState('');

  const params = useMemo(
    () => ({ granularity, anchor, ...(userId ? { user_id: userId } : {}) }),
    [granularity, anchor, userId]
  );

  const { data, loading, isStale, error } =
    useCachedPeriodData(salesTrackerAPI.getSummary, 'summary', params);

  const { data: insightData, loading: aiLoading } =
    useCachedPeriodData(salesTrackerAPI.getInsights, 'insights', params);

  // Rep list — fixed cache key so it is fetched once per session, not per period
  const { data: userList } = useCachedPeriodData(
    () => salesTrackerAPI.getTrackerUsers(),
    'users',
    { granularity: 'static', anchor: 'static', user_id: '' },
    { enabled: isPrivileged }
  );
  const users = Array.isArray(userList) ? userList : [];

  const insight = insightOverride || insightData;

  const handlePeriodChange = useCallback(({ granularity: g, anchor: a }) => {
    setGranularity(g); setAnchor(a); setDrillDate(null); setInsightOverride(null);
  }, []);

  const toggleMetric = (key) => {
    setHidden(prev => {
      const next = new Set(prev);
      // Never allow hiding every series — an empty chart is a bug, not a feature
      if (next.has(key)) next.delete(key);
      else if (next.size < ACTIVITY_COLS.length - 1) next.add(key);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true); setGenError('');
    try {
      const res = await salesTrackerAPI.generateInsights(params);
      setInsightOverride(res.data);
    } catch (e) {
      setGenError(e?.response?.data?.detail || 'Could not generate the AI review.');
    } finally {
      setGenerating(false);
    }
  };

  /* ── Derived ── */

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map(s => ({
      label: shortDate(s.date),
      date:  s.date,
      ...ACTIVITY_COLS.reduce((a, c) => ({ ...a, [c.key]: s[c.key] || 0 }), {}),
      total: ACTIVITY_COLS.filter(c => !hidden.has(c.key))
                          .reduce((sum, c) => sum + (s[c.key] || 0), 0),
    }));
  }, [data, hidden]);

  const repChartData = useMemo(() => {
    if (!data?.by_rep) return [];
    return data.by_rep.map(r => ({
      label: (r.name || '').split(' ')[0] || 'Unknown',
      date:  r.user_id,
      ...ACTIVITY_COLS.reduce((a, c) => ({ ...a, [c.key]: r[c.key] || 0 }), {}),
    }));
  }, [data]);

  const periodLabel = useMemo(() => {
    const { start, end } = periodRange(granularity, anchor);
    if (granularity === 'day')   return `${start.getDate()} ${MONTHS[start.getMonth()]}`;
    if (granularity === 'month') return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    return `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }, [granularity, anchor]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows ? [...data.rows] : [];
    const filtered = drillDate ? rows.filter(r => String(r.log_date).slice(0, 10) === drillDate) : rows;
    return filtered.sort((a, b) => String(a.log_date).localeCompare(String(b.log_date)));
  }, [data, drillDate]);

  const exportCSV = () => {
    if (!data?.rows?.length) return;
    const headers = ['Date','Day','Rep','LinkedIn messages','LinkedIn invites','Calls made',
                     'Emails sent','Job portals researched','Replies','Meetings booked',
                     'Proposals sent','Hours','Notes'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    [...data.rows].sort((a, b) => String(a.log_date).localeCompare(String(b.log_date)))
      .forEach(r => lines.push([
        r.log_date, r.day_of_week, r.logged_by_name, r.linkedin_sent,
        r.linkedin_invites_sent, r.calls_made, r.emails_sent, r.job_portal_research,
        r.replies_received, r.meetings_booked, r.proposals_sent, r.hours_worked, r.daily_notes,
      ].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sales-tracker-${granularity}-${anchor}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const totals = data?.totals || {};
  const prior  = data?.prior_totals || {};

  const card = {
    background: 'var(--surface)', borderRadius: '0.875rem',
    border: '1px solid var(--outline-variant)', padding: '1rem 1.25rem', marginBottom: '1.25rem',
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
      {/* Scoped keyframes — no global stylesheet edit needed */}
      <style>{`@keyframes nx-pulse{0%,100%{opacity:.4}50%{opacity:.7}}`}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Activity Tracker</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: '0.25rem 0 0' }}>
            {isPrivileged ? 'Team activity across every rep' : 'Your logged activity'}
            {isStale && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>· refreshing…</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportCSV} disabled={!data?.rows?.length}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'transparent', fontSize: '0.8125rem', fontWeight: 600, cursor: data?.rows?.length ? 'pointer' : 'not-allowed', opacity: data?.rows?.length ? 1 : 0.5, color: 'var(--on-surface)' }}>
            <Icon name="download" style={{ fontSize: '1rem' }} /> Export
          </button>
          <a href="/sales/activity-log"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.875rem', borderRadius: '0.5rem', background: 'var(--primary)', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'none' }}>
            <Icon name="edit_note" style={{ fontSize: '1rem', color: '#fff' }} /> Log activity
          </a>
        </div>
      </div>

      <PeriodSelector
        granularity={granularity} anchor={anchor} onChange={handlePeriodChange}
        users={users} userId={userId}
        onUserChange={(v) => { setUserId(v); setDrillDate(null); setInsightOverride(null); }}
        showUserFilter={isPrivileged}
      />

      {(error || genError) && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: 'var(--error-container)', color: 'var(--error)', fontSize: '0.8125rem', marginBottom: '1rem' }}>
          {error || genError}
        </div>
      )}

      {/* Activity KPIs — clicking one shows/hides that series in the chart */}
      {loading && !data ? <SkeletonCards n={5} min={isMobile ? 130 : 155} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 155}px, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
          {ACTIVITY_COLS.map(c => {
            const off = hidden.has(c.key);
            const tgt = scaleTarget(data?.targets?.[c.key]?.min, granularity);
            const val = totals[c.key] || 0;
            return (
              <button key={c.key} onClick={() => toggleMetric(c.key)}
                title={off ? 'Show in chart' : 'Hide from chart'}
                style={{
                  textAlign: 'left', border: '1px solid', borderRadius: '0.875rem',
                  borderColor: 'var(--outline-variant)',
                  borderLeft: `3px solid ${off ? 'var(--outline-variant)' : c.color}`,
                  background: off ? 'transparent' : 'var(--surface-container)',
                  padding: '0.875rem 1rem', cursor: 'pointer', opacity: off ? 0.5 : 1,
                  transition: 'opacity 0.2s, background 0.2s', font: 'inherit', color: 'inherit',
                }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginBottom: '0.25rem' }}>{c.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{fmt(val)}</span>
                  <Delta current={val} prior={prior[c.key]} />
                </div>
                <TargetBar value={val} target={tgt} color={c.color} />
              </button>
            );
          })}
        </div>
      )}

      {loading && !data ? <SkeletonCards n={4} min={isMobile ? 130 : 155} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 155}px, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
          {OUTCOME_COLS.map(c => (
            <div key={c.key} style={{ background: 'var(--surface-container)', borderRadius: '0.875rem', padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
                <Icon name={c.icon} style={{ fontSize: '0.9375rem', color: 'var(--on-surface-variant)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{c.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{fmt(totals[c.key])}</span>
                <Delta current={totals[c.key]} prior={prior[c.key]} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>
            {granularity === 'day' ? 'Activity by rep' : 'Activity over the period'}
          </h2>
          {drillDate ? (
            <button onClick={() => setDrillDate(null)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.625rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'transparent', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', color: 'var(--primary)' }}>
              <Icon name="close" style={{ fontSize: '0.875rem' }} /> Clear {shortDate(drillDate)}
            </button>
          ) : granularity !== 'day' && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)' }}>Click a bar to filter the table below</span>
          )}
        </div>

        {loading && !data ? (
          <Skeleton h={300} r={10} />
        ) : (
          <Suspense fallback={<Skeleton h={300} r={10} />}>
            <TrackerCharts
              mode={granularity === 'day' ? 'day' : 'period'}
              data={granularity === 'day' ? repChartData : chartData}
              cols={ACTIVITY_COLS}
              hidden={hidden}
              selectedDate={drillDate}
              onSelect={(d) => setDrillDate(prev => (prev === d ? null : d))}
              height={300}
            />
          </Suspense>
        )}
      </div>

      {isPrivileged && data?.by_rep?.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: 0, marginBottom: '0.875rem' }}>By rep</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: 620 }}>
              <thead>
                <tr style={{ color: 'var(--on-surface-variant)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.5rem 0.5rem 0', fontWeight: 600 }}>Rep</th>
                  <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Days</th>
                  {ACTIVITY_COLS.map(c => (
                    <th key={c.key} style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center', opacity: hidden.has(c.key) ? 0.4 : 1 }}>{c.short}</th>
                  ))}
                  <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.by_rep.map(r => {
                  const top = data.by_rep[0]?.total_touches || 1;
                  return (
                    <tr key={r.user_id || r.name} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                      <td style={{ padding: '0.625rem 0.5rem 0.625rem 0', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center', color: 'var(--on-surface-variant)' }}>{r.days_logged}</td>
                      {ACTIVITY_COLS.map(c => (
                        <td key={c.key} style={{ padding: '0.625rem 0.5rem', textAlign: 'center', opacity: hidden.has(c.key) ? 0.4 : 1 }}>{fmt(r[c.key])}</td>
                      ))}
                      <td style={{ padding: '0.625rem 0.5rem', minWidth: 90 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round((r.total_touches / top) * 100)}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
                          </div>
                          <strong style={{ minWidth: 28, textAlign: 'right' }}>{fmt(r.total_touches)}</strong>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={card}>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: 0, marginBottom: '0.875rem' }}>
          Daily entries {drillDate && <span style={{ fontWeight: 500, color: 'var(--on-surface-variant)' }}>· {shortDate(drillDate)}</span>}
        </h2>
        {loading && !data ? (
          <>{[0,1,2].map(i => <Skeleton key={i} h={34} style={{ marginBottom: '0.5rem' }} />)}</>
        ) : !visibleRows.length ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: 0 }}>Nothing logged for this period.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: 720 }}>
              <thead>
                <tr style={{ color: 'var(--on-surface-variant)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.5rem 0.5rem 0', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0.5rem', fontWeight: 600 }}>Rep</th>
                  {ACTIVITY_COLS.map(c => (
                    <th key={c.key} style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center', opacity: hidden.has(c.key) ? 0.4 : 1 }}>{c.short}</th>
                  ))}
                  <th style={{ padding: '0.5rem', fontWeight: 600, minWidth: 180 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={`${r.log_date}-${r.logged_by}`} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                    <td style={{ padding: '0.625rem 0.5rem 0.625rem 0', whiteSpace: 'nowrap' }}>{shortDate(r.log_date)}</td>
                    <td style={{ padding: '0.625rem 0.5rem', whiteSpace: 'nowrap' }}>{r.logged_by_name}</td>
                    {ACTIVITY_COLS.map(c => (
                      <td key={c.key} style={{ padding: '0.625rem 0.5rem', textAlign: 'center', opacity: hidden.has(c.key) ? 0.4 : 1 }}>{r[c.key] || 0}</td>
                    ))}
                    <td style={{ padding: '0.625rem 0.5rem', color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>{r.daily_notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AIInsightPanel
        insight={insight} loading={aiLoading} canGenerate={isPrivileged}
        generating={generating} onGenerate={handleGenerate} periodLabel={periodLabel}
      />
    </div>
  );
}
