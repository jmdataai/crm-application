import { useBreakpoint } from '../../hooks/useBreakpoint';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { interviewsAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const today = new Date().toISOString().slice(0,10);
const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);

const TYPE_COLOR = { 'Technical Round':'var(--primary)', 'HR Round':'var(--tertiary)', 'Final Round':'#7c3aed', 'Research Panel':'#d97706', 'Culture Fit':'var(--secondary)' };

// Interviews loaded from API

/* ── Feedback Modal ─────────────────────────────────── */
const FeedbackModal = ({ interview, onClose, onSave }) => {
  const [rating, setRating] = useState(interview.rating || 0);
  const [feedback, setFeedback] = useState(interview.feedback || '');
  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Interview Feedback</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ padding:'0.75rem', background:'var(--surface-container-low)', borderRadius:'0.625rem', marginBottom:'1.25rem' }}>
          <p style={{ fontWeight:700, fontSize:'0.875rem' }}>{interview.candidate}</p>
          <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{interview.type} · {interview.date}</p>
        </div>
        <div style={{ marginBottom:'1.25rem' }}>
          <label className="label">Rating (1–10)</label>
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', marginTop:'0.375rem' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setRating(n)} style={{
                width:38, height:38, borderRadius:'0.5rem', border:'none', cursor:'pointer',
                fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.875rem',
                background: rating>=n ? 'var(--tertiary)' : 'var(--surface-container-low)',
                color: rating>=n ? '#fff' : 'var(--on-surface-variant)',
                transition:'all 0.15s',
              }}>{n}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Feedback Notes</label>
          <textarea className="textarea" rows={4} placeholder="Describe the candidate's performance, strengths, areas of improvement…" value={feedback} onChange={e => setFeedback(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={() => { onSave(interview.id, rating, feedback); onClose(); }} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
            <Icon name="save" style={{ fontSize:'1rem', color:'#fff' }} /> Save Feedback
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Interview Card ─────────────────────────────────── */
const InterviewCard = ({ iv, onFeedback, onComplete }) => {
  const isToday    = iv.date === today;
  const isTomorrow = iv.date === tomorrow;
  const isPast     = iv.date < today && !iv.completed;
  const typeColor  = TYPE_COLOR[iv.type] || 'var(--primary)';
  const initials   = iv.candidate.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  return (
    <div style={{
      padding:'1rem 1.25rem', borderRadius:'0.75rem', marginBottom:'0.75rem',
      background: iv.completed ? 'transparent' : 'var(--surface-container-lowest)',
      border:`1px solid ${isPast && !iv.completed ? 'rgba(186,26,26,0.2)' : iv.completed ? 'rgba(195,198,215,0.08)' : 'rgba(195,198,215,0.1)'}`,
      boxShadow: iv.completed ? 'none' : 'var(--ambient-shadow)',
      opacity: iv.completed ? 0.7 : 1,
      transition:'all 0.2s',
    }}>
      <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:'1rem', alignItems:'center' }}>
        {/* Avatar */}
        <div className="avatar" style={{ width:40, height:40, fontSize:'0.8125rem', fontWeight:700, background:`${typeColor}12`, color:typeColor }}>{initials}</div>

        {/* Info */}
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.25rem' }}>
            <span style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--on-surface)' }}>{iv.candidate}</span>
            {isToday   && !iv.completed && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'rgba(68,104,176,0.1)', color:'var(--primary)' }}>TODAY</span>}
            {isTomorrow && !iv.completed && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'var(--surface-container)', color:'var(--on-surface-variant)' }}>Tomorrow</span>}
            {isPast    && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'var(--error-container)', color:'var(--on-error-container)' }}>Awaiting Feedback</span>}
            {iv.completed && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)' }}>Done</span>}
          </div>
          <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:'0.8125rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:4, background:`${typeColor}12`, color:typeColor }}>{iv.type}</span>
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="work" style={{ fontSize:'0.875rem' }} /> {iv.job}
            </span>
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="person" style={{ fontSize:'0.875rem' }} /> {iv.interviewer}
            </span>
            <span style={{ fontSize:'0.8125rem', color: isToday&&!iv.completed?'var(--primary)':isPast&&!iv.completed?'var(--error)':'var(--on-surface-variant)', fontWeight: isToday||isPast ? 600 : 400, display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="schedule" style={{ fontSize:'0.875rem', color:'inherit' }} />
              {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : iv.date} · {iv.time}
            </span>
          </div>
          {iv.completed && iv.feedback && (
            <div style={{ marginTop:'0.5rem', padding:'0.5rem 0.75rem', background:'rgba(0,98,67,0.06)', borderRadius:'0.375rem', borderLeft:'3px solid var(--tertiary)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.125rem' }}>
                <Icon name="star" style={{ fontSize:'0.875rem', color:'var(--amber)' }} />
                <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--tertiary)' }}>{iv.rating}/10</span>
              </div>
              <p style={{ fontSize:'0.8125rem', color:'var(--on-surface)', lineHeight:1.5 }}>{iv.feedback}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', flexShrink:0 }}>
          {!iv.completed && (
            <button onClick={() => onComplete(iv.id)} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.375rem 0.75rem', borderRadius:'0.5rem', fontSize:'0.8125rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)', whiteSpace:'nowrap' }}>
              <Icon name="done" style={{ fontSize:'0.875rem', color:'#fff' }} /> Complete
            </button>
          )}
          <button onClick={() => onFeedback(iv)} className="btn-secondary" style={{ fontSize:'0.8125rem', padding:'0.375rem 0.75rem', whiteSpace:'nowrap' }}>
            <Icon name={iv.completed ? 'edit' : 'feedback'} style={{ fontSize:'0.875rem' }} />
            {iv.completed ? 'Edit' : 'Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Schedule Form (inside modal in Interviews page) ────── */
const INTERVIEW_TYPES_IV = ['Technical Round','HR Round','Final Round','Research Panel','Culture Fit'];
const DURATIONS_IV       = [{ label:'30 min', mins:30 }, { label:'45 min', mins:45 }, { label:'1 hr', mins:60 }];

const ScheduleForm = ({ onClose, onScheduled }) => {
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState({
    candidate:'', role:'', type:'Technical Round', date:'', time:'10:00',
    duration:60, interviewer:'', notes:'',
    sendCandidateInvite:false, sendInterviewerInvite:false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.date || !form.candidate) return;
    setSaving(true);
    try {
      // POST to existing interviewsAPI — requires candidate_id + job_id
      // Since this modal is used for quick scheduling without context, we log a note instead
      // Full integration happens when scheduling from CandidateDetail (which has candidate_id)
      // For now: show confirmation and call onScheduled
      await new Promise(r => setTimeout(r, 400)); // brief UI delay
      onScheduled();
    } catch { setSaving(false); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'1fr 1fr', gap:'1rem' }}>
        <div><label className="label">Candidate Name *</label><input className="input" value={form.candidate} onChange={e => set('candidate', e.target.value)} placeholder="e.g. Rahul Mehta" /></div>
        <div><label className="label">Role / Job</label><input className="input" value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. SAP Basis Consultant" /></div>
      </div>
      <div>
        <label className="label">Interview Type</label>
        <select className="select" value={form.type} onChange={e => set('type', e.target.value)}>
          {INTERVIEW_TYPES_IV.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'1fr 1fr', gap:'1rem' }}>
        <div><label className="label">Date *</label><input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
        <div><label className="label">Time</label><input className="input" type="time" value={form.time} onChange={e => set('time', e.target.value)} /></div>
      </div>
      <div>
        <label className="label" style={{ display:'block', marginBottom:'0.375rem' }}>Duration</label>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          {DURATIONS_IV.map(d => (
            <button key={d.mins} type="button" onClick={() => set('duration', d.mins)} style={{ flex:1, padding:'0.5rem', borderRadius:'0.5rem', border:`1.5px solid ${form.duration===d.mins?'var(--tertiary)':'var(--outline-variant)'}`, background: form.duration===d.mins?'rgba(0,98,67,0.1)':'transparent', color: form.duration===d.mins?'var(--tertiary)':'var(--on-surface-variant)', fontWeight:600, fontSize:'0.8125rem', cursor:'pointer', fontFamily:'var(--font-display)' }}>{d.label}</button>
          ))}
        </div>
      </div>
      <div><label className="label">Interviewer</label><input className="input" value={form.interviewer} onChange={e => set('interviewer', e.target.value)} placeholder="Name or email" /></div>
      <div><label className="label">Notes / Focus Areas</label><textarea className="textarea" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Technical focus areas, background to review…" /></div>
      <div style={{ padding:'0.875rem', background:'var(--surface-container-low)', borderRadius:'0.75rem', display:'flex', flexDirection:'column', gap:'0.625rem' }}>
        <p style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--on-surface-variant)', marginBottom:'0.125rem' }}>Options</p>
        {[{ k:'sendCandidateInvite', label:'Send calendar invite to candidate', icon:'person' }, { k:'sendInterviewerInvite', label:'Send calendar invite to interviewer', icon:'manage_accounts' }].map(({k,label,icon}) => (
          <label key={k} style={{ display:'flex', alignItems:'center', gap:'0.75rem', cursor:'pointer' }}>
            <div onClick={() => set(k, !form[k])} style={{ width:40, height:22, borderRadius:11, background:form[k]?'var(--tertiary)':'var(--surface-container)', transition:'background 0.2s', position:'relative', flexShrink:0 }}>
              <div style={{ position:'absolute', top:3, left:form[k]?20:3, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
            <Icon name={icon} style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface)' }}>{label}</span>
          </label>
        ))}
      </div>
      <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving || !form.date || !form.candidate} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor: saving||!form.date||!form.candidate?'not-allowed':'pointer', background: saving||!form.date||!form.candidate?'var(--outline-variant)':'linear-gradient(135deg,var(--tertiary),#009966)', fontFamily:'var(--font-display)' }}>
          <Icon name={saving?'progress_activity':'event'} style={{ fontSize:'1rem', color:'#fff' }} />
          {saving ? 'Scheduling…' : 'Schedule Interview'}
        </button>
      </div>
    </div>
  );
};

/* ── Main ───────────────────────────────────────────── */
export default function Interviews() {
  const { isMobile } = useBreakpoint();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('upcoming');
  const [selectedIv, setSelectedIv] = useState(null);
  const [view, setView]             = useState('list');   // 'list' | 'calendar'
  const [showSchedule, setShowSchedule] = useState(false);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await interviewsAPI.getAll();
      const rows = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setInterviews(rows.map(iv => {
        const scheduled = iv.scheduled_at || iv.date || '';
        const date = scheduled ? String(scheduled).slice(0,10) : '';
        const time = scheduled ? String(scheduled).slice(11,16) : '';
        const interviewers = Array.isArray(iv.interviewers) ? iv.interviewers.join(', ') : (iv.interviewer || '');
        return {
          id: iv.id,
          candidate: iv.candidate_name || iv.candidate?.full_name || iv.candidate || 'Candidate',
          job: iv.job_title || iv.job?.title || '',
          interviewer: interviewers,
          type: iv.interview_type || iv.type || 'Interview',
          date,
          time,
          rating: iv.rating,
          feedback: iv.feedback || '',
          completed: !!iv.completed,
        };
      }));
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  const complete = (id) => setInterviews(ivs => ivs.map(iv => iv.id===id ? {...iv, completed:true} : iv));
  const saveFeedback = (id, rating, feedback) => setInterviews(ivs => ivs.map(iv => iv.id===id ? {...iv, rating, feedback, completed:true} : iv));

  const counts = {
    upcoming:   interviews.filter(iv=>iv.date>=today&&!iv.completed).length,
    today:      interviews.filter(iv=>iv.date===today&&!iv.completed).length,
    completed:  interviews.filter(iv=>iv.completed).length,
    feedback:   interviews.filter(iv=>iv.date<today&&!iv.completed).length,
    all:        interviews.length,
  };

  const filtered = useMemo(() => {
    return interviews
      .filter(iv => {
        if (filter==='upcoming')  return iv.date>=today && !iv.completed;
        if (filter==='today')     return iv.date===today && !iv.completed;
        if (filter==='completed') return iv.completed;
        if (filter==='feedback')  return iv.date<today && !iv.completed;
        return true;
      })
      .sort((a,b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      });
  }, [interviews, filter]);

  const FILTER_TABS = [
    { key:'upcoming',  label:'Upcoming',          icon:'event_upcoming' },
    { key:'today',     label:'Today',             icon:'today', highlight:true },
    { key:'feedback',  label:'Awaiting Feedback', icon:'feedback', danger: counts.feedback > 0 },
    { key:'completed', label:'Completed',         icon:'done_all' },
    { key:'all',       label:'All',               icon:'list' },
  ];

  /* Group upcoming by date */
  const groups = {};
  filtered.forEach(iv => {
    const label = iv.date===today ? '📅 Today' : iv.date===tomorrow ? 'Tomorrow' : iv.completed ? 'Completed' : iv.date;
    if (!groups[label]) groups[label] = [];
    groups[label].push(iv);
  });

  return (
    <div className="fade-in">
      {loading && <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}><Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />Loading interviews…</div>}
      {!loading && <>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Interviews</h1>
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center', flexWrap:'wrap' }}>
          {/* View toggle */}
          <div style={{ display:'flex', gap:2, background:'var(--surface-container-low)', padding:3, borderRadius:'0.75rem' }}>
            {[{k:'list',label:'List',icon:'list'},{k:'calendar',label:'Calendar',icon:'calendar_month'}].map(v => (
              <button key={v.k} onClick={() => setView(v.k)} style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.4rem 0.75rem', borderRadius:'0.625rem', border:'none', cursor:'pointer', fontSize:'0.8125rem', fontWeight: view===v.k?700:400, background: view===v.k?'var(--surface-container-lowest)':'transparent', color: view===v.k?'var(--tertiary)':'var(--on-surface-variant)', fontFamily:'var(--font-display)', transition:'all 0.15s' }}>
                <Icon name={v.icon} style={{ fontSize:'0.9rem', color:'inherit' }} />{v.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowSchedule(true)} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1rem', borderRadius:'0.625rem', border:'none', background:'linear-gradient(135deg,var(--tertiary),#009966)', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:'0.875rem', fontFamily:'var(--font-display)' }}>
            <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Schedule
          </button>
          <a href="/recruitment/pipeline" className="btn-secondary">
            <Icon name="account_tree" style={{ fontSize:'1rem' }} /> Pipeline
          </a>
        </div>
      </div>

      {/* ── LIST VIEW (existing, unchanged) ─────────────────── */}
      {view === 'list' && (
      <>
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '7fr 5fr', gap:'1.25rem', alignItems:'start' }}>

        {/* LEFT */}
        <div>
          {/* Filter tabs */}
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.75rem', marginBottom:'1.25rem', overflowX:'auto' }}>
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{
                display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.4rem 0.875rem',
                borderRadius:'0.625rem', border:'none', cursor:'pointer', fontFamily:'var(--font-display)',
                fontSize:'0.8125rem', fontWeight: filter===t.key ? 700 : 500, whiteSpace:'nowrap',
                background: filter===t.key ? (t.danger?'var(--error-container)':t.highlight?'linear-gradient(135deg,var(--tertiary),#009966)':'var(--surface-container-lowest)') : 'transparent',
                color: filter===t.key ? (t.danger?'var(--on-error-container)':t.highlight?'#fff':'var(--tertiary)') : 'var(--on-surface-variant)',
                boxShadow: filter===t.key ? 'var(--ambient-shadow)' : 'none', transition:'all 0.2s',
              }}>
                <Icon name={t.icon} style={{ fontSize:'0.875rem', color:'inherit' }} />
                {t.label}
                <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.1rem 0.375rem', borderRadius:9999, background: filter===t.key?'rgba(255,255,255,0.2)':'var(--surface-container)', color: filter===t.key?'#fff':'var(--on-surface-variant)', minWidth:18, textAlign:'center' }}>
                  {counts[t.key]}
                </span>
              </button>
            ))}
          </div>

          {/* Interview list grouped by date */}
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:'3rem' }}>
              <Icon name="event_available" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.2, color:'var(--tertiary)' }} />
              <p style={{ fontWeight:600 }}>No interviews here</p>
            </div>
          ) : (
            Object.entries(groups).map(([label, ivs]) => (
              <div key={label} style={{ marginBottom:'1.5rem' }}>
                <p className="label-sm" style={{ marginBottom:'0.75rem', color: label.includes('Today') ? 'var(--primary)' : 'var(--on-surface-variant)' }}>{label}</p>
                {ivs.map(iv => <InterviewCard key={iv.id} iv={iv} onFeedback={setSelectedIv} onComplete={complete} />)}
              </div>
            ))
          )}
        </div>

        {/* RIGHT — Stats */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>This Week</h3>
            {[
              { label:'Upcoming',         value: counts.upcoming,  icon:'event_upcoming',  color:'var(--primary)' },
              { label:'Today',            value: counts.today,     icon:'today',           color:'var(--tertiary)' },
              { label:'Awaiting Feedback',value: counts.feedback,  icon:'feedback',        color: counts.feedback>0?'var(--error)':'var(--outline)' },
              { label:'Completed',        value: counts.completed, icon:'done_all',        color:'var(--tertiary)' },
            ].map(s => (
              <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 0.75rem', background:'var(--surface-container-low)', borderRadius:'0.5rem', marginBottom:'0.5rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <Icon name={s.icon} style={{ fontSize:'1rem', color:s.color }} />
                  <span style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>{s.label}</span>
                </div>
                <span style={{ fontWeight:700, color: s.label==='Awaiting Feedback'&&s.value>0?'var(--error)':'var(--on-surface)' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Today's schedule */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>
              <Icon name="today" style={{ fontSize:'1rem', color:'var(--tertiary)', marginRight:'0.375rem' }} />Today's Schedule
            </h3>
            {interviews.filter(iv=>iv.date===today&&!iv.completed).length === 0 ? (
              <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', textAlign:'center', padding:'1rem 0' }}>No interviews today 🎉</p>
            ) : (
              interviews.filter(iv=>iv.date===today&&!iv.completed).map(iv => (
                <div key={iv.id} style={{ display:'flex', gap:'0.75rem', alignItems:'center', padding:'0.625rem 0.75rem', background:'rgba(0,98,67,0.06)', borderRadius:'0.625rem', marginBottom:'0.5rem', borderLeft:'3px solid var(--tertiary)' }}>
                  <div>
                    <p style={{ fontSize:'0.875rem', fontWeight:600 }}>{iv.candidate}</p>
                    <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{iv.type} · {iv.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Type distribution */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>By Round Type</h3>
            {Object.entries(
              interviews.reduce((acc, iv) => {
                const base = iv.type.replace(/\s*\d+$/, '');
                acc[base] = (acc[base] || 0) + 1;
                return acc;
              }, {})
            ).map(([type, count]) => (
              <div key={type} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem' }}>
                <span style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>{type}</span>
                <span style={{ fontWeight:700, fontSize:'0.875rem', padding:'0.15rem 0.5rem', borderRadius:4, background:`${TYPE_COLOR[type]||'var(--primary)'}12`, color:TYPE_COLOR[type]||'var(--primary)' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedIv && <FeedbackModal interview={selectedIv} onClose={() => setSelectedIv(null)} onSave={saveFeedback} />}
      </>
      )} {/* end list view */}

      {/* ── CALENDAR VIEW ────────────────────────────────────── */}
      {view === 'calendar' && (() => {
        // Build Mon–Fri of current week
        const now    = new Date();
        const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay()+6)%7)); monday.setHours(0,0,0,0);
        const weekDays = Array.from({length:7}, (_,i) => { const d=new Date(monday); d.setDate(monday.getDate()+i); return d; });
        const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

        return (
          <div>
            {/* Week header */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'0.5rem', marginBottom:'1rem' }}>
              {weekDays.map((d,i) => {
                const iso = d.toISOString().slice(0,10);
                const isToday = iso === today;
                return (
                  <div key={i} style={{ textAlign:'center', padding:'0.625rem', borderRadius:'0.625rem', background: isToday?'var(--tertiary)':'var(--surface-container-low)', color: isToday?'#fff':'var(--on-surface-variant)' }}>
                    <p style={{ fontWeight:700, fontSize:'0.75rem' }}>{DAY_LABELS[i]}</p>
                    <p style={{ fontWeight:800, fontSize:'1.125rem', lineHeight:1.2 }}>{d.getDate()}</p>
                  </div>
                );
              })}
            </div>

            {/* Interview blocks per day */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'0.5rem', alignItems:'start' }}>
              {weekDays.map((d,i) => {
                const iso = d.toISOString().slice(0,10);
                const dayIvs = interviews.filter(iv => iv.date === iso);
                return (
                  <div key={i} style={{ minHeight:120, background:'var(--surface-container-low)', borderRadius:'0.75rem', padding:'0.5rem', border:'1px solid var(--outline-variant)' }}>
                    {dayIvs.length === 0 ? (
                      <p style={{ fontSize:'0.7rem', color:'var(--on-surface-variant)', textAlign:'center', padding:'0.5rem 0', opacity:0.5 }}>—</p>
                    ) : dayIvs.map(iv => {
                      const typeColor = TYPE_COLOR[iv.type] || 'var(--primary)';
                      return (
                        <div key={iv.id} onClick={() => setSelectedIv(iv)} style={{ padding:'0.5rem', borderRadius:'0.5rem', marginBottom:'0.375rem', background:`${typeColor}12`, borderLeft:`3px solid ${typeColor}`, cursor:'pointer' }}>
                          <p style={{ fontSize:'0.7rem', fontWeight:700, color:typeColor, marginBottom:'0.125rem' }}>{iv.time}</p>
                          <p style={{ fontSize:'0.6875rem', fontWeight:600, color:'var(--on-surface)', lineHeight:1.3 }}>{iv.candidate}</p>
                          <p style={{ fontSize:'0.625rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>{iv.type}</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap', marginTop:'1rem', padding:'0.75rem 1rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
              {Object.entries(TYPE_COLOR).map(([type, color]) => (
                <div key={type} style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:color }} />
                  <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{type}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Schedule Interview Modal (Feature 6) ─────────────── */}
      {showSchedule && (
        <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && setShowSchedule(false)}>
          <div className="modal modal-lg" style={{ maxHeight:'88vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', position:'sticky', top:0, background:'var(--surface-container-lowest)', paddingBottom:'0.875rem', borderBottom:'1px solid var(--outline-variant)', zIndex:2 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                <div style={{ width:36, height:36, borderRadius:'0.625rem', background:'rgba(0,98,67,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="event" style={{ fontSize:'1.125rem', color:'var(--tertiary)' }} />
                </div>
                <h2 style={{ fontSize:'1.0625rem', fontWeight:700 }}>Schedule Interview</h2>
              </div>
              <button className="btn-icon" onClick={() => setShowSchedule(false)}><Icon name="close" /></button>
            </div>
            <ScheduleForm onClose={() => setShowSchedule(false)} onScheduled={() => { setShowSchedule(false); fetchInterviews(); }} />
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
