import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { tasksAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const today    = new Date().toISOString().slice(0,10);
const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);

const PRIORITY = {
  high:   { label:'High',   color:'var(--error)',    bg:'rgba(186,26,26,0.08)',  dot:'#ba1a1a' },
  medium: { label:'Medium', color:'var(--amber)',    bg:'rgba(217,119,6,0.08)', dot:'#d97706' },
  low:    { label:'Low',    color:'var(--tertiary)', bg:'rgba(0,98,67,0.08)',   dot:'#006243' },
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

/* ── Task Row ───────────────────────────────────────── */
const TaskRow = ({ task, onToggle, onDelete }) => {
  const p  = PRIORITY[task.priority]  || PRIORITY.medium;
  const tt = TASK_TYPE[task.type]     || TASK_TYPE.review;
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:'0.875rem', padding:'0.875rem 0', borderBottom:'1px solid var(--surface-container)', opacity:task.done?0.55:1 }}>
      <button onClick={() => onToggle(task.id)} style={{ marginTop:'0.125rem', width:20, height:20, borderRadius:4, border:`2px solid ${task.done?'var(--tertiary)':'var(--outline-variant)'}`, background:task.done?'var(--tertiary)':'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {task.done && <Icon name="check" style={{ fontSize:'0.75rem', color:'#fff' }} />}
      </button>
      <div style={{ width:32, height:32, borderRadius:'0.5rem', background:`${tt.color}14`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon name={tt.icon} style={{ fontSize:'1rem', color:tt.color }} />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontWeight:600, fontSize:'0.9375rem', color:'var(--on-surface)', textDecoration:task.done?'line-through':'none', marginBottom:'0.25rem' }}>{task.title}</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem', alignItems:'center' }}>
          <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.1rem 0.5rem', borderRadius:9999, background:p.bg, color:p.color }}>{p.label}</span>
          {task.candidate && <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.2rem' }}><Icon name="person" style={{ fontSize:'0.875rem' }} />{task.candidate}</span>}
          {task.job       && <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.2rem' }}><Icon name="work" style={{ fontSize:'0.875rem' }} />{task.job}</span>}
          {task.time      && <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.2rem' }}><Icon name="schedule" style={{ fontSize:'0.875rem' }} />{task.time}</span>}
          {task.notes     && <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{task.notes}</span>}
        </div>
      </div>
      <button onClick={() => onDelete(task.id)} className="btn-icon" style={{ opacity:0.5 }}>
        <Icon name="delete" style={{ fontSize:'1rem' }} />
      </button>
    </div>
  );
};

/* ── Add Task Modal ─────────────────────────────────── */
const AddTaskModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ title:'', type:'interview', priority:'medium', due:today, time:'09:00', candidate:'', job:'', notes:'' });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return;
    try {
      const res = await tasksAPI.create({
        title: form.title, task_type: form.type, priority: form.priority,
        due_date: form.due, due_time: form.time || null,
        description: form.notes || null,
      });
      const t = res.data;
      onAdd({ id:t.id, title:t.title, type:t.task_type||'interview', priority:t.priority,
        due:t.due_date, time:t.due_time?.slice(0,5)||'', candidate:'', job:'', done:false, notes:t.description||'' });
      onClose();
    } catch (err) { alert(err?.response?.data?.detail || 'Failed to add task'); }
  };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>New Recruiter Task</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Task Title *</label>
            <input className="input" value={form.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Schedule interview — Candidate Name" />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="select" value={form.type} onChange={e=>set('type',e.target.value)}>
              {Object.keys(TASK_TYPE).map(k=><option key={k} value={k}>{k.charAt(0).toUpperCase()+k.slice(1).replace('_',' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="select" value={form.priority} onChange={e=>set('priority',e.target.value)}>
              {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Due Date</label>
            <input className="input" type="date" value={form.due} onChange={e=>set('due',e.target.value)} />
          </div>
          <div>
            <label className="label">Time</label>
            <input className="input" type="time" value={form.time} onChange={e=>set('time',e.target.value)} />
          </div>
          <div>
            <label className="label">Candidate (optional)</label>
            <input className="input" value={form.candidate} onChange={e=>set('candidate',e.target.value)} placeholder="Candidate name" />
          </div>
          <div>
            <label className="label">Job (optional)</label>
            <input className="input" value={form.job} onChange={e=>set('job',e.target.value)} placeholder="Job title" />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Notes</label>
            <textarea className="textarea" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)} />
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

/* ── Main ───────────────────────────────────────────── */
export default function RecruitmentTasks() {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [priority, setPri]      = useState('all');
  const [showAdd, setShowAdd]   = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tasksAPI.getAll();
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.data) ? res.data.data : [];
      const recruitTypes = ['interview','review','outreach','sourcing','onboarding'];
      const filtered = data.filter(t => t.candidate_id || t.job_id || recruitTypes.includes(t.task_type));
      setTasks(filtered.map(t => ({
        id:t.id, title:t.title, type:t.task_type||'review',
        priority:t.priority, due:t.due_date,
        time:t.due_time?.slice(0,5)||'',
        candidate:t.candidate?.full_name || '',
        job:t.job?.title || '',
        done:t.completed, notes:t.description||'',
      })));
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const toggle = async (id) => {
    const task = tasks.find(t => t.id===id);
    if (!task) return;
    setTasks(ts => ts.map(t => t.id===id ? {...t, done:!t.done} : t));
    try { await tasksAPI.update(id, { completed: !task.done }); }
    catch { setTasks(ts => ts.map(t => t.id===id ? {...t, done:task.done} : t)); }
  };

  const del = async (id) => {
    setTasks(ts => ts.filter(t => t.id!==id));
    try { await tasksAPI.delete(id); } catch {}
  };

  const add = (t) => setTasks(ts => [t, ...ts]);

  const filtered = useMemo(() => tasks
    .filter(t => {
      if (filter==='today')   return t.due===today && !t.done;
      if (filter==='overdue') return t.due<today   && !t.done;
      if (filter==='done')    return t.done;
      return true;
    })
    .filter(t => priority==='all' || t.priority===priority)
    .sort((a,b) => {
      if (a.done !== b.done) return a.done?1:-1;
      if (a.due  !== b.due)  return a.due.localeCompare(b.due);
      const po={high:0,medium:1,low:2};
      return (po[a.priority]||0)-(po[b.priority]||0);
    }), [tasks, filter, priority]);

  const counts = {
    all:     tasks.filter(t=>!t.done).length,
    today:   tasks.filter(t=>t.due===today&&!t.done).length,
    overdue: tasks.filter(t=>t.due<today&&!t.done).length,
    done:    tasks.filter(t=>t.done).length,
  };

  const FILTER_CARDS = [
    { key:'all',     label:'All Tasks',   icon:'task_alt',    count:counts.all },
    { key:'today',   label:'Due Today',   icon:'today',       count:counts.today },
    { key:'overdue', label:'Overdue',     icon:'warning',     count:counts.overdue, danger:true },
    { key:'done',    label:'Completed',   icon:'check_circle',count:counts.done },
  ];

  const groups = {};
  filtered.forEach(t => {
    const label = t.done ? '✓ Completed'
      : t.due < today    ? '⚠️ Overdue'
      : t.due === today  ? '📅 Today'
      : t.due === tomorrow ? 'Tomorrow'
      : t.due;
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });

  return (
    <div className="fade-in">
      {loading && (
        <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />
          Loading tasks…
        </div>
      )}
      {!loading && (
        <>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
            <div>
              <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
              <h1 className="headline-sm">Recruiter Tasks</h1>
            </div>
            <button onClick={() => setShowAdd(true)} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)', boxShadow:'0 2px 8px rgba(0,98,67,0.25)' }}>
              <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> New Task
            </button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
            {FILTER_CARDS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding:'1rem', borderRadius:'0.75rem', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-display)', background:filter===f.key?(f.danger?'var(--error-container)':'linear-gradient(135deg,var(--tertiary),#009966)'):'var(--surface-container-lowest)', boxShadow:'var(--ambient-shadow)', transition:'all 0.2s' }}>
                <Icon name={f.icon} style={{ fontSize:'1.25rem', color:filter===f.key?(f.danger?'var(--on-error-container)':'#fff'):(f.danger?'var(--error)':'var(--tertiary)'), marginBottom:'0.375rem', display:'block' }} />
                <p style={{ fontSize:'1.5rem', fontWeight:800, lineHeight:1, color:filter===f.key?(f.danger?'var(--on-error-container)':'#fff'):'var(--on-surface)', marginBottom:'0.125rem' }}>{f.count}</p>
                <p style={{ fontSize:'0.75rem', fontWeight:600, color:filter===f.key?(f.danger?'var(--on-error-container)':'rgba(255,255,255,0.8)'):'var(--on-surface-variant)' }}>{f.label}</p>
              </button>
            ))}
          </div>

          <div className="card" style={{ padding:'0.75rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', gap:'0.375rem' }}>
              {['all','high','medium','low'].map(p => (
                <button key={p} onClick={() => setPri(p)} style={{ padding:'0.3rem 0.875rem', borderRadius:9999, border:'none', cursor:'pointer', fontSize:'0.8125rem', fontWeight:600, fontFamily:'var(--font-display)', background:priority===p?'var(--on-surface)':'var(--surface-container-low)', color:priority===p?'#fff':'var(--on-surface-variant)', transition:'all 0.15s' }}>
                  {p==='all' ? 'All Priority' : PRIORITY[p].label}
                </button>
              ))}
            </div>
            <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
              {filtered.filter(t=>!t.done).length} pending · {filtered.filter(t=>t.done).length} done
            </p>
          </div>

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
                  <p className="label-sm" style={{ marginBottom:'0.625rem', color:label.includes('Overdue')?'var(--error)':label.includes('Today')?'var(--tertiary)':'var(--on-surface-variant)' }}>{label}</p>
                  {gtasks.map(t => <TaskRow key={t.id} task={t} onToggle={toggle} onDelete={del} />)}
                </div>
              ))
            )}
          </div>

          {showAdd && <AddTaskModal onClose={() => setShowAdd(false)} onAdd={add} />}
        </>
      )}
    </div>
  );
}
