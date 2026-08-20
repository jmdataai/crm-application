import React from 'react';

/**
 * Renders cached AI coaching output. Shared by the tracker and the dashboard.
 *
 * Deliberately dumb: it never calls the LLM itself. The parent fetches the
 * cached insight and passes it down, so switching Day/Week/Month never
 * triggers a model call.
 */

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-IE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const Column = ({ title, icon, items, bg, color, border }) => (
  <div style={{
    background: bg, borderRadius: '0.75rem', padding: '0.875rem 1rem',
    border: `1px solid ${border}`, flex: '1 1 220px', minWidth: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
      <Icon name={icon} style={{ fontSize: '1rem', color }} />
      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color }}>{title}</span>
    </div>
    {items && items.length > 0 ? (
      <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {items.map((t, i) => (
          <li key={i} style={{ fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--on-surface)' }}>{t}</li>
        ))}
      </ul>
    ) : (
      <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: 0 }}>Nothing flagged.</p>
    )}
  </div>
);

export default function AIInsightPanel({
  insight,
  loading = false,
  canGenerate = false,
  generating = false,
  onGenerate,
  periodLabel = '',
}) {
  const has = insight && (
    (insight.went_well || []).length ||
    (insight.falling_short || []).length ||
    (insight.do_next || []).length
  );

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '0.75rem',
      border: '1px solid var(--outline-variant)', padding: '1rem 1.25rem', marginTop: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon name="auto_awesome" style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '0.9375rem', fontWeight: 700 }}>AI sales review</span>
          {periodLabel && (
            <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>· {periodLabel}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {insight?.generated_at && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)' }}>
              generated {fmtWhen(insight.generated_at)}
            </span>
          )}
          {canGenerate && (
            <button
              onClick={onGenerate}
              disabled={generating}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.375rem 0.75rem', borderRadius: '0.5rem',
                border: '1px solid var(--outline-variant)', background: 'transparent',
                fontSize: '0.75rem', fontWeight: 600,
                cursor: generating ? 'wait' : 'pointer',
                opacity: generating ? 0.6 : 1, color: 'var(--primary)',
              }}
            >
              <Icon name={generating ? 'hourglass_top' : 'refresh'} style={{ fontSize: '0.9375rem' }} />
              {generating ? 'Analysing…' : (has ? 'Regenerate' : 'Generate')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: 0 }}>Loading insight…</p>
      ) : !has ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: 0 }}>
          No review generated for this period yet.
          {canGenerate ? ' Click Generate to run one now.' : ' Reviews are generated automatically each morning.'}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Column
              title="Working well" icon="trending_up" items={insight.went_well}
              bg="rgba(0,98,67,0.08)" color="#006633" border="rgba(0,98,67,0.2)"
            />
            <Column
              title="Falling short" icon="trending_down" items={insight.falling_short}
              bg="rgba(239,68,68,0.07)" color="#B91C1C" border="rgba(239,68,68,0.2)"
            />
            <Column
              title="Do next" icon="checklist" items={insight.do_next}
              bg="var(--surface-container)" color="var(--on-surface)" border="var(--outline-variant)"
            />
          </div>

          {insight.risk_flag ? (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.75rem',
              padding: '0.625rem 0.875rem', borderRadius: '0.5rem',
              background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
            }}>
              <Icon name="warning" style={{ fontSize: '1rem', color: '#D97706', marginTop: 1 }} />
              <span style={{ fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.5 }}>{insight.risk_flag}</span>
            </div>
          ) : null}

          <p style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', marginTop: '0.75rem', marginBottom: 0 }}>
            AI-generated from logged activity. Sense-check before acting.
          </p>
        </>
      )}
    </div>
  );
}
