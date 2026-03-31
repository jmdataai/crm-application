import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const STAGE_META = {
  sourced:             { label:'Sourced',             bg:'var(--surface-container)',     color:'var(--on-surface-variant)', next:'screened' },
  screened:            { label:'Screened',            bg:'var(--secondary-container)',   color:'#2b3a4e',                   next:'shortlisted' },
  shortlisted:         { label:'Shortlisted',         bg:'rgba(217,119,6,0.12)',         color:'#92400e',                   next:'interview_scheduled' },
  interview_scheduled: { label:'Interview Scheduled', bg:'rgba(0,74,198,0.1)',           color:'var(--primary)',             next:'interviewed' },
  interviewed:         { label:'Interviewed',         bg:'rgba(0,74,198,0.15)',          color:'var(--primary)',             next:'selected' },
  selected:            { label:'Selected',            bg:'rgba(0,98,67,0.12)',           color:'var(--tertiary)',            next:'onboarded' },
  rejected:            { label:'Rejected',            bg:'var(--error-container)',       color:'var(--on-error-container)', next:null },
  onboarded:           { label:'Onboarded',           bg:'rgba(0,98,67,0.22)',           color:'var(--tertiary)',            next:null },
};

const STAGES_ORDER = ['sourced','screened','shortlisted','interview_scheduled','interviewed','selected','onboarded'];

const ACT_ICON  = { note:'edit_note', call:'phone', email:'mail', interview:'video_call', status_change:'swap_horiz', task:'task_alt' };
const ACT_COLOR = { note:'var(--amber)', call:'var(--primary)', email:'var(--tertiary)', interview:'#7c3aed', status_change:'var(--secondary)', task:'var(--primary)' };

/* ── Seed ───────────────────────────────────────────── */
const DB = {
  c1: {
    id:'c1', name:'Arjun Mehta', email:'arjun@gmail.com', phone:'+91 98765 11111',
    role:'AI Engineer', job:'Senior ML Engineer', dept:'Engineering', exp:6,
    source:'LinkedIn', status:'interview_scheduled', applied:'2026-03-25',
    linkedin:'linkedin.com/in/arjunmehta', portfolio:'arjun.dev',
    skills:['Python','TensorFlow','MLOps','Docker','Kubernetes'],
    notes:'Strong profile. 2 YOE in LLMs. Cleared screening round with full marks.',
    activities:[
      { id:'a1', type:'status_change', text:'Moved to Interview Scheduled',         date:'2026-03-30 15:00', user:'Recruiter' },
      { id:'a2', type:'interview',     text:'Cleared Technical Round 1 — Score 9/10', date:'2026-03-29 11:00', user:'Priya R.' },
      { id:'a3', type:'email',         text:'Interview confirmation sent to candidate', date:'2026-03-28 10:00', user:'Recruiter' },
      { id:'a4', type:'status_change', text:'Moved to Shortlisted',                 date:'2026-03-27 09:00', user:'Recruiter' },
      { id:'a5', type:'call',          text:'Screening call — 20 min, strong culture fit', date:'2026-03-26 14:00', user:'Recruiter' },
      { id:'a6', type:'note',          text:'Imported from LinkedIn campaign',       date:'2026-03-25 08:00', user:'System' },
    ],
    interviews:[
      { id:'iv1', type:'Technical Round 1', date:'2026-03-29', time:'11:00 AM', interviewer:'Priya R.', rating:9, feedback:'Excellent problem solving. Strong in Python and TF.', completed:true },
      { id:'iv2', type:'Technical Round 2', date:'2026-04-01', time:'10:00 AM', interviewer:'Karan D.', rating:null, feedback:'', completed:false },
    ],
  },
  c4: {
    id:'c4', name:'Divya Rao', email:'divya@gmail.com', phone:'+91 95432 44444',
    role:'ML Research', job:'Research Scientist', dept:'AI Research', exp:4,
    source:'Resume', status:'selected', applied:'2026-03-20',
    linkedin:'linkedin.com/in/divyarao', portfolio:'',
    skills:['NLP','Python','Research','Transformers','Statistics'],
    notes:'Excellent culture fit. PhD from IISc. Recommended by three senior researchers.',
    activities:[
      { id:'a1', type:'status_change', text:'Selected — offer in progress',          date:'2026-03-30 16:00', user:'HR Lead' },
      { id:'a2', type:'interview',     text:'Final HR round — Very positive',        date:'2026-03-29 14:00', user:'Anita K.' },
      { id:'a3', type:'interview',     text:'Technical + Research panel — 10/10',   date:'2026-03-27 10:00', user:'Research Team' },
    ],
    interviews:[
      { id:'iv1', type:'Research Panel', date:'2026-03-27', time:'10:00 AM', interviewer:'Research Team', rating:10, feedback:'Outstanding. Best candidate we have seen this cycle.', completed:true },
      { id:'iv2', type:'HR Final Round', date:'2026-03-29', time:'2:00 PM',  interviewer:'Anita K.',      rating:9,  feedback:'Very positive. Ready for offer.',                   completed:true },
    ],
  },
};

const FALLBACK = (id) => ({
  id, name:'Candidate', email:'', phone:'', role:'', job:'', dept:'', exp:0,
  source:'Manual', status:'sourced', applied:'2026-03-31',
  linkedin:'', portfolio:'', skills:[], notes:'', activities:[], interviews:[],
});

/* ── Schedule Interview Modal ───────────────────────── */
const ScheduleModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ type:'Technical Round', date:'', time:'10:00', interviewer:'', notes:'' });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.date) return;
    onAdd({ ...form, id:`iv${Date.now()}`, rating:null, feedback:'', completed:false });
    onClose();
  };
  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Schedule Interview</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div>
            <label className="label">Interview Type</label>
            <select className="select" value={form.type} onChange={e => set('type',e.target.value)}>
              {['Technical Round','HR Round','Final Round','Research Panel','Culture Fit'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date} onChange={e => set('date',e.target.value)} />
            </div>
            <div>
              <label className="label">Time</label>
              <input className="input" type="time" value={form.time} onChange={e => set('time',e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Interviewer</label>
            <input className="input" placeholder="Name of interviewer" value={form.interviewer} onChange={e => set('interviewer',e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="textarea" rows={2} placeholder="Focus areas, prep notes…" value={form.notes} onChange={e => set('notes',e.target.value)} />
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={submit} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
            <Icon name="event" style={{ fontSize:'1rem', color:'#fff' }} /> Schedule
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main ───────────────────────────────────────────── */
export default function CandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCand] = useState(() => DB[id] || FALLBACK(id));
  const [activeTab, setTab]  = useState('activity');
  const [showSchedule, setSchedule] = useState(false);
  const [editing, setEditing]       = useState(false);
  const [editForm, setEditForm]     = useState({ ...candidate });
  const [note, setNote]             = useState('');

  const sm = STAGE_META[candidate.status] || STAGE_META.sourced;
  const initials = candidate.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const stageIdx = STAGES_ORDER.indexOf(candidate.status);

  const moveStage = (newStage) => {
    const act = { id:`a${Date.now()}`, type:'status_change', text:`Moved to ${STAGE_META[newStage]?.label}`, date:new Date().toLocaleString(), user:'You' };
    setCand(c => ({ ...c, status:newStage, activities:[act,...c.activities] }));
  };

  const logAct = (type, text) => {
    const act = { id:`a${Date.now()}`, type, text, date:new Date().toLocaleString(), user:'You' };
    setCand(c => ({ ...c, activities:[act,...c.activities] }));
  };

  const addInterview = (iv) => {
    setCand(c => ({ ...c, interviews:[...c.interviews, iv] }));
    logAct('interview', `${iv.type} scheduled for ${iv.date}`);
  };

  const addNote = () => { if(!note.trim()) return; logAct('note', note.trim()); setNote(''); };

  const set = (k,v) => setEditForm(f => ({ ...f, [k]: v }));
  const saveEdit = () => { setCand(c => ({ ...c, ...editForm })); setEditing(false); };

  const TABS = [
    { key:'activity',   label:'Activity',   icon:'history' },
    { key:'interviews', label:'Interviews', icon:'video_call' },
    { key:'notes',      label:'Notes',      icon:'sticky_note_2' },
  ];

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.5rem' }}>
        <button className="btn-ghost" onClick={() => navigate('/recruitment/candidates')} style={{ padding:'0.25rem 0.5rem' }}>
          <Icon name="arrow_back" style={{ fontSize:'1rem' }} /> Candidates
        </button>
        <Icon name="chevron_right" style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
        <span style={{ fontSize:'0.875rem', fontWeight:600 }}>{candidate.name}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'5fr 7fr', gap:'1.25rem', alignItems:'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Profile hero */}
          <div className="card" style={{ textAlign:'center', padding:'2rem 1.5rem' }}>
            <div className="avatar" style={{ width:68, height:68, fontSize:'1.5rem', fontWeight:700, background:'linear-gradient(135deg,var(--tertiary),#009966)', color:'#fff', margin:'0 auto 1rem' }}>{initials}</div>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'0.25rem' }}>{candidate.name}</h2>
            <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'0.75rem' }}>
              {candidate.role}{candidate.role && candidate.job ? ' · ' : ''}{candidate.job}
            </p>
            <span style={{ display:'inline-flex', alignItems:'center', padding:'0.25rem 0.75rem', borderRadius:9999, fontSize:'0.75rem', fontWeight:700, background:sm.bg, color:sm.color }}>{sm.label}</span>

            {/* Quick actions */}
            <div style={{ display:'flex', gap:'0.5rem', justifyContent:'center', marginTop:'1.25rem' }}>
              {[
                { icon:'phone',     label:'Call',     act:() => logAct('call','Logged a call') },
                { icon:'mail',      label:'Email',    act:() => logAct('email','Sent an email') },
                { icon:'event',     label:'Schedule', act:() => setSchedule(true) },
              ].map(a => (
                <button key={a.label} className="btn-secondary" onClick={a.act} style={{ flexDirection:'column', gap:'0.25rem', padding:'0.625rem 1rem', fontSize:'0.75rem' }}>
                  <Icon name={a.icon} style={{ fontSize:'1.125rem' }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline progress */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Hiring Pipeline</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
              {STAGES_ORDER.map((s, i) => {
                const sm2 = STAGE_META[s];
                const done  = i < stageIdx;
                const active = s === candidate.status;
                const future = i > stageIdx;
                return (
                  <button key={s} onClick={() => !active && moveStage(s)} style={{
                    display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.5rem 0.75rem',
                    borderRadius:'0.5rem', border:'none', cursor: active ? 'default' : 'pointer',
                    fontFamily:'Inter,sans-serif', background: active ? 'rgba(0,98,67,0.08)' : 'transparent',
                    opacity: future ? 0.45 : 1, transition:'all 0.15s',
                  }}>
                    <div style={{
                      width:22, height:22, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                      background: done ? 'var(--tertiary)' : active ? 'rgba(0,98,67,0.15)' : 'var(--surface-container)',
                      border: active ? '2px solid var(--tertiary)' : 'none',
                    }}>
                      {done  && <Icon name="check" style={{ fontSize:'0.75rem', color:'#fff' }} />}
                      {active && <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--tertiary)', display:'block' }} />}
                    </div>
                    <span style={{ fontSize:'0.875rem', fontWeight: active ? 700 : 400, color: active ? 'var(--tertiary)' : done ? 'var(--on-surface)' : 'var(--on-surface-variant)' }}>
                      {sm2.label}
                    </span>
                    {active && <Icon name="chevron_right" style={{ fontSize:'1rem', color:'var(--tertiary)', marginLeft:'auto' }} />}
                  </button>
                );
              })}
            </div>

            {/* Reject button */}
            {!['rejected','onboarded'].includes(candidate.status) && (
              <button onClick={() => moveStage('rejected')} style={{
                width:'100%', marginTop:'0.875rem', padding:'0.5rem', borderRadius:'0.5rem', border:'1px solid rgba(186,26,26,0.25)',
                background:'transparent', cursor:'pointer', fontSize:'0.875rem', fontWeight:600,
                color:'var(--error)', fontFamily:'Inter,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.375rem',
                transition:'background 0.15s',
              }}>
                <Icon name="cancel" style={{ fontSize:'1rem', color:'var(--error)' }} /> Reject Candidate
              </button>
            )}
          </div>

          {/* Candidate info */}
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Candidate Info</h3>
              <button className="btn-ghost" onClick={() => { setEditForm({...candidate}); setEditing(true); }} style={{ fontSize:'0.8125rem' }}>
                <Icon name="edit" style={{ fontSize:'1rem' }} /> Edit
              </button>
            </div>
            {[
              { icon:'mail',           label:'Email',       val: candidate.email   || '—' },
              { icon:'phone',          label:'Phone',       val: candidate.phone   || '—' },
              { icon:'work',           label:'Applying For',val: candidate.job     || '—' },
              { icon:'corporate_fare', label:'Department',  val: candidate.dept    || '—' },
              { icon:'schedule',       label:'Experience',  val: candidate.exp ? `${candidate.exp} years` : '—' },
              { icon:'hub',            label:'Source',      val: candidate.source  || '—' },
              { icon:'calendar_today', label:'Applied',     val: candidate.applied || '—' },
              { icon:'link',           label:'LinkedIn',    val: candidate.linkedin|| '—' },
            ].map(f => (
              <div key={f.label} style={{ display:'flex', gap:'0.75rem', alignItems:'flex-start', marginBottom:'0.75rem' }}>
                <Icon name={f.icon} style={{ fontSize:'1rem', color:'var(--on-surface-variant)', marginTop:'0.125rem', flexShrink:0 }} />
                <div>
                  <p className="label-sm" style={{ marginBottom:'0.125rem' }}>{f.label}</p>
                  <p style={{ fontSize:'0.875rem', fontWeight:500, wordBreak:'break-word' }}>{f.val}</p>
                </div>
              </div>
            ))}

            {/* Skills */}
            {candidate.skills?.length > 0 && (
              <div style={{ marginTop:'0.25rem' }}>
                <p className="label-sm" style={{ marginBottom:'0.5rem' }}>Skills</p>
                <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap' }}>
                  {candidate.skills.map(s => (
                    <span key={s} style={{ fontSize:'0.8125rem', fontWeight:600, padding:'0.25rem 0.625rem', borderRadius:9999, background:'rgba(0,98,67,0.08)', color:'var(--tertiary)', border:'1px solid rgba(0,98,67,0.15)' }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Tab bar */}
          <div style={{ display:'flex', gap:'2px', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.75rem', alignSelf:'flex-start' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display:'flex', alignItems:'center', gap:'0.375rem',
                padding:'0.5rem 1rem', borderRadius:'0.625rem', border:'none', cursor:'pointer',
                fontFamily:'Inter,sans-serif', fontSize:'0.875rem', fontWeight: activeTab===t.key ? 600 : 400,
                background: activeTab===t.key ? 'var(--surface-container-lowest)' : 'transparent',
                color: activeTab===t.key ? 'var(--tertiary)' : 'var(--on-surface-variant)',
                boxShadow: activeTab===t.key ? 'var(--ambient-shadow)' : 'none', transition:'all 0.2s',
              }}>
                <Icon name={t.icon} style={{ fontSize:'1rem', color:'inherit' }} />
                {t.label}
                {t.key==='interviews' && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.1rem 0.375rem', borderRadius:9999, background:'rgba(0,98,67,0.12)', color:'var(--tertiary)' }}>{candidate.interviews.length}</span>}
              </button>
            ))}
          </div>

          {/* Activity tab */}
          {activeTab === 'activity' && (
            <div className="card slide-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Activity History</h3>
                <button onClick={() => logAct('note', 'Manual note added')} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 0.875rem', borderRadius:'0.5rem', fontSize:'0.8125rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                  <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Log
                </button>
              </div>
              <div style={{ position:'relative', paddingLeft:'1.5rem' }}>
                <div style={{ position:'absolute', left:'0.625rem', top:0, bottom:0, width:2, background:'var(--surface-container)', borderRadius:2 }} />
                {candidate.activities.map((act, i) => (
                  <div key={act.id} style={{ display:'flex', gap:'0.875rem', marginBottom: i<candidate.activities.length-1 ? '1.25rem' : 0, position:'relative' }}>
                    <div style={{
                      position:'absolute', left:'-1.1875rem', top:'0.25rem',
                      width:14, height:14, borderRadius:'50%',
                      background: ACT_COLOR[act.type] || 'var(--tertiary)',
                      border:'2px solid var(--surface-container-lowest)',
                    }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:'0.5rem' }}>
                        <p style={{ fontWeight:600, fontSize:'0.875rem' }}>{act.text}</p>
                        <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap', flexShrink:0 }}>{act.date}</span>
                      </div>
                      <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>by {act.user}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interviews tab */}
          {activeTab === 'interviews' && (
            <div className="card slide-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Interview Rounds</h3>
                <button onClick={() => setSchedule(true)} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 0.875rem', borderRadius:'0.5rem', fontSize:'0.8125rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                  <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Schedule
                </button>
              </div>

              {candidate.interviews.length === 0 && (
                <div style={{ textAlign:'center', padding:'2rem', color:'var(--on-surface-variant)' }}>
                  <Icon name="video_call" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.25 }} />
                  No interviews scheduled yet.
                </div>
              )}

              {candidate.interviews.map((iv, i) => (
                <div key={iv.id} style={{ padding:'1rem', background: iv.completed ? 'var(--surface-container-low)' : 'rgba(0,74,198,0.04)', borderRadius:'0.75rem', border:`1px solid ${iv.completed ? 'rgba(195,198,215,0.1)' : 'rgba(0,74,198,0.15)'}`, marginBottom: i < candidate.interviews.length-1 ? '0.875rem' : 0 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'0.625rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      <div style={{ width:36, height:36, borderRadius:'0.5rem', background: iv.completed ? 'rgba(0,98,67,0.1)' : 'rgba(0,74,198,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon name="video_call" style={{ fontSize:'1.125rem', color: iv.completed ? 'var(--tertiary)' : 'var(--primary)' }} />
                      </div>
                      <div>
                        <p style={{ fontWeight:700, fontSize:'0.875rem' }}>{iv.type}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>with {iv.interviewer}</p>
                      </div>
                    </div>
                    <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.15rem 0.5rem', borderRadius:9999, background: iv.completed ? 'rgba(0,98,67,0.1)' : 'rgba(0,74,198,0.1)', color: iv.completed ? 'var(--tertiary)' : 'var(--primary)' }}>
                      {iv.completed ? 'Completed' : 'Upcoming'}
                    </span>
                  </div>

                  <div style={{ display:'flex', gap:'1rem', marginBottom: iv.feedback ? '0.625rem' : 0 }}>
                    <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                      <Icon name="calendar_today" style={{ fontSize:'0.875rem' }} /> {iv.date} · {iv.time}
                    </span>
                    {iv.rating && (
                      <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--tertiary)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                        <Icon name="star" style={{ fontSize:'0.875rem', color:'var(--amber)' }} /> {iv.rating}/10
                      </span>
                    )}
                  </div>

                  {iv.feedback && (
                    <div style={{ padding:'0.5rem 0.75rem', background:'rgba(0,98,67,0.06)', borderRadius:'0.5rem', borderLeft:'3px solid var(--tertiary)' }}>
                      <p style={{ fontSize:'0.8125rem', color:'var(--on-surface)', lineHeight:1.6 }}>{iv.feedback}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Notes tab */}
          {activeTab === 'notes' && (
            <div className="card slide-in">
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Recruiter Notes</h3>
              <div style={{ background:'var(--surface-container-low)', borderRadius:'0.625rem', padding:'1rem', minHeight:80, marginBottom:'1rem' }}>
                <p style={{ fontSize:'0.875rem', color: candidate.notes ? 'var(--on-surface)' : 'var(--on-surface-variant)', whiteSpace:'pre-wrap' }}>{candidate.notes || 'No notes yet.'}</p>
              </div>
              <div>
                <label className="label">Add Note</label>
                <textarea className="textarea" rows={3} placeholder="Type a note…" value={note} onChange={e => setNote(e.target.value)} />
                <button onClick={addNote} style={{ marginTop:'0.75rem', display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                  <Icon name="save" style={{ fontSize:'1rem', color:'#fff' }} /> Save Note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && setEditing(false)}>
          <div className="modal modal-lg">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
              <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Edit Candidate</h2>
              <button className="btn-icon" onClick={() => setEditing(false)}><Icon name="close" /></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              {[
                { label:'Full Name *', key:'name',  type:'text',  span:2 },
                { label:'Email',       key:'email', type:'email' },
                { label:'Phone',       key:'phone', type:'tel' },
                { label:'Current Role',key:'role',  type:'text' },
                { label:'Applying For',key:'job',   type:'text' },
                { label:'LinkedIn',    key:'linkedin',type:'text' },
                { label:'Portfolio',   key:'portfolio',type:'text' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn:f.span===2?'1/-1':undefined }}>
                  <label className="label">{f.label}</label>
                  <input className="input" type={f.type} value={editForm[f.key]||''} onChange={e => set(f.key,e.target.value)} />
                </div>
              ))}
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Notes</label>
                <textarea className="textarea" rows={4} value={editForm.notes||''} onChange={e => set('notes',e.target.value)} />
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
              <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button onClick={saveEdit} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                <Icon name="save" style={{ fontSize:'1rem', color:'#fff' }} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showSchedule && <ScheduleModal onClose={() => setSchedule(false)} onAdd={addInterview} />}
    </div>
  );
}
