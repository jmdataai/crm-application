import React, { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';

/**
 * Recharts is isolated here so IntegrationsDashboard can React.lazy it —
 * same pattern as TrackerCharts.js. Both pages share the ~350 KB chunk, so
 * visiting the second one costs nothing extra.
 *
 * Styled after a reference HUD dashboard, but with BAR series (explicitly
 * requested over lines/areas): rounded bar caps, square legend swatches,
 * click-a-legend-item to show/hide a series, and a long eased entrance
 * animation so the bars visibly grow up from the axis rather than snapping
 * into place. Each series keeps its own bar rather than stacking, so a
 * hidden series simply removes its bar instead of reshaping the others.
 */

const TOOLTIP_STYLE = {
  fontSize: '0.75rem', borderRadius: '0.625rem',
  border: '1px solid var(--outline-variant)', background: 'var(--surface)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.10)', padding: '0.625rem 0.875rem',
};

const SERIES = [
  { key: 'cloudtalk_calls_total',    name: 'Calls',    color: '#D97706' },
  { key: 'cloudtalk_calls_answered', name: 'Answered', color: '#059669' },
  { key: 'apollo_emails_sent',       name: 'Emails',   color: '#2563EB' },
  { key: 'apollo_emails_replied',    name: 'Replies',  color: '#7C3AED' },
];

/** Legend item look when a series is toggled off — dim + strikethrough, with
 * a CSS transition so clicking it gives a small "settling into place"
 * animation instead of an abrupt jump. */
const legendItemStyle = (isHidden) => ({
  opacity: isHidden ? 0.35 : 1,
  textDecoration: isHidden ? 'line-through' : 'none',
  transition: 'opacity 0.2s ease, text-decoration-color 0.2s ease',
});

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => (p.value || 0) > 0);
  if (!rows.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, marginBottom: '0.375rem' }}>{label}</div>
      {rows.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', lineHeight: 1.7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{p.name}</span>
          <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

export default function IntegrationCharts({ data = [], height = 280 }) {
  const [hiddenKeys, setHiddenKeys] = useState(new Set());
  const toggleKey = (key) => setHiddenKeys(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--on-surface-variant)', fontSize: '0.8125rem', textAlign: 'center', padding: '0 1rem' }}>
        No synced data yet. Press "Sync now" once the API keys are in place.
      </div>
    );
  }

  // Only offer series that actually carry data — an all-zero legend entry is
  // noise. Hide-toggle (via the legend click) applies on top of this.
  const active = SERIES.filter(s => data.some(d => Number(d[s.key]) > 0));
  const legendPayload = active.map(s => ({
    value: s.name, type: 'square', id: s.key, color: s.color, payload: { dataKey: s.key },
  }));
  const handleLegendClick = (entry) => {
    const key = entry?.payload?.dataKey ?? entry?.id;
    if (key) toggleKey(key);
  };
  const legendFormatter = (value, entry) => (
    <span style={legendItemStyle(hiddenKeys.has(entry?.payload?.dataKey ?? entry?.id))}>{value}</span>
  );

  const axis = { tick: { fontSize: 11, fill: 'var(--on-surface-variant)' },
                 stroke: 'var(--outline-variant)', tickLine: false, axisLine: false };

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data.map(d => ({ ...d, label: String(d.date).slice(5) }))}
                  margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
                  barGap={2} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="2 4" stroke="var(--outline-variant)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip content={<Tip />} cursor={{ fill: 'var(--outline-variant)', opacity: 0.2 }} />
          <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8, cursor: 'pointer' }}
                  iconType="square" iconSize={9} payload={legendPayload}
                  onClick={handleLegendClick} formatter={legendFormatter} />
          {active.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name}
                 fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22}
                 hide={hiddenKeys.has(s.key)}
                 animationDuration={900} animationEasing="ease-out" />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
