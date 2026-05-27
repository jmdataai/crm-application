import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { salesTrackerAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const fmt = (n) => new Intl.NumberFormat('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const fmtEur = (n) => '€' + fmt(n);
const fmtDate = (d) => {
  if (!d) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return d;
  return `${String(dt.getDate()).padStart(2,'0')}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
};

// Traffic light logic
const trafficLight = (val, min, max) => {
  if (val === undefined || val === null) return 'none';
  if (val >= max)  return 'green';
  if (val >= min)  return 'amber';
  return 'red';
};

const DOT_COLORS = {
  green: { bg: 'rgba(0,98,67,0.15)',    dot: '#006633', text: '#006633' },
  amber: { bg: 'rgba(217,119,6,0.12)',  dot: '#D97706', text: '#92400e' },
  red:   { bg: 'rgba(239,68,68,0.1)',   dot: '#EF4444', text: '#B91C1C' },
  none:  { bg: 'var(--surface-container)', dot: 'var(--outline-variant)', text: 'var(--on-surface-variant)' },
};

const Dot = ({ status, size = 10 }) => (
  <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: DOT_COLORS[status]?.dot || DOT_COLORS.none.dot }} />
);

const STAGES = [
  'Cold Outreach','Engaged / Replied','Discovery Call Booked',
  'Discovery Done / Qualified','Proposal Sent','Negotiation','Closed-Won','Closed-Lost'
];
const STAGE_PROB = {
  'Cold Outreach':10,'Engaged / Replied':20,'Discovery Call Booked':30,
  'Discovery Done / Qualified':40,'Proposal Sent':60,'Negotiation':75,
  'Closed-Won':100,'Closed-Lost':0,
};
const STAGE_COLORS = {
  'Cold Outreach':'#64748b','Engaged / Replied':'#4468B0','Discovery Call Booked':'#7C3AED',
  'Discovery Done / Qualified':'#0891B2','Proposal Sent':'#D97706','Negotiation':'#EA580C',
  'Closed-Won':'#006633','Closed-Lost':'#9CA3AF',
};

const DAYS_OF_WEEK = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const TARGETS = {
  weeklyEmails:    { min: 50,    max: 75 },
  weeklyLinkedin:  { min: 30,    max: 50 },
  weeklyCalls:     { min: 15,    max: 25 },
  weeklyMeetings:  { min: 8,     max: 12 },
  weeklyProposals: { min: 4,     max: 6  },
  monthlyClients:  { min: 2,     max: 3  },
  monthlyValue:    { min: 15000, max: 30000 },
  monthlyProposals:{ min: 16,    max: 24 },
};

// Empty deal form
const EMPTY_DEAL = { client_name:'', industry:'', stage:'Cold Outreach', deal_value:'', next_action:'', next_action_date:'', owner:'', notes:'' };

export default function SalesTrackerDashboard() {
  const { user, isSales, isViewer, isAdmin } = useAuth();
  const { isMobile } = useBreakpoint();
  const isPrivileged = isViewer || isAdmin;  // CEO (viewer) or admin can see all users

  const [activeTab, setActiveTab] = useState('overview');
  const [activeDay, setActiveDay] = useState(() => {
    const d = new Date().getDay();
    return d >= 1 && d <= 5 ? DAYS_OF_WEEK[d - 1] : 'Monday';
  });
  const [weekOffset, setWeekOffset]   = useState(0); // 0 = current week, -1 = last week etc
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [pipeline, setPipeline]       = useState([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingDeal, setEditingDeal]   = useState(null);
  const [dealForm, setDealForm]         = useState(EMPTY_DEAL);
  const [dealSaving, setDealSaving]     = useState(false);
  const [dealError, setDealError]       = useState('');
  const [monthlyRollups, setMonthlyRollups] = useState([]);

  // User picker (admin/viewer only)
  const [trackerUsers, setTrackerUsers]   = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');  // '' = all users

  const canEditPipeline = isSales || isAdmin;

  // Load available users for the picker (admin/viewer only)
  useEffect(() => {
    if (!isPrivileged) return;
    salesTrackerAPI.getTrackerUsers()
      .then(res => setTrackerUsers(res.data || []))
      .catch(() => {});
  }, [isPrivileged]);

  const loadDashboard = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    try {
      const params = { week_offset: weekOffset };
      if (isPrivileged && selectedUserId) params.user_id = selectedUserId;
      const res = await salesTrackerAPI.getDashboard(params);
      setData(res.data);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, [weekOffset, selectedUserId, isPrivileged]);

  const loadPipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const res = await salesTrackerAPI.getPipeline();
      setPipeline(res.data || []);
    } catch (_) {}
    finally { setPipelineLoading(false); }
  }, []);

  const loadMonthly = useCallback(async () => {
    try {
      const res = await salesTrackerAPI.getMonthlyRollups();
      setMonthlyRollups(res.data || []);
    } catch (_) {}
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (activeTab === 'pipeline') loadPipeline(); }, [activeTab, loadPipeline]);
  useEffect(() => { if (activeTab === 'monthly')  loadMonthly(); }, [activeTab, loadMonthly]);

  // ── Weekly log data for "Daily" tab ──────────────────────────
  // weekOffset=0 → current week, -1 → last week
  const weekLogs = useMemo(() => {
    if (!data) return {};
    if (weekOffset === 0) return data.thisWeek?.days || {};
    return {}; // for past weeks, would need a separate API call — show empty
  }, [data, weekOffset]);

  // ── Helpers ───────────────────────────────────────────────────
  const getWeekDates = (offset = 0) => {
    const today = new Date();
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7) + (offset * 7));
    return DAYS_OF_WEEK.map((day, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return { day, date: d };
    });
  };
  const weekDates = getWeekDates(weekOffset);

  // ── KPI Card ──────────────────────────────────────────────────
  const KPICard = ({ label, value, target, unit = '', icon, trendVal, subLabel }) => {
    const tgt = TARGETS[target];
    const status = tgt ? trafficLight(value, tgt.min, tgt.max) : 'none';
    const dc = DOT_COLORS[status];
    const trend = trendVal !== undefined ? trendVal : null;
    return (
      <div className="card" style={{ padding: '1.25rem', background: dc.bg, border: `1px solid ${dc.dot}20` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--on-surface-variant)' }}>{label}</span>
          {status !== 'none' && <Dot status={status} size={10} />}
        </div>
        <p style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--on-surface)', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {unit}{fmt(value)}
        </p>
        {tgt && (
          <p style={{ fontSize: '0.75rem', color: dc.text, marginTop: '0.375rem', fontWeight: 600 }}>
            Target: {unit}{tgt.min}–{unit}{tgt.max}
          </p>
        )}
        {subLabel && <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>{subLabel}</p>}
        {trend !== null && (
          <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: trend >= 0 ? '#006633' : 'var(--error)', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Icon name={trend >= 0 ? 'trending_up' : 'trending_down'} style={{ fontSize: '0.875rem', color: trend >= 0 ? '#006633' : 'var(--error)' }} />
            {Math.abs(trend)} vs last week
          </p>
        )}
      </div>
    );
  };

  // ── Pipeline deal row ─────────────────────────────────────────
  const DealRow = ({ deal }) => {
    const stalled  = (deal.daysInStage || 0) > 7;
    const isClosed = deal.stage === 'Closed-Won' || deal.stage === 'Closed-Lost';
    const stageBg  = STAGE_COLORS[deal.stage] || '#64748b';
    const overdue  = deal.next_action_date && new Date(deal.next_action_date) < new Date();
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 110px 1fr 90px 70px 90px 1fr 70px 80px',
        gap: '0.5rem', padding: '0.75rem 1rem', alignItems: 'center',
        borderLeft: `3px solid ${stalled ? '#EF4444' : isClosed && deal.stage === 'Closed-Won' ? '#006633' : 'transparent'}`,
        background: stalled ? 'rgba(239,68,68,0.03)' : isClosed && deal.stage === 'Closed-Won' ? 'rgba(0,98,67,0.03)' : 'transparent',
        opacity: deal.stage === 'Closed-Lost' ? 0.55 : 1,
        borderBottom: '1px solid var(--outline-variant)',
      }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', textDecoration: deal.stage === 'Closed-Lost' ? 'line-through' : 'none' }}>{deal.client_name}</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>{deal.industry || '—'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ padding: '0.2rem 0.625rem', borderRadius: 9999, fontSize: '0.6875rem', fontWeight: 700, background: `${stageBg}18`, color: stageBg, whiteSpace: 'nowrap' }}>
            {deal.stage}
          </span>
        </span>
        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{fmtEur(deal.deal_value)}</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>{deal.probability}%</span>
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--tertiary)' }}>{fmtEur(deal.weighted_value)}</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.next_action || '—'}</span>
        <span style={{ fontSize: '0.75rem', color: overdue ? 'var(--error)' : 'var(--on-surface-variant)', fontWeight: overdue ? 700 : 400 }}>
          {deal.next_action_date ? fmtDate(deal.next_action_date) : '—'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: stalled ? 700 : 400, color: stalled ? 'var(--error)' : 'var(--on-surface-variant)' }}>
          {stalled && <Icon name="warning" style={{ fontSize: '0.875rem', color: 'var(--error)' }} />}
          {deal.daysInStage || 0}d
        </span>
        {canEditPipeline && (
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button onClick={() => { setEditingDeal(deal); setDealForm({ client_name: deal.client_name, industry: deal.industry||'', stage: deal.stage, deal_value: String(deal.deal_value||''), next_action: deal.next_action||'', next_action_date: deal.next_action_date ? fmtDate(new Date(deal.next_action_date)) : '', owner: deal.owner||'', notes: deal.notes||'' }); setShowDealForm(true); }} style={{ background:'none', border:'none', cursor:'pointer', padding:4 }}>
              <Icon name="edit" style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Deal form ─────────────────────────────────────────────────
  const saveDeal = async () => {
    if (!dealForm.client_name.trim()) { setDealError('Client name is required.'); return; }
    setDealSaving(true); setDealError('');
    try {
      const payload = {
        client_name:      dealForm.client_name,
        industry:         dealForm.industry || null,
        stage:            dealForm.stage,
        deal_value:       parseFloat(dealForm.deal_value) || 0,
        next_action:      dealForm.next_action || null,
        next_action_date: dealForm.next_action_date || null,
        owner:            dealForm.owner || null,
        notes:            dealForm.notes || null,
      };
      if (editingDeal) {
        await salesTrackerAPI.updateDeal(editingDeal.id, payload);
      } else {
        await salesTrackerAPI.createDeal(payload);
      }
      setShowDealForm(false); setEditingDeal(null); setDealForm(EMPTY_DEAL);
      loadPipeline(); loadDashboard(true);
    } catch (e) {
      setDealError(e?.response?.data?.detail || 'Failed to save deal.');
    } finally { setDealSaving(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ width: 44, height: 44, border: '3px solid var(--outline-variant)', borderTopColor: 'var(--tertiary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'var(--on-surface-variant)' }}>Loading tracker…</p>
    </div>
  );

  const tw = data?.thisWeek || {};
  const lw = data?.lastWeek || {};
  const ps = data?.pipelineStats || {};
  const monthly = data?.monthlyRollup;
  const viewingUserName = selectedUserId
    ? (trackerUsers.find(u => u.id === selectedUserId)?.name || 'Selected User')
    : (isPrivileged ? 'All Users' : user?.name || 'My');

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p className="label-sm" style={{ color: 'var(--tertiary)', marginBottom: '0.25rem' }}>Sales Tracker</p>
          <h1 className="headline-sm">{viewingUserName}'s Dashboard</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
            Week {tw.weekNumber} · {tw.dateRange}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
          {/* User picker — admin/viewer only */}
          {isPrivileged && trackerUsers.length > 0 && (
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.875rem',
                border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)',
                color: 'var(--on-surface)', fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <option value="">All Users</option>
              {trackerUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <button onClick={() => loadDashboard(true)} disabled={refreshing} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
            background: 'transparent', color: 'var(--on-surface-variant)', cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-display)',
          }}>
            <Icon name="refresh" style={{ fontSize: '1.125rem', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Per-user breakdown banner (admin/viewer, all users view) */}
      {isPrivileged && !selectedUserId && data?.perUserBreakdown?.length > 1 && (
        <div style={{ marginBottom: '1.25rem', padding: '0.875rem 1rem', borderRadius: '0.75rem', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--on-surface-variant)', alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>This Week</span>
          {data.perUserBreakdown.map(u => (
            <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(68,104,176,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                {(u.userName || '?')[0].toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1 }}>{u.userName}</p>
                <p style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>
                  {u.emails}e · {u.calls}c · {u.linkedin}li · {u.daysLogged}d logged
                </p>
              </div>
              <button onClick={() => setSelectedUserId(u.userId)} style={{ fontSize: '0.6875rem', padding: '0.1rem 0.5rem', borderRadius: 9999, border: '1px solid var(--primary)', color: 'var(--primary)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600 }}>View</button>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--outline-variant)', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {[
          { id: 'overview', label: 'Overview',  icon: 'dashboard' },
          { id: 'daily',    label: 'Daily',     icon: 'calendar_today' },
          { id: 'pipeline', label: 'Pipeline',  icon: 'funnel' },
          { id: 'traffic',  label: 'Traffic Light', icon: 'traffic' },
          { id: 'monthly',  label: 'Monthly',   icon: 'bar_chart' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '0.75rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
            borderBottom: activeTab === tab.id ? '2px solid var(--tertiary)' : '2px solid transparent',
            marginBottom: -2, fontWeight: activeTab === tab.id ? 700 : 500,
            color: activeTab === tab.id ? 'var(--tertiary)' : 'var(--on-surface-variant)',
            fontSize: '0.875rem', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: '0.375rem',
          }}>
            <Icon name={tab.icon} style={{ fontSize: '1rem' }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <KPICard label="Emails Sent"     value={tw.emails}         target="weeklyEmails"    trendVal={(tw.emails||0)-(lw.emails||0)} />
            <KPICard label="LinkedIn"        value={tw.linkedin}       target="weeklyLinkedin"  trendVal={(tw.linkedin||0)-(lw.linkedin||0)} />
            <KPICard label="Calls Made"      value={tw.calls}          target="weeklyCalls"     trendVal={(tw.calls||0)-(lw.calls||0)} />
            <KPICard label="Meetings Booked" value={tw.meetingsBooked} target="weeklyMeetings"  trendVal={(tw.meetingsBooked||0)-(lw.meetingsBooked||0)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <KPICard label="Proposals Sent"  value={tw.proposals}      target="weeklyProposals" trendVal={(tw.proposals||0)-(lw.proposals||0)} />
            <KPICard label="Replies"         value={tw.replies}        subLabel="This week" />
            <KPICard label="Pipeline Value"  value={ps.weightedValue}  unit="€" subLabel={`${ps.totalDeals || 0} open deals`} />
            <KPICard label="Stalled Deals"   value={ps.stalledCount}   subLabel=">7 days in stage" />
          </div>

          {/* Stalled deals warning */}
          {(data?.stalledDeals || []).length > 0 && (
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                <Icon name="warning" style={{ color: 'var(--error)' }} />
                <h3 style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--error)' }}>
                  {data.stalledDeals.length} stalled deal{data.stalledDeals.length > 1 ? 's' : ''} — needs attention
                </h3>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {data.stalledDeals.map(d => (
                  <div key={d.id} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', background: 'var(--surface-container)', display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 160 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{d.client_name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{d.stage} · {d.daysInStage}d stalled</span>
                    {d.next_action && <span style={{ fontSize: '0.75rem', color: 'var(--error)' }}>Next: {d.next_action}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DAILY TAB ────────────────────────────────────────────── */}
      {activeTab === 'daily' && (
        <div>
          {/* Week navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'none', border: '1px solid var(--outline-variant)', borderRadius: '0.5rem', padding: '0.375rem 0.625rem', cursor: 'pointer' }}>
              <Icon name="chevron_left" />
            </button>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', minWidth: 160, textAlign: 'center' }}>
              {weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : `${Math.abs(weekOffset)} weeks ago`}
              {' — '}{weekDates[0]?.date.toLocaleDateString('en-IE',{day:'2-digit',month:'short'})} – {weekDates[4]?.date.toLocaleDateString('en-IE',{day:'2-digit',month:'short'})}
            </span>
            <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} disabled={weekOffset >= 0} style={{ background: 'none', border: '1px solid var(--outline-variant)', borderRadius: '0.5rem', padding: '0.375rem 0.625rem', cursor: weekOffset >= 0 ? 'not-allowed' : 'pointer', opacity: weekOffset >= 0 ? 0.4 : 1 }}>
              <Icon name="chevron_right" />
            </button>
          </div>

          {/* Day sub-tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {weekDates.map(({ day, date: d }) => {
              const iso  = d.toISOString().slice(0, 10);
              const log  = weekLogs[day];
              const hasLog = !!log;
              const isToday = iso === new Date().toISOString().slice(0,10);
              return (
                <button key={day} onClick={() => setActiveDay(day)} style={{
                  padding: '0.5rem 1rem', borderRadius: '0.625rem', border: '1.5px solid',
                  borderColor: activeDay === day ? 'var(--tertiary)' : hasLog ? 'rgba(0,98,67,0.3)' : 'var(--outline-variant)',
                  background: activeDay === day ? 'rgba(0,98,67,0.1)' : hasLog ? 'rgba(0,98,67,0.04)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: activeDay === day ? 700 : 500,
                  color: activeDay === day ? 'var(--tertiary)' : 'var(--on-surface)',
                  fontSize: '0.875rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.125rem',
                }}>
                  <span>{day.slice(0,3)}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', fontWeight: 400 }}>
                    {d.toLocaleDateString('en-IE',{day:'2-digit',month:'short'})}
                  </span>
                  {hasLog && <Dot status="green" size={6} />}
                </button>
              );
            })}
          </div>

          {/* Selected day detail */}
          {(() => {
            const log = weekLogs[activeDay];
            const { date: d } = weekDates.find(w => w.day === activeDay) || {};
            const isFuture = d && d > new Date() && d.toISOString().slice(0,10) !== new Date().toISOString().slice(0,10);
            if (!log) return (
              <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <Icon name={isFuture ? 'schedule' : 'event_busy'} style={{ fontSize: '2rem', color: 'var(--on-surface-variant)', display: 'block', margin: '0 auto 0.75rem' }} />
                <p style={{ fontWeight: 600, color: 'var(--on-surface)' }}>
                  {isFuture ? 'Not yet' : 'No log for this day'}
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
                  {isFuture ? `${activeDay} hasn't happened yet` : `Kajal didn't log ${activeDay}`}
                </p>
              </div>
            );
            const metrics = [
              { label: 'Emails Sent',      val: log.emails_sent,      target: [10,15] },
              { label: 'LinkedIn Msgs',    val: log.linkedin_sent,    target: [8,10]  },
              { label: 'Calls Made',       val: log.calls_made,       target: [3,5]   },
              { label: 'Replies',          val: log.replies_received, target: null    },
              { label: 'Meetings Booked',  val: log.meetings_booked,  target: null    },
              { label: 'Meetings Done',    val: log.meetings_done,    target: null    },
              { label: 'Proposals Sent',   val: log.proposals_sent,   target: null    },
              { label: 'Follow-ups',       val: log.followups_done,   target: [3,5]   },
              { label: 'New Leads',        val: log.new_leads_added,  target: null    },
              { label: 'Hours Worked',     val: log.hours_worked,     target: null    },
            ];
            return (
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.0625rem', fontWeight: 700 }}>{activeDay}</h2>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>{d && fmtDate(d)}</span>
                  {log.mood && (
                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: 9999, background: log.mood <= 2 ? 'var(--error-container)' : log.mood >= 4 ? 'rgba(0,98,67,0.1)' : 'var(--surface-container)', color: log.mood <= 2 ? 'var(--error)' : log.mood >= 4 ? '#006633' : 'var(--on-surface-variant)', fontWeight: 700, fontSize: '0.8125rem' }}>
                      Mood {log.mood}/5 {log.mood === 5 ? '🤩' : log.mood >= 4 ? '🙂' : log.mood === 3 ? '😐' : log.mood <= 2 ? '😔' : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5,1fr)', gap: '0.875rem', marginBottom: '1.25rem' }}>
                  {metrics.map(({ label, val, target }) => {
                    const status = target ? trafficLight(val, target[0], target[1]) : 'none';
                    const dc = DOT_COLORS[status];
                    return (
                      <div key={label} style={{ padding: '0.875rem', borderRadius: '0.625rem', background: dc.bg, textAlign: 'center' }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>{val || 0}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>{label}</p>
                        {target && <Dot status={status} size={8} />}
                      </div>
                    );
                  })}
                </div>
                {(log.biggest_win || log.biggest_blocker) && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                    {log.biggest_win && (
                      <div style={{ padding: '0.875rem', borderRadius: '0.625rem', background: 'rgba(0,98,67,0.06)', border: '1px solid rgba(0,98,67,0.15)' }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#006633', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Biggest Win</p>
                        <p style={{ fontSize: '0.875rem' }}>{log.biggest_win}</p>
                      </div>
                    )}
                    {log.biggest_blocker && (
                      <div style={{ padding: '0.875rem', borderRadius: '0.625rem', background: 'var(--error-container)', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--error)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Biggest Blocker</p>
                        <p style={{ fontSize: '0.875rem' }}>{log.biggest_blocker}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── PIPELINE TAB ─────────────────────────────────────────── */}
      {activeTab === 'pipeline' && (
        <div>
          {/* Pipeline stats */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '0.875rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Total Deals',    val: ps.totalDeals,    fmt: fmt },
              { label: 'Total Value',    val: ps.totalValue,    fmt: fmtEur },
              { label: 'Weighted Value', val: ps.weightedValue, fmt: fmtEur },
              { label: 'Stalled >7d',   val: ps.stalledCount,  fmt: fmt,   warn: ps.stalledCount > 0 },
            ].map(({ label, val, fmt: f, warn }) => (
              <div key={label} className="card" style={{ padding: '1rem', background: warn ? 'rgba(239,68,68,0.05)' : undefined }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: '0.25rem' }}>{label}</p>
                <p style={{ fontSize: '1.375rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: warn ? 'var(--error)' : 'var(--on-surface)' }}>{f(val)}</p>
              </div>
            ))}
          </div>

          {/* Add deal button */}
          {canEditPipeline && (
            <div style={{ marginBottom: '1rem' }}>
              <button onClick={() => { setEditingDeal(null); setDealForm(EMPTY_DEAL); setShowDealForm(true); }} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none',
                background: 'var(--tertiary)', color: '#fff', fontWeight: 700, fontSize: '0.875rem',
                cursor: 'pointer', fontFamily: 'var(--font-display)',
              }}>
                <Icon name="add" style={{ color: '#fff' }} /> Add Deal
              </button>
            </div>
          )}

          {/* Deal form */}
          {showDealForm && (
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem', border: '1px solid var(--tertiary)30' }}>
              <h3 style={{ fontWeight: 700, marginBottom: '1.25rem' }}>{editingDeal ? 'Edit Deal' : 'New Deal'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                {[
                  { k: 'client_name', label: 'Client Name *', type: 'text' },
                  { k: 'industry',    label: 'Industry',       type: 'text' },
                  { k: 'deal_value',  label: 'Deal Value (€)', type: 'number' },
                  { k: 'next_action', label: 'Next Action',    type: 'text' },
                  { k: 'next_action_date', label: 'Next Action Date (DD-MMM-YYYY)', type: 'text' },
                  { k: 'owner',       label: 'Owner',          type: 'text' },
                ].map(({ k, label, type }) => (
                  <div key={k}>
                    <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>{label}</label>
                    <input type={type} className="input" value={dealForm[k]} onChange={e => setDealForm(f => ({...f, [k]: e.target.value}))} style={{ width: '100%' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: '0.875rem', marginBottom: '1rem' }}>
                <div>
                  <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>Stage</label>
                  <select className="select" value={dealForm.stage} onChange={e => setDealForm(f => ({...f, stage: e.target.value}))} style={{ width: '100%' }}>
                    {STAGES.map(s => <option key={s} value={s}>{s} ({STAGE_PROB[s]}%)</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>Notes</label>
                  <input type="text" className="input" value={dealForm.notes} onChange={e => setDealForm(f => ({...f, notes: e.target.value}))} style={{ width: '100%' }} />
                </div>
              </div>
              {/* Preview weighted value */}
              <div style={{ fontSize: '0.8125rem', color: 'var(--tertiary)', fontWeight: 600, marginBottom: '1rem' }}>
                Weighted value preview: {fmtEur((parseFloat(dealForm.deal_value)||0) * (STAGE_PROB[dealForm.stage]||10) / 100)}
              </div>
              {dealError && <p style={{ color: 'var(--error)', fontSize: '0.875rem', marginBottom: '0.875rem' }}>{dealError}</p>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={saveDeal} disabled={dealSaving} style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: 'var(--tertiary)', color: '#fff', fontWeight: 700, cursor: dealSaving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)' }}>
                  {dealSaving ? 'Saving…' : 'Save Deal'}
                </button>
                <button onClick={() => { setShowDealForm(false); setEditingDeal(null); setDealError(''); }} style={{ padding: '0.625rem 1.5rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Pipeline table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '180px 110px 1fr 90px 70px 90px 1fr 70px 80px', gap: '0.5rem', padding: '0.625rem 1rem', background: 'var(--surface-container)', borderBottom: '2px solid var(--outline-variant)' }}>
                {['Client','Industry','Stage','Deal €','Prob%','Weighted €','Next Action','Due','Days'].map(h => (
                  <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)' }}>{h}</span>
                ))}
              </div>
            )}
            {pipelineLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading pipeline…</div>
            ) : pipeline.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <Icon name="funnel" style={{ fontSize: '2rem', color: 'var(--on-surface-variant)', display: 'block', margin: '0 auto 0.75rem' }} />
                <p style={{ color: 'var(--on-surface-variant)' }}>No deals yet. Add your first deal above.</p>
              </div>
            ) : (
              pipeline.map(deal => <DealRow key={deal.id} deal={deal} />)
            )}
          </div>

          {/* Hot deals */}
          {(data?.topDeals || []).length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                <Icon name="local_fire_department" style={{ color: '#EA580C' }} />
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Hot Deals — Top 5</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.topDeals.map((d, i) => (
                  <div key={d.id} className="card" style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.125rem', color: i === 0 ? '#D97706' : 'var(--on-surface-variant)', minWidth: 24 }}>{i+1}</span>
                    <span style={{ fontWeight: 700, flex: 1, minWidth: 120 }}>{d.client_name}</span>
                    <span style={{ padding: '0.2rem 0.625rem', borderRadius: 9999, fontSize: '0.6875rem', fontWeight: 700, background: `${STAGE_COLORS[d.stage]}18`, color: STAGE_COLORS[d.stage] }}>{d.stage}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>{fmtEur(d.deal_value)}</span>
                    <span style={{ fontWeight: 700, color: 'var(--tertiary)', fontSize: '1rem' }}>{fmtEur(d.weighted_value)}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{d.next_action || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TRAFFIC LIGHT TAB ────────────────────────────────────── */}
      {activeTab === 'traffic' && (
        <div>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginBottom: '1.25rem' }}>
            Last 4 weeks activity vs targets. <Dot status="green" size={10} /> On/above · <Dot status="amber" size={10} /> 75–99% · <Dot status="red" size={10} /> Below
          </p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(6,1fr)', padding: '0.75rem 1rem', background: 'var(--surface-container)', borderBottom: '2px solid var(--outline-variant)', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)' }}>Week</span>
              {['Emails','LinkedIn','Calls','Meetings','Proposals','Overall'].map(h => (
                <span key={h} style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', textAlign: 'center' }}>{h}</span>
              ))}
            </div>
            {(data?.last4Weeks || []).map((wk, i) => {
              const statuses = [
                trafficLight(wk.emails,         TARGETS.weeklyEmails.min,    TARGETS.weeklyEmails.max),
                trafficLight(wk.linkedin,        TARGETS.weeklyLinkedin.min,  TARGETS.weeklyLinkedin.max),
                trafficLight(wk.calls,           TARGETS.weeklyCalls.min,     TARGETS.weeklyCalls.max),
                trafficLight(wk.meetingsBooked,  TARGETS.weeklyMeetings.min,  TARGETS.weeklyMeetings.max),
                trafficLight(wk.proposals,       TARGETS.weeklyProposals.min, TARGETS.weeklyProposals.max),
              ];
              const greenCount = statuses.filter(s => s === 'green').length;
              const overall = greenCount >= 4 ? 'green' : greenCount >= 2 ? 'amber' : 'red';
              const isCurrentWeek = i === data.last4Weeks.length - 1;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px repeat(6,1fr)', padding: '0.875rem 1rem', gap: '0.5rem', alignItems: 'center', borderBottom: '1px solid var(--outline-variant)', background: isCurrentWeek ? 'rgba(68,104,176,0.04)' : 'transparent' }}>
                  <div>
                    <p style={{ fontSize: '0.8125rem', fontWeight: isCurrentWeek ? 700 : 500 }}>
                      {isCurrentWeek ? 'This week' : `Wk ${wk.weekNumber}`}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>{wk.dateRange}</p>
                  </div>
                  {statuses.map((s, si) => (
                    <div key={si} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                      <Dot status={s} size={12} />
                      <span style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>
                        {si === 0 ? wk.emails : si === 1 ? wk.linkedin : si === 2 ? wk.calls : si === 3 ? wk.meetingsBooked : wk.proposals}
                      </span>
                    </div>
                  ))}
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                    <Dot status={overall} size={14} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: DOT_COLORS[overall].text }}>{greenCount}/5</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MONTHLY TAB ──────────────────────────────────────────── */}
      {activeTab === 'monthly' && (
        <div>
          {monthlyRollups.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <Icon name="bar_chart" style={{ fontSize: '2rem', color: 'var(--on-surface-variant)', display: 'block', margin: '0 auto 0.75rem' }} />
              <p style={{ color: 'var(--on-surface-variant)' }}>No monthly rollups yet. Kajal fills this last Friday of each month.</p>
            </div>
          ) : monthlyRollups.map((m, idx) => {
            const kpis = [
              { label: 'Clients Signed',    val: m.clients_signed,       fmt: fmt,    target: [TARGETS.monthlyClients.min, TARGETS.monthlyClients.max] },
              { label: 'Contract Value',    val: m.total_contract_value,  fmt: fmtEur, target: [TARGETS.monthlyValue.min,   TARGETS.monthlyValue.max] },
              { label: 'Avg Deal Size',     val: m.avg_deal_size,         fmt: fmtEur, target: null },
              { label: 'Proposals Sent',    val: m.proposals_sent,        fmt: fmt,    target: [TARGETS.monthlyProposals.min, TARGETS.monthlyProposals.max] },
              { label: 'Close Rate',        val: (m.proposal_close_rate * 100).toFixed(0) + '%', fmt: v => v, target: null },
              { label: 'Pipeline Value',    val: m.pipeline_value,        fmt: fmtEur, target: [TARGETS.pipelineValue, TARGETS.pipelineValue * 2] },
            ];
            return (
              <div key={m.id} className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.0625rem', marginBottom: '1.25rem' }}>
                  {m.month} {m.year}
                  {idx === 0 && <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.625rem', borderRadius: 9999, background: 'rgba(68,104,176,0.1)', color: 'var(--primary)' }}>Latest</span>}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: '0.875rem', marginBottom: '1.25rem' }}>
                  {kpis.map(({ label, val, fmt: f, target }) => {
                    const status = target ? trafficLight(parseFloat(val), target[0], target[1]) : 'none';
                    const dc = DOT_COLORS[status];
                    return (
                      <div key={label} style={{ padding: '1rem', borderRadius: '0.625rem', background: dc.bg }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginBottom: '0.375rem' }}>{label}</p>
                        <p style={{ fontSize: '1.375rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--on-surface)' }}>{typeof f === 'function' ? f(val) : val}</p>
                        {target && <p style={{ fontSize: '0.725rem', color: dc.text, marginTop: '0.25rem', fontWeight: 600 }}>Target: {f(target[0])}–{f(target[1])}</p>}
                      </div>
                    );
                  })}
                </div>
                {(m.best_industry || m.top_objection || m.best_channel || m.what_worked) && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.875rem', paddingTop: '1rem', borderTop: '1px solid var(--outline-variant)' }}>
                    {[
                      { label: 'Best Industry',   val: m.best_industry },
                      { label: 'Top Objection',   val: m.top_objection },
                      { label: 'Best Channel',    val: m.best_channel },
                      { label: 'Competitors',     val: m.competitor_names },
                      { label: 'Pricing Feedback',val: m.pricing_feedback },
                      { label: 'Top Fix Needed',  val: m.top_fix },
                    ].filter(x => x.val).map(({ label, val }) => (
                      <div key={label}>
                        <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--on-surface-variant)', marginBottom: '0.25rem' }}>{label}</p>
                        <p style={{ fontSize: '0.875rem' }}>{val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
