import React, { useState, useMemo, Suspense, lazy, useCallback } from 'react';
import { integrationsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import useCachedPeriodData from '../hooks/useCachedPeriodData';

// Same lazy-chart pattern as the tracker — recharts stays out of the main bundle
const IntegrationCharts = lazy(() => import('../components/IntegrationCharts'));

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const fmt = (n) => new Intl.NumberFormat('en-IE', { maximumFractionDigits: 1 }).format(n || 0);

const mmss = (sec) => {
  const s = Math.round(Number(sec) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};

const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** Monday-start week, matching how the desk (Dublin-based) counts a work week. */
const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

/** Apollo-style timeframe presets. Recomputed on mount so "Today" etc. stay correct. */
function buildPresets() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = addDays(today, -1);
  const curWeekStart = startOfWeek(today);
  const prevWeekEnd = addDays(curWeekStart, -1);
  const prevWeekStart = addDays(prevWeekEnd, -6);
  const curMonthStart = startOfMonth(today);
  const prevMonthEnd = addDays(curMonthStart, -1);
  const prevMonthStart = startOfMonth(prevMonthEnd);

  return [
    { key: 'today',      label: 'Today',         start: today,          end: today },
    { key: 'yesterday',  label: 'Yesterday',      start: yesterday,      end: yesterday },
    { key: 'cur_week',   label: 'Current week',   start: curWeekStart,   end: today },
    { key: 'prev_week',  label: 'Previous week',  start: prevWeekStart,  end: prevWeekEnd },
    { key: 'last7',      label: 'Last 7 days',    start: addDays(today, -6),  end: today },
    { key: 'last30',     label: 'Last 30 days',   start: addDays(today, -29), end: today },
    { key: 'cur_month',  label: 'Current month',  start: curMonthStart,  end: today },
    { key: 'prev_month', label: 'Previous month', start: prevMonthStart, end: prevMonthEnd },
    { key: 'last90',     label: 'Last 90 days',   start: addDays(today, -89), end: today },
    { key: 'custom',     label: 'Custom range',   start: null,           end: null },
  ];
}

/** Dispositions carried over from the manual call-cadence sheet. */
const DISPOSITION_TONE = {
  'interested': '#006633', 'sale : interested': '#006633',
  'vm': '#D97706', 'voicemail': '#D97706', 'gatekeeper': '#D97706',
  'no ring': '#6B7280', 'hung up': '#B91C1C', 'not interested': '#B91C1C',
  'not fit': '#B91C1C', 'not allowed': '#B91C1C', 'not found': '#6B7280',
  'do not call': '#B91C1C',
};
const toneFor = (label) => DISPOSITION_TONE[String(label).toLowerCase().trim()] || '#4468B0';

const Skeleton = ({ h = 16, w = '100%', r = 6, style = {} }) => (
  <div style={{ height: h, width: w, borderRadius: r, background: 'var(--outline-variant)',
                opacity: 0.4, animation: 'nx-pulse 1.4s ease-in-out infinite', ...style }} />
);

/** Connection pill — shows exactly why a source is dark, not just that it is. */
const StatusPill = ({ name, state }) => {
  const configured = state?.configured;
  const ok = state?.ok;
  const tone = !configured ? '#6B7280' : ok ? '#006633' : '#B91C1C';
  const text = !configured ? 'Not configured' : ok ? 'Connected' : 'Error';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem',
                  borderRadius: '0.625rem', border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}
             title={state?.detail || text}>
          {text}{state?.last_sync ? ` · synced ${String(state.last_sync.metric_date).slice(5)}` : ''}
        </div>
      </div>
    </div>
  );
};

const Kpi = ({ label, value, sub, icon, accent }) => (
  <div style={{ background: 'var(--surface-container)', borderRadius: '0.875rem',
                padding: '0.875rem 1rem', borderLeft: `3px solid ${accent || 'var(--primary)'}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
      {icon && <Icon name={icon} style={{ fontSize: '0.9375rem', color: 'var(--on-surface-variant)' }} />}
      <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{label}</span>
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', marginTop: '0.125rem' }}>{sub}</div>}
  </div>
);

export default function IntegrationsDashboard() {
  const { isAdmin, isViewer } = useAuth();
  const { isMobile } = useBreakpoint();
  const isPrivileged = isAdmin || isViewer;

  const presets = useMemo(buildPresets, []);
  // Default: closest match to the old 14-day default without inventing a
  // preset Apollo doesn't have — 30 days gives a fuller, still-recent view.
  const [presetKey, setPresetKey] = useState('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedRange, setAppliedRange] = useState(() => {
    const p = presets.find((x) => x.key === 'last30');
    return { start: toISO(p.start), end: toISO(p.end) };
  });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const handlePresetChange = useCallback((key) => {
    setPresetKey(key);
    if (key === 'custom') return; // wait for Apply — see handleApplyCustom
    const p = presets.find((x) => x.key === key);
    if (p) setAppliedRange({ start: toISO(p.start), end: toISO(p.end) });
  }, [presets]);

  const handleApplyCustom = useCallback(() => {
    if (!customStart || !customEnd) return;
    setAppliedRange({ start: customStart, end: customEnd });
  }, [customStart, customEnd]);

  const params = useMemo(() => ({
    granularity: 'range', anchor: `${appliedRange.start}_${appliedRange.end}`, user_id: '',
  }), [appliedRange]);

  const { data, loading, isStale, error, refetch } = useCachedPeriodData(
    () => integrationsAPI.getDashboard({ start: appliedRange.start, end: appliedRange.end }),
    'integ-dash', params
  );

  const { data: status, refetch: refetchStatus } = useCachedPeriodData(
    () => integrationsAPI.getStatus(), 'integ-status',
    { granularity: 'static', anchor: 'static', user_id: '' }
  );

  const handleSync = useCallback(async () => {
    setSyncing(true); setSyncMsg('');
    try {
      // Sending start/end backfills CloudTalk's real per-day history across
      // the currently-selected range (not just "yesterday") — see
      // sync_cloudtalk_range on the backend. Apollo has no per-day history
      // to backfill, so it always just refreshes its one live snapshot
      // regardless of range.
      const res = await integrationsAPI.sync({
        source: 'all', start: appliedRange.start, end: appliedRange.end,
      });
      const ct = res.data?.cloudtalk, ap = res.data?.apollo;
      const ctMsg = ct?.skipped ? 'not configured'
        : ct?.ok ? (ct?.days_synced ? `${ct.days_synced} day(s) backfilled, ${ct.calls} calls` : `${ct.calls} calls`)
        : ct?.detail;
      setSyncMsg(
        `CloudTalk: ${ctMsg} · ` +
        `Apollo: ${ap?.skipped ? 'not configured' : ap?.ok ? `${ap.sequences} sequences (live snapshot)` : ap?.detail}`
      );
      refetch(); refetchStatus();
    } catch (e) {
      setSyncMsg(e?.response?.data?.detail || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }, [refetch, refetchStatus, appliedRange]);

  const ct = data?.totals?.cloudtalk || {};
  const ap = data?.totals?.apollo || {};
  const configured = data?.configured || {};
  const nothingConfigured = configured.apollo === false && configured.cloudtalk === false;

  const card = {
    background: 'var(--surface)', borderRadius: '0.875rem',
    border: '1px solid var(--outline-variant)', padding: '1rem 1.25rem', marginBottom: '1.25rem',
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`@keyframes nx-pulse{0%,100%{opacity:.4}50%{opacity:.7}}`}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Outreach Command Centre</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: '0.25rem 0 0' }}>
            CloudTalk calls and Apollo sequences in one view
            {isStale && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>· refreshing…</span>}
          </p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', margin: '0.125rem 0 0', opacity: 0.8 }}>
            Switching the range only re-reads what's already stored — press Sync now to backfill real CloudTalk history for it.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={presetKey} onChange={(e) => handlePresetChange(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
                     background: 'var(--surface-container)', color: 'var(--on-surface)',
                     fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
            {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {presetKey === 'custom' && (
            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={customStart} max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ padding: '0.4375rem 0.5rem', borderRadius: '0.5rem',
                         border: '1px solid var(--outline-variant)', fontSize: '0.8125rem',
                         background: 'var(--surface-container)', color: 'var(--on-surface)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>to</span>
              <input type="date" value={customEnd} min={customStart || undefined}
                max={toISO(new Date())}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ padding: '0.4375rem 0.5rem', borderRadius: '0.5rem',
                         border: '1px solid var(--outline-variant)', fontSize: '0.8125rem',
                         background: 'var(--surface-container)', color: 'var(--on-surface)' }} />
              <button onClick={handleApplyCustom} disabled={!customStart || !customEnd}
                style={{ padding: '0.4375rem 0.75rem', borderRadius: '0.5rem', border: 'none',
                         background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', fontWeight: 700,
                         cursor: (!customStart || !customEnd) ? 'not-allowed' : 'pointer',
                         opacity: (!customStart || !customEnd) ? 0.5 : 1 }}>
                Apply
              </button>
            </div>
          )}
          {isPrivileged && (
            <button onClick={handleSync} disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.875rem',
                       borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
                       background: 'transparent', fontSize: '0.8125rem', fontWeight: 600,
                       cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1, color: 'var(--on-surface)' }}>
              <Icon name="sync" style={{ fontSize: '1rem' }} /> {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      {/* Connection state — first thing you look at when a number seems wrong */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <StatusPill name="CloudTalk" state={status?.cloudtalk} />
        <StatusPill name="Apollo"    state={status?.apollo} />
      </div>

      {syncMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: 'var(--surface-container)',
                      fontSize: '0.8125rem', marginBottom: '1rem' }}>{syncMsg}</div>
      )}
      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: 'var(--error-container)',
                      color: 'var(--error)', fontSize: '0.8125rem', marginBottom: '1rem' }}>{error}</div>
      )}

      {nothingConfigured && !loading && (
        <div style={{ ...card, textAlign: 'center', padding: '2rem 1.25rem' }}>
          <Icon name="link_off" style={{ fontSize: '2rem', color: 'var(--on-surface-variant)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>No sources connected yet</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: 0 }}>
            Add the CloudTalk and Apollo keys to the backend Space secrets, then press Sync now.
            See INTEGRATIONS_SETUP.md for where to find each key.
          </p>
        </div>
      )}

      {/* CloudTalk */}
      {configured.cloudtalk !== false && (
        <>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 0.75rem',
                       display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="call" style={{ fontSize: '1rem' }} /> Calls
          </h2>
          {loading && !data ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 155}px, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[0,1,2,3,4].map(i => <Skeleton key={i} h={92} r={14} />)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 155}px, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
              <Kpi label="Calls made"    value={fmt(ct.calls_total)}    icon="call"          accent="#D97706" />
              <Kpi label="Answered"      value={fmt(ct.calls_answered)} icon="call_received" accent="#059669"
                   sub="Excludes voicemail" />
              <Kpi label="Voicemail"     value={fmt(ct.calls_voicemail)} icon="voicemail"     accent="#D97706" />
              <Kpi label="Missed"        value={fmt(ct.calls_missed)}   icon="call_missed"   accent="#B91C1C" />
              <Kpi label="Answer rate"   value={`${fmt(ct.answer_rate)}%`} icon="percent"    accent="#0891B2" />
              <Kpi label="Talk time"     value={mmss(ct.talk_time_sec)} icon="schedule"      accent="#7C3AED" />
              <Kpi label="Avg call"      value={mmss(ct.avg_talk_sec)}  icon="timer"         accent="#4468B0" />
              <Kpi label="Avg wait"      value={mmss(ct.avg_waiting_sec)} icon="hourglass_top" accent="#6B7280" />
            </div>
          )}
        </>
      )}

      {/* Apollo */}
      {configured.apollo !== false && (
        <>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 0.75rem',
                       display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="mail" style={{ fontSize: '1rem' }} /> Sequences
          </h2>
          {loading && !data ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 155}px, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[0,1,2,3,4].map(i => <Skeleton key={i} h={92} r={14} />)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 155}px, 1fr))`, gap: '0.75rem', marginBottom: '1.25rem' }}>
              <Kpi label="Emails sent"  value={fmt(ap.emails_sent)}      icon="send"       accent="#4468B0" />
              <Kpi label="Open rate"    value={`${fmt(ap.open_rate)}%`}  icon="drafts"     accent="#0891B2" />
              <Kpi label="Reply rate"   value={`${fmt(ap.reply_rate)}%`} icon="reply"      accent="#059669" />
              <Kpi label="Bounce rate"  value={`${fmt(ap.bounce_rate)}%`} icon="error"
                   accent={Number(ap.bounce_rate) > 3 ? '#B91C1C' : '#6B7280'}
                   sub={Number(ap.bounce_rate) > 3 ? 'Above 3% — check list hygiene' : null} />
              <Kpi label="Sequences"    value={fmt(ap.sequences_count)}  icon="list_alt"   accent="#7C3AED" />
            </div>
          )}
        </>
      )}

      {/* Trend */}
      <div style={card}>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: 0, marginBottom: '0.875rem' }}>Daily trend</h2>
        {loading && !data ? <Skeleton h={280} r={10} /> : (
          <Suspense fallback={<Skeleton h={280} r={10} />}>
            <IntegrationCharts mode="trend" data={data?.series || []} height={280} />
          </Suspense>
        )}
      </div>

      {/* Dispositions — replaces the manual Remarks column */}
      {data?.dispositions?.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: 0, marginBottom: '0.25rem' }}>Call outcomes</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', margin: '0 0 0.875rem' }}>
            Pulled from CloudTalk automatically — this is the "Remarks" column from the call sheet.
          </p>
          {data.dispositions.map(d => {
            const top = data.dispositions[0].count || 1;
            return (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', minWidth: 130, textTransform: 'capitalize' }}>{d.label}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((d.count / top) * 100)}%`, height: '100%',
                                background: toneFor(d.label), borderRadius: 4 }} />
                </div>
                <strong style={{ fontSize: '0.8125rem', minWidth: 34, textAlign: 'right' }}>{fmt(d.count)}</strong>
              </div>
            );
          })}
        </div>
      )}

      {/* Incoming vs outgoing */}
      {data?.call_types?.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: 0, marginBottom: '0.875rem' }}>Call type</h2>
          {data.call_types.map(ctp => {
            const top = data.call_types[0].count || 1;
            return (
              <div key={ctp.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', minWidth: 130, textTransform: 'capitalize' }}>{ctp.label}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((ctp.count / top) * 100)}%`, height: '100%',
                                background: ctp.label === 'incoming' ? '#059669' : '#4468B0', borderRadius: 4 }} />
                </div>
                <strong style={{ fontSize: '0.8125rem', minWidth: 34, textAlign: 'right' }}>{fmt(ctp.count)}</strong>
              </div>
            );
          })}
        </div>
      )}

      {/* Agent leaderboard */}
      {data?.agents?.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: 0, marginBottom: '0.875rem' }}>By agent</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: 480 }}>
              <thead>
                <tr style={{ color: 'var(--on-surface-variant)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.5rem 0.5rem 0', fontWeight: 600 }}>Agent</th>
                  <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Calls</th>
                  <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Answered</th>
                  <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Rate</th>
                  <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Talk time</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map(a => {
                  const rate = a.calls_total ? (a.calls_answered / a.calls_total) * 100 : 0;
                  return (
                    <tr key={a.name} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                      <td style={{ padding: '0.625rem 0.5rem 0.625rem 0', fontWeight: 600 }}>{a.name}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>{fmt(a.calls_total)}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>{fmt(a.calls_answered)}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center',
                                   color: rate >= 30 ? '#006633' : rate >= 15 ? 'var(--on-surface)' : '#B91C1C',
                                   fontWeight: 600 }}>{rate.toFixed(0)}%</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>{mmss(a.talk_time_sec)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
