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
        <div style={{ display:'flex', gap:'0.375rem', flexShrink:0 }}>
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

/* ── Main ───────────────────────────────────────────── */
export default function Interviews() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('upcoming');
  const [selectedIv, setSelectedIv] = useState(null);

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
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Interviews</h1>
        </div>
        <div style={{ display:'flex', gap:'0.625rem' }}>
          <a href="/recruitment/pipeline" className="btn-secondary">
            <Icon name="account_tree" style={{ fontSize:'1rem' }} /> Pipeline
          </a>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem', alignItems:'start' }}>

        {/* LEFT */}
        <div>
          {/* Filter tabs */}
          <div style={{ display:'flex', gap:'0.375rem', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.75rem', marginBottom:'1.25rem', overflowX:'auto' }}>
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
      </>}
    </div>
  );
}
