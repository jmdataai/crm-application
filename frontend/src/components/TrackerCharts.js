import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';

/**
 * All recharts usage lives in THIS file only.
 *
 * WHY: recharts + d3 is roughly 300-400 KB of JS. If it is imported directly
 * by the page component it lands in the main bundle and every user pays for it
 * on first load, even on pages with no charts. Isolating it here lets the page
 * pull it in with React.lazy, so the numbers and tables paint immediately and
 * the chart arrives a moment later. On a slow connection that is the
 * difference between a usable page in 1s and a blank screen for 6s.
 *
 * Nothing here fetches — it renders whatever props it is handed.
 */

const TOOLTIP_STYLE = {
  fontSize: '0.75rem',
  borderRadius: '0.625rem',
  border: '1px solid var(--outline-variant)',
  background: 'var(--surface)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  padding: '0.5rem 0.75rem',
};

/** Custom tooltip: totals the stack and hides zero rows, which recharts won't. */
const SmartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => (p.value || 0) > 0);
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 700, marginBottom: '0.375rem' }}>{label}</div>
      {rows.length === 0 ? (
        <div style={{ color: 'var(--on-surface-variant)' }}>No activity</div>
      ) : rows.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', lineHeight: 1.7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{p.name}</span>
          <strong>{p.value}</strong>
        </div>
      ))}
      {rows.length > 1 && (
        <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '0.375rem', paddingTop: '0.375rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total</span><span>{total}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Period chart.
 *  - day view   -> grouped bars, one cluster per rep
 *  - week/month -> stacked bars per date + a total trend line
 *
 * `hidden` is a Set of metric keys to omit, driven by the KPI card toggles.
 * `onSelect` fires with the clicked date so the parent can drill in.
 */
export default function TrackerCharts({
  mode,              // 'day' | 'period'
  data,
  cols,
  hidden = new Set(),
  onSelect,
  selectedDate = null,
  height = 300,
}) {
  const visible = useMemo(() => cols.filter(c => !hidden.has(c.key)), [cols, hidden]);

  if (!data?.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', fontSize: '0.8125rem' }}>
        Nothing logged in this period.
      </div>
    );
  }

  const axis = {
    tick: { fontSize: 11, fill: 'var(--on-surface-variant)' },
    stroke: 'var(--outline-variant)',
    tickLine: false,
  };

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        {mode === 'day' ? (
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 4 }} barGap={2}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--outline-variant)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} {...axis} />
            <YAxis allowDecimals={false} axisLine={false} {...axis} />
            <Tooltip content={<SmartTooltip />} cursor={{ fill: 'var(--outline-variant)', opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }} iconType="circle" iconSize={8} />
            {visible.map(c => (
              <Bar key={c.key} dataKey={c.key} name={c.short} fill={c.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
            ))}
          </BarChart>
        ) : (
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
            onClick={(e) => {
              const d = e?.activePayload?.[0]?.payload?.date;
              if (d && onSelect) onSelect(d);
            }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="var(--outline-variant)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} {...axis} />
            <YAxis allowDecimals={false} axisLine={false} {...axis} />
            <Tooltip content={<SmartTooltip />} cursor={{ fill: 'var(--outline-variant)', opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }} iconType="circle" iconSize={8} />
            {visible.map((c, i) => (
              <Bar key={c.key} dataKey={c.key} name={c.short} stackId="a" fill={c.color} maxBarSize={40}
                   radius={i === visible.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                {/* Dim every bar except the selected day, so drill-down is obvious */}
                {data.map(d => (
                  <Cell key={d.date}
                        opacity={!selectedDate || d.date === selectedDate ? 1 : 0.35}
                        cursor="pointer" />
                ))}
              </Bar>
            ))}
            <Line type="monotone" dataKey="total" name="Total"
                  stroke="var(--on-surface)" strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: 'var(--on-surface)' }}
                  activeDot={{ r: 5 }} />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
