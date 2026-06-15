import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { salesTrackerAPI } from '../../services/api';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const fmtCurrency = (v) =>
  `€${Number(v || 0).toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Stage config — mirrors backend STAGE_PROBABILITY_MAP ─────
const STAGES = [
  { key: 'Cold Outreach',              color: '#6B7280', prob: 10  },
  { key: 'Engaged / Replied',          color: '#3B82F6', prob: 20  },
  { key: 'Discovery Call Booked',      color: '#8B5CF6', prob: 30  },
  { key: 'Discovery Done / Qualified', color: '#F59E0B', prob: 40  },
  { key: 'Proposal Sent',              color: '#F97316', prob: 60  },
  { key: 'Negotiation',                color: '#10B981', prob: 75  },
  { key: 'Closed-Won',                 color: '#006243', prob: 100 },
  { key: 'Closed-Lost',                color: '#BA1A1A', prob: 0   },
];

const STAGE_COLOR   = Object.fromEntries(STAGES.map(s => [s.key, s.color]));
const STAGE_PROB    = Object.fromEntries(STAGES.map(s => [s.key, s.prob]));
const ACTIVE_STAGES = STAGES.filter(s => !['Closed-Won', 'Closed-Lost'].includes(s.key));

// ── Small avatar initials ─────────────────────────────────────
const Avatar = ({ name, size = 28 }) => {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const hue = (name || '').split('').reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `hsl(${hue},45%,55%)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

// ── Probability badge ────────────────────────────────────────
const ProbBadge = ({ stage }) => {
  const prob  = STAGE_PROB[stage] ?? 10;
  const color = prob >= 75 ? '#006243' : prob >= 40 ? '#B45309' : '#6B7280';
  const bg    = prob >= 75 ? 'rgba(0,98,67,0.10)' : prob >= 40 ? 'rgba(180,83,9,0.09)' : 'rgba(107,114,128,0.10)';
  return (
    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 9999, background: bg, color }}>
      {prob}%
    </span>
  );
};

// ── Deal Card ─────────────────────────────────────────────────
const DealCard = ({ deal, onClickDeal, isDragging, onDragStart, onDragEnd }) => (
  <div
    draggable
    onDragStart={e => onDragStart(e, deal)}
    onDragEnd={onDragEnd}
    onClick={() => onClickDeal(deal)}
    style={{
      background: 'var(--surface-container-lowest)',
      border: '1px solid var(--outline-variant)',
      borderRadius: '0.625rem',
      padding: '0.75rem',
      cursor: 'grab',
      opacity: isDragging ? 0.45 : 1,
      transition: 'box-shadow 0.15s',
      marginBottom: '0.5rem',
    }}
    className="hover-lift"
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
      <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--on-surface)', lineHeight: 1.3, flex: 1 }}>{deal.client_name}</p>
      <ProbBadge stage={deal.stage} />
    </div>

    {deal.industry && (
      <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginBottom: '0.375rem' }}>{deal.industry}</p>
    )}

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: STAGE_COLOR[deal.stage] || 'var(--primary)' }}>
        {fmtCurrency(deal.deal_value)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        {deal.daysInStage != null && (
          <span style={{ fontSize: '0.7rem', color: deal.daysInStage > 14 ? '#BA1A1A' : 'var(--on-surface-variant)', fontWeight: deal.daysInStage > 14 ? 700 : 400 }}>
            {deal.daysInStage}d
          </span>
        )}
        {deal.owner && <Avatar name={deal.owner} size={22} />}
      </div>
    </div>

    {deal.next_action && (
      <div style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', background: 'var(--surface-container-low)', borderRadius: '0.375rem' }}>
        <p style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', margin: 0 }}>
          ▶ {deal.next_action}{deal.next_action_date ? ` · ${deal.next_action_date}` : ''}
        </p>
      </div>
    )}
  </div>
);

// ── Deal Drawer ───────────────────────────────────────────────
const BLANK_FORM = { client_name: '', industry: '', stage: 'Cold Outreach', deal_value: '', next_action: '', next_action_date: '', owner: '', notes: '' };

const DealDrawer = ({ deal, onClose, onSave, onDelete, saving }) => {
  const isNew = !deal?.id;
  const [form, setForm] = useState(isNew ? BLANK_FORM : {
    client_name:     deal.client_name    || '',
    industry:        deal.industry       || '',
    stage:           deal.stage          || 'Cold Outreach',
    deal_value:      deal.deal_value     != null ? String(deal.deal_value) : '',
    next_action:     deal.next_action    || '',
    next_action_date:deal.next_action_date || '',
    owner:           deal.owner          || '',
    notes:           deal.notes          || '',
  });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(12,22,42,0.4)' }} />
      {/* Panel */}
      <div style={{ width: Math.min(420, window.innerWidth - 32), background: 'var(--surface-container-lowest)', borderLeft: '1px solid var(--outline-variant)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>{isNew ? 'New Deal' : 'Edit Deal'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="close" /></button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[
            { k: 'client_name',  label: 'Client Name',   type: 'text',   required: true },
            { k: 'industry',     label: 'Industry',      type: 'text' },
            { k: 'owner',        label: 'Owner / AE',    type: 'text' },
            { k: 'deal_value',   label: 'Deal Value (€)', type: 'number' },
            { k: 'next_action',  label: 'Next Action',   type: 'text' },
            { k: 'next_action_date', label: 'Next Action Date', type: 'date' },
          ].map(({ k, label, type, required }) => (
            <div key={k}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: '0.375rem' }}>
                {label}{required && <span style={{ color: 'var(--error)' }}> *</span>}
              </label>
              <input
                type={type} value={form[k]}
                onChange={e => setF(k, e.target.value)}
                className="input" style={{ width: '100%' }}
                placeholder={type === 'number' ? '0' : ''}
              />
            </div>
          ))}

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: '0.375rem' }}>Stage</label>
            <select value={form.stage} onChange={e => setF('stage', e.target.value)} className="input" style={{ width: '100%' }}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: '0.375rem' }}>Notes</label>
            <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} className="textarea" rows={3} style={{ width: '100%', resize: 'none' }} placeholder="Any additional context…" />
          </div>

          {/* Probability preview */}
          <div style={{ padding: '0.75rem', background: 'var(--surface-container-low)', borderRadius: '0.625rem', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>Close Probability</span>
            <ProbBadge stage={form.stage} />
          </div>
          {Number(form.deal_value) > 0 && (
            <div style={{ padding: '0.75rem', background: 'rgba(68,104,176,0.07)', borderRadius: '0.625rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>Weighted Value</span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--primary)' }}>
                {fmtCurrency(Number(form.deal_value) * (STAGE_PROB[form.stage] ?? 10) / 100)}
              </span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--outline-variant)', display: 'flex', gap: '0.625rem', flexShrink: 0 }}>
          {!isNew && (
            <button onClick={() => onDelete(deal.id)} style={{ padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1px solid var(--error)', background: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
              <Icon name="delete" style={{ fontSize: '1rem', verticalAlign: 'middle', marginRight: 4 }} />Delete
            </button>
          )}
          <button
            onClick={() => onSave(form, deal?.id)}
            disabled={saving || !form.client_name.trim()}
            style={{ flex: 1, padding: '0.625rem 1rem', borderRadius: '0.5rem', border: 'none', background: saving || !form.client_name.trim() ? 'var(--outline-variant)' : 'var(--primary)', color: '#fff', cursor: saving || !form.client_name.trim() ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', fontFamily: 'var(--font-display)' }}
          >
            {saving ? 'Saving…' : isNew ? 'Create Deal' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────
export default function PipelineKanban() {
  const { isMobile }          = useBreakpoint();
  const { user }              = useAuth();
  const canEdit               = user?.role === 'admin' || user?.role === 'sales' || user?.role === 'viewer';

  const [deals, setDeals]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  const [draggingId, setDraggingId]   = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  const [selectedDeal, setSelectedDeal] = useState(null); // null = drawer closed; 'new' = new deal form; deal obj = edit
  const drawerIsNew = selectedDeal === 'new';

  const [view, setView] = useState('kanban'); // 'kanban' | 'forecast'

  // ── Load deals ────────────────────────────────────────────────
  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await salesTrackerAPI.getPipeline();
      setDeals(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError('Failed to load pipeline. Please refresh.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  // ── Deals by stage ────────────────────────────────────────────
  const dealsByStage = useMemo(() => {
    const map = {};
    for (const s of STAGES) map[s.key] = [];
    for (const d of deals) {
      if (map[d.stage]) map[d.stage].push(d);
      else map['Cold Outreach'].push(d); // fallback
    }
    return map;
  }, [deals]);

  // ── Stage totals ──────────────────────────────────────────────
  const stageTotals = useMemo(() =>
    Object.fromEntries(STAGES.map(s => [s.key, dealsByStage[s.key].reduce((acc, d) => acc + (d.deal_value || 0), 0)])),
  [dealsByStage]);

  const totalPipeline  = useMemo(() => deals.filter(d => !['Closed-Won','Closed-Lost'].includes(d.stage)).reduce((a, d) => a + (d.deal_value || 0), 0), [deals]);
  const totalWeighted  = useMemo(() => deals.filter(d => !['Closed-Lost'].includes(d.stage)).reduce((a, d) => a + (d.weighted_value || 0), 0), [deals]);
  const totalWon       = useMemo(() => deals.filter(d => d.stage === 'Closed-Won').reduce((a, d) => a + (d.deal_value || 0), 0), [deals]);

  // ── Forecast chart data ───────────────────────────────────────
  const forecastData = useMemo(() =>
    ACTIVE_STAGES.map(s => ({
      stage: s.key.replace('Discovery Done / Qualified', 'Discovery / Qualified').replace('Discovery Call Booked', 'Discovery Booked'),
      weighted: Math.round(stageTotals[s.key] * s.prob / 100),
      raw:      Math.round(stageTotals[s.key]),
      color:    s.color,
    })).filter(d => d.raw > 0),
  [stageTotals]);

  // ── Drag handlers ─────────────────────────────────────────────
  const handleDragStart = useCallback((e, deal) => {
    e.dataTransfer.setData('dealId', deal.id);
    setDraggingId(deal.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverStage(null);
  }, []);

  const handleDragOver = useCallback((e, stageKey) => {
    e.preventDefault();
    setDragOverStage(stageKey);
  }, []);

  const handleDrop = useCallback(async (e, targetStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData('dealId');
    const deal   = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === targetStage) { setDraggingId(null); return; }

    // Optimistic update
    setDeals(prev => prev.map(d => d.id === dealId
      ? { ...d, stage: targetStage, probability: STAGE_PROB[targetStage] ?? 10, daysInStage: 0 }
      : d
    ));
    setDraggingId(null);

    try {
      await salesTrackerAPI.updateDeal(dealId, { stage: targetStage, stage_updated_date: todayISO() });
    } catch {
      // Revert on failure
      setDeals(prev => prev.map(d => d.id === dealId ? deal : d));
      setError('Failed to move deal. Please try again.');
    }
  }, [deals]);

  // ── Save deal (create / update) ───────────────────────────────
  const handleSave = async (form, existingId) => {
    if (!form.client_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        client_name:        form.client_name.trim(),
        industry:           form.industry || null,
        stage:              form.stage,
        deal_value:         parseFloat(form.deal_value) || 0,
        next_action:        form.next_action || null,
        next_action_date:   form.next_action_date || null,
        owner:              form.owner || null,
        notes:              form.notes || null,
        stage_updated_date: todayISO(),
      };
      if (existingId) {
        const res = await salesTrackerAPI.updateDeal(existingId, payload);
        const updated = res.data?.deal || { ...payload, id: existingId, daysInStage: 0 };
        setDeals(prev => prev.map(d => d.id === existingId ? updated : d));
      } else {
        const res = await salesTrackerAPI.createDeal(payload);
        const created = res.data?.deal;
        if (created) setDeals(prev => [...prev, created]);
      }
      setSelectedDeal(null);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save deal.');
    } finally { setSaving(false); }
  };

  // ── Delete deal ───────────────────────────────────────────────
  const handleDelete = async (dealId) => {
    if (!window.confirm('Delete this deal? This cannot be undone.')) return;
    setSaving(true);
    try {
      await salesTrackerAPI.deleteDeal(dealId);
      setDeals(prev => prev.filter(d => d.id !== dealId));
      setSelectedDeal(null);
    } catch { setError('Failed to delete deal.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fade-in">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p className="label-sm" style={{ color: 'var(--tertiary)', marginBottom: '0.25rem' }}>Sales</p>
          <h1 className="headline-sm">Pipeline Kanban</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.125rem' }}>
            Drag cards between stages to update. Click any card to edit.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-container-low)', padding: 3, borderRadius: '0.75rem' }}>
            {['kanban', 'forecast'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: view === v ? 700 : 400, background: view === v ? 'var(--surface-container-lowest)' : 'transparent', color: view === v ? 'var(--on-surface)' : 'var(--on-surface-variant)', fontFamily: 'var(--font-display)', transition: 'all 0.15s', textTransform: 'capitalize' }}>
                {v === 'kanban' ? 'Kanban' : 'Forecast'}
              </button>
            ))}
          </div>
          {canEdit && (
            <button onClick={() => setSelectedDeal('new')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', borderRadius: '0.625rem', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', fontFamily: 'var(--font-display)' }}>
              <Icon name="add" style={{ fontSize: '1rem', color: '#fff' }} /> New Deal
            </button>
          )}
          <button onClick={loadDeals} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="refresh" style={{ fontSize: '1rem' }} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', background: 'var(--error-container)', color: 'var(--error)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon name="error_outline" style={{ fontSize: '1rem' }} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}><Icon name="close" style={{ fontSize: '1rem' }} /></button>
        </div>
      )}

      {/* ── Summary strip ────────────────────────────────────── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Total Deals',      value: deals.filter(d => d.stage !== 'Closed-Lost').length,     icon: 'business_center', color: 'var(--primary)' },
            { label: 'Pipeline Value',   value: fmtCurrency(totalPipeline),   icon: 'trending_up',     color: 'var(--primary)' },
            { label: 'Weighted Value',   value: fmtCurrency(totalWeighted),   icon: 'analytics',       color: '#8b5cf6' },
            { label: 'Closed-Won',       value: fmtCurrency(totalWon),        icon: 'check_circle',    color: '#006243' },
          ].map(kpi => (
            <div key={kpi.label} className="card" style={{ padding: '1rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 8, right: 10, opacity: 0.06 }}>
                <Icon name={kpi.icon} style={{ fontSize: '2.5rem', color: kpi.color }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', fontWeight: 600, marginBottom: '0.25rem' }}>{kpi.label}</p>
              <p style={{ fontSize: '1.375rem', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" style={{ fontSize: '2.5rem', display: 'block', margin: '0 auto 0.75rem' }} />
          Loading pipeline…
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          KANBAN VIEW
      ══════════════════════════════════════════════════════════ */}
      {!loading && view === 'kanban' && (
        <div style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', minWidth: STAGES.length * 220 }}>
            {STAGES.map(stage => {
              const stageDeals = dealsByStage[stage.key] || [];
              const isDropTarget = dragOverStage === stage.key;
              return (
                <div
                  key={stage.key}
                  onDragOver={canEdit ? e => handleDragOver(e, stage.key) : undefined}
                  onDrop={canEdit ? e => handleDrop(e, stage.key) : undefined}
                  style={{
                    width: 220, flexShrink: 0,
                    background: isDropTarget ? `${stage.color}0E` : 'var(--surface-container-low)',
                    border: isDropTarget ? `1.5px dashed ${stage.color}` : '1.5px solid transparent',
                    borderRadius: '0.875rem',
                    padding: '0.75rem',
                    transition: 'background 0.15s, border 0.15s',
                  }}
                >
                  {/* Column header */}
                  <div style={{ marginBottom: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                      <p style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--on-surface)', lineHeight: 1.2 }}>{stage.key}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}</span>
                      {stageTotals[stage.key] > 0 && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: stage.color }}>{fmtCurrency(stageTotals[stage.key])}</span>
                      )}
                    </div>
                  </div>

                  {/* Cards */}
                  <div style={{ minHeight: 80 }}>
                    {stageDeals.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        onClickDeal={setSelectedDeal}
                        isDragging={draggingId === deal.id}
                        onDragStart={canEdit ? handleDragStart : () => {}}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                    {stageDeals.length === 0 && (
                      <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--on-surface-variant)', opacity: 0.4 }}>
                        <Icon name="inbox" style={{ fontSize: '1.5rem', display: 'block', margin: '0 auto 0.25rem' }} />
                        <p style={{ fontSize: '0.75rem' }}>Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          FORECAST VIEW
      ══════════════════════════════════════════════════════════ */}
      {!loading && view === 'forecast' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
          {/* Weighted value chart */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Weighted Value by Stage</h2>
            {forecastData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={forecastData} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" interval={0} height={50} />
                  <YAxis tickFormatter={v => `€${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v, name) => [fmtCurrency(v), name === 'weighted' ? 'Weighted' : 'Raw Value']}
                    contentStyle={{ fontSize: '0.8125rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)' }}
                  />
                  <Bar dataKey="weighted" radius={[4, 4, 0, 0]} name="weighted">
                    {forecastData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: 'var(--on-surface-variant)', fontStyle: 'italic', fontSize: '0.875rem' }}>No deals yet — add some to see the forecast</p>
            )}
          </div>

          {/* Stage breakdown table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--outline-variant)' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Stage Breakdown</h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead style={{ background: 'var(--surface-container-low)' }}>
                <tr>
                  {['Stage', 'Deals', 'Raw Value', 'Weighted'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 1rem', textAlign: h === 'Stage' ? 'left' : 'right', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--on-surface-variant)', letterSpacing: '0.05em', borderBottom: '1px solid var(--outline-variant)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAGES.map(s => {
                  const stageDeals = dealsByStage[s.key] || [];
                  const raw = stageTotals[s.key] || 0;
                  const wt  = Math.round(raw * s.prob / 100);
                  return (
                    <tr key={s.key} style={{ borderBottom: '1px solid var(--surface-container)' }}>
                      <td style={{ padding: '0.625rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                          <span style={{ fontWeight: 500 }}>{s.key}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: 'var(--on-surface-variant)' }}>{stageDeals.length}</td>
                      <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: 600 }}>{raw > 0 ? fmtCurrency(raw) : '—'}</td>
                      <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: 700, color: s.color }}>{wt > 0 ? fmtCurrency(wt) : '—'}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--surface-container-low)' }}>
                  <td style={{ padding: '0.625rem 1rem', fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: 700 }}>{deals.length}</td>
                  <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(deals.reduce((a, d) => a + (d.deal_value || 0), 0))}</td>
                  <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>{fmtCurrency(totalWeighted)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Deal drawer (edit / create) ───────────────────────── */}
      {selectedDeal !== null && (
        <DealDrawer
          deal={drawerIsNew ? null : selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
        />
      )}
    </div>
  );
}
