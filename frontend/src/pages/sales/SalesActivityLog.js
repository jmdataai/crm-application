import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { salesTrackerAPI } from '../../services/api';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TARGETS = {
  emails_sent:   { min: 10, max: 15, label: 'Cold Emails' },
  linkedin_sent: { min: 8,  max: 10, label: 'LinkedIn Msgs' },
  calls_made:    { min: 3,  max: 5,  label: 'Cold Calls' },
  followups_done:{ min: 3,  max: 5,  label: 'Follow-ups' },
};

const fmtDate = (d) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
};

const getStatusPill = (val, min, max) => {
  const n = parseInt(val) || 0;
  if (n === 0) return null;
  if (n >= max)   return { label: 'Above target', color: '#006633', bg: 'rgba(0,98,67,0.12)' };
  if (n >= min)   return { label: 'On target',    color: '#006633', bg: 'rgba(0,98,67,0.12)' };
  return { label: 'Below target', color: 'var(--error)', bg: 'var(--error-container)' };
};

const EMPTY_FORM = {
  emails_sent: '', linkedin_sent: '', calls_made: '', replies_received: '',
  meetings_booked: '', meetings_done: '', proposals_sent: '', followups_done: '',
  new_leads_added: '', hours_worked: '', mood: null,
  biggest_win: '', biggest_blocker: '',
};

export default function SalesActivityLog() {
  const { isMobile } = useBreakpoint();
  const today  = useMemo(() => new Date(), []);
  const todayISO = today.toISOString().slice(0, 10);

  const [form, setForm]         = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');
  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [weeklyTab, setWeeklyTab]     = useState(null);
  const [weeklyForm, setWeeklyForm]   = useState({
    new_leads: '', leads_qualified: '', deals_lost: '', loss_reason: '',
    clients_signed: '', contract_value: '',
    what_worked: '', what_didnt: '', what_to_change: '', help_needed: '', top_priorities: '',
  });
  const [weeklySubmitting, setWeeklySubmitting] = useState(false);
  const [weeklySuccess, setWeeklySuccess]       = useState(false);

  const isFriday = today.getDay() === 5;

  const loadRecentLogs = useCallback(async () => {
    try {
      setLoadingLogs(true);
      // Get logs for last 7 days
      const from = new Date(today); from.setDate(from.getDate() - 6);
      const fromISO = from.toISOString().slice(0, 10);
      const res = await salesTrackerAPI.getLogs({ from_date: fromISO, to_date: todayISO });
      const logs = res.data || [];
      setRecentLogs(logs);
      // Pre-fill if already logged today
      const todayLog = logs.find(l => l.log_date === todayISO);
      if (todayLog) {
        setForm({
          emails_sent:      String(todayLog.emails_sent      || ''),
          linkedin_sent:    String(todayLog.linkedin_sent    || ''),
          calls_made:       String(todayLog.calls_made       || ''),
          replies_received: String(todayLog.replies_received || ''),
          meetings_booked:  String(todayLog.meetings_booked  || ''),
          meetings_done:    String(todayLog.meetings_done    || ''),
          proposals_sent:   String(todayLog.proposals_sent   || ''),
          followups_done:   String(todayLog.followups_done   || ''),
          new_leads_added:  String(todayLog.new_leads_added  || ''),
          hours_worked:     String(todayLog.hours_worked     || ''),
          mood:             todayLog.mood || null,
          biggest_win:      todayLog.biggest_win     || '',
          biggest_blocker:  todayLog.biggest_blocker || '',
        });
        setSubmitted(true);
      }
    } catch (_) {}
    finally { setLoadingLogs(false); }
  }, [today, todayISO]);

  useEffect(() => { loadRecentLogs(); }, [loadRecentLogs]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.emails_sent && !form.calls_made && !form.linkedin_sent) {
      setError('Please fill in at least one activity field.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await salesTrackerAPI.submitLog({
        log_date:          fmtDate(today),
        emails_sent:       parseInt(form.emails_sent)      || 0,
        linkedin_sent:     parseInt(form.linkedin_sent)    || 0,
        calls_made:        parseInt(form.calls_made)       || 0,
        replies_received:  parseInt(form.replies_received) || 0,
        meetings_booked:   parseInt(form.meetings_booked)  || 0,
        meetings_done:     parseInt(form.meetings_done)    || 0,
        proposals_sent:    parseInt(form.proposals_sent)   || 0,
        followups_done:    parseInt(form.followups_done)   || 0,
        new_leads_added:   parseInt(form.new_leads_added)  || 0,
        hours_worked:      parseFloat(form.hours_worked)   || 0,
        mood:              form.mood,
        biggest_win:       form.biggest_win     || null,
        biggest_blocker:   form.biggest_blocker || null,
      });
      setSubmitted(true);
      loadRecentLogs();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWeeklySubmit = async () => {
    setWeeklySubmitting(true);
    try {
      const iso = today.toISOString();
      const week = today.toISOString().slice(0,10);
      const wn = getISOWeek(today);
      // Calculate week date range
      const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const fri = new Date(mon);   fri.setDate(mon.getDate() + 4);
      await salesTrackerAPI.submitWeeklyReview({
        week_number:     wn,
        year:            today.getFullYear(),
        date_range:      `${fmtDate(mon)} – ${fmtDate(fri)}`,
        new_leads:       parseInt(weeklyForm.new_leads)       || 0,
        leads_qualified: parseInt(weeklyForm.leads_qualified) || 0,
        deals_lost:      parseInt(weeklyForm.deals_lost)      || 0,
        loss_reason:     weeklyForm.loss_reason   || null,
        clients_signed:  parseInt(weeklyForm.clients_signed)  || 0,
        contract_value:  parseFloat(weeklyForm.contract_value) || 0,
        what_worked:     weeklyForm.what_worked    || null,
        what_didnt:      weeklyForm.what_didnt     || null,
        what_to_change:  weeklyForm.what_to_change || null,
        help_needed:     weeklyForm.help_needed    || null,
        top_priorities:  weeklyForm.top_priorities || null,
      });
      setWeeklySuccess(true);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save weekly review.');
    } finally {
      setWeeklySubmitting(false);
    }
  };

  // Get ISO week number
  const getISOWeek = (d) => {
    const date = new Date(d); date.setHours(0,0,0,0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  // Build current week days map from recent logs
  const weekDaysMap = {};
  const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const log = recentLogs.find(l => l.log_date === iso);
    weekDaysMap[DAYS[i]] = { date: d, iso, log };
  }

  const numInput = (key, label, hint) => {
    const tgt = TARGETS[key];
    const pill = tgt ? getStatusPill(form[key], tgt.min, tgt.max) : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="label" style={{ fontSize: '0.8125rem' }}>{label}</label>
          {pill && (
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: 9999, background: pill.bg, color: pill.color }}>
              {pill.label}
            </span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="number" min="0" className="input"
            value={form[key]}
            onChange={e => setF(key, e.target.value)}
            placeholder="0"
            style={{ width: '100%' }}
          />
        </div>
        {hint && <p style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', margin: 0 }}>{hint}</p>}
      </div>
    );
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p className="label-sm" style={{ color: 'var(--tertiary)', marginBottom: '0.25rem' }}>Sales Tracker</p>
        <h1 className="headline-sm">Daily Activity Log</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
          {today.toLocaleDateString('en-IE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Target banner */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.625rem',
        padding: '0.75rem 1rem', borderRadius: '0.625rem', marginBottom: '1.5rem',
        background: 'rgba(68,104,176,0.08)', border: '1px solid rgba(68,104,176,0.15)',
        alignItems: 'center',
      }}>
        <Icon name="target" style={{ fontSize: '1rem', color: 'var(--primary)' }} />
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--primary)' }}>Daily targets:</span>
        {Object.entries(TARGETS).map(([k, t]) => (
          <span key={k} style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
            {t.label}: <strong style={{ color: 'var(--on-surface)' }}>{t.min}–{t.max}</strong>
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: '1.25rem', alignItems: 'start' }}>

        {/* ── Log Form ── */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>
              {submitted ? "Today's Log" : "Log Today's Activity"}
            </h2>
            {submitted && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', color: '#006633', fontWeight: 600 }}>
                <Icon name="check_circle" style={{ fontSize: '1rem', color: '#006633' }} /> Saved
              </span>
            )}
          </div>

          {/* Outreach */}
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: '0.875rem' }}>Outreach</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            {numInput('emails_sent',   'Cold Emails Sent',        'Target: 10–15')}
            {numInput('linkedin_sent', 'LinkedIn Messages',       'Target: 8–10')}
            {numInput('calls_made',    'Cold Calls Made',         'Target: 3–5')}
            {numInput('replies_received', 'Replies Received',     '')}
          </div>

          {/* Meetings & proposals */}
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: '0.875rem' }}>Meetings & Pipeline</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            {numInput('meetings_booked', 'Meetings Booked', '')}
            {numInput('meetings_done',   'Meetings Done',   '')}
            {numInput('proposals_sent',  'Proposals Sent',  '')}
            {numInput('followups_done',  'Follow-ups Done', 'Target: 3–5')}
            {numInput('new_leads_added', 'New Leads Added', '')}
            {numInput('hours_worked',    'Hours Worked',    '')}
          </div>

          {/* Mood */}
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>Mood & Energy</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: form.mood <= 2 && form.mood ? '0.5rem' : '1.25rem' }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setF('mood', form.mood === n ? null : n)} style={{
                width: 44, height: 44, borderRadius: '0.5rem', border: '1.5px solid',
                borderColor: form.mood === n ? 'var(--tertiary)' : 'var(--outline-variant)',
                background: form.mood === n ? 'rgba(0,98,67,0.1)' : 'transparent',
                fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                color: form.mood === n ? 'var(--tertiary)' : 'var(--on-surface-variant)',
              }}>{n}</button>
            ))}
            <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', alignSelf: 'center', marginLeft: '0.25rem' }}>
              {form.mood === 1 ? '😔 Rough' : form.mood === 2 ? '😟 Below average' : form.mood === 3 ? '😐 Average' : form.mood === 4 ? '🙂 Good' : form.mood === 5 ? '🤩 Brilliant!' : ''}
            </span>
          </div>
          {form.mood !== null && form.mood <= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'var(--error-container)', marginBottom: '1.25rem' }}>
              <Icon name="warning" style={{ fontSize: '1rem', color: 'var(--error)' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--error)', margin: 0 }}>Burnout alert — this will be flagged for Jayant's attention.</p>
            </div>
          )}

          {/* Text fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.5rem' }}>
            <div>
              <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>Biggest Win Today <span style={{ color: 'var(--on-surface-variant)', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="textarea" rows={2} value={form.biggest_win} onChange={e => setF('biggest_win', e.target.value)}
                placeholder="e.g. Booked a discovery call with Pixel Studio" style={{ width: '100%', resize: 'none' }} />
            </div>
            <div>
              <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>Biggest Blocker Today <span style={{ color: 'var(--on-surface-variant)', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="textarea" rows={2} value={form.biggest_blocker} onChange={e => setF('biggest_blocker', e.target.value)}
                placeholder="e.g. Decision maker on leave all week" style={{ width: '100%', resize: 'none' }} />
            </div>
          </div>

          {error && (
            <div style={{ padding: '0.625rem 0.875rem', background: 'var(--error-container)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting} style={{
            width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: 'none',
            cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)',
            fontWeight: 700, fontSize: '0.9375rem', color: '#fff',
            background: submitting ? 'var(--outline-variant)' : 'linear-gradient(135deg,var(--tertiary),#009966)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}>
            {submitting
              ? <><Icon name="progress_activity" style={{ animation: 'spin 1s linear infinite', color: '#fff' }} /> Saving…</>
              : <><Icon name={submitted ? 'sync' : 'save'} style={{ color: '#fff' }} /> {submitted ? 'Update Log' : "Log Today's Activity"}</>}
          </button>
        </div>

        {/* ── Right panel: this week mini-view ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* This week at a glance */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>This Week</h3>
            {loadingLogs ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>Loading…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {DAYS.map(day => {
                  const { date: d, iso, log } = weekDaysMap[day] || {};
                  const isFuture = d > today;
                  const isToday  = iso === todayISO;
                  return (
                    <div key={day} style={{
                      display: 'flex', alignItems: 'center', gap: '0.625rem',
                      padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                      background: isToday ? 'rgba(68,104,176,0.08)' : 'var(--surface-container-low)',
                      border: isToday ? '1px solid rgba(68,104,176,0.2)' : '1px solid transparent',
                      opacity: isFuture ? 0.45 : 1,
                    }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, width: 28, color: isToday ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
                        {day.slice(0,3)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', width: 60 }}>
                        {d ? d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short' }) : ''}
                      </span>
                      <div style={{ flex: 1 }}>
                        {log ? (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {[
                              { label: 'E', val: log.emails_sent,   color: '#4468B0' },
                              { label: 'L', val: log.linkedin_sent, color: '#7C3AED' },
                              { label: 'C', val: log.calls_made,    color: '#D97706' },
                            ].map(({ label, val, color }) => (
                              <span key={label} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: 4, background: `${color}18`, color }}>
                                {label}:{val || 0}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
                            {isFuture ? '—' : 'Not logged'}
                          </span>
                        )}
                      </div>
                      {log && <Icon name="check_circle" style={{ fontSize: '0.875rem', color: '#006633' }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Friday — Weekly Review nudge */}
          {isFriday && (
            <div className="card" style={{ padding: '1.25rem', border: '1px solid rgba(68,104,176,0.2)', background: 'rgba(68,104,176,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Icon name="event_note" style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>It's Friday — Weekly Review</h3>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: '0.875rem' }}>
                Fill your weekly review before you leave today.
              </p>
              {weeklyTab === null && (
                <button onClick={() => setWeeklyTab('open')} className="btn-primary" style={{ width: '100%', padding: '0.625rem' }}>
                  Start Weekly Review
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Weekly Review form (Friday only, expandable) */}
      {weeklyTab === 'open' && (
        <div className="card" style={{ padding: '1.5rem', marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Weekly Review — Week {getISOWeek(today)}</h2>
            <button onClick={() => setWeeklyTab(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <Icon name="close" />
            </button>
          </div>

          {weeklySuccess ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Icon name="check_circle" style={{ fontSize: '2.5rem', color: 'var(--tertiary)', display: 'block', margin: '0 auto 0.75rem' }} />
              <p style={{ fontWeight: 700 }}>Weekly review saved! Great work this week, Kajal.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
                {[
                  { k: 'new_leads', label: 'New Leads Added' },
                  { k: 'leads_qualified', label: 'Leads Qualified' },
                  { k: 'deals_lost', label: 'Deals Lost' },
                  { k: 'clients_signed', label: 'Clients Signed' },
                  { k: 'contract_value', label: 'Contract Value Won (€)' },
                ].map(({ k, label }) => (
                  <div key={k}>
                    <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>{label}</label>
                    <input type="number" min="0" className="input" value={weeklyForm[k]}
                      onChange={e => setWeeklyForm(f => ({ ...f, [k]: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
                {[
                  { k: 'loss_reason',    label: 'Reason for Deals Lost',    ph: 'e.g. Price too high, no budget' },
                  { k: 'what_worked',    label: 'What worked this week?',   ph: 'e.g. LinkedIn outreach to fintech sector' },
                  { k: 'what_didnt',     label: "What didn't work?",        ph: 'e.g. Cold emails to HR departments' },
                  { k: 'what_to_change', label: 'What will you change?',    ph: 'e.g. Try video messages on LinkedIn' },
                  { k: 'help_needed',    label: 'Help needed from Jayant?', ph: 'e.g. Intro to Stripe contact' },
                  { k: 'top_priorities', label: 'Top 3 priorities next week', ph: '1. Follow up with Pixel Studio...' },
                ].map(({ k, label, ph }) => (
                  <div key={k}>
                    <label className="label" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'block' }}>{label}</label>
                    <textarea className="textarea" rows={2} value={weeklyForm[k]}
                      onChange={e => setWeeklyForm(f => ({ ...f, [k]: e.target.value }))}
                      placeholder={ph} style={{ width: '100%', resize: 'none' }} />
                  </div>
                ))}
              </div>
              <button onClick={handleWeeklySubmit} disabled={weeklySubmitting} style={{
                padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none',
                cursor: weeklySubmitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)',
                fontWeight: 700, fontSize: '0.9375rem', color: '#fff',
                background: weeklySubmitting ? 'var(--outline-variant)' : 'linear-gradient(135deg,var(--tertiary),#009966)',
              }}>
                {weeklySubmitting ? 'Saving…' : 'Save Weekly Review'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
