import React, { useState, useMemo } from 'react';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const today = '2026-03-31';

const SEED = [
  { id:'r1',  title:'Follow-up: Priya Sharma interested in AI Suite', lead:'Priya Sharma',  company:'Infosys Ltd',   due:'2026-03-31', time:'10:00', emailAlert:true,  dismissed:false, repeat:'none',  note:'She mentioned budget approval by Apr 1' },
  { id:'r2',  title:'Send enterprise pricing to Rahul Mehta',         lead:'Rahul Mehta',   company:'TCS',           due:'2026-03-31', time:'12:00', emailAlert:true,  dismissed:false, repeat:'none',  note:'' },
  { id:'r3',  title:'Check in — Anika Patel callback due',            lead:'Anika Patel',   company:'Wipro',         due:'2026-03-31', time:'15:30', emailAlert:false, dismissed:false, repeat:'none',  note:'She prefers afternoon calls' },
  { id:'r4',  title:'Weekly pipeline review',                          lead:'',              company:'',              due:'2026-03-31', time:'09:00', emailAlert:true,  dismissed:true,  repeat:'weekly', note:'Every Monday 9am' },
  { id:'r5',  title:'Follow-up: Deepa Nair — OVERDUE',                lead:'Deepa Nair',    company:'Mindtree',      due:'2026-03-28', time:'09:00', emailAlert:true,  dismissed:false, repeat:'none',  note:'Urgent — was interested last contact' },
  { id:'r6',  title:'Discovery call reminder — Meera Joshi',          lead:'Meera Joshi',   company:'Accenture',     due:'2026-04-01', time:'11:00', emailAlert:true,  dismissed:false, repeat:'none',  note:'' },
  { id:'r7',  title:'Proposal deadline — Rajesh Gupta',               lead:'Rajesh Gupta',  company:'Capgemini',     due:'2026-04-01', time:'17:00', emailAlert:true,  dismissed:false, repeat:'none',  note:'Needs proposal by EOD' },
  { id:'r8',  title:'Monthly team sync',                               lead:'',              company:'',              due:'2026-04-02', time:'10:00', emailAlert:false, dismissed:false, repeat:'monthly', note:'' },
  { id:'r9',  title:'Reconnect: Vikram Singh — 2-week check',         lead:'Vikram Singh',  company:'HCL Tech',      due:'2026-04-03', time:'14:00', emailAlert:true,  dismissed:false, repeat:'none',  note:'' },
  { id:'r10', title:'Q2 outreach campaign kickoff',                    lead:'',              company:'',              due:'2026-04-05', time:'09:00', emailAlert:true,  dismissed:false, repeat:'none',  note:'Kick off new Apollo sequence' },
];

const REPEAT_LABEL = { none:'One-time', daily:'Daily', weekly:'Weekly', monthly:'Monthly' };

/* ── Add Reminder Modal ─────────────────────────────── */
const AddReminderModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({
    title:'', lead:'', company:'', due:today, time:'09:00',
    emailAlert:true, repeat:'none', note:'',
  });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => { if(!form.title.trim()) return; onAdd({ ...form, id:`r${Date.now()}`, dismissed:false }); onClose(); };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>New Reminder</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div>
            <label className="label">Reminder Title *</label>
            <input className="input" placeholder="e.g. Follow up with Priya about pricing" value={form.title} onChange={e => set('title',e.target.value)} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.due} onChange={e => set('due',e.target.value)} />
            </div>
            <div>
              <label className="label">Time</label>
              <input className="input" type="time" value={form.time} onChange={e => set('time',e.target.value)} />
            </div>
            <div>
              <label className="label">Lead Name</label>
              <input className="input" placeholder="Optional" value={form.lead} onChange={e => set('lead',e.target.value)} />
            </div>
            <div>
              <label className="label">Repeat</label>
              <select className="select" value={form.repeat} onChange={e => set('repeat',e.target.value)}>
                {Object.entries(REPEAT_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <textarea className="textarea" rows={2} placeholder="Optional context…" value={form.note} onChange={e => set('note',e.target.value)} />
          </div>
          {/* Email toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
            <Icon name="mail" style={{ fontSize:'1.125rem', color:'var(--primary)' }} />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)' }}>Email alert</p>
              <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>Receive an email when this reminder fires</p>
            </div>
            <button
              onClick={() => set('emailAlert', !form.emailAlert)}
              style={{
                width:44, height:24, borderRadius:12, border:'none', cursor:'pointer',
                background: form.emailAlert ? 'var(--primary)' : 'var(--outline-variant)',
                position:'relative', transition:'background 0.2s',
              }}
            >
              <span style={{
                position:'absolute', top:3, left: form.emailAlert?20:3,
                width:18, height:18, borderRadius:'50%', background:'#fff',
                transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>
            <Icon name="notifications_active" style={{ fontSize:'1rem', color:'#fff' }} /> Set Reminder
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Reminder Card ──────────────────────────────────── */
const ReminderCard = ({ reminder, onDismiss, onDelete, onToggleEmail }) => {
  const isOverdue = reminder.due < today && !reminder.dismissed;
  const isDueToday = reminder.due === today;

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'auto 1fr auto', gap:'1rem', alignItems:'flex-start',
      padding:'1rem 1.25rem', borderRadius:'0.75rem', marginBottom:'0.625rem',
      background: reminder.dismissed ? 'transparent' : 'var(--surface-container-lowest)',
      border:`1px solid ${isOverdue ? 'rgba(186,26,26,0.2)' : 'rgba(195,198,215,0.1)'}`,
      opacity: reminder.dismissed ? 0.5 : 1,
      boxShadow: reminder.dismissed ? 'none' : 'var(--ambient-shadow)',
      transition:'all 0.2s ease',
    }}>
      {/* Bell icon */}
      <div style={{
        width:40, height:40, borderRadius:'0.625rem', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
        background: isOverdue ? 'rgba(186,26,26,0.1)' : isDueToday ? 'rgba(0,74,198,0.08)' : 'var(--surface-container-low)',
      }}>
        <Icon name={isOverdue ? 'notification_important' : 'notifications'} style={{ fontSize:'1.25rem', color: isOverdue ? 'var(--error)' : isDueToday ? 'var(--primary)' : 'var(--on-surface-variant)' }} />
      </div>

      {/* Content */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.25rem' }}>
          {isOverdue && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'var(--error-container)', color:'var(--on-error-container)' }}>OVERDUE</span>}
          {isDueToday && !isOverdue && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'rgba(0,74,198,0.1)', color:'var(--primary)' }}>TODAY</span>}
          {reminder.dismissed && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'var(--surface-container)', color:'var(--on-surface-variant)' }}>DISMISSED</span>}
          {reminder.repeat !== 'none' && (
            <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)', display:'inline-flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="repeat" style={{ fontSize:'0.75rem', color:'inherit' }} /> {REPEAT_LABEL[reminder.repeat]}
            </span>
          )}
        </div>

        <p style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--on-surface)', marginBottom:'0.375rem', textDecoration: reminder.dismissed?'line-through':'none' }}>
          {reminder.title}
        </p>

        <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          {reminder.lead && (
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="person" style={{ fontSize:'0.875rem' }} /> {reminder.lead}{reminder.company ? ` · ${reminder.company}` : ''}
            </span>
          )}
          <span style={{ fontSize:'0.8125rem', color: isOverdue?'var(--error)':'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem', fontWeight: isOverdue?600:400 }}>
            <Icon name="schedule" style={{ fontSize:'0.875rem', color:'inherit' }} />
            {reminder.due === today ? 'Today' : reminder.due} at {reminder.time}
          </span>
          {reminder.emailAlert && (
            <span style={{ fontSize:'0.8125rem', color:'var(--tertiary)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="mail" style={{ fontSize:'0.875rem', color:'inherit' }} /> Email on
            </span>
          )}
        </div>
        {reminder.note && <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginTop:'0.375rem', fontStyle:'italic' }}>{reminder.note}</p>}
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:'0.25rem', flexShrink:0 }}>
        {!reminder.dismissed && (
          <button className="btn-icon" title="Dismiss" onClick={() => onDismiss(reminder.id)}>
            <Icon name="check" style={{ fontSize:'1rem' }} />
          </button>
        )}
        <button className="btn-icon" title="Toggle email" onClick={() => onToggleEmail(reminder.id)}>
          <Icon name={reminder.emailAlert ? 'mail' : 'mail_off'} style={{ fontSize:'1rem', color: reminder.emailAlert ? 'var(--primary)' : 'var(--on-surface-variant)' }} />
        </button>
        <button className="btn-icon" title="Delete" onClick={() => onDelete(reminder.id)} style={{ color:'var(--error)' }}>
          <Icon name="delete" style={{ fontSize:'1rem', color:'inherit' }} />
        </button>
      </div>
    </div>
  );
};

/* ── Main ───────────────────────────────────────────── */
export default function SalesReminders() {
  const [reminders, setReminders] = useState(SEED);
  const [showAdd, setShowAdd]     = useState(false);
  const [filter, setFilter]       = useState('active'); // active | today | overdue | dismissed | all
  const [emailAllEnabled, setEmailAllEnabled] = useState(true);

  const dismiss       = (id) => setReminders(rs => rs.map(r => r.id===id ? {...r, dismissed:true} : r));
  const del           = (id) => setReminders(rs => rs.filter(r => r.id!==id));
  const toggleEmail   = (id) => setReminders(rs => rs.map(r => r.id===id ? {...r, emailAlert:!r.emailAlert} : r));
  const add           = (r)  => setReminders(rs => [r, ...rs]);

  const counts = {
    active:   reminders.filter(r=>!r.dismissed).length,
    today:    reminders.filter(r=>r.due===today&&!r.dismissed).length,
    overdue:  reminders.filter(r=>r.due<today&&!r.dismissed).length,
    dismissed:reminders.filter(r=>r.dismissed).length,
    all:      reminders.length,
  };

  const filtered = useMemo(() => {
    return reminders
      .filter(r => {
        if (filter==='active')    return !r.dismissed;
        if (filter==='today')     return r.due===today&&!r.dismissed;
        if (filter==='overdue')   return r.due<today&&!r.dismissed;
        if (filter==='dismissed') return r.dismissed;
        return true;
      })
      .sort((a,b) => {
        if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
        return a.due.localeCompare(b.due) || a.time.localeCompare(b.time);
      });
  }, [reminders, filter]);

  const FILTER_TABS = [
    { key:'active',    label:'Active',    icon:'notifications' },
    { key:'today',     label:'Today',     icon:'today' },
    { key:'overdue',   label:'Overdue',   icon:'warning', danger:true },
    { key:'dismissed', label:'Dismissed', icon:'done_all' },
    { key:'all',       label:'All',       icon:'list' },
  ];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Reminders</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="add_alert" style={{ fontSize:'1rem', color:'#fff' }} /> New Reminder
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem', alignItems:'start' }}>

        {/* LEFT — Reminders list */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:'0.375rem', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.75rem', alignSelf:'flex-start' }}>
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{
                display:'flex', alignItems:'center', gap:'0.375rem',
                padding:'0.4rem 0.875rem', borderRadius:'0.625rem', border:'none', cursor:'pointer',
                fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight: filter===t.key ? 700 : 500,
                background: filter===t.key ? (t.danger?'var(--error-container)':'var(--surface-container-lowest)') : 'transparent',
                color: filter===t.key ? (t.danger?'var(--on-error-container)':'var(--primary)') : 'var(--on-surface-variant)',
                boxShadow: filter===t.key ? 'var(--ambient-shadow)' : 'none',
                transition:'all 0.2s ease', whiteSpace:'nowrap',
              }}>
                <Icon name={t.icon} style={{ fontSize:'0.875rem', color:'inherit' }} />
                {t.label}
                <span style={{
                  marginLeft:'0.125rem', minWidth:18, height:18, borderRadius:9999,
                  background: filter===t.key ? (t.danger?'var(--error)':'var(--primary)') : 'var(--surface-container)',
                  color: filter===t.key ? '#fff' : 'var(--on-surface-variant)',
                  fontSize:'0.6875rem', fontWeight:700,
                  display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 0.25rem',
                }}>
                  {counts[t.key]}
                </span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="card">
            {filtered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'3rem 0', color:'var(--on-surface-variant)' }}>
                <Icon name="notifications_off" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.2 }} />
                <p style={{ fontWeight:600 }}>No reminders here</p>
                <p style={{ fontSize:'0.875rem', marginTop:'0.25rem', opacity:0.7 }}>
                  {filter==='overdue' ? "You're all caught up! 🎉" : 'Set your first reminder above.'}
                </p>
              </div>
            ) : (
              filtered.map(r => (
                <ReminderCard key={r.id} reminder={r} onDismiss={dismiss} onDelete={del} onToggleEmail={toggleEmail} />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Summary + Email prefs */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* At-a-glance */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>At a Glance</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
              {[
                { label:'Active Reminders',  value: counts.active,    icon:'notifications',         color:'var(--primary)' },
                { label:'Due Today',         value: counts.today,     icon:'today',                 color:'var(--primary)' },
                { label:'Overdue',           value: counts.overdue,   icon:'notification_important', color:'var(--error)' },
                { label:'With Email Alert',  value: reminders.filter(r=>r.emailAlert&&!r.dismissed).length, icon:'mail', color:'var(--tertiary)' },
                { label:'Recurring',         value: reminders.filter(r=>r.repeat!=='none'&&!r.dismissed).length, icon:'repeat', color:'var(--secondary)' },
              ].map(s => (
                <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 0.75rem', background:'var(--surface-container-low)', borderRadius:'0.5rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <Icon name={s.icon} style={{ fontSize:'1rem', color:s.color }} />
                    <span style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>{s.label}</span>
                  </div>
                  <span style={{ fontWeight:700, fontSize:'0.9375rem', color: s.value>0&&s.label==='Overdue' ? 'var(--error)' : 'var(--on-surface)' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Email notification settings */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>
              <Icon name="mail" style={{ fontSize:'1rem', color:'var(--primary)', marginRight:'0.375rem' }} />
              Email Notifications
            </h3>

            {[
              { label:'All Reminders',       sub:'Send email for every active reminder', key:'all',     on: emailAllEnabled },
              { label:'Daily Digest',        sub:'Summary of today\'s reminders at 8am',  key:'daily',   on: true },
              { label:'Overdue Alerts',      sub:'Alert when a reminder passes due',       key:'overdue', on: true },
            ].map(pref => (
              <div key={pref.key} style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.75rem 0', borderBottom:'1px solid var(--ghost-border)' }}>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)' }}>{pref.label}</p>
                  <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{pref.sub}</p>
                </div>
                <button
                  onClick={() => pref.key==='all' && setEmailAllEnabled(v=>!v)}
                  style={{
                    width:44, height:24, borderRadius:12, border:'none', cursor:'pointer',
                    background: pref.on ? 'var(--primary)' : 'var(--outline-variant)',
                    position:'relative', transition:'background 0.2s', flexShrink:0,
                  }}
                >
                  <span style={{
                    position:'absolute', top:3, left: pref.on?20:3,
                    width:18, height:18, borderRadius:'50%', background:'#fff',
                    transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
            ))}

            <div style={{ marginTop:'1rem', padding:'0.75rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
              <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
                Emails are sent to <strong style={{ color:'var(--on-surface)' }}>your account email</strong>.
                Reminders fire at the scheduled time automatically.
              </p>
            </div>
          </div>

          {/* Quick add */}
          <div className="card" style={{ background:'linear-gradient(135deg,var(--primary),var(--primary-container))', border:'none' }}>
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', color:'#fff', marginBottom:'0.5rem' }}>Set a Quick Reminder</h3>
            <p style={{ fontSize:'0.8125rem', color:'rgba(255,255,255,0.75)', marginBottom:'1rem' }}>Quickly remind yourself to follow up on something.</p>
            <button className="btn-secondary" onClick={() => setShowAdd(true)} style={{ color:'#fff', borderColor:'rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)' }}>
              <Icon name="add_alert" style={{ fontSize:'1rem' }} /> New Reminder
            </button>
          </div>
        </div>
      </div>

      {showAdd && <AddReminderModal onClose={() => setShowAdd(false)} onAdd={add} />}
    </div>
  );
}
