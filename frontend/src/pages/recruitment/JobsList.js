import { useBreakpoint } from '../../hooks/useBreakpoint';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { jobsAPI, candidatesAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

/* Textarea with bullet-point toolbar */
const BulletTextarea = ({ value, onChange, rows = 4, placeholder }) => {
  const ref = React.useRef();

  const insertBullet = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const before = value.slice(0, start);
    const after  = value.slice(end);
    const lineStart = before.lastIndexOf('\n') + 1;
    const currentLine = before.slice(lineStart);
    const prefix = currentLine.startsWith('• ') ? '' : '• ';
    const newVal = before.slice(0, lineStart) + prefix + currentLine + after;
    onChange({ target: { value: newVal } });
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + prefix.length;
      el.focus();
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const el = ref.current;
      const before = value.slice(0, el.selectionStart);
      const lineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.slice(lineStart);
      if (currentLine.startsWith('• ')) {
        e.preventDefault();
        const after  = value.slice(el.selectionStart);
        const newVal = before + '\n• ' + after;
        onChange({ target: { value: newVal } });
        setTimeout(() => { el.selectionStart = el.selectionEnd = el.selectionStart + 3; }, 0);
      }
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
        <button type="button" onClick={insertBullet} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          padding: '0.25rem 0.625rem', borderRadius: '0.375rem',
          border: '1px solid var(--outline-variant)', background: 'var(--surface-container)',
          cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
          color: 'var(--on-surface-variant)', fontFamily: 'var(--font-display)',
        }}>
          <Icon name="format_list_bulleted" style={{ fontSize: '0.875rem' }} /> Bullet
        </button>
        <span style={{ fontSize: '0.725rem', color: 'var(--on-surface-variant)', alignSelf: 'center' }}>
          Enter auto-continues bullets
        </span>
      </div>
      <textarea
        ref={ref}
        className="textarea"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        style={{ width: '100%' }}
      />
    </div>
  );
};

/* Render stored bullet text as styled list */
const BulletText = ({ text, style = {} }) => {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div style={{ fontSize: '0.875rem', lineHeight: 1.6, ...style }}>
      {lines.map((line, i) => {
        if (line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--tertiary)', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        return <p key={i} style={{ margin: line ? '0.25rem 0' : 0 }}>{line}</p>;
      })}
    </div>
  );
};

const EMP_TYPES   = ['Full-time','Part-time','Contract','Internship'];
const DEPARTMENTS = ['Engineering','AI Research','Product','Platform','Design','Operations','Sales'];

// Map backend field names (is_active, department, employment_type, description)
// to the short names the rest of the JSX uses (active, dept, type, desc)
const normalizeJob = (j) => ({
  ...j,
  active: j.is_active     ?? j.active ?? true,
  urgent: j.is_urgent     ?? j.urgent ?? false,
  dept:   j.department    ?? j.dept   ?? '',
  type:   j.employment_type ?? j.type ?? '',
  desc:   j.description   ?? j.desc   ?? '',
  posted: j.posted || (j.created_at ? j.created_at.slice(0, 10) : ''),
});

// Jobs loaded from API

/* ── Add Job Modal ──────────────────────────────────── */
const AddJobModal = ({ onClose, onAdd }) => {
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState({
    title:'', dept:'Engineering', location:'', type:'Full-time',
    desc:'', requirements:'', salary_range:'', skills:'', urgent:false,
  });
  const [postLinkedin, setPostLinkedin] = useState(true);
  const [linkedinResult, setLinkedinResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await jobsAPI.create({
        title:            form.title,
        department:       form.dept,
        location:         form.location,
        employment_type:  form.type,
        description:      form.desc,
        skills:           form.skills.split(',').map(s => s.trim()).filter(Boolean),
        requirements:     form.requirements || null,
        salary_range:     form.salary_range  || null,
        is_urgent:        form.urgent,
        is_active:        true,
        post_to_linkedin: postLinkedin,
      });
      const li = res.data?.linkedin_post;
      if (postLinkedin && li && !li.success) {
        setLinkedinResult(li.error || 'LinkedIn post failed');
        onAdd(normalizeJob(res.data));
        setSaving(false);
        return; // stay open to show LinkedIn error
      }
      onAdd(normalizeJob(res.data));
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to post job. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Post New Job</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'1rem' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Job Title *</label>
            <input className="input" placeholder="e.g. Senior ML Engineer" value={form.title} onChange={e => set('title',e.target.value)} />
          </div>
          <div>
            <label className="label">Department</label>
            <select className="select" value={form.dept} onChange={e => set('dept',e.target.value)}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Employment Type</label>
            <select className="select" value={form.type} onChange={e => set('type',e.target.value)}>
              {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Location</label>
            <input className="input" placeholder="e.g. Hyderabad / Remote" value={form.location} onChange={e => set('location',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Job Description</label>
            <BulletTextarea rows={4} placeholder="Describe the role and responsibilities… (use • Bullet button for bullet points)" value={form.desc} onChange={e => set('desc',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Requirements</label>
            <BulletTextarea rows={3} placeholder="• Minimum qualifications&#10;• Certifications&#10;• Years of experience" value={form.requirements} onChange={e => set('requirements',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Required Skills (comma separated)</label>
            <input className="input" placeholder="e.g. Python, TensorFlow, Docker" value={form.skills} onChange={e => set('skills',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Salary Range</label>
            <input className="input" placeholder="e.g. ₹12–18 LPA or $80k–$100k" value={form.salary_range} onChange={e => set('salary_range',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1', display:'flex', flexWrap:'wrap', gap:'1.5rem', alignItems:'center' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'0.625rem', cursor:'pointer' }}>
              <input type="checkbox" checked={form.urgent} onChange={e => set('urgent',e.target.checked)} style={{ width:16, height:16, accentColor:'var(--error)' }} />
              <span style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--on-surface)' }}>Mark as Urgent Hire</span>
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer' }}>
              <input type="checkbox" checked={postLinkedin} onChange={e => setPostLinkedin(e.target.checked)} style={{ width:16, height:16, accentColor:'#0077B5' }} />
              <Icon name="share" style={{ fontSize:'1rem', color:'#0077B5' }} />
              <span style={{ fontSize:'0.875rem', fontWeight:500 }}>Auto-post to LinkedIn</span>
            </label>
          </div>
          {postLinkedin && (
            <div style={{ gridColumn:'1/-1', display:'flex', gap:'0.5rem', padding:'0.625rem 0.875rem', borderRadius:'0.5rem', background:'rgba(0,119,181,0.06)', border:'1px solid rgba(0,119,181,0.2)' }}>
              <Icon name="info" style={{ fontSize:'0.875rem', color:'#0077B5', flexShrink:0, marginTop:2 }} />
              <p style={{ fontSize:'0.775rem', color:'var(--on-surface-variant)', margin:0, lineHeight:1.5 }}>
                Posts to JM Data Talent LinkedIn page with a direct link to the apply form.
                Requires <code>LINKEDIN_ACCESS_TOKEN</code> + <code>LINKEDIN_ORGANIZATION_ID</code> in HuggingFace env vars.
              </p>
            </div>
          )}
          {linkedinResult && (
            <div style={{ gridColumn:'1/-1', padding:'0.625rem 0.875rem', borderRadius:'0.5rem', background:'var(--error-container)' }}>
              <p style={{ fontSize:'0.8125rem', color:'var(--error)', margin:0 }}>
                <strong>Job posted ✓</strong> — but LinkedIn failed: {linkedinResult}
              </p>
              <button onClick={onClose} style={{ marginTop:'0.375rem', fontSize:'0.8125rem', fontWeight:600, color:'var(--primary)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                Close anyway →
              </button>
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          {error && <p style={{ fontSize:'0.8125rem', color:'var(--error)', alignSelf:'center', flex:1 }}>{error}</p>}
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{
            display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem',
            borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor: saving ? 'not-allowed' : 'pointer',
            background:'linear-gradient(135deg,var(--tertiary),#009966)',
            boxShadow:'0 2px 8px rgba(0,98,67,0.25)', opacity: saving ? 0.7 : 1,
          }}>
            <Icon name={saving ? 'progress_activity' : 'add'} style={{ fontSize:'1rem', color:'#fff' }} /> {saving ? 'Posting…' : 'Post Job'}
          </button>
        </div>
      </div>
    </div>
  );
};


/* ── Edit Job Modal ─────────────────────────────────── */
const EditJobModal = ({ job, onClose, onSave }) => {
  const { isMobile } = useBreakpoint();
  const [form, setForm] = React.useState({
    title:        job.title        || '',
    dept:         job.dept         || 'Engineering',
    location:     job.location     || '',
    type:         job.type         || 'Full-time',
    desc:         job.desc         || '',
    requirements: job.requirements || '',
    salary_range: job.salary_range || '',
    skills:       (job.skills||[]).join(', '),
    urgent:       job.urgent       || false,
  });
  const [saving, setSaving] = React.useState(false);
  const [error,  setError]  = React.useState('');
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const submit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      await jobsAPI.update(job.id, {
        title:           form.title,
        department:      form.dept,
        location:        form.location,
        employment_type: form.type,
        description:     form.desc,
        requirements:    form.requirements || null,
        salary_range:    form.salary_range  || null,
        skills:          form.skills.split(',').map(s => s.trim()).filter(Boolean),
        is_urgent:       form.urgent,
      });
      onSave({
        ...job,
        title: form.title, dept: form.dept, location: form.location,
        type: form.type, desc: form.desc, requirements: form.requirements,
        salary_range: form.salary_range,
        skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
        urgent: form.urgent,
      });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update job.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Edit Job</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'1rem' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Job Title *</label>
            <input className="input" value={form.title} onChange={e => set('title',e.target.value)} />
          </div>
          <div>
            <label className="label">Department</label>
            <select className="select" value={form.dept} onChange={e => set('dept',e.target.value)}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Employment Type</label>
            <select className="select" value={form.type} onChange={e => set('type',e.target.value)}>
              {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={e => set('location',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Job Description</label>
            <textarea className="textarea" rows={4} value={form.desc} onChange={e => set('desc',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Requirements</label>
            <textarea className="textarea" rows={3} value={form.requirements} onChange={e => set('requirements',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Required Skills (comma separated)</label>
            <input className="input" value={form.skills} onChange={e => set('skills',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Salary Range</label>
            <input className="input" placeholder="e.g. ₹12–18 LPA or $80k–$100k" value={form.salary_range} onChange={e => set('salary_range',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'0.625rem', cursor:'pointer' }}>
              <input type="checkbox" checked={form.urgent} onChange={e => set('urgent',e.target.checked)} style={{ width:16, height:16, accentColor:'var(--error)' }} />
              <span style={{ fontSize:'0.875rem', fontWeight:500 }}>Mark as Urgent Hire</span>
            </label>
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          {error && <p style={{ fontSize:'0.8125rem', color:'var(--error)', alignSelf:'center', flex:1 }}>{error}</p>}
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{
            display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem',
            borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            background:'linear-gradient(135deg,var(--primary),#3366cc)',
            boxShadow:'0 2px 8px rgba(68,104,176,0.25)', opacity: saving ? 0.7 : 1,
          }}>
            <Icon name={saving ? 'progress_activity' : 'save'} style={{ fontSize:'1rem', color:'#fff' }} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Job Detail Panel ───────────────────────────────── */
const JobPanel = ({ job, onClose, onToggle, onViewApplicants, onEdit, candidateCount }) => {
  const { isMobile } = useBreakpoint();
  const [copied, setCopied] = React.useState(false);
  const applyUrl = job.apply_key
    ? `${window.location.origin}/apply?key=${job.apply_key}`
    : null;

  const copyLink = () => {
    if (!applyUrl) return;
    navigator.clipboard.writeText(applyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
  <div style={{
    position:'fixed', top:0, right:0, bottom:0, width:480, zIndex:60,
    background:'var(--surface-container-lowest)', boxShadow:'-8px 0 40px rgba(19,27,46,0.12)',
    display:'flex', flexDirection:'column', overflowY:'auto',
  }} className="slide-in">
    <div style={{ padding:'1.5rem', borderBottom:'1px solid var(--ghost-border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
        <div style={{ width:44, height:44, borderRadius:'0.75rem', background:'rgba(0,98,67,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="work" style={{ fontSize:'1.375rem', color:'var(--tertiary)' }} />
        </div>
        <div>
          <h2 style={{ fontSize:'1.0625rem', fontWeight:700, color:'var(--on-surface)' }}>{job.title}</h2>
          <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{job.dept} · {job.location}</p>
        </div>
      </div>
      <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
    </div>

    <div style={{ padding:'1.5rem', flex:1 }}>
      {/* Badges */}
      <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1.25rem' }}>
        <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.2rem 0.625rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)' }}>{job.type}</span>
        {job.urgent && <span style={{ fontSize:'0.75rem', fontWeight:700, padding:'0.2rem 0.625rem', borderRadius:9999, background:'var(--error-container)', color:'var(--on-error-container)' }}>Urgent Hire</span>}
        <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.2rem 0.625rem', borderRadius:9999, background: job.active?'rgba(0,98,67,0.1)':'var(--surface-container)', color: job.active?'var(--tertiary)':'var(--on-surface-variant)' }}>
          {job.active ? '● Active' : '○ Closed'}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'0.875rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Applications', value: candidateCount ?? 0, icon:'group' },
          { label:'Posted',       value: job.posted,          icon:'calendar_today' },
        ].map(s => (
          <div key={s.label} style={{ padding:'0.875rem', background:'var(--surface-container-low)', borderRadius:'0.625rem', textAlign:'center' }}>
            <Icon name={s.icon} style={{ fontSize:'1.125rem', color:'var(--tertiary)', display:'block', margin:'0 auto 0.25rem' }} />
            <p style={{ fontWeight:700, fontSize:'1.125rem', color:'var(--on-surface)' }}>{s.value}</p>
            <p className="label-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Description */}
      <div style={{ marginBottom:'1.25rem' }}>
        <p className="label-sm" style={{ marginBottom:'0.5rem' }}>Description</p>
        <p style={{ fontSize:'0.875rem', color:'var(--on-surface)', lineHeight:1.7 }}>{job.desc}</p>
      </div>

      {/* Skills */}
      <div style={{ marginBottom:'1.5rem' }}>
        <p className="label-sm" style={{ marginBottom:'0.5rem' }}>Required Skills</p>
        <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap' }}>
          {(job.skills||[]).map(s => (
            <span key={s} style={{ fontSize:'0.8125rem', fontWeight:600, padding:'0.25rem 0.625rem', borderRadius:9999, background:'rgba(0,98,67,0.08)', color:'var(--tertiary)', border:'1px solid rgba(0,98,67,0.15)' }}>{s}</span>
          ))}
        </div>
      </div>

      {/* Application link — for sharing with Framer team */}
      {applyUrl && (
        <div style={{ marginBottom:'1.5rem' }}>
          <p className="label-sm" style={{ marginBottom:'0.5rem' }}>Public Application Link</p>
          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginBottom:'0.5rem', lineHeight:1.5 }}>
            Share this URL with the Framer team. Candidates who click Apply will land here.
          </p>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            <div style={{
              flex:1, padding:'0.5rem 0.75rem', borderRadius:'0.5rem',
              background:'var(--surface-container-low)', border:'1px solid var(--outline-variant)',
              fontSize:'0.8125rem', fontFamily:'monospace', color:'var(--on-surface)',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>
              {applyUrl}
            </div>
            <button
              onClick={copyLink}
              title="Copy link"
              style={{
                flexShrink:0, padding:'0.5rem 0.75rem', borderRadius:'0.5rem',
                border:'1px solid var(--outline-variant)', background: copied ? 'rgba(0,98,67,0.1)' : 'var(--surface-container-low)',
                cursor:'pointer', display:'flex', alignItems:'center', gap:'0.375rem',
                fontSize:'0.8125rem', fontWeight:600,
                color: copied ? 'var(--tertiary)' : 'var(--on-surface-variant)',
                transition:'all 0.15s',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize:'1rem' }}>
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)', marginTop:'0.375rem', opacity:0.7 }}>
            Key: <code style={{ fontFamily:'monospace' }}>{job.apply_key}</code> — tamper-proof, validated server-side
          </p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:'0.75rem' }}>
        <button onClick={() => onViewApplicants(job.id)} style={{
          flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
          padding:'0.625rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer',
          background:'linear-gradient(135deg,var(--tertiary),#009966)',
        }}>
          <Icon name="person_search" style={{ fontSize:'1rem', color:'#fff' }} /> View Candidates
        </button>
        <button onClick={() => onEdit(job)} className="btn-secondary" style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'0.375rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize:'1rem' }}>edit</span> Edit Job
        </button>
        <button onClick={() => onToggle(job.id)} className="btn-secondary" style={{ flex:1 }}>
          {job.active ? 'Close Position' : 'Reopen Position'}
        </button>
      </div>
    </div>
  </div>
  );
};

const JOBS_FILTER_KEY = 'nexus_jobs_filter';

/* ── Main ───────────────────────────────────────────── */
export default function JobsList() {
  const { isMobile, isTablet } = useBreakpoint();
  const navigate = useNavigate();
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [showEdit, setShowEdit] = useState(null);  // job being edited, or null
  const [selected, setSelected] = useState(null);
  const [candidateCounts, setCandidateCounts] = useState({}); // {job_id: count}

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobsAPI.getAll({ limit: 200 });
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setJobs(data.map(normalizeJob));
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, []);

  // Fetch candidate counts per job + aggregate website jobs
  const fetchCandidateCounts = useCallback(async () => {
    try {
      const res = await candidatesAPI.getAll({ limit: 1000 });
      const all = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.candidates) ? res.data.candidates : [];

      // Count per CRM job_id (includes website candidates — they now have real job_id)
      const counts = {};
      all.forEach(c => {
        if (c.job_id) counts[c.job_id] = (counts[c.job_id] || 0) + 1;
      });
      setCandidateCounts(counts);
    } catch {}
  }, []);

  useEffect(() => { fetchJobs(); fetchCandidateCounts(); }, [fetchJobs, fetchCandidateCounts]);

  const viewApplicants = (jobId, e) => {
    e?.stopPropagation();
    // Navigate to candidates page with job filter pre-applied via URL state
    navigate('/recruitment/candidates', { state: { jobFilter: jobId } });
  };
  const [search, setSearch]     = useState(() => {
    try { const raw = sessionStorage.getItem(JOBS_FILTER_KEY); return raw ? (JSON.parse(raw).search || '') : ''; } catch { return ''; }
  });
  const [deptFilter, setDept]   = useState(() => {
    try { const raw = sessionStorage.getItem(JOBS_FILTER_KEY); return raw ? (JSON.parse(raw).deptFilter || 'all') : 'all'; } catch { return 'all'; }
  });
  const [typeFilter, setType]   = useState(() => {
    try { const raw = sessionStorage.getItem(JOBS_FILTER_KEY); return raw ? (JSON.parse(raw).typeFilter || 'all') : 'all'; } catch { return 'all'; }
  });
  const [statusFilter, setStat] = useState(() => {
    try { const raw = sessionStorage.getItem(JOBS_FILTER_KEY); return raw ? (JSON.parse(raw).statusFilter || 'active') : 'active'; } catch { return 'active'; }
  });
  const [view, setView]         = useState(() => {
    try { const raw = sessionStorage.getItem(JOBS_FILTER_KEY); return raw ? (JSON.parse(raw).view || 'grid') : 'grid'; } catch { return 'grid'; }
  }); // grid | list

  // ── Persist filter state to sessionStorage on every change ──
  useEffect(() => {
    try {
      sessionStorage.setItem(JOBS_FILTER_KEY, JSON.stringify({ search, deptFilter, typeFilter, statusFilter, view }));
    } catch {}
  }, [search, deptFilter, typeFilter, statusFilter, view]);

  const toggle = async (id) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    const newActive = !job.active;
    setJobs(js => js.map(j => j.id===id ? {...j, active:newActive} : j));
    setSelected(s => s?.id===id ? {...s, active:newActive} : s);
    try { await jobsAPI.update(id, { is_active: newActive }); } catch {}
  };

  const addJob = (j) => setJobs(js => [j, ...js]);

  const saveEditedJob = (updated) => {
    setJobs(js => js.map(j => j.id === updated.id ? { ...j, ...updated } : j));
    setSelected(s => s?.id === updated.id ? { ...s, ...updated } : s);
  };

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      const q = search.toLowerCase();
      const matchQ = !q || j.title.toLowerCase().includes(q) || j.dept.toLowerCase().includes(q) || j.location.toLowerCase().includes(q);
      const matchD = deptFilter==='all' || j.dept===deptFilter;
      const matchT = typeFilter==='all' || j.type===typeFilter;
      const matchS = statusFilter==='all' || (statusFilter==='active'?j.active:!j.active);
      return matchQ && matchD && matchT && matchS;
    });
  }, [jobs, search, deptFilter, typeFilter, statusFilter]);

  const statCounts = { active: jobs.filter(j=>j.active).length, closed: jobs.filter(j=>!j.active).length, urgent: jobs.filter(j=>j.urgent&&j.active).length, total: jobs.length };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Job Openings</h1>
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem',
          borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer',
          background:'linear-gradient(135deg,var(--tertiary),#009966)',
          boxShadow:'0 2px 8px rgba(0,98,67,0.25)',
        }}>
          <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Post Job
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Positions', value:statCounts.total,  icon:'work',          color:'var(--tertiary)' },
          { label:'Active',          value:statCounts.active, icon:'check_circle',   color:'var(--tertiary)' },
          { label:'Urgent Hire',     value:statCounts.urgent, icon:'priority_high',  color:'var(--error)' },
          { label:'Closed',          value:statCounts.closed, icon:'cancel',         color:'var(--on-surface-variant)' },
        ].map(s => (
          <div key={s.label} className="card-sm" style={{ display:'flex', alignItems:'center', gap:'0.875rem' }}>
            <div style={{ width:40, height:40, borderRadius:'0.625rem', background:`${s.color}12`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon name={s.icon} style={{ fontSize:'1.25rem', color:s.color }} />
            </div>
            <div>
              <p style={{ fontSize:'1.375rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{s.value}</p>
              <p className="label-sm" style={{ marginTop:'0.125rem' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding:'0.875rem 1.25rem', marginBottom:'1rem', display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
        <div className="search-bar" style={{ maxWidth:260, flex:'1 1 auto' }}>
          <Icon name="search" style={{ position:'absolute', left:'0.625rem', top:'50%', transform:'translateY(-50%)', color:'var(--on-surface-variant)', fontSize:'1.1rem' }} />
          <input placeholder="Search jobs…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft:'2.25rem', width:'100%' }} />
        </div>

        <select className="select" style={{ width:'auto', minWidth:140 }} value={deptFilter} onChange={e => setDept(e.target.value)}>
          <option value="all">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select className="select" style={{ width:'auto', minWidth:130 }} value={typeFilter} onChange={e => setType(e.target.value)}>
          <option value="all">All Types</option>
          {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>

        <div style={{ display:'flex', gap:'2px', background:'var(--surface-container-low)', padding:4, borderRadius:'0.5rem' }}>
          {[{k:'active',l:'Active'},{k:'closed',l:'Closed'},{k:'all',l:'All'}].map(s => (
            <button key={s.k} onClick={() => setStat(s.k)} style={{
              padding:'0.3rem 0.75rem', borderRadius:'0.375rem', border:'none', cursor:'pointer',
              fontSize:'0.8125rem', fontWeight: statusFilter===s.k?600:400, fontFamily:'var(--font-display)',
              background: statusFilter===s.k?'var(--surface-container-lowest)':'transparent',
              color: statusFilter===s.k?'var(--on-surface)':'var(--on-surface-variant)',
              boxShadow: statusFilter===s.k?'var(--ambient-shadow)':'none', transition:'all 0.15s',
            }}>{s.l}</button>
          ))}
        </div>

        <div style={{ marginLeft:'auto', display:'flex', gap:'0.25rem' }}>
          {[{k:'grid',icon:'grid_view'},{k:'list',icon:'view_list'}].map(v => (
            <button key={v.k} className="btn-icon" onClick={() => setView(v.k)} style={{ background: view===v.k?'var(--surface-container)':'transparent', color: view===v.k?'var(--primary)':'var(--on-surface-variant)' }}>
              <Icon name={v.icon} style={{ fontSize:'1.125rem', color:'inherit' }} />
            </button>
          ))}
        </div>
      </div>

      {/* Grid view */}
      {view === 'grid' && (
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap:'1rem' }}>
          {filtered.map(job => (
            <div
              key={job.id}
              className="card hover-lift"
              style={{ cursor:'pointer', opacity: job.active?1:0.65, border: job.urgent&&job.active?'1px solid rgba(186,26,26,0.2)':'1px solid rgba(195,198,215,0.1)' }}
              onClick={() => setSelected(job)}
            >
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'0.875rem' }}>
                <div style={{ width:44, height:44, borderRadius:'0.75rem', background:'rgba(0,98,67,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="work" style={{ fontSize:'1.375rem', color:'var(--tertiary)' }} />
                </div>
                <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', alignItems:'center' }}>
                  {job.urgent && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.15rem 0.5rem', borderRadius:9999, background:'var(--error-container)', color:'var(--on-error-container)' }}>Urgent</span>}
                  <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.15rem 0.5rem', borderRadius:9999, background: job.active?'rgba(0,98,67,0.1)':'var(--surface-container)', color: job.active?'var(--tertiary)':'var(--on-surface-variant)' }}>
                    {job.active ? '● Active' : '○ Closed'}
                  </span>
                </div>
              </div>

              <h3 style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--on-surface)', marginBottom:'0.25rem' }}>{job.title}</h3>
              <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginBottom:'0.875rem' }}>{job.dept} · {job.location}</p>

              <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', marginBottom:'1rem' }}>
                {(job.skills||[]).slice(0,3).map(s => (
                  <span key={s} style={{ fontSize:'0.75rem', fontWeight:500, padding:'0.2rem 0.5rem', borderRadius:4, background:'var(--surface-container-low)', color:'var(--on-surface-variant)' }}>{s}</span>
                ))}
                {(job.skills||[]).length > 3 && <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', padding:'0.2rem 0.5rem' }}>+{job.skills.length-3}</span>}
              </div>

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:'0.875rem', borderTop:'1px solid var(--ghost-border)' }}>
                <button
                  onClick={e => viewApplicants(job.id, e)}
                  style={{
                    display:'flex', alignItems:'center', gap:'0.375rem',
                    background:'rgba(0,98,67,0.07)', border:'none', cursor:'pointer',
                    padding:'0.3rem 0.625rem', borderRadius:'0.5rem', color:'var(--tertiary)',
                  }}>
                  <Icon name="group" style={{ fontSize:'1rem', color:'var(--tertiary)' }} />
                  <span style={{ fontWeight:700, fontSize:'0.9375rem' }}>{candidateCounts[job.id] || 0}</span>
                  <span style={{ fontSize:'0.75rem' }}>applicants</span>
                </button>
                <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{job.posted}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div className="table-scroll-wrapper"><table className="data-table" style={{ margin:0 }}>
            <thead>
              <tr style={{ background:'var(--surface-container-low)' }}>
                {['Job Title','Department','Location','Type','Applications','Posted','Status',''].map(h => (
                  <th key={h} style={{ padding:'0.875rem 1rem', textAlign: h===''?'right':'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => (
                <tr key={job.id} onClick={() => setSelected(job)} style={{ cursor:'pointer' }}>
                  <td style={{ padding:'0.875rem 1rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                      <div style={{ width:34, height:34, borderRadius:'0.5rem', background:'rgba(0,98,67,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon name="work" style={{ fontSize:'1rem', color:'var(--tertiary)' }} />
                      </div>
                      <div>
                        <p style={{ fontWeight:600, fontSize:'0.875rem' }}>{job.title}</p>
                        {job.urgent && <span style={{ fontSize:'0.6875rem', fontWeight:700, color:'var(--error)' }}>Urgent</span>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'0.875rem 1rem', color:'var(--on-surface-variant)' }}>{job.dept}</td>
                  <td style={{ padding:'0.875rem 1rem', color:'var(--on-surface-variant)', fontSize:'0.8125rem' }}>{job.location}</td>
                  <td style={{ padding:'0.875rem 1rem' }}>
                    <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.2rem 0.5rem', borderRadius:4, background:'rgba(0,98,67,0.08)', color:'var(--tertiary)' }}>{job.type}</span>
                  </td>
                  <td style={{ padding:'0.875rem 1rem', fontWeight:700 }}>{candidateCounts[job.id] || 0}</td>
                  <td style={{ padding:'0.875rem 1rem', color:'var(--on-surface-variant)', fontSize:'0.8125rem' }}>{job.posted}</td>
                  <td style={{ padding:'0.875rem 1rem' }}>
                    <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.2rem 0.5rem', borderRadius:9999, background:job.active?'rgba(0,98,67,0.1)':'var(--surface-container)', color:job.active?'var(--tertiary)':'var(--on-surface-variant)' }}>
                      {job.active ? 'Active' : 'Closed'}
                    </span>
                  </td>
                  <td style={{ padding:'0.875rem 1rem', textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                    <div style={{ display:'flex', gap:'0.25rem', justifyContent:'flex-end' }}>
                      <button className="btn-icon"><Icon name="open_in_new" style={{ fontSize:'1rem' }} /></button>
                      <button className="btn-icon" onClick={() => toggle(job.id)}><Icon name={job.active?'toggle_on':'toggle_off'} style={{ fontSize:'1.25rem', color: job.active?'var(--tertiary)':'var(--outline)' }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="card" style={{ textAlign:'center', padding:'3rem' }}>
          <Icon name="work_off" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.2, color:'var(--tertiary)' }} />
          <p style={{ fontWeight:600, color:'var(--on-surface)' }}>No jobs match your filters</p>
        </div>
      )}

      {/* Side panel overlay */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:0, background:'rgba(19,27,46,0.25)', backdropFilter:'blur(2px)', zIndex:59 }} />
          <JobPanel job={selected} onClose={() => setSelected(null)} onToggle={toggle} onViewApplicants={viewApplicants} onEdit={j => { setShowEdit(j); }} candidateCount={candidateCounts[selected?.id] || 0} />
        </>
      )}

      {showAdd && <AddJobModal onClose={() => setShowAdd(false)} onAdd={addJob} />}
      {showEdit && <EditJobModal job={showEdit} onClose={() => setShowEdit(null)} onSave={saveEditedJob} />}
    </div>
  );
}
