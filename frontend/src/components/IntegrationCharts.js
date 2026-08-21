import React, { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';

/**
 * Recharts is isolated here so IntegrationsDashboard can React.lazy it —
 * same pattern as TrackerCharts.js. Both pages share the ~350 KB chunk, so
 * visiting the second one costs nothing extra.
 */

const TOOLTIP_STYLE = {
  fontSize: '0.75rem', borderRadius: '0.625rem',
  border: '1px solid var(--outline-variant)', background: 'var(--surface)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: '0.5rem 0.75rem',
};

const SERIES = [
  { key: 'cloudtalk_calls_total',    name: 'Calls',    color: '#D97706', type: 'bar' },
  { key: 'cloudtalk_calls_answered', name: 'Answered', color: '#059669', type: 'bar' },
  { key: 'apollo_emails_sent',       name: 'Emails',   color: '#4468B0', type: 'bar' },
  { key: 'apollo_emails_replied',    name: 'Replies',  color: '#7C3AED', type: 'area' },
];

/** Legend item look when a series is toggled off — dim + strikethrough, with
 * a CSS transition so clicking it gives a small "settling into place"
 * animation instead of an abrupt jump. */
const legendItemStyle = (isHidden) => ({
  opacity: isHidden ? 0.4 : 1,
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
    value: s.name, type: 'circle', id: s.key, color: s.color, payload: { dataKey: s.key },
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
        <ComposedChart data={data.map(d => ({ ...d, label: String(d.date).slice(5) }))}
                       margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
          <defs>
            {active.filter(s => s.type === 'area').map(s => (
              <linearGradient key={s.key} id={`nx-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--outline-variant)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip content={<Tip />} cursor={{ fill: 'var(--outline-variant)', opacity: 0.25 }} />
          <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8, cursor: 'pointer' }}
                  iconType="circle" iconSize={8} payload={legendPayload}
                  onClick={handleLegendClick} formatter={legendFormatter} />
          {active.filter(s => s.type === 'bar').map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={26}
                 hide={hiddenKeys.has(s.key)} animationDuration={550} animationEasing="ease-out" />
          ))}
          {active.filter(s => s.type === 'area').map(s => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={s.color} strokeWidth={2} fill={`url(#nx-grad-${s.key})`}
                  dot={{ r: 3, strokeWidth: 0, fill: s.color }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--surface)' }}
                  hide={hiddenKeys.has(s.key)} animationDuration={650} animationEasing="ease-out" />
          ))}
          {active.filter(s => s.type === 'line').map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: s.color }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--surface)' }}
                  hide={hiddenKeys.has(s.key)} animationDuration={650} animationEasing="ease-out" />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
