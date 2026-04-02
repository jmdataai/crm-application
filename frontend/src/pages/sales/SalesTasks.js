import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { tasksAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const PRIORITY_MAP = {
  high:   { label:'High',   color:'var(--error)',     bg:'rgba(186,26,26,0.08)',    dot:'#ba1a1a' },
  medium: { label:'Medium', color:'var(--amber)',     bg:'rgba(217,119,6,0.08)',    dot:'#d97706' },
  low:    { label:'Low',    color:'var(--tertiary)',  bg:'rgba(0,98,67,0.08)',      dot:'#006243' },
};

const TYPE_ICON  = { call:'phone', email:'mail', meeting:'video_call', note:'edit_note', follow_up:'schedule', demo:'present_to_all' };
const TYPE_COLOR = { call:'var(--primary)', email:'var(--tertiary)', meeting:'#7c3aed', note:'var(--amber)', follow_up:'#d97706', demo:'var(--primary-container)' };

const today = new Date().toISOString().slice(0,10);

// Tasks loaded from API

/* ── Add Task Modal ─────────────────────────────────── */
const AddTaskModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ title:'', type:'call', priority:'medium', due:today, time:'09:00', lead:'', company:'', notes:'' });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => { if(!form.title.trim()) return; onAdd({ ...form, id:`t${Date.now()}`, done:false }); onClose(); };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>New Task</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {/* Type selector */}
        <div style={{ marginBottom:'1.25rem' }}>
          <label className="label">Task Type</label>
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', marginTop:'0.375rem' }}>
            {Object.entries(TYPE_ICON).map(([k, icon]) => (
              <button key={k} onClick={() => set('type', k)} style={{
                display:'flex', alignItems:'center', gap:'0.375rem',
                padding:'0.4rem 0.875rem', borderRadius:9999, border:'none', cursor:'pointer',
                fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight:600,
                background: form.type===k ? 'var(--primary)' : 'var(--surface-container-low)',
                color: form.type===k ? '#fff' : 'var(--on-surface-variant)',
                transition:'all 0.15s',
              }}>
                <Icon name={icon} style={{ fontSize:'1rem', color:'inherit' }} />
                {k.charAt(0).toUpperCase()+k.slice(1).replace('_',' ')}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Task Title *</label>
            <input className="input" placeholder="e.g. Follow-up call with Priya" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="select" value={form.priority} onChange={e => set('priority', e.target.value)}>
              {Object.entries(PRIORITY_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Due Date</label>
            <input className="input" type="date" value={form.due} onChange={e => set('due', e.target.value)} />
          </div>
          <div>
            <label className="label">Time</label>
            <input className="input" type="time" value={form.time} onChange={e => set('time', e.target.value)} />
          </div>
          <div>
            <label className="label">Lead Name</label>
            <input className="input" placeholder="Associated lead" value={form.lead} onChange={e => set('lead', e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Notes</label>
            <textarea className="textarea" rows={2} placeholder="Optional context…" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>
            <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Task
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Task Row ───────────────────────────────────────── */
const TaskRow = ({ task, onToggle, onDelete }) => {
  const p = PRIORITY_MAP[task.priority];
  const isOverdue = !task.done && task.due < today;
  const isToday   = task.due === today;

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'32px 1fr auto', gap:'0.875rem', alignItems:'flex-start',
      padding:'0.875rem 1rem', borderRadius:'0.625rem',
      background: task.done ? 'transparent' : 'var(--surface-container-lowest)',
      border:`1px solid ${isOverdue && !task.done ? 'rgba(186,26,26,0.2)' : 'rgba(195,198,215,0.1)'}`,
      opacity: task.done ? 0.55 : 1, marginBottom:'0.5rem',
      transition:'all 0.2s ease',
    }}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        style={{
          width:22, height:22, borderRadius:6, border:`2px solid ${task.done ? 'var(--tertiary)' : p.dot}`,
          background: task.done ? 'var(--tertiary)' : 'transparent',
          cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2,
        }}
      >
        {task.done && <Icon name="check" style={{ fontSize:'0.75rem', color:'#fff' }} />}
      </button>

      {/* Content */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.25rem' }}>
          {/* Type badge */}
          <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', fontSize:'0.75rem', fontWeight:600, padding:'0.125rem 0.5rem', borderRadius:4, background:`${TYPE_COLOR[task.type]}14`, color:TYPE_COLOR[task.type] }}>
            <Icon name={TYPE_ICON[task.type]} style={{ fontSize:'0.75rem', color:'inherit' }} />
            {task.type.replace('_',' ')}
          </span>
          {/* Priority */}
          <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', fontSize:'0.75rem', fontWeight:600, padding:'0.125rem 0.5rem', borderRadius:4, background:p.bg, color:p.color }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:p.dot }} />
            {p.label}
          </span>
          {/* Overdue */}
          {isOverdue && <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--error)', background:'rgba(186,26,26,0.08)', padding:'0.125rem 0.5rem', borderRadius:4 }}>OVERDUE</span>}
          {isToday && !isOverdue && <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--primary)', background:'rgba(0,74,198,0.08)', padding:'0.125rem 0.5rem', borderRadius:4 }}>TODAY</span>}
        </div>

        <p style={{ fontSize:'0.9375rem', fontWeight:600, color:'var(--on-surface)', textDecoration:task.done?'line-through':'none', marginBottom:'0.25rem' }}>{task.title}</p>

        <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          {task.lead && (
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <Icon name="person" style={{ fontSize:'0.875rem' }} /> {task.lead}{task.company ? ` · ${task.company}` : ''}
            </span>
          )}
          <span style={{ fontSize:'0.8125rem', color: isOverdue ? 'var(--error)' : 'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem', fontWeight: isOverdue?600:400 }}>
            <Icon name="schedule" style={{ fontSize:'0.875rem', color: isOverdue?'var(--error)':'inherit' }} />
            {task.due === today ? 'Today' : task.due === tomorrow ? 'Tomorrow' : task.due} {task.time && `· ${task.time}`}
          </span>
        </div>
        {task.notes && <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginTop:'0.375rem', fontStyle:'italic' }}>{task.notes}</p>}
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:'0.25rem', flexShrink:0 }}>
        <button className="btn-icon" title="Edit task"><Icon name="edit" style={{ fontSize:'1rem' }} /></button>
        <button className="btn-icon" title="Delete" onClick={() => onDelete(task.id)} style={{ color:'var(--error)' }}>
          <Icon name="delete" style={{ fontSize:'1rem', color:'inherit' }} />
        </button>
      </div>
    </div>
  );
};

/* ── Main ───────────────────────────────────────────── */
export default function SalesTasks() {
  const [tasks, setTasks]   = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all');     // all | today | overdue | done
  const [priority, setPriority] = useState('all');

  const toggle = (id) => setTasks(ts => ts.map(t => t.id===id ? {...t, done:!t.done} : t));
  const del    = (id) => setTasks(ts => ts.filter(t => t.id!==id));
  const addTask = (t) => setTasks(ts => [t, ...ts]);

  const filtered = useMemo(() => {
    return tasks
      .filter(t => {
        if (filter === 'today')   return t.due === today && !t.done;
        if (filter === 'overdue') return t.due < today && !t.done;
        if (filter === 'done')    return t.done;
        return true;
      })
      .filter(t => priority === 'all' || t.priority === priority)
      .sort((a,b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.due  !== b.due)  return a.due.localeCompare(b.due);
        const po = { high:0, medium:1, low:2 };
        return (po[a.priority]||0) - (po[b.priority]||0);
      });
  }, [tasks, filter, priority]);

  const counts = {
    all:     tasks.length,
    today:   tasks.filter(t=>t.due===today&&!t.done).length,
    overdue: tasks.filter(t=>t.due<today&&!t.done).length,
    done:    tasks.filter(t=>t.done).length,
  };

  const FILTERS = [
    { key:'all',     label:'All Tasks',     icon:'task_alt' },
    { key:'today',   label:'Due Today',     icon:'today' },
    { key:'overdue', label:'Overdue',       icon:'warning', danger:true },
    { key:'done',    label:'Completed',     icon:'check_circle' },
  ];

  return (
    <div className="fade-in">
      {loading && <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}><Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />Loading tasks…</div>}
      {!loading && <>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Tasks</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> New Task
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding:'1rem', borderRadius:'0.75rem', border:'none', cursor:'pointer', textAlign:'left',
              background: filter===f.key ? (f.danger ? 'var(--error-container)' : 'linear-gradient(135deg,var(--primary),var(--primary-container))') : 'var(--surface-container-lowest)',
              boxShadow:'var(--ambient-shadow)', transition:'all 0.2s ease',
              fontFamily:'Inter,sans-serif',
            }}
          >
            <Icon name={f.icon} style={{ fontSize:'1.25rem', color: filter===f.key ? (f.danger?'var(--on-error-container)':'#fff') : (f.danger?'var(--error)':'var(--primary)'), marginBottom:'0.375rem', display:'block' }} />
            <p style={{ fontSize:'1.5rem', fontWeight:800, lineHeight:1, color: filter===f.key ? (f.danger?'var(--on-error-container)':'#fff') : 'var(--on-surface)', marginBottom:'0.125rem' }}>{counts[f.key]}</p>
            <p style={{ fontSize:'0.75rem', fontWeight:600, color: filter===f.key ? (f.danger?'var(--on-error-container)':'rgba(255,255,255,0.8)') : 'var(--on-surface-variant)' }}>{f.label}</p>
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="card" style={{ padding:'0.875rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem' }}>
        <div style={{ display:'flex', gap:'0.375rem' }}>
          {['all','high','medium','low'].map(p => (
            <button key={p} onClick={() => setPriority(p)} style={{
              padding:'0.3rem 0.875rem', borderRadius:9999, border:'none', cursor:'pointer',
              fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
              background: priority===p ? 'var(--on-surface)' : 'var(--surface-container-low)',
              color: priority===p ? '#fff' : 'var(--on-surface-variant)',
              transition:'all 0.15s',
            }}>
              {p === 'all' ? 'All Priority' : PRIORITY_MAP[p].label}
            </button>
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
            <Icon name="task_alt" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.25 }} />
            <p style={{ fontWeight:600 }}>No tasks here</p>
            <p style={{ fontSize:'0.875rem', marginTop:'0.25rem', opacity:0.7 }}>
              {filter==='overdue' ? 'All caught up!' : 'Create your first task to get started.'}
            </p>
          </div>
        ) : (
          <>
            {/* Group by date */}
            {(() => {
              const groups = {};
              filtered.forEach(t => {
                const label = t.due === today ? '📅 Today' : t.due === tomorrow ? 'Tomorrow' : t.due < today ? '⚠️ Overdue' : t.due;
                if (!groups[label]) groups[label] = [];
                groups[label].push(t);
              });
              return Object.entries(groups).map(([label, gtasks]) => (
                <div key={label} style={{ marginBottom:'1.25rem' }}>
                  <p className="label-sm" style={{ marginBottom:'0.625rem', color: label.includes('Overdue') ? 'var(--error)' : 'var(--on-surface-variant)' }}>{label}</p>
                  {gtasks.map(t => (
                    <TaskRow key={t.id} task={t} onToggle={toggle} onDelete={del} />
                  ))}
                </div>
              ));
            })()}
          </>
        )}
      </div>

      {showAdd && <AddTaskModal onClose={() => setShowAdd(false)} onAdd={addTask} />}
    </div>
    </>
  );
}
