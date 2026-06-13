import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { sequencesAPI } from '../../services/api';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

// ── Design tokens ─────────────────────────────────────────────
const PRIMARY   = '#4468B0';
const TERTIARY  = '#006243';
const STEP_TYPES = [
  { type: 'email',    icon: 'mail',            label: 'Email',    color: PRIMARY },
  { type: 'linkedin', icon: 'person_add',      label: 'LinkedIn', color: '#0077B5' },
  { type: 'call',     icon: 'phone_in_talk',   label: 'Call',     color: TERTIARY },
  { type: 'task',     icon: 'task_alt',        label: 'Task',     color: '#f59e0b' },
];
const VARIABLES = ['{name}', '{company}', '{title}', '{email}'];

const blankStep = (num) => ({
  step_number:   num,
  delay_days:    num === 1 ? 0 : 3,
  type:          'email',
  subject:       '',
  body_template: '',
});

// ── Step type badge ───────────────────────────────────────────
const TypeBadge = ({ type }) => {
  const meta = STEP_TYPES.find(t => t.type === type) || STEP_TYPES[0];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', fontSize:'0.7rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:9999, background:`${meta.color}14`, color:meta.color }}>
      <Icon name={meta.icon} style={{ fontSize:'0.75rem' }} />{meta.label}
    </span>
  );
};

// ── Step status badge (enrollment) ────────────────────────────
const STATUS_META = {
  active:    { label:'Active',           color:PRIMARY,   bg:'rgba(68,104,176,0.1)' },
  completed: { label:'Completed ✓',      color:TERTIARY,  bg:'rgba(0,98,67,0.1)' },
  replied:   { label:'Replied — stopped',color:TERTIARY,  bg:'rgba(0,98,67,0.1)' },
  paused:    { label:'Paused',           color:'#B45309', bg:'rgba(180,83,9,0.09)' },
};

const EnrollmentBadge = ({ enrollment }) => {
  if (!enrollment) return <span style={{ color:'var(--on-surface-variant)', fontSize:'0.75rem' }}>—</span>;
  const meta = STATUS_META[enrollment.status] || STATUS_META.active;
  const seqSteps = enrollment.total_steps || 1;
  if (enrollment.status === 'active') {
    return (
      <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.1rem 0.5rem', borderRadius:9999, background:meta.bg, color:meta.color, whiteSpace:'nowrap' }}>
        Step {(enrollment.current_step || 0) + 1}/{seqSteps}
      </span>
    );
  }
  return (
    <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.1rem 0.5rem', borderRadius:9999, background:meta.bg, color:meta.color, whiteSpace:'nowrap' }}>
      {meta.label}
    </span>
  );
};

// ── Enroll Modal ──────────────────────────────────────────────
const EnrollModal = ({ sequences, onClose, onEnroll }) => {
  const [selectedSeq, setSelectedSeq] = useState(sequences[0]?.id || '');
  const [enrolling, setEnrolling]     = useState(false);
  const seq = sequences.find(s => s.id === selectedSeq);

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.0625rem', fontWeight:700 }}>Enroll in Sequence</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div>
            <label className="label">Sequence</label>
            <select className="select" value={selectedSeq} onChange={e => setSelectedSeq(e.target.value)} style={{ width:'100%' }}>
              {sequences.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({(s.steps||[]).length} steps)</option>
              ))}
              {sequences.filter(s => s.is_active).length === 0 && (
                <option disabled>No active sequences — create one first</option>
              )}
            </select>
          </div>
          {seq && (
            <div style={{ padding:'0.875rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
              <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--on-surface-variant)', marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>First step preview</p>
              {seq.steps?.[0] ? (
                <>
                  <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)', marginBottom:'0.25rem' }}>{seq.steps[0].subject || '(no subject)'}</p>
                  <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                    {seq.steps[0].body_template || '(no body)'}
                  </p>
                </>
              ) : <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>No steps defined yet</p>}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            disabled={enrolling || !selectedSeq || sequences.filter(s=>s.is_active).length===0}
            onClick={async () => {
              setEnrolling(true);
              await onEnroll(selectedSeq);
              setEnrolling(false);
              onClose();
            }}
            style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', border:'none', background: enrolling?'var(--outline-variant)':'var(--primary)', color:'#fff', fontWeight:700, fontSize:'0.875rem', cursor: enrolling?'not-allowed':'pointer', fontFamily:'var(--font-display)' }}
          >
            <Icon name={enrolling ? 'progress_activity' : 'play_arrow'} style={{ fontSize:'1rem', color:'#fff' }} />
            {enrolling ? 'Enrolling…' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Sequence Card ─────────────────────────────────────────────
const SequenceCard = ({ seq, enrollmentCount, replyCount, onEdit, onToggle }) => {
  const replyRate = enrollmentCount > 0 ? Math.round((replyCount / enrollmentCount) * 100) : 0;
  return (
    <div className="card" style={{ opacity: seq.is_active ? 1 : 0.65 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'0.875rem', gap:'0.5rem' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <h3 style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--on-surface)', marginBottom:'0.25rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{seq.name}</h3>
          {seq.description && <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{seq.description}</p>}
        </div>
        {/* Active toggle */}
        <div onClick={() => onToggle(seq)} style={{ width:40, height:22, borderRadius:11, background: seq.is_active?TERTIARY:'var(--surface-container)', transition:'background 0.2s', position:'relative', flexShrink:0, cursor:'pointer' }}>
          <div style={{ position:'absolute', top:3, left: seq.is_active?20:3, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
      </div>

      {/* Step chips */}
      <div style={{ display:'flex', gap:'0.25rem', flexWrap:'wrap', marginBottom:'1rem' }}>
        {(seq.steps || []).map((step, i) => {
          const meta = STEP_TYPES.find(t => t.type === step.type) || STEP_TYPES[0];
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.7rem', padding:'0.15rem 0.5rem', borderRadius:9999, background:`${meta.color}12`, color:meta.color, fontWeight:600 }}>
              <Icon name={meta.icon} style={{ fontSize:'0.75rem' }} />
              Day {step.delay_days}
            </div>
          );
        })}
        {(seq.steps||[]).length === 0 && (
          <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', fontStyle:'italic' }}>No steps yet</span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display:'flex', gap:'1rem', padding:'0.625rem 0', borderTop:'1px solid var(--outline-variant)', marginBottom:'0.875rem' }}>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontSize:'1rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{(seq.steps||[]).length}</p>
          <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)' }}>Steps</p>
        </div>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontSize:'1rem', fontWeight:800, color:PRIMARY, lineHeight:1 }}>{enrollmentCount}</p>
          <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)' }}>Enrolled</p>
        </div>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontSize:'1rem', fontWeight:800, color:TERTIARY, lineHeight:1 }}>{replyRate}%</p>
          <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)' }}>Reply rate</p>
        </div>
      </div>

      <button onClick={() => onEdit(seq)} style={{ width:'100%', padding:'0.5rem', borderRadius:'0.5rem', border:`1px solid ${PRIMARY}`, background:'transparent', color:PRIMARY, fontWeight:600, fontSize:'0.875rem', cursor:'pointer', fontFamily:'var(--font-display)', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.375rem' }}>
        <Icon name="edit" style={{ fontSize:'1rem' }} /> Edit Sequence
      </button>
    </div>
  );
};

// ── Step Builder Panel ────────────────────────────────────────
const StepBuilder = ({ steps, activeStepIdx, setActiveStepIdx, onAddStep, onRemoveStep, onMoveStep }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
    {steps.map((step, i) => {
      const meta = STEP_TYPES.find(t => t.type === step.type) || STEP_TYPES[0];
      const isActive = i === activeStepIdx;
      return (
        <div
          key={i}
          draggable
          onDragStart={e => e.dataTransfer.setData('stepIdx', String(i))}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); onMoveStep(Number(e.dataTransfer.getData('stepIdx')), i); }}
          onClick={() => setActiveStepIdx(i)}
          style={{ display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.75rem', borderRadius:'0.625rem', border:`1.5px solid ${isActive ? meta.color : 'var(--outline-variant)'}`, background: isActive ? `${meta.color}08` : 'var(--surface-container-low)', cursor:'pointer', transition:'all 0.15s' }}
        >
          <div style={{ width:28, height:28, borderRadius:'50%', background:`${meta.color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Icon name={meta.icon} style={{ fontSize:'1rem', color:meta.color }} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', marginBottom:'0.125rem' }}>
              <span style={{ fontSize:'0.75rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:9999, background:`${meta.color}18`, color:meta.color }}>Day {step.delay_days}</span>
              <span style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--on-surface)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{step.subject || `Step ${i+1}`}</span>
            </div>
            <p style={{ fontSize:'0.7rem', color:'var(--on-surface-variant)' }}>{meta.label}</p>
          </div>
          <div style={{ display:'flex', gap:'0.25rem' }}>
            {steps.length > 1 && (
              <button onClick={e => { e.stopPropagation(); onRemoveStep(i); }} style={{ background:'none', border:'none', cursor:'pointer', padding:2, color:'var(--on-surface-variant)', display:'flex' }}>
                <Icon name="delete" style={{ fontSize:'1rem' }} />
              </button>
            )}
            <Icon name="drag_indicator" style={{ fontSize:'1rem', color:'var(--on-surface-variant)', cursor:'grab' }} />
          </div>
        </div>
      );
    })}
    <button onClick={onAddStep} style={{ padding:'0.625rem', borderRadius:'0.625rem', border:`2px dashed var(--outline-variant)`, background:'transparent', color:'var(--on-surface-variant)', fontSize:'0.875rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font-display)', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.375rem' }}>
      <Icon name="add" style={{ fontSize:'1rem' }} /> Add Step
    </button>
  </div>
);

// ── Step Editor Panel ─────────────────────────────────────────
const StepEditor = ({ step, onChange }) => {
  const insertVar = (v) => onChange('body_template', (step.body_template || '') + v);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      {/* Type picker */}
      <div>
        <label className="label" style={{ display:'block', marginBottom:'0.375rem' }}>Step Type</label>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          {STEP_TYPES.map(t => (
            <button key={t.type} type="button" onClick={() => onChange('type', t.type)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'0.25rem', padding:'0.5rem', borderRadius:'0.625rem', border:`1.5px solid ${step.type===t.type ? t.color : 'var(--outline-variant)'}`, background: step.type===t.type ? `${t.color}10` : 'transparent', cursor:'pointer', transition:'all 0.15s' }}>
              <Icon name={t.icon} style={{ fontSize:'1.125rem', color: step.type===t.type ? t.color : 'var(--on-surface-variant)' }} />
              <span style={{ fontSize:'0.7rem', fontWeight:600, color: step.type===t.type ? t.color : 'var(--on-surface-variant)' }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Delay */}
      <div>
        <label className="label">Send on Day</label>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <input type="number" min={0} className="input" value={step.delay_days} onChange={e => onChange('delay_days', Math.max(0, parseInt(e.target.value) || 0))} style={{ width:80 }} />
          <span style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>after enrollment (0 = immediately)</span>
        </div>
      </div>

      {/* Subject — only for email type */}
      {step.type === 'email' && (
        <div>
          <label className="label">Subject</label>
          <input type="text" className="input" value={step.subject} onChange={e => onChange('subject', e.target.value)} placeholder="e.g. Following up — {company}" style={{ width:'100%' }} />
        </div>
      )}

      {/* Body */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.375rem' }}>
          <label className="label">{step.type === 'email' ? 'Email Body' : 'Task / Note Description'}</label>
          <div style={{ display:'flex', gap:'0.25rem' }}>
            {VARIABLES.map(v => (
              <button key={v} onClick={() => insertVar(v)} type="button" style={{ fontSize:'0.6875rem', padding:'0.1rem 0.375rem', borderRadius:4, border:'1px solid var(--primary)', color:'var(--primary)', background:'rgba(68,104,176,0.06)', cursor:'pointer', fontFamily:'monospace' }}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <textarea className="textarea" rows={step.type === 'email' ? 8 : 4} value={step.body_template} onChange={e => onChange('body_template', e.target.value)} placeholder={step.type === 'email' ? 'Hi {name},\n\nI wanted to follow up…' : 'e.g. Connect with {name} on LinkedIn'} style={{ width:'100%', resize:'vertical', fontFamily:'var(--font-ui)', fontSize:'0.875rem' }} />
        <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>Click variable chips above to insert. HTML is supported in email body.</p>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────
export default function SequencesManager() {
  const { isMobile } = useBreakpoint();

  const [sequences, setSequences]       = useState([]);
  const [enrollments, setEnrollments]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [saving, setSaving]             = useState(false);

  // Builder mode
  const [editingSeq, setEditingSeq]     = useState(null); // null = list view, seq object = editing
  const [isNew, setIsNew]               = useState(false);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [builderName, setBuilderName]   = useState('');
  const [builderDesc, setBuilderDesc]   = useState('');
  const [builderSteps, setBuilderSteps] = useState([blankStep(1)]);

  // Load data
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [seqRes, enrollRes] = await Promise.allSettled([
        sequencesAPI.getAll(),
        sequencesAPI.getEnrollments(),
      ]);
      if (seqRes.status   === 'fulfilled') setSequences(Array.isArray(seqRes.value?.data)   ? seqRes.value.data   : []);
      if (enrollRes.status=== 'fulfilled') setEnrollments(Array.isArray(enrollRes.value?.data) ? enrollRes.value.data : []);
    } catch { setError('Failed to load sequences.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Per-sequence enrollment counts
  const enrollmentCounts = useMemo(() => {
    const map = {};
    for (const e of enrollments) {
      if (!map[e.sequence_id]) map[e.sequence_id] = { total: 0, replied: 0 };
      map[e.sequence_id].total++;
      if (e.status === 'replied') map[e.sequence_id].replied++;
    }
    return map;
  }, [enrollments]);

  // ── Builder helpers ────────────────────────────────────────
  const openNewBuilder = () => {
    setEditingSeq(null);
    setIsNew(true);
    setBuilderName('');
    setBuilderDesc('');
    setBuilderSteps([blankStep(1)]);
    setActiveStepIdx(0);
  };

  const openEditBuilder = (seq) => {
    setEditingSeq(seq);
    setIsNew(false);
    setBuilderName(seq.name);
    setBuilderDesc(seq.description || '');
    setBuilderSteps(seq.steps && seq.steps.length > 0 ? seq.steps : [blankStep(1)]);
    setActiveStepIdx(0);
  };

  const closeBuilder = () => { setEditingSeq(null); setIsNew(false); };

  const updateStep = (field, value) => {
    setBuilderSteps(prev => prev.map((s, i) => i === activeStepIdx ? { ...s, [field]: value } : s));
  };

  const addStep = () => {
    const newStep = blankStep(builderSteps.length + 1);
    newStep.delay_days = (builderSteps[builderSteps.length - 1]?.delay_days || 0) + 3;
    setBuilderSteps(prev => [...prev, newStep]);
    setActiveStepIdx(builderSteps.length);
  };

  const removeStep = (idx) => {
    const next = builderSteps.filter((_, i) => i !== idx);
    setBuilderSteps(next);
    setActiveStepIdx(Math.min(activeStepIdx, next.length - 1));
  };

  const moveStep = (fromIdx, toIdx) => {
    const arr = [...builderSteps];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    setBuilderSteps(arr.map((s, i) => ({ ...s, step_number: i + 1 })));
    setActiveStepIdx(toIdx);
  };

  const saveSequence = async () => {
    if (!builderName.trim()) { setError('Sequence name is required.'); return; }
    if (builderSteps.length === 0) { setError('Add at least one step.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name:        builderName.trim(),
        description: builderDesc.trim() || null,
        steps:       builderSteps.map((s, i) => ({ ...s, step_number: i + 1 })),
        is_active:   true,
      };
      if (isNew) {
        await sequencesAPI.create(payload);
      } else {
        await sequencesAPI.update(editingSeq.id, payload);
      }
      closeBuilder();
      await loadAll();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save sequence.');
    } finally { setSaving(false); }
  };

  const toggleActive = async (seq) => {
    try {
      await sequencesAPI.update(seq.id, { is_active: !seq.is_active });
      setSequences(prev => prev.map(s => s.id === seq.id ? { ...s, is_active: !s.is_active } : s));
    } catch { setError('Failed to update sequence.'); }
  };

  const inBuilder = isNew || editingSeq !== null;

  return (
    <div className="fade-in">
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <p className="label-sm" style={{ color:'var(--tertiary)', marginBottom:'0.25rem' }}>Sales</p>
          <h1 className="headline-sm">Email Sequences</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>
            Build automated follow-up sequences. Enroll companies from the Sales Tracker.
          </p>
        </div>
        <div style={{ display:'flex', gap:'0.625rem' }}>
          {inBuilder && (
            <button onClick={closeBuilder} className="btn-secondary">
              ← Back to Library
            </button>
          )}
          {!inBuilder && (
            <button onClick={openNewBuilder} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1rem', borderRadius:'0.625rem', border:'none', background:'var(--primary)', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:'0.875rem', fontFamily:'var(--font-display)' }}>
              <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> New Sequence
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom:'1rem', padding:'0.625rem 0.875rem', borderRadius:'0.5rem', background:'var(--error-container)', color:'var(--error)', fontSize:'0.875rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <Icon name="error_outline" style={{ fontSize:'1rem' }} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--error)' }}><Icon name="close" style={{ fontSize:'1rem' }} /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem' }} />
          Loading sequences…
        </div>
      )}

      {/* ══ SEQUENCE LIBRARY ══════════════════════════════════════ */}
      {!loading && !inBuilder && (
        <>
          {sequences.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:'4rem' }}>
              <Icon name="mark_email_unread" style={{ fontSize:'3rem', display:'block', margin:'0 auto 1rem', opacity:0.2, color:PRIMARY }} />
              <h2 style={{ fontWeight:700, marginBottom:'0.5rem' }}>No sequences yet</h2>
              <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginBottom:'1.5rem' }}>
                Build your first sequence to automate follow-ups. Industry average: 10× more replies than a single email.
              </p>
              <button onClick={openNewBuilder} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1.5rem', borderRadius:'0.625rem', border:'none', background:'var(--primary)', color:'#fff', cursor:'pointer', fontWeight:700, fontFamily:'var(--font-display)', fontSize:'0.9375rem' }}>
                <Icon name="add" style={{ fontSize:'1.125rem', color:'#fff' }} /> Create First Sequence
              </button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap:'1.25rem' }}>
              {sequences.map(seq => (
                <SequenceCard
                  key={seq.id}
                  seq={seq}
                  enrollmentCount={enrollmentCounts[seq.id]?.total || 0}
                  replyCount={enrollmentCounts[seq.id]?.replied || 0}
                  onEdit={openEditBuilder}
                  onToggle={toggleActive}
                />
              ))}
            </div>
          )}

          {/* Enrollments summary */}
          {enrollments.length > 0 && (
            <div className="card" style={{ marginTop:'1.5rem', padding:0, overflow:'hidden' }}>
              <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <Icon name="groups" style={{ color:PRIMARY }} />
                <h2 style={{ fontSize:'1rem', fontWeight:700 }}>Recent Enrollments</h2>
                <span style={{ marginLeft:'auto', fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{enrollments.length} total</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                  <thead style={{ background:'var(--surface-container-low)' }}>
                    <tr>
                      {['Company', 'Sequence', 'Status', 'Enrolled', 'Next Step'].map(h => (
                        <th key={h} style={{ padding:'0.5rem 1rem', textAlign:'left', fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', color:'var(--on-surface-variant)', borderBottom:'1px solid var(--outline-variant)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.slice(0, 20).map((e, i) => {
                      const seq   = sequences.find(s => s.id === e.sequence_id);
                      const meta  = STATUS_META[e.status] || STATUS_META.active;
                      return (
                        <tr key={e.id || i} style={{ borderBottom:'1px solid var(--surface-container)' }}>
                          <td style={{ padding:'0.625rem 1rem', fontWeight:600 }}>{e.company_name || e.company_email || '—'}</td>
                          <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)' }}>{seq?.name || '—'}</td>
                          <td style={{ padding:'0.625rem 1rem' }}>
                            <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.1rem 0.5rem', borderRadius:9999, background:meta.bg, color:meta.color }}>{meta.label}</span>
                          </td>
                          <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>
                            {e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('en-IE',{day:'2-digit',month:'short'}) : '—'}
                          </td>
                          <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>
                            {e.next_step_at ? new Date(e.next_step_at).toLocaleDateString('en-IE',{day:'2-digit',month:'short'}) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ SEQUENCE BUILDER ══════════════════════════════════════ */}
      {!loading && inBuilder && (
        <div>
          {/* Sequence meta */}
          <div className="card" style={{ marginBottom:'1.25rem', padding:'1.25rem' }}>
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'1rem' }}>
              <div>
                <label className="label">Sequence Name *</label>
                <input type="text" className="input" value={builderName} onChange={e => setBuilderName(e.target.value)} placeholder="e.g. IT Staffing Intro" style={{ width:'100%' }} />
              </div>
              <div>
                <label className="label">Description <span style={{ fontWeight:400, color:'var(--on-surface-variant)' }}>(optional)</span></label>
                <input type="text" className="input" value={builderDesc} onChange={e => setBuilderDesc(e.target.value)} placeholder="e.g. 5-step intro for Ireland tech companies" style={{ width:'100%' }} />
              </div>
            </div>
          </div>

          {/* Two-panel builder */}
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.75fr', gap:'1.25rem', alignItems:'start' }}>
            {/* Left: Step list */}
            <div className="card" style={{ padding:'1.25rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Steps ({builderSteps.length})</h3>
              <StepBuilder
                steps={builderSteps}
                activeStepIdx={activeStepIdx}
                setActiveStepIdx={setActiveStepIdx}
                onAddStep={addStep}
                onRemoveStep={removeStep}
                onMoveStep={moveStep}
              />
            </div>

            {/* Right: Step editor */}
            <div className="card" style={{ padding:'1.25rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.25rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem', flex:1 }}>
                  Step {activeStepIdx + 1} — {builderSteps[activeStepIdx]?.subject || 'Edit'}
                </h3>
                <TypeBadge type={builderSteps[activeStepIdx]?.type} />
              </div>
              {builderSteps[activeStepIdx] && (
                <StepEditor step={builderSteps[activeStepIdx]} onChange={updateStep} />
              )}
            </div>
          </div>

          {/* Save bar */}
          <div style={{ marginTop:'1.25rem', display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
            <button onClick={closeBuilder} className="btn-secondary">Discard</button>
            <button
              onClick={saveSequence}
              disabled={saving}
              style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.625rem 1.5rem', borderRadius:'0.625rem', border:'none', background: saving?'var(--outline-variant)':'var(--primary)', color:'#fff', fontWeight:700, fontSize:'0.9375rem', cursor: saving?'not-allowed':'pointer', fontFamily:'var(--font-display)' }}
            >
              <Icon name={saving ? 'progress_activity' : 'save'} style={{ fontSize:'1.125rem', color:'#fff' }} />
              {saving ? 'Saving…' : isNew ? 'Create Sequence' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
