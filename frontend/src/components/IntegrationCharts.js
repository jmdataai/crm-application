import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
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
  { key: 'apollo_emails_replied',    name: 'Replies',  color: '#7C3AED', type: 'line' },
];

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
  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--on-surface-variant)', fontSize: '0.8125rem', textAlign: 'center', padding: '0 1rem' }}>
        No synced data yet. Press "Sync now" once the API keys are in place.
      </div>
    );
  }

  // Only plot series that actually carry data — an all-zero legend entry is noise
  const active = SERIES.filter(s => data.some(d => Number(d[s.key]) > 0));

  const axis = { tick: { fontSize: 11, fill: 'var(--on-surface-variant)' },
                 stroke: 'var(--outline-variant)', tickLine: false, axisLine: false };

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data.map(d => ({ ...d, label: String(d.date).slice(5) }))}
                       margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--outline-variant)" vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip content={<Tip />} cursor={{ fill: 'var(--outline-variant)', opacity: 0.25 }} />
          <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }} iconType="circle" iconSize={8} />
          {active.filter(s => s.type === 'bar').map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={26} />
          ))}
          {active.filter(s => s.type === 'line').map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: s.color }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
