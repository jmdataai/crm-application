import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { candidatesAPI } from '../../services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import NexusTutorial from '../../components/NexusTutorial';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);
const STAGE_META = {
  sourced:             { label:'Sourced',             bg:'var(--surface-container)',     color:'var(--on-surface-variant)' },
  screened:            { label:'Screened',            bg:'var(--secondary-container)',   color:'#2b3a4e' },
  shortlisted:         { label:'Shortlisted',         bg:'rgba(217,119,6,0.12)',         color:'#92400e' },
  interview_scheduled: { label:'Interview Scheduled', bg:'rgba(68,104,176,0.1)',           color:'var(--primary)' },
  interviewed:         { label:'Interviewed',         bg:'rgba(68,104,176,0.15)',          color:'var(--primary)' },
  selected:            { label:'Selected',            bg:'rgba(0,98,67,0.12)',           color:'var(--tertiary)' },
  rejected:            { label:'Rejected',            bg:'var(--error-container)',       color:'var(--on-error-container)' },
  onboarded:           { label:'Onboarded',           bg:'rgba(0,98,67,0.22)',           color:'var(--tertiary)' },
};
const Chip = ({ status }) => {
  const s = STAGE_META[status] || STAGE_META.sourced;
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.6875rem', fontWeight:700, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>{s.label}</span>;
};
const SOURCES = ['LinkedIn','Referral','AngelList','Resume','Campus','Portfolio','Import'];
const STAGES  = Object.keys(STAGE_META);
const VISA_COLORS = {
  'H1B': { bg:'rgba(68,104,176,0.1)', color:'var(--primary)' },
  'GC':  { bg:'rgba(0,98,67,0.1)',  color:'var(--tertiary)' },
  'USCitizen': { bg:'rgba(0,98,67,0.15)', color:'var(--tertiary)' },
};
const VisaBadge = ({ visa }) => {
  if (!visa) return <span style={{ color:'var(--outline)' }}>—</span>;
  const style = VISA_COLORS[visa.trim()] || { bg:'rgba(217,119,6,0.1)', color:'#d97706' };
  return <span style={{ padding:'0.15rem 0.5rem', borderRadius:4, fontSize:'0.75rem', fontWeight:700, ...style }}>{visa.trim()}</span>;
};

/* ── Inline Resume Viewer Modal ─────────────────────── */
const ResumeViewerModal = ({ url, candidateName, onClose }) => (
  <div
    className="modal-overlay scale-in"
    onClick={e => e.target === e.currentTarget && onClose()}
    style={{ zIndex: 1000 }}
  >
    <div style={{
      background: 'var(--surface-container-lowest)',
      borderRadius: '1rem',
      width: '90vw',
      maxWidth: 900,
      height: '90vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem', borderBottom:'1px solid var(--outline-variant)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
          <Icon name="description" style={{ color:'var(--tertiary)' }} />
          <span style={{ fontWeight:700, fontSize:'0.9375rem' }}>Resume — {candidateName}</span>
        </div>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          <a
            href={url.replace('/preview', '/view')}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.375rem 0.875rem', borderRadius:'0.5rem', fontSize:'0.8125rem', fontWeight:600, background:'rgba(0,98,67,0.08)', color:'var(--tertiary)', textDecoration:'none' }}
          >
            <Icon name="open_in_new" style={{ fontSize:'1rem' }} /> Open in Drive
          </a>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
      </div>
      {/* iframe */}
      <iframe
        src={url}
        title={`Resume — ${candidateName}`}
        style={{ flex:1, width:'100%', border:'none', background:'#f8f8f8' }}
        allow="autoplay"
      />
    </div>
  </div>
);

/* ── Add Candidate Modal ─────────────────────────────── */
const AddCandidateModal = ({ onClose, onAdd, defaultType }) => {
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    full_name:'', email:'', phone:'', candidate_role:'',
    total_experience:'', relevant_experience:'', location:'',
    visa_status:'', relocation:'', source:'LinkedIn', status:'sourced',
    notes:'', candidate_type: defaultType || 'domestic',
  });
  const [resumeFile, setResumeFile]       = useState(null);   // File object
  const [uploading, setUploading]         = useState(false);  // true during Drive upload
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError]                 = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isIntl = form.candidate_type === 'international';

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) { setResumeFile(null); return; }
    const allowed = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      setError('Only PDF, DOC, or DOCX files are allowed.');
      setResumeFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum 10 MB.');
      setResumeFile(null);
      return;
    }
    setError('');
    setResumeFile(file);
  };

  const submit = async () => {
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    setError('');
    setUploading(true);
    try {
      // Step 1 — create the candidate record (JSON)
      const totalExpNum  = form.total_experience    ? parseFloat(form.total_experience)    : null;
      const relevExpNum  = form.relevant_experience ? parseFloat(form.relevant_experience) : null;
      const res = await candidatesAPI.create({
        full_name:           form.full_name,
        email:               form.email || null,
        phone:               form.phone || null,
        candidate_role:      form.candidate_role || null,
        source:              form.source,
        status:              form.status,
        notes:               form.notes || null,
        candidate_type:      form.candidate_type,
        total_experience:    totalExpNum != null ? `${totalExpNum} years` : null,
        relevant_experience: relevExpNum != null ? `${relevExpNum} years` : null,
        experience_years:    totalExpNum != null && !isNaN(totalExpNum) ? Math.round(totalExpNum) : null,
        location:            form.location || null,
        relocation:          form.relocation || null,
        visa_status:         isIntl ? (form.visa_status || null) : null,
      });
      const newCandidate = res.data;

      // Step 2 — if a resume file was selected, upload it to Google Drive
      if (resumeFile) {
        setUploadProgress(0);
        const upRes = await candidatesAPI.uploadResume(
          newCandidate.id,
          resumeFile,
          (pct) => setUploadProgress(pct),
        );
        newCandidate.resume_url      = upRes.data.resume_url;
        newCandidate.tech_stack      = upRes.data.tech_stack      || [];
        newCandidate.experience_years= upRes.data.experience_years ?? newCandidate.experience_years;
      }

      onAdd(normalise(newCandidate));
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to add candidate. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const fileLabel = resumeFile
    ? resumeFile.name
    : 'Click to attach resume (PDF, DOC, DOCX — max 10 MB)';

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Add Candidate</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {/* Domestic / International toggle */}
        <div style={{ display:'flex', gap:4, padding:4, background:'var(--surface-container-high)', borderRadius:'0.75rem', marginBottom:'1rem', width:'fit-content' }}>
          {['domestic','international'].map(t => (
            <button key={t} onClick={() => set('candidate_type', t)} style={{ padding:'0.4rem 1rem', borderRadius:'0.5rem', border:'none', cursor:'pointer', fontFamily:'var(--font-display)', fontSize:'0.8125rem', fontWeight:form.candidate_type===t?600:500, background:form.candidate_type===t?'var(--surface-container-lowest)':'transparent', color:form.candidate_type===t?'var(--tertiary)':'var(--on-surface-variant)' }}>
              {t === 'domestic' ? '🇮🇳 Domestic' : '🌍 International'}
            </button>
          ))}
        </div>

        {/* Fields grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {[
            { label:'Full Name *',         key:'full_name',           type:'text', span:2 },
            { label:'Email',               key:'email',               type:'email' },
            { label:'Phone',               key:'phone',               type:'tel' },
            { label:'Role / Technology',   key:'candidate_role',      type:'text' },
            { label:'Location',            key:'location',            type:'text' },
            { label:'Total Exp (years)',    key:'total_experience',    type:'number', placeholder:'e.g. 5' },
            { label:'Relevant Exp (years)', key:'relevant_experience', type:'number', placeholder:'e.g. 3' },
          ].map(f => (
            <div key={f.key} style={{ gridColumn: f.span === 2 ? '1/-1' : undefined }}>
              <label className="label">{f.label}</label>
              <input className="input" type={f.type} placeholder={f.placeholder || ''} value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} min={f.type==='number'?0:undefined} />
            </div>
          ))}

          {isIntl && (<>
            <div>
              <label className="label">VISA Status</label>
              <input className="input" placeholder="H1B, GC, H4EAD…" value={form.visa_status} onChange={e => set('visa_status', e.target.value)} />
            </div>
            <div>
              <label className="label">Relocation</label>
              <input className="input" placeholder="Remote, Local, Any…" value={form.relocation} onChange={e => set('relocation', e.target.value)} />
            </div>
          </>)}

          <div>
            <label className="label">Source</label>
            <select className="select" value={form.source} onChange={e => set('source', e.target.value)}>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Stage</label>
            <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
              {STAGES.map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
            </select>
          </div>

          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Notes</label>
            <textarea className="textarea" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {/* ── Resume Upload ── */}
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Resume <span style={{ color:'var(--on-surface-variant)', fontWeight:400 }}>(optional)</span></label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display:'none' }}
              onChange={handleFileChange}
            />
            {/* Drop zone / click area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${resumeFile ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                borderRadius: '0.625rem',
                padding: '1rem 1.25rem',
                cursor: 'pointer',
                background: resumeFile ? 'rgba(0,98,67,0.04)' : 'var(--surface-container-low)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                transition: 'all 0.15s',
              }}
            >
              <Icon
                name={resumeFile ? 'description' : 'upload_file'}
                style={{ fontSize:'1.5rem', color: resumeFile ? 'var(--tertiary)' : 'var(--on-surface-variant)', flexShrink:0 }}
              />
              <div style={{ minWidth:0 }}>
                <p style={{ fontSize:'0.875rem', fontWeight: resumeFile ? 600 : 400, color: resumeFile ? 'var(--tertiary)' : 'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {fileLabel}
                </p>
                {resumeFile && (
                  <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>
                    {(resumeFile.size / 1024).toFixed(0)} KB · Will be uploaded to Google Drive
                  </p>
                )}
              </div>
              {resumeFile && (
                <button
                  onClick={e => { e.stopPropagation(); setResumeFile(null); if(fileInputRef.current) fileInputRef.current.value=''; }}
                  style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--error)', display:'flex', alignItems:'center', flexShrink:0 }}
                >
                  <Icon name="cancel" style={{ fontSize:'1.125rem', color:'var(--error)' }} />
                </button>
              )}
            </div>

            {/* Upload progress bar */}
            {uploading && resumeFile && (
              <div style={{ marginTop:'0.5rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                  <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>
                    {uploadProgress < 100 ? 'Uploading to Google Drive…' : 'Processing…'}
                  </span>
                  <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--tertiary)' }}>{uploadProgress}%</span>
                </div>
                <div style={{ height:4, background:'var(--surface-container)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${uploadProgress}%`, background:'var(--tertiary)', borderRadius:2, transition:'width 0.2s' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginTop:'0.75rem', padding:'0.625rem 0.875rem', background:'var(--error-container)', borderRadius:'0.5rem' }}>
            <p style={{ fontSize:'0.8125rem', color:'var(--error)' }}>{error}</p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose} disabled={uploading}>Cancel</button>
          <button
            onClick={submit}
            disabled={uploading}
            style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor: uploading ? 'not-allowed' : 'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)', opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? (
              <><Icon name="progress_activity" style={{ fontSize:'1rem', color:'#fff' }} /> {resumeFile ? 'Uploading…' : 'Adding…'}</>
            ) : (
              <><Icon name="person_add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Candidate</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const normalise = (c) => ({
  id: c.id, name: c.full_name, email: c.email, phone: c.phone,
  candidate_role: c.candidate_role, current_company: c.current_company,
  job: c.job?.title || '', dept: c.job?.department || '',
  experience_years: c.experience_years != null ? Number(c.experience_years) : null,
  total_experience: c.total_experience || '', relevant_experience: c.relevant_experience || '',
  location: c.location || '', relocation: c.relocation || '', visa_status: c.visa_status || '',
  source: c.source || 'Manual', status: c.status, candidate_type: c.candidate_type || 'domestic',
  applied: c.created_at?.slice(0, 10), notes: c.notes,
  resume_url: c.resume_url || null,
  tech_stack: Array.isArray(c.tech_stack) ? c.tech_stack : [],
});

/* ── Tech stack multi-select dropdown ───────────────────── */
const TechMultiSelect = ({ allTech, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('any'); // 'any' | 'all'
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (tech) => {
    const next = new Set(selected);
    next.has(tech) ? next.delete(tech) : next.add(tech);
    onChange(next, mode);
  };
  const clearAll = () => onChange(new Set(), mode);
  const switchMode = (m) => { setMode(m); onChange(selected, m); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
          padding: '0.375rem 0.75rem', borderRadius: '0.5rem',
          border: `1px solid ${selected.size > 0 ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
          background: selected.size > 0 ? 'rgba(0,98,67,0.07)' : 'var(--surface)',
          cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.8125rem', fontWeight: 600,
          color: selected.size > 0 ? 'var(--tertiary)' : 'var(--on-surface-variant)',
          whiteSpace: 'nowrap',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>code</span>
        {selected.size > 0 ? `Tech (${selected.size})` : 'Tech Stack'}
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)',
          borderRadius: '0.625rem', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          width: 260, padding: '0.625rem',
        }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: '0.5rem', background: 'var(--surface-container-high)', padding: 3, borderRadius: '0.5rem' }}>
            {[{id:'any',label:'Match ANY'},{id:'all',label:'Match ALL'}].map(m => (
              <button key={m.id} onClick={() => switchMode(m.id)} style={{
                flex: 1, padding: '0.25rem', borderRadius: '0.375rem', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 600,
                background: mode === m.id ? 'var(--surface-container-lowest)' : 'transparent',
                color: mode === m.id ? 'var(--tertiary)' : 'var(--on-surface-variant)',
              }}>{m.label}</button>
            ))}
          </div>
          {/* List */}
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allTech.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', padding: '0.5rem' }}>No tech data yet</p>}
            {allTech.map(tech => (
              <label key={tech} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.375rem', borderRadius: '0.375rem', cursor: 'pointer', background: selected.has(tech) ? 'rgba(0,98,67,0.07)' : 'transparent' }}>
                <input type="checkbox" checked={selected.has(tech)} onChange={() => toggle(tech)} style={{ accentColor: 'var(--tertiary)', width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ fontSize: '0.8125rem', fontWeight: selected.has(tech) ? 600 : 400, color: selected.has(tech) ? 'var(--tertiary)' : 'var(--on-surface)' }}>{tech}</span>
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <button onClick={clearAll} style={{ marginTop: '0.5rem', width: '100%', padding: '0.3rem', borderRadius: '0.375rem', border: '1px solid var(--outline-variant)', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--error)', fontFamily: 'var(--font-display)' }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Experience filter ────────────────────────────────────── */
const ExpFilter = ({ value, onChange }) => {
  // value: { op: '>' | '<' | '>=' | '<=' | '=', years: string }
  const ops = ['>', '>=', '=', '<=', '<'];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: `1px solid ${(value.years) ? 'var(--tertiary)' : 'var(--outline-variant)'}`, borderRadius: '0.5rem', overflow: 'hidden', background: value.years ? 'rgba(0,98,67,0.05)' : 'var(--surface)' }}>
      <select
        value={value.op}
        onChange={e => onChange({ ...value, op: e.target.value })}
        style={{ padding: '0.35rem 0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--tertiary)', outline: 'none', minWidth: 36 }}
      >
        {ops.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <input
        type="number"
        min="0" max="50"
        placeholder="yrs"
        value={value.years}
        onChange={e => onChange({ ...value, years: e.target.value })}
        style={{ width: 48, padding: '0.35rem 0.375rem', border: 'none', background: 'transparent', fontFamily: 'var(--font-display)', fontSize: '0.8125rem', outline: 'none', color: 'var(--on-surface)' }}
      />
    </div>
  );
};

export default function CandidatesList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState('domestic');
  const [stageFilter, setStage]     = useState('all');
  const [selected, setSelected]     = useState(new Set());
  const [showAdd, setShowAdd]       = useState(false);
  const [sortBy, setSortBy]         = useState('applied');
  const [sortDir, setSortDir]       = useState('desc');
  const [page, setPage]             = useState(1);
  const [viewerCandidate, setViewer] = useState(null);
  const PER_PAGE = 25;

  // Column text searches
  const [colSearch, setColSearch] = useState({ name:'', candidate_role:'', total_experience:'', relevant_experience:'', location:'', visa_status:'', relocation:'', source:'' });
  const setCS = (k, v) => { setColSearch(s => ({ ...s, [k]: v })); setPage(1); };

  // Advanced filters
  const [expFilter, setExpFilter]         = useState({ op: '>', years: '' });
  const [techSelected, setTechSelected]   = useState(new Set());
  const [techMode, setTechMode]           = useState('any');   // 'any' | 'all'
  const [hasResumeOnly, setHasResumeOnly] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q'); if (q) setColSearch(s => ({ ...s, name: q }));
    const type = params.get('type'); if (type) setActiveTab(type);
  }, [location.search]);

  // Derived: all unique tech tags across current tab's candidates
  const allTechOptions = useMemo(() => {
    const set = new Set();
    candidates
      .filter(c => c.candidate_type === activeTab)
      .forEach(c => (c.tech_stack || []).forEach(t => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [candidates, activeTab]);

  const fetchCandidates = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await candidatesAPI.getAll({ limit: 500 });
      const data = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.candidates) ? res.data.candidates : Array.isArray(res.data?.data) ? res.data.data : [];
      setCandidates(data.map(normalise));
    } catch { setError('Failed to load candidates.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const filtered = useMemo(() => {
    let out = candidates.filter(c => {
      if (c.candidate_type !== activeTab) return false;
      if (stageFilter !== 'all' && c.status !== stageFilter) return false;

      // Column text searches
      const cs = colSearch;
      if (cs.name && !c.name?.toLowerCase().includes(cs.name.toLowerCase())) return false;
      if (cs.candidate_role && !c.candidate_role?.toLowerCase().includes(cs.candidate_role.toLowerCase())) return false;
      if (cs.total_experience && !c.total_experience?.toLowerCase().includes(cs.total_experience.toLowerCase())) return false;
      if (cs.relevant_experience && !c.relevant_experience?.toLowerCase().includes(cs.relevant_experience.toLowerCase())) return false;
      if (cs.location && !c.location?.toLowerCase().includes(cs.location.toLowerCase())) return false;
      if (cs.visa_status && !c.visa_status?.toLowerCase().includes(cs.visa_status.toLowerCase())) return false;
      if (cs.relocation && !c.relocation?.toLowerCase().includes(cs.relocation.toLowerCase())) return false;
      if (cs.source && !c.source?.toLowerCase().includes(cs.source.toLowerCase())) return false;

      // Experience filter (numeric comparison on experience_years)
      if (expFilter.years !== '') {
        const threshold = parseFloat(expFilter.years);
        if (!isNaN(threshold)) {
          const exp = c.experience_years;
          if (exp == null) return false;  // exclude unknowns when filter active
          const ops = { '>': exp > threshold, '>=': exp >= threshold, '=': exp === threshold, '<=': exp <= threshold, '<': exp < threshold };
          if (!ops[expFilter.op]) return false;
        }
      }

      // Has-resume filter
      if (hasResumeOnly && !c.resume_url) return false;

      // Tech stack filter
      if (techSelected.size > 0) {
        const cStack = new Set((c.tech_stack || []).map(t => t.toLowerCase()));
        const sel    = [...techSelected].map(t => t.toLowerCase());
        if (techMode === 'all') {
          if (!sel.every(t => cStack.has(t))) return false;
        } else {
          if (!sel.some(t => cStack.has(t))) return false;
        }
      }

      return true;
    });
    out = [...out].sort((a, b) => {
      const av = a[sortBy] ?? '', bv = b[sortBy] ?? '';
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return out;
  }, [candidates, activeTab, stageFilter, colSearch, expFilter, hasResumeOnly, techSelected, techMode, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const toggleSort = (col) => { if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(col); setSortDir('asc'); } setPage(1); };
  const SortIcon = ({ col }) => sortBy === col ? <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} style={{ fontSize:'0.75rem', color:'var(--tertiary)' }} /> : <Icon name="unfold_more" style={{ fontSize:'0.75rem', opacity:0.3 }} />;
  const tabCounts = { domestic: candidates.filter(c => c.candidate_type === 'domestic').length, international: candidates.filter(c => c.candidate_type === 'international').length };
  const isIntl = activeTab === 'international';
  const hasColSearch = Object.values(colSearch).some(v => v) || expFilter.years !== '' || hasResumeOnly || techSelected.size > 0;

  const clearAllFilters = () => {
    setColSearch({ name:'', candidate_role:'', total_experience:'', relevant_experience:'', location:'', visa_status:'', relocation:'', source:'' });
    setExpFilter({ op: '>', years: '' });
    setHasResumeOnly(false);
    setTechSelected(new Set());
    setStage('all');
    setPage(1);
  };

  const domCols  = [
    {label:'Candidate',        key:'name'},
    {label:'Role / Technology',key:'candidate_role'},
    {label:'Tech Stack',       key:'tech_stack'},
    {label:'Total Exp',        key:'total_experience'},
    {label:'Rel. Exp',         key:'relevant_experience'},
    {label:'Exp (yrs)',        key:'experience_years'},
    {label:'Source',           key:'source'},
    {label:'Resume',           key:'resume_url'},
    {label:'Stage',            key:'status'},
    {label:'Added',            key:'applied'},
  ];
  const intlCols = [
    {label:'Candidate',        key:'name'},
    {label:'VISA',             key:'visa_status'},
    {label:'Role / Technology',key:'candidate_role'},
    {label:'Tech Stack',       key:'tech_stack'},
    {label:'Total Exp',        key:'total_experience'},
    {label:'Rel. Exp',         key:'relevant_experience'},
    {label:'Exp (yrs)',        key:'experience_years'},
    {label:'Location',         key:'location'},
    {label:'Relocation',       key:'relocation'},
    {label:'Resume',           key:'resume_url'},
    {label:'Stage',            key:'status'},
    {label:'Added',            key:'applied'},
  ];
  const cols = isIntl ? intlCols : domCols;

  return (
    <div className="fade-in">
      {loading && <div style={{textAlign:'center',padding:'4rem',color:'var(--on-surface-variant)'}}><Icon name="progress_activity" style={{fontSize:'2rem',display:'block',margin:'0 auto 0.75rem',animation:'spin 1s linear infinite'}}/>Loading…</div>}
      {error && <div style={{background:'var(--error-container)',color:'var(--error)',padding:'1rem',borderRadius:'0.5rem',marginBottom:'1rem'}}>{error}</div>}
      {!loading && <>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:'1.5rem'}}>
        <div><p className="label-sm" style={{marginBottom:'0.25rem',color:'var(--tertiary)'}}>Recruitment ATS</p><h1 className="headline-sm">Candidates</h1></div>
        <div style={{display:'flex',gap:'0.625rem'}}>
          <a href="/recruitment/import-candidates" className="btn-secondary"><Icon name="upload_file" style={{fontSize:'1rem'}}/> Import</a>
          <a data-tour="candidates-pipeline" href="/recruitment/pipeline" className="btn-secondary"><Icon name="account_tree" style={{fontSize:'1rem'}}/> Pipeline</a>
          <button data-tour="candidates-add" onClick={()=>setShowAdd(true)} style={{display:'inline-flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 1.25rem',borderRadius:'0.5rem',fontSize:'0.875rem',fontWeight:600,color:'#fff',border:'none',cursor:'pointer',background:'linear-gradient(135deg,var(--tertiary),#009966)',boxShadow:'0 2px 8px rgba(0,98,67,0.25)'}}>
            <Icon name="person_add" style={{fontSize:'1rem',color:'#fff'}}/> Add Candidate
          </button>
        </div>
      </div>
      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:'1.25rem',background:'var(--surface-container-high)',padding:4,borderRadius:'0.875rem',width:'fit-content'}}>
        {[{id:'domestic',label:'🇮🇳 Domestic'},{id:'international',label:'🌍 International'}].map(tab=>(
          <button key={tab.id} onClick={()=>{setActiveTab(tab.id);setPage(1);}} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 1.5rem',borderRadius:'0.625rem',border:'none',cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'0.875rem',fontWeight:activeTab===tab.id?600:500,background:activeTab===tab.id?'var(--surface-container-lowest)':'transparent',color:activeTab===tab.id?'var(--tertiary)':'var(--on-surface-variant)',boxShadow:activeTab===tab.id?'var(--ambient-shadow)':'none',transition:'all 0.2s'}}>
            {tab.label}
            <span style={{padding:'0.1rem 0.5rem',borderRadius:9999,fontSize:'0.75rem',fontWeight:700,background:activeTab===tab.id?'rgba(0,98,67,0.12)':'var(--surface-container)',color:activeTab===tab.id?'var(--tertiary)':'var(--on-surface-variant)'}}>{tabCounts[tab.id]}</span>
          </button>
        ))}
      </div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem',marginBottom:'1.5rem'}}>
        {[
          {label:'In View',value:filtered.length,icon:'group',color:'var(--tertiary)'},
          {label:'Active Pipeline',value:filtered.filter(c=>!['rejected','onboarded'].includes(c.status)).length,icon:'pending',color:'var(--tertiary)'},
          {label:'Interviews Set',value:filtered.filter(c=>c.status==='interview_scheduled').length,icon:'event',color:'var(--primary)'},
          {label:'Resumes Uploaded',value:filtered.filter(c=>c.resume_url).length,icon:'description',color:'var(--tertiary)'},
        ].map(s=>(
          <div key={s.label} className="card-sm" style={{display:'flex',alignItems:'center',gap:'0.875rem'}}>
            <div style={{width:40,height:40,borderRadius:'0.625rem',background:`${s.color}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name={s.icon} style={{fontSize:'1.25rem',color:s.color}}/></div>
            <div><p style={{fontSize:'1.375rem',fontWeight:800,color:'var(--on-surface)',lineHeight:1}}>{s.value}</p><p className="label-sm" style={{marginTop:'0.125rem'}}>{s.label}</p></div>
          </div>
        ))}
      </div>
      {/* Filter bar */}
      <div className="card" style={{padding:'0.875rem 1.25rem',marginBottom:'1rem'}}>
        {/* Stage pills */}
        <div style={{display:'flex',gap:'0.375rem',flexWrap:'wrap',alignItems:'center',marginBottom:'0.75rem'}}>
          {['all',...STAGES].map(s=>(
            <button key={s} onClick={()=>{setStage(s);setPage(1);}} style={{padding:'0.3rem 0.75rem',borderRadius:9999,border:'none',cursor:'pointer',fontSize:'0.8125rem',fontWeight:600,fontFamily:'var(--font-display)',background:stageFilter===s?'var(--tertiary)':'var(--surface-container-low)',color:stageFilter===s?'#fff':'var(--on-surface-variant)',transition:'all 0.15s'}}>
              {s==='all'?'All Stages':STAGE_META[s]?.label}
            </button>
          ))}
        </div>
        {/* Advanced filters row */}
        <div style={{display:'flex',gap:'0.625rem',flexWrap:'wrap',alignItems:'center'}}>
          {/* Experience numeric filter */}
          <div style={{display:'flex',alignItems:'center',gap:'0.375rem'}}>
            <span style={{fontSize:'0.75rem',fontWeight:700,color:'var(--on-surface-variant)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Exp</span>
            <ExpFilter value={expFilter} onChange={(v)=>{setExpFilter(v);setPage(1);}} />
          </div>
          {/* Tech stack multi-select */}
          <TechMultiSelect
            allTech={allTechOptions}
            selected={techSelected}
            onChange={(sel, mode) => { setTechSelected(new Set(sel)); setTechMode(mode); setPage(1); }}
          />
          {/* Has resume toggle */}
          <button
            onClick={()=>{setHasResumeOnly(v=>!v);setPage(1);}}
            style={{
              display:'inline-flex',alignItems:'center',gap:'0.375rem',
              padding:'0.375rem 0.75rem',borderRadius:'0.5rem',
              border:`1px solid ${hasResumeOnly?'var(--tertiary)':'var(--outline-variant)'}`,
              background:hasResumeOnly?'rgba(0,98,67,0.07)':'var(--surface)',
              cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'0.8125rem',fontWeight:600,
              color:hasResumeOnly?'var(--tertiary)':'var(--on-surface-variant)',
              whiteSpace:'nowrap',
            }}
          >
            <Icon name="description" style={{fontSize:'1rem'}}/> Has Resume
          </button>
          {/* Clear all */}
          {hasColSearch && (
            <button onClick={clearAllFilters} style={{marginLeft:'auto',padding:'0.3rem 0.75rem',borderRadius:9999,border:'1px solid var(--outline-variant)',cursor:'pointer',fontSize:'0.8125rem',fontWeight:600,background:'transparent',color:'var(--error)',fontFamily:'var(--font-display)'}}>
              <Icon name="filter_alt_off" style={{fontSize:'0.875rem'}}/> Clear all
            </button>
          )}
        </div>
        {selected.size>0&&<div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginTop:'0.875rem',padding:'0.625rem 0.875rem',background:'rgba(0,98,67,0.06)',borderRadius:'0.5rem'}}><span style={{fontSize:'0.875rem',fontWeight:600,color:'var(--tertiary)'}}>{selected.size} selected</span><button className="btn-ghost" onClick={()=>{setCandidates(cs=>cs.filter(c=>!selected.has(c.id)));setSelected(new Set());}} style={{fontSize:'0.8125rem',color:'var(--error)',marginLeft:'auto'}}><Icon name="delete" style={{fontSize:'1rem',color:'var(--error)'}}/> Remove</button></div>}
      </div>
      {/* Table */}
      <div data-tour="candidates-list" className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table className="data-table" style={{margin:0}}>
            <thead>
              <tr style={{background:'var(--surface-container-low)'}}>
                <th style={{padding:'0.75rem 1rem',width:44}}><input type="checkbox" checked={selected.size===paged.length&&paged.length>0} onChange={()=>{if(selected.size===paged.length)setSelected(new Set());else setSelected(new Set(paged.map(c=>c.id)));}} style={{cursor:'pointer',width:16,height:16,accentColor:'var(--tertiary)'}}/></th>
                {cols.map(col=>(
                  <th key={col.key}
                    onClick={()=> col.key !== 'resume_url' && toggleSort(col.key)}
                    style={{padding:'0.75rem 1rem',textAlign:'left',cursor:col.key==='resume_url'?'default':'pointer',userSelect:'none',whiteSpace:'nowrap'}}
                  >
                    <div style={{display:'flex',alignItems:'center',gap:'0.25rem',fontSize:'0.7rem',fontWeight:700,color:'var(--on-surface-variant)',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                      {col.label}{col.key !== 'resume_url' && <SortIcon col={col.key}/>}
                    </div>
                  </th>
                ))}
                <th style={{padding:'0.75rem 1rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:'var(--on-surface-variant)',textTransform:'uppercase'}}>Actions</th>
              </tr>
              <tr style={{background:'var(--surface-container)',borderBottom:'2px solid var(--outline-variant)'}}>
                <th style={{padding:'0 1rem 0.5rem'}}/>
                {cols.map(col=>(
                  <th key={col.key} style={{padding:'0 0.5rem 0.5rem'}}>
                    {col.key==='resume_url'||col.key==='applied'||col.key==='tech_stack'||col.key==='experience_years'?<div style={{height:26}}/>:col.key==='status'?(
                      <select style={{width:'100%',fontSize:'0.75rem',padding:'0.2rem 0.4rem',borderRadius:4,border:'1px solid var(--outline-variant)',background:'var(--surface)',color:'var(--on-surface)',fontFamily:'var(--font-display)'}} value={colSearch[col.key]||''} onChange={e=>setCS(col.key,e.target.value)}>
                        <option value="">All</option>{STAGES.map(s=><option key={s} value={s}>{STAGE_META[s].label}</option>)}
                      </select>
                    ):colSearch[col.key]!==undefined?(
                      <input placeholder="Search…" value={colSearch[col.key]||''} onChange={e=>setCS(col.key,e.target.value)}
                        style={{width:'100%',fontSize:'0.75rem',padding:'0.2rem 0.4rem',borderRadius:4,border:'1px solid var(--outline-variant)',background:'var(--surface)',color:'var(--on-surface)',fontFamily:'var(--font-display)',boxSizing:'border-box'}}/>
                    ):<div style={{height:26}}/>}
                  </th>
                ))}
                <th style={{padding:'0 1rem 0.5rem'}}/>
              </tr>
            </thead>
            <tbody>
              {paged.length===0&&<tr><td colSpan={cols.length+2} style={{textAlign:'center',padding:'3rem',color:'var(--on-surface-variant)'}}><Icon name="person_search" style={{fontSize:'2rem',display:'block',margin:'0 auto 0.5rem'}}/>No candidates match your filters.</td></tr>}
              {paged.map(c=>{
                const initials=c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                return (
                  <tr key={c.id} onClick={()=>navigate(`/recruitment/candidates/${c.id}`)} style={{cursor:'pointer'}}>
                    <td style={{padding:'0.75rem 1rem'}} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={()=>setSelected(s=>{const n=new Set(s);n.has(c.id)?n.delete(c.id):n.add(c.id);return n;})} style={{cursor:'pointer',width:16,height:16,accentColor:'var(--tertiary)'}}/></td>
                    <td style={{padding:'0.75rem 1rem',minWidth:'160px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'0.625rem'}}>
                        <div className="avatar" style={{width:32,height:32,fontSize:'0.625rem',background:'rgba(0,98,67,0.1)',color:'var(--tertiary)',fontWeight:700,flexShrink:0}}>{initials}</div>
                        <div style={{minWidth:0}}><p style={{fontWeight:600,fontSize:'0.875rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</p>{c.current_company&&<p style={{fontSize:'0.7rem',color:'var(--on-surface-variant)'}}>{c.current_company}</p>}</div>
                      </div>
                    </td>
                    {isIntl?(
                      <>
                        <td style={{padding:'0.75rem 1rem'}}><VisaBadge visa={c.visa_status}/></td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.candidate_role||'—'}</td>
                        {/* Tech stack chips */}
                        <td style={{padding:'0.75rem 1rem',maxWidth:200}}>
                          <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                            {(c.tech_stack||[]).slice(0,3).map(t=>(
                              <span key={t} style={{padding:'0.1rem 0.4rem',borderRadius:4,fontSize:'0.6875rem',fontWeight:600,background:'rgba(68,104,176,0.08)',color:'var(--primary)',whiteSpace:'nowrap'}}>{t}</span>
                            ))}
                            {(c.tech_stack||[]).length>3&&<span style={{fontSize:'0.6875rem',color:'var(--on-surface-variant)',alignSelf:'center'}}>+{c.tech_stack.length-3}</span>}
                            {(c.tech_stack||[]).length===0&&<span style={{color:'var(--outline)',fontSize:'0.75rem'}}>—</span>}
                          </div>
                        </td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.total_experience||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.relevant_experience||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',fontWeight:600,whiteSpace:'nowrap'}}>
                          {c.experience_years!=null?`${c.experience_years} yrs`:'—'}
                        </td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.location||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.75rem',color:'var(--on-surface-variant)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.relocation||'—'}</td>
                      </>
                    ):(
                      <>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',fontWeight:500,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.candidate_role||'—'}</td>
                        {/* Tech stack chips */}
                        <td style={{padding:'0.75rem 1rem',maxWidth:200}}>
                          <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                            {(c.tech_stack||[]).slice(0,3).map(t=>(
                              <span key={t} style={{padding:'0.1rem 0.4rem',borderRadius:4,fontSize:'0.6875rem',fontWeight:600,background:'rgba(68,104,176,0.08)',color:'var(--primary)',whiteSpace:'nowrap'}}>{t}</span>
                            ))}
                            {(c.tech_stack||[]).length>3&&<span style={{fontSize:'0.6875rem',color:'var(--on-surface-variant)',alignSelf:'center'}}>+{c.tech_stack.length-3}</span>}
                            {(c.tech_stack||[]).length===0&&<span style={{color:'var(--outline)',fontSize:'0.75rem'}}>—</span>}
                          </div>
                        </td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.total_experience||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.relevant_experience||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',fontWeight:600,whiteSpace:'nowrap'}}>
                          {c.experience_years!=null?`${c.experience_years} yrs`:'—'}
                        </td>
                        <td style={{padding:'0.75rem 1rem'}}><span style={{fontSize:'0.75rem',fontWeight:600,padding:'0.175rem 0.5rem',borderRadius:4,background:'rgba(68,104,176,0.08)',color:'var(--primary)'}}>{c.source}</span></td>
                      </>
                    )}
                    {/* ── Resume column ── */}
                    <td style={{padding:'0.75rem 1rem'}} onClick={e=>e.stopPropagation()}>
                      {c.resume_url ? (
                        <button
                          onClick={() => setViewer({ name: c.name, resume_url: c.resume_url })}
                          style={{
                            display:'inline-flex', alignItems:'center', gap:'0.25rem',
                            padding:'0.2rem 0.625rem', borderRadius:4, border:'none', cursor:'pointer',
                            fontSize:'0.8125rem', fontWeight:600,
                            background:'rgba(0,98,67,0.08)', color:'var(--tertiary)',
                            fontFamily:'var(--font-display)',
                          }}
                        >
                          <Icon name="description" style={{ fontSize:'0.875rem' }} /> View
                        </button>
                      ) : (
                        <span style={{ fontSize:'0.75rem', color:'var(--outline)' }}>—</span>
                      )}
                    </td>
                    <td style={{padding:'0.75rem 1rem'}}><Chip status={c.status}/></td>
                    <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.applied}</td>
                    <td style={{padding:'0.75rem 1rem',textAlign:'right'}} onClick={e=>e.stopPropagation()}>
                      <button className="btn-icon" onClick={()=>navigate(`/recruitment/candidates/${c.id}`)}><Icon name="open_in_new" style={{fontSize:'1rem'}}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.875rem 1.25rem',borderTop:'1px solid var(--ghost-border)',background:'var(--surface-container-low)'}}>
          <p style={{fontSize:'0.8125rem',color:'var(--on-surface-variant)'}}>Showing <b>{Math.min((page-1)*PER_PAGE+1,filtered.length)}–{Math.min(page*PER_PAGE,filtered.length)}</b> of <b>{filtered.length}</b></p>
          <div style={{display:'flex',gap:'0.375rem'}}>
            <button className="btn-icon" disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{opacity:page===1?0.35:1}}><Icon name="chevron_left"/></button>
            {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((p,i,arr)=>(
              <React.Fragment key={p}>{i>0&&arr[i-1]!==p-1&&<span style={{alignSelf:'center',color:'var(--on-surface-variant)',fontSize:'0.875rem'}}>…</span>}<button onClick={()=>setPage(p)} style={{width:32,height:32,borderRadius:'0.375rem',border:'none',cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'0.875rem',fontWeight:600,background:page===p?'var(--tertiary)':'transparent',color:page===p?'#fff':'var(--on-surface-variant)',transition:'all 0.15s'}}>{p}</button></React.Fragment>
            ))}
            <button className="btn-icon" disabled={page===totalPages||totalPages===0} onClick={()=>setPage(p=>p+1)} style={{opacity:(page===totalPages||totalPages===0)?0.35:1}}><Icon name="chevron_right"/></button>
          </div>
        </div>
      </div>
      {showAdd && <AddCandidateModal onClose={()=>setShowAdd(false)} onAdd={c=>setCandidates(cs=>[c,...cs])} defaultType={activeTab}/>}
      {viewerCandidate && (
        <ResumeViewerModal
          url={viewerCandidate.resume_url}
          candidateName={viewerCandidate.name}
          onClose={() => setViewer(null)}
        />
      )}
      </>}
      <NexusTutorial page="candidates" />
    </div>
  );
}
