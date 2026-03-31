import React, { useState, useMemo } from 'react';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const today    = '2026-03-31';
const tomorrow = '2026-04-01';

const PRIORITY = {
  high:   { label:'High',   color:'var(--error)',    bg:'rgba(186,26,26,0.08)',   dot:'#ba1a1a' },
  medium: { label:'Medium', color:'var(--amber)',    bg:'rgba(217,119,6,0.08)',   dot:'#d97706' },
  low:    { label:'Low',    color:'var(--tertiary)', bg:'rgba(0,98,67,0.08)',     dot:'#006243' },
};

const TASK_TYPE = {
  interview:  { icon:'video_call',    color:'#7c3aed' },
  review:     { icon:'description',   color:'var(--primary)' },
  outreach:   { icon:'mail',          color:'var(--tertiary)' },
  call:       { icon:'phone',         color:'var(--primary)' },
  follow_up:  { icon:'schedule',      color:'var(--amber)' },
  onboarding: { icon:'how_to_reg',    color:'var(--tertiary)' },
  sourcing:   { icon:'person_search', color:'var(--secondary)' },
};

const SEED = [
  { id:'rt1',  title:'Schedule Technical Round 2 — Arjun Mehta',   type:'interview',  priority:'high',   due:'2026-03-31', time:'09:00', candidate:'Arjun Mehta',   job:'Senior ML Engineer',  done:false, notes:'Confirm slot with Karan D.' },
  { id:'rt2',  title:'Review resume — Ritu Verma',                  type:'review',     priority:'medium', due:'2026-03-31', time:'11:00', candidate:'Ritu Verma',    job:'Research Scientist',  done:false, notes:'IIT Hyderabad fresh grad' },
  { id:'rt3',  title:'Send offer letter — Divya Rao',               type:'follow_up',  priority:'high',   due:'2026-03-31', time:'14:00', candidate:'Divya Rao',     job:'Research Scientist',  done:true,  notes:'Salary approved at 18LPA' },
  { id:'rt4',  title:'Outreach: Source NLP engineers from campus',  type:'sourcing',   priority:'medium', due:'2026-03-31', time:'16:00', candidate:'',              job:'Research Scientist',  done:false, notes:'Target IIT/IISc alumni' },
  { id:'rt5',  title:'Confirm interview — Prerna Shah',             type:'interview',  priority:'high',   due:'2026-04-01', time:'09:30', candidate:'Prerna Shah',   job:'Product Lead – AI',   done:false, notes:'Final round with CEO' },
  { id:'rt6',  title:'Call Amit Gupta — post-interview follow-up',  type:'call',       priority:'medium', due:'2026-04-01', time:'11:00', candidate:'Amit Gupta',    job:'DevOps Lead',         done:false, notes:'' },
  { id:'rt7',  title:'Screen 8 new resumes — DevOps Lead',          type:'review',     priority:'low',    due:'2026-04-01', time:'14:00', candidate:'',              job:'DevOps Lead',         done:false, notes:'Received from LinkedIn campaign' },
  { id:'rt8',  title:'Update pipeline — Karan Bose',                type:'follow_up',  priority:'low',    due:'2026-04-02', time:'10:00', candidate:'Karan Bose',    job:'Product Lead – AI',   done:false, notes:'' },
  { id:'rt9',  title:'Send onboarding kit — Megha Sharma',          type:'onboarding', priority:'high',   due:'2026-03-28', time:'09:00', candidate:'Megha Sharma',  job:'Frontend Engineer',   done:false, notes:'OVERDUE — started March 20' },
  { id:'rt10', title:'Sourcing sprint: ML Engineers Q2',            type:'sourcing',   priority:'medium', due:'2026-04-05', time:'10:00', candidate:'',              job:'Senior ML Engineer',  done:false, notes:'Target 20 outreach by Apr 5' },
];

/* ── Add Task Modal ─────────────────────────────────── */
const AddTaskModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ title:'', type:'review', priority:'medium', due:today, time:'09:00', candidate:'', job:'', notes:'' });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => { if(!form.title.trim()) return; onAdd({ ...form, id:`rt${Date.now()}`, done:false }); onClose(); };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>New Recruiter Task</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {/* Type pills */}
        <div style={{ marginBottom:'1.25rem' }}>
          <label className="label">Task Type</label>
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', marginTop:'0.375rem' }}>
            {Object.entries(TASK_TYPE).map(([k,v]) => (
              <button key={k} onClick={() => set('type',k)} style={{
                display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.375rem 0.75rem',
                borderRadius:9999, border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif',
                fontSize:'0.8125rem', fontWeight:600,
                background: form.type===k ? 'var(--tertiary)' : 'var(--surface-container-low)',
                color: form.type===k ? '#fff' : 'var(--on-surface-variant)', transition:'all 0.15s',
              }}>
                <Icon name={v.icon} style={{ fontSize:'1rem', color:'inherit' }} />
                {k.charAt(0).toUpperCase()+k.slice(1).replace('_',' ')}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Task Title *</label>
            <input className="input" placeholder="e.g. Schedule interview for Arjun" value={form.title} onChange={e => set('title',e.target.value)} />
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="select" value={form.priority} onChange={e => set('priority',e.target.value)}>
              {Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Due Date</label>
            <input className="input" type="date" value={form.due} onChange={e => set('due',e.target.value)} />
          </div>
          <div>
            <label className="label">Time</label>
            <input className="input" type="time" value={form.time} onChange={e => set('time',e.target.value)} />
          </div>
          <div>
            <label className="label">Candidate (optional)</label>
            <input className="input" placeholder="Candidate name" value={form.candidate} onChange={e => set('candidate',e.target.value)} />
          </div>
          <div>
            <label className="label">Job Position</label>
            <input className="input" placeholder="Role title" value={form.job} onChange={e => set('job',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Notes</label>
            <textarea className="textarea" rows={2} value={form.notes} onChange={e => set('notes',e.target.value)} />
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={submit} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
            <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Task
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Task Row ───────────────────────────────────────── */
const TaskRow = ({ task, onToggle, onDelete }) => {
  const p = PRIORITY[task.priority];
  const tt = TASK_TYPE[task.type] || TASK_TYPE.review;
  const isOverdue = !task.done && task.due < today;
  const isToday   = task.due === today;

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'32px 1fr auto', gap:'0.875rem', alignItems:'flex-start',
      padding:'0.875rem 1rem', borderRadius:'0.625rem',
      background: task.done ? 'transparent' : 'var(--surface-container-lowest)',
      border:`1px solid ${isOverdue && !task.done ? 'rgba(186,26,26,0.2)' : 'rgba(195,198,215,0.1)'}`,
      opacity: task.done ? 0.55 : 1, marginBottom:'0.5rem', transition:'all 0.2s',
    }}>
      <button onClick={() => onToggle(task.id)} style={{
        width:22, height:22, borderRadius:6, border:`2px solid ${task.done ? 'var(--tertiary)' : p.dot}`,
        background: task.done ? 'var(--tertiary)' : 'transparent',
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginTop:2, flexShrink:0,
      }}>
        {task.done && <Icon name="check" style={{ fontSize:'0.75rem', color:'#fff' }} />}
      </button>

      <div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.25rem' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', fontSize:'0.75rem', fontWeight:600, padding:'0.125rem 0.5rem', borderRadius:4, background:`${tt.color}12`, color:tt.color }}>
            <Icon name={tt.icon} style={{ fontSize:'0.75rem', color:'inherit' }} />
            {task.type.replace('_',' ')}
          </span>
          <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', fontSize:'0.75rem', fontWeight:600, padding:'0.125rem 0.5rem', borderRadius:4, background:p.bg, color:p.color }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:p.dot }} />
            {p.label}
          </span>
          {isOverdue && <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--error)', background:'rgba(186,26,26,0.08)', padding:'0.125rem 0.5rem', borderRadius:4 }}>OVERDUE</span>}
          {isToday && !isOverdue && <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--tertiary)', background:'rgba(0,98,67,0.08)', padding:'0.125rem 0.5rem', borderRadius:4 }}>TODAY</span>}
        </div>

        <p style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--on-surface)', textDecoration:task.done?'line-through':'none', marginBottom:'0.25rem' }}>{task.title}</p>

        <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          {task.candidate && (
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="person" style={{ fontSize:'0.875rem' }} /> {task.candidate}
              {task.job && <span> · {task.job}</span>}
            </span>
          )}
          {!task.candidate && task.job && (
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="work" style={{ fontSize:'0.875rem' }} /> {task.job}
            </span>
          )}
          <span style={{ fontSize:'0.8125rem', color: isOverdue?'var(--error)':'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem', fontWeight: isOverdue?600:400 }}>
            <Icon name="schedule" style={{ fontSize:'0.875rem', color:'inherit' }} />
            {task.due===today?'Today':task.due===tomorrow?'Tomorrow':task.due} {task.time&&`· ${task.time}`}
          </span>
        </div>
        {task.notes && <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginTop:'0.375rem', fontStyle:'italic' }}>{task.notes}</p>}
      </div>

      <div style={{ display:'flex', gap:'0.25rem' }}>
        <button className="btn-icon"><Icon name="edit" style={{ fontSize:'1rem' }} /></button>
        <button className="btn-icon" onClick={() => onDelete(task.id)} style={{ color:'var(--error)' }}>
          <Icon name="delete" style={{ fontSize:'1rem', color:'inherit' }} />
        </button>
      </div>
    </div>
  );
};

/* ── Main ───────────────────────────────────────────── */
export default function RecruitmentTasks() {
  const [tasks, setTasks]     = useState(SEED);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter]   = useState('all');
  const [priority, setPri]    = useState('all');

  const toggle = (id) => setTasks(ts => ts.map(t => t.id===id ? {...t, done:!t.done} : t));
  const del    = (id) => setTasks(ts => ts.filter(t => t.id!==id));
  const add    = (t)  => setTasks(ts => [t, ...ts]);

  const counts = {
    all:     tasks.length,
    today:   tasks.filter(t=>t.due===today&&!t.done).length,
    overdue: tasks.filter(t=>t.due<today&&!t.done).length,
    done:    tasks.filter(t=>t.done).length,
  };

  const filtered = useMemo(() => {
    return tasks
      .filter(t => {
        if (filter==='today')   return t.due===today&&!t.done;
        if (filter==='overdue') return t.due<today&&!t.done;
        if (filter==='done')    return t.done;
        return true;
      })
      .filter(t => priority==='all' || t.priority===priority)
      .sort((a,b) => {
        if (a.done !== b.done) return a.done?1:-1;
        if (a.due  !== b.due)  return a.due.localeCompare(b.due);
        const po={high:0,medium:1,low:2};
        return (po[a.priority]||0)-(po[b.priority]||0);
      });
  }, [tasks, filter, priority]);

  const FILTER_CARDS = [
    { key:'all',     label:'All Tasks',  icon:'task_alt',   count:counts.all },
    { key:'today',   label:'Due Today',  icon:'today',      count:counts.today },
    { key:'overdue', label:'Overdue',    icon:'warning',    count:counts.overdue, danger:true },
    { key:'done',    label:'Completed',  icon:'check_circle',count:counts.done },
  ];

  /* Group by date */
  const groups = {};
  filtered.forEach(t => {
    const label = t.done ? '✓ Completed' : t.due<today ? '⚠️ Overdue' : t.due===today ? '📅 Today' : t.due===tomorrow ? 'Tomorrow' : t.due;
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Recruiter Tasks</h1>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)', boxShadow:'0 2px 8px rgba(0,98,67,0.25)' }}>
          <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> New Task
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {FILTER_CARDS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding:'1rem', borderRadius:'0.75rem', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'Inter,sans-serif',
            background: filter===f.key ? (f.danger?'var(--error-container)':'linear-gradient(135deg,var(--tertiary),#009966)') : 'var(--surface-container-lowest)',
            boxShadow:'var(--ambient-shadow)', transition:'all 0.2s',
          }}>
            <Icon name={f.icon} style={{ fontSize:'1.25rem', color: filter===f.key?(f.danger?'var(--on-error-container)':'#fff'):(f.danger?'var(--error)':'var(--tertiary)'), marginBottom:'0.375rem', display:'block' }} />
            <p style={{ fontSize:'1.5rem', fontWeight:800, lineHeight:1, color: filter===f.key?(f.danger?'var(--on-error-container)':'#fff'):'var(--on-surface)', marginBottom:'0.125rem' }}>{f.count}</p>
            <p style={{ fontSize:'0.75rem', fontWeight:600, color: filter===f.key?(f.danger?'var(--on-error-container)':'rgba(255,255,255,0.8)'):'var(--on-surface-variant)' }}>{f.label}</p>
          </button>
        ))}
      </div>

      {/* Priority filter */}
      <div className="card" style={{ padding:'0.75rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:'0.375rem' }}>
          {['all','high','medium','low'].map(p => (
            <button key={p} onClick={() => setPri(p)} style={{
              padding:'0.3rem 0.875rem', borderRadius:9999, border:'none', cursor:'pointer',
              fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
              background: priority===p ? 'var(--on-surface)' : 'var(--surface-container-low)',
              color: priority===p ? '#fff' : 'var(--on-surface-variant)', transition:'all 0.15s',
            }}>{p==='all' ? 'All Priority' : PRIORITY[p].label}</button>
          ))}
        </div>
        <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
          {filtered.filter(t=>!t.done).length} pending · {filtered.filter(t=>t.done).length} done
        </p>
      </div>

      {/* Task list */}
      <div className="card" style={{ padding:'1.25rem' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem 0', color:'var(--on-surface-variant)' }}>
            <Icon name="task_alt" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.25, color:'var(--tertiary)' }} />
            <p style={{ fontWeight:600 }}>No tasks here</p>
            <p style={{ fontSize:'0.875rem', marginTop:'0.25rem', opacity:0.7 }}>
              {filter==='overdue' ? 'All caught up! 🎉' : 'Create your first recruiter task.'}
            </p>
          </div>
        ) : (
          Object.entries(groups).map(([label, gtasks]) => (
            <div key={label} style={{ marginBottom:'1.25rem' }}>
              <p className="label-sm" style={{ marginBottom:'0.625rem', color: label.includes('Overdue') ? 'var(--error)' : label.includes('Today') ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}>{label}</p>
              {gtasks.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} onDelete={del} />)}
            </div>
          ))
        )}
      </div>

      {showAdd && <AddTaskModal onClose={() => setShowAdd(false)} onAdd={add} />}
    </div>
  );
}
