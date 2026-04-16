import React, { useState, useEffect, useCallback, useRef } from 'react';
import { candidatesAPI, activitiesAPI, interviewsAPI } from '../../services/api';
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
const ACT_COLOR = { note:'var(--amber)', call:'var(--primary)', email:'var(--tertiary)', interview:'#7c3aed', status_change:'var(--secondary)', task:'var(--primary)' };

/* ── Inline Resume Viewer ───────────────────────────── */
const ResumeViewer = ({ url, candidateName, onClose }) => (
  <div
    className="modal-overlay scale-in"
    onClick={e => e.target === e.currentTarget && onClose()}
    style={{ zIndex: 1000 }}
  >
    <div style={{
      background: 'var(--surface-container-lowest)',
      borderRadius: '1rem',
      width: '92vw',
      maxWidth: 960,
      height: '92vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.875rem 1.25rem', borderBottom:'1px solid var(--outline-variant)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
          <Icon name="description" style={{ color:'var(--tertiary)' }} />
          <span style={{ fontWeight:700, fontSize:'0.9375rem' }}>Resume — {candidateName}</span>
        </div>
        <div style={{ display:'flex', gap:'0.5rem' }}>
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
      <iframe
        src={url}
        title={`Resume — ${candidateName}`}
        style={{ flex:1, width:'100%', border:'none', background:'#f5f5f5' }}
        allow="autoplay"
      />
    </div>
  </div>
);

/* ── Resume Card (left column) ──────────────────────── */
const ResumeCard = ({ candidateId, candidateName, initialUrl, onSaved }) => {
  const fileInputRef                    = useRef(null);
  const [resumeUrl, setResumeUrl]       = useState(initialUrl || '');
  const [uploading, setUploading]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [deleting, setDeleting]         = useState(false);
  const [showViewer, setShowViewer]     = useState(false);
  const [error, setError]               = useState('');

  // Keep in sync if parent re-fetches
  useEffect(() => { setResumeUrl(initialUrl || ''); }, [initialUrl]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.type)) {
      setError('Only PDF, DOC, or DOCX files are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum 10 MB.');
      return;
    }

    setError('');
    setUploading(true);
    setProgress(0);

    try {
      const res = await candidatesAPI.uploadResume(candidateId, file, (pct) => setProgress(pct));
      const newUrl = res.data.resume_url;
      setResumeUrl(newUrl);
      onSaved(newUrl);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setProgress(0);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this resume from Google Drive? This cannot be undone.')) return;
    setDeleting(true);
    setError('');
    try {
      await candidatesAPI.deleteResume(candidateId);
      setResumeUrl('');
      onSaved(null);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const btnBase = {
    display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
    padding: '0.5rem 1rem', borderRadius: '0.5rem',
    fontSize: '0.875rem', fontWeight: 600, border: 'none',
    cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'opacity 0.15s',
  };

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.875rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <Icon name="description" style={{ fontSize:'1.125rem', color: resumeUrl ? 'var(--tertiary)' : 'var(--on-surface-variant)' }} />
          <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Resume</h3>
          {resumeUrl && (
            <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.1rem 0.5rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)' }}>Uploaded</span>
          )}
        </div>
      </div>

      {/* If resume exists */}
      {resumeUrl && !uploading && (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
          {/* View button */}
          <button
            onClick={() => setShowViewer(true)}
            style={{ ...btnBase, background:'linear-gradient(135deg,var(--tertiary),#009966)', color:'#fff', justifyContent:'center' }}
          >
            <Icon name="visibility" style={{ fontSize:'1rem', color:'#fff' }} /> View Resume
          </button>

          {/* Replace / Delete */}
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ ...btnBase, flex:1, justifyContent:'center', background:'rgba(0,98,67,0.08)', color:'var(--tertiary)' }}
            >
              <Icon name="upload" style={{ fontSize:'1rem' }} /> Replace
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ ...btnBase, background:'transparent', border:'1px solid rgba(186,26,26,0.25)', color:'var(--error)', opacity: deleting ? 0.6 : 1 }}
            >
              <Icon name="delete" style={{ fontSize:'1rem', color:'var(--error)' }} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {/* If no resume */}
      {!resumeUrl && !uploading && (
        <div style={{ textAlign:'center', padding:'1rem 0.5rem' }}>
          <Icon name="upload_file" style={{ fontSize:'2.5rem', color:'var(--on-surface-variant)', opacity:0.25, display:'block', margin:'0 auto 0.625rem' }} />
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginBottom:'0.875rem' }}>
            No resume uploaded yet
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ ...btnBase, background:'linear-gradient(135deg,var(--tertiary),#009966)', color:'#fff' }}
          >
            <Icon name="upload_file" style={{ fontSize:'1rem', color:'#fff' }} /> Upload Resume
          </button>
          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.625rem' }}>
            PDF, DOC, DOCX · max 10 MB
          </p>
        </div>
      )}

      {/* Uploading state */}
      {uploading && (
        <div style={{ padding:'0.5rem 0' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.375rem' }}>
            <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
              {progress < 100 ? 'Uploading to Google Drive…' : 'Processing…'}
            </span>
            <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--tertiary)' }}>{progress}%</span>
          </div>
          <div style={{ height:6, background:'var(--surface-container)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,var(--tertiary),#009966)', borderRadius:3, transition:'width 0.2s' }} />
          </div>
          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.5rem', textAlign:'center' }}>
            Please wait — this may take a moment
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop:'0.5rem', padding:'0.5rem 0.75rem', background:'var(--error-container)', borderRadius:'0.5rem' }}>
          <p style={{ fontSize:'0.8125rem', color:'var(--error)' }}>{error}</p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display:'none' }}
        onChange={handleFileChange}
      />

      {/* Inline viewer modal */}
      {showViewer && resumeUrl && (
        <ResumeViewer url={resumeUrl} candidateName={candidateName} onClose={() => setShowViewer(false)} />
      )}
    </div>
  );
};

/* ── Schedule Interview Modal ───────────────────────── */
const ScheduleModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ type:'Technical Round', date:'', time:'10:00', interviewer:'', notes:'' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.date) return;
    onAdd({ ...form, id:`iv${Date.now()}`, rating:null, feedback:'', completed:false });
    onClose();
  };
  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Schedule Interview</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div>
            <label className="label">Interview Type</label>
            <select className="select" value={form.type} onChange={e => set('type', e.target.value)}>
              {['Technical Round','HR Round','Final Round','Research Panel','Culture Fit'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
            <div><label className="label">Time</label><input className="input" type="time" value={form.time} onChange={e => set('time', e.target.value)} /></div>
          </div>
          <div><label className="label">Interviewer</label><input className="input" placeholder="Name of interviewer" value={form.interviewer} onChange={e => set('interviewer', e.target.value)} /></div>
          <div><label className="label">Notes</label><textarea className="textarea" rows={2} placeholder="Focus areas…" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
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
  const [candidate, setCand]        = useState(null);
  const [activities, setActivities] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setTab]         = useState('activity');
  const [showSchedule, setSchedule] = useState(false);
  const [editing, setEditing]       = useState(false);
  const [editForm, setEditForm]     = useState({});
  const [note, setNote]             = useState('');

  const fetchCandidate = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, aRes, iRes] = await Promise.all([
        candidatesAPI.getOne(id),
        activitiesAPI.getAll({ candidate_id: id }),
        interviewsAPI.getAll({ candidate_id: id }),
      ]);
      const c = cRes.data;
      setCand(c);
      setEditForm({
        full_name: c.full_name, email: c.email, phone: c.phone,
        candidate_role: c.candidate_role, current_company: c.current_company,
        experience_years: c.experience_years, source: c.source,
        linkedin_url: c.linkedin_url, portfolio_url: c.portfolio_url,
        notes: c.notes, skills: c.skills || [],
      });
      const acts = Array.isArray(aRes.data) ? aRes.data : Array.isArray(aRes.data?.data) ? aRes.data.data : [];
      setActivities(acts.map(a => ({
        id:a.id, type:a.activity_type, text:a.description,
        date:a.created_at?.slice(0,16).replace('T',' '), user:a.user_name||'You',
      })));
      const ivs = Array.isArray(iRes.data) ? iRes.data : Array.isArray(iRes.data?.data) ? iRes.data.data : [];
      setInterviews(ivs.map(iv => ({
        id:iv.id, type:iv.interview_type,
        date:iv.scheduled_at?.slice(0,10),
        time:iv.scheduled_at?.slice(11,16),
        interviewer:(iv.interviewers||[]).join(', '),
        rating:iv.rating, feedback:iv.feedback||'', completed:iv.completed,
      })));
    } catch { navigate('/recruitment/candidates'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchCandidate(); }, [fetchCandidate]);

  const moveStage = async (newStage) => {
    const prev = candidate.status;
    setCand(c => ({ ...c, status: newStage }));
    try {
      await candidatesAPI.update(id, { status: newStage });
      const actText = `Moved to ${STAGE_META[newStage]?.label}`;
      await activitiesAPI.create({ candidate_id: id, activity_type:'status_change', description:actText });
      setActivities(prev => [{ id:`a${Date.now()}`, type:'status_change', text:actText, date:new Date().toLocaleString(), user:'You' }, ...prev]);
    } catch { setCand(c => ({ ...c, status: prev })); }
  };

  const logAct = async (type, text) => {
    if (!text.trim()) return;
    try {
      await activitiesAPI.create({ candidate_id: id, activity_type: type, description: text });
      setActivities(prev => [{ id:`a${Date.now()}`, type, text, date:new Date().toLocaleString(), user:'You' }, ...prev]);
    } catch {}
  };

  const addInterview = async (iv) => {
    try {
      const res = await interviewsAPI.create({
        candidate_id: id, job_id: candidate?.job_id || null,
        interview_type: iv.type, scheduled_at: `${iv.date}T${iv.time||'10:00'}:00`,
        interviewers: iv.interviewer ? [iv.interviewer] : [], notes: iv.notes || null,
      });
      const saved = res.data;
      setInterviews(prev => [...prev, { id:saved.id, type:saved.interview_type, date:iv.date, time:iv.time||'10:00', interviewer:iv.interviewer, rating:null, feedback:'', completed:false }]);
      logAct('interview', `${iv.type} scheduled for ${iv.date}`);
    } catch (err) { alert(err?.response?.data?.detail || 'Failed to schedule interview'); }
  };

  const addNote = () => { if (note.trim()) { logAct('note', note.trim()); setNote(''); } };

  const set = (k, v) => setEditForm(f => ({ ...f, [k]: v }));
  const saveEdit = async () => {
    try {
      await candidatesAPI.update(id, editForm);
      setCand(c => ({ ...c, ...editForm }));
      setEditing(false);
    } catch {}
  };

  if (loading) return (
    <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
      <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />
      Loading candidate…
    </div>
  );

  if (!candidate) return null;

  const sm = STAGE_META[candidate.status] || STAGE_META.sourced;
  const initials = candidate.full_name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '??';
  const stageIdx = STAGES_ORDER.indexOf(candidate.status);
  const cand = {
    ...candidate, name: candidate.full_name, candidate_role: candidate.candidate_role||'',
    job: candidate.job?.title||'', dept: candidate.job?.department||'',
    // experience_years = LLM-extracted relevant exp; fall back to total_experience string from Excel
    exp: candidate.experience_years || null,
    expDisplay: candidate.experience_years
      ? `${candidate.experience_years} yrs (relevant)`
      : candidate.total_experience || '—',
    linkedin: candidate.linkedin_url||'', portfolio: candidate.portfolio_url||'',
    activities, interviews,
    skills: candidate.skills||[],
    tech_stack: candidate.tech_stack || [],   // LLM-extracted from resume
    applied: candidate.created_at?.slice(0,10)||'',
  };

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
        <span style={{ fontSize:'0.875rem', fontWeight:600 }}>{cand.full_name}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'5fr 7fr', gap:'1.25rem', alignItems:'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Profile hero */}
          <div className="card" style={{ textAlign:'center', padding:'2rem 1.5rem' }}>
            <div className="avatar" style={{ width:68, height:68, fontSize:'1.5rem', fontWeight:700, background:'linear-gradient(135deg,var(--tertiary),#009966)', color:'#fff', margin:'0 auto 1rem' }}>{initials}</div>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'0.25rem' }}>{cand.full_name}</h2>
            <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'0.75rem' }}>
              {cand.candidate_role}{cand.candidate_role && cand.job ? ' · ' : ''}{cand.job}
            </p>
            <span style={{ display:'inline-flex', alignItems:'center', padding:'0.25rem 0.75rem', borderRadius:9999, fontSize:'0.75rem', fontWeight:700, background:sm.bg, color:sm.color }}>{sm.label}</span>
            <div style={{ display:'flex', gap:'0.5rem', justifyContent:'center', marginTop:'1.25rem' }}>
              {[
                { icon:'phone', label:'Call',     act:() => logAct('call','Logged a call') },
                { icon:'mail',  label:'Email',    act:() => logAct('email','Sent an email') },
                { icon:'event', label:'Schedule', act:() => setSchedule(true) },
              ].map(a => (
                <button key={a.label} className="btn-secondary" onClick={a.act} style={{ flexDirection:'column', gap:'0.25rem', padding:'0.625rem 1rem', fontSize:'0.75rem' }}>
                  <Icon name={a.icon} style={{ fontSize:'1.125rem' }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Hiring Pipeline</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
              {STAGES_ORDER.map((s, i) => {
                const sm2 = STAGE_META[s];
                const done   = i < stageIdx;
                const active = s === candidate.status;
                const future = i > stageIdx;
                return (
                  <button key={s} onClick={() => !active && moveStage(s)} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.5rem 0.75rem', borderRadius:'0.5rem', border:'none', cursor: active ? 'default' : 'pointer', fontFamily:'Inter,sans-serif', background: active ? 'rgba(0,98,67,0.08)' : 'transparent', opacity: future ? 0.45 : 1, transition:'all 0.15s' }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: done ? 'var(--tertiary)' : active ? 'rgba(0,98,67,0.15)' : 'var(--surface-container)', border: active ? '2px solid var(--tertiary)' : 'none' }}>
                      {done   && <Icon name="check" style={{ fontSize:'0.75rem', color:'#fff' }} />}
                      {active && <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--tertiary)', display:'block' }} />}
                    </div>
                    <span style={{ fontSize:'0.875rem', fontWeight: active ? 700 : 400, color: active ? 'var(--tertiary)' : done ? 'var(--on-surface)' : 'var(--on-surface-variant)' }}>{sm2.label}</span>
                    {active && <Icon name="chevron_right" style={{ fontSize:'1rem', color:'var(--tertiary)', marginLeft:'auto' }} />}
                  </button>
                );
              })}
            </div>
            {!['rejected','onboarded'].includes(candidate.status) && (
              <button onClick={() => moveStage('rejected')} style={{ width:'100%', marginTop:'0.875rem', padding:'0.5rem', borderRadius:'0.5rem', border:'1px solid rgba(186,26,26,0.25)', background:'transparent', cursor:'pointer', fontSize:'0.875rem', fontWeight:600, color:'var(--error)', fontFamily:'Inter,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.375rem', transition:'background 0.15s' }}>
                <Icon name="cancel" style={{ fontSize:'1rem', color:'var(--error)' }} /> Reject Candidate
              </button>
            )}
          </div>

          {/* Candidate Info */}
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Candidate Info</h3>
              <button className="btn-ghost" onClick={() => { setEditForm({...candidate}); setEditing(true); }} style={{ fontSize:'0.8125rem' }}>
                <Icon name="edit" style={{ fontSize:'1rem' }} /> Edit
              </button>
            </div>
            {[
              { icon:'mail',           label:'Email',       val: cand.email   || '—' },
              { icon:'phone',          label:'Phone',       val: cand.phone   || '—' },
              { icon:'work',           label:'Applying For',val: cand.job     || '—' },
              { icon:'corporate_fare', label:'Department',  val: cand.dept    || '—' },
              { icon:'schedule',       label:'Experience',  val: cand.expDisplay },
              { icon:'hub',            label:'Source',      val: cand.source  || '—' },
              { icon:'calendar_today', label:'Applied',     val: cand.applied || '—' },
              { icon:'link',           label:'LinkedIn',    val: cand.linkedin|| '—' },
            ].map(f => (
              <div key={f.label} style={{ display:'flex', gap:'0.75rem', alignItems:'flex-start', marginBottom:'0.75rem' }}>
                <Icon name={f.icon} style={{ fontSize:'1rem', color:'var(--on-surface-variant)', marginTop:'0.125rem', flexShrink:0 }} />
                <div>
                  <p className="label-sm" style={{ marginBottom:'0.125rem' }}>{f.label}</p>
                  <p style={{ fontSize:'0.875rem', fontWeight:500, wordBreak:'break-word' }}>{f.val}</p>
                </div>
              </div>
            ))}
            {cand.skills?.length > 0 && (
              <div style={{ marginTop:'0.25rem' }}>
                <p className="label-sm" style={{ marginBottom:'0.5rem' }}>Skills</p>
                <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap' }}>
                  {cand.skills.map(s => (
                    <span key={s} style={{ fontSize:'0.8125rem', fontWeight:600, padding:'0.25rem 0.625rem', borderRadius:9999, background:'rgba(0,98,67,0.08)', color:'var(--tertiary)', border:'1px solid rgba(0,98,67,0.15)' }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Tech Stack Card ── */}
          {cand.tech_stack.length > 0 && (
            <div className="card">
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.875rem' }}>
                <Icon name="code" style={{ fontSize:'1.125rem', color:'var(--tertiary)' }} />
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Tech Stack</h3>
                <span style={{ marginLeft:'auto', fontSize:'0.75rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)' }}>
                  {cand.tech_stack.length} skills
                </span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem' }}>
                {cand.tech_stack.map(s => (
                  <span key={s} style={{
                    fontSize:'0.8125rem', fontWeight:600,
                    padding:'0.25rem 0.625rem', borderRadius:9999,
                    background:'rgba(0,74,198,0.08)', color:'var(--primary)',
                    border:'1px solid rgba(0,74,198,0.15)',
                  }}>{s}</span>
                ))}
              </div>
              <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.75rem' }}>
                Extracted from resume via AI
              </p>
            </div>
          )}

          {/* ── Resume Card ── */}
          <ResumeCard
            candidateId={id}
            candidateName={candidate.full_name}
            initialUrl={candidate.resume_url || ''}
            onSaved={(url) => setCand(c => ({ ...c, resume_url: url }))}
          />

        </div>{/* end LEFT */}

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Tab bar */}
          <div style={{ display:'flex', gap:'2px', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.75rem', alignSelf:'flex-start' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1rem', borderRadius:'0.625rem', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', fontSize:'0.875rem', fontWeight: activeTab===t.key ? 600 : 400, background: activeTab===t.key ? 'var(--surface-container-lowest)' : 'transparent', color: activeTab===t.key ? 'var(--tertiary)' : 'var(--on-surface-variant)', boxShadow: activeTab===t.key ? 'var(--ambient-shadow)' : 'none', transition:'all 0.2s' }}>
                <Icon name={t.icon} style={{ fontSize:'1rem', color:'inherit' }} />
                {t.label}
                {t.key==='interviews' && <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.1rem 0.375rem', borderRadius:9999, background:'rgba(0,98,67,0.12)', color:'var(--tertiary)' }}>{cand.interviews.length}</span>}
              </button>
            ))}
          </div>

          {/* Activity */}
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
                {cand.activities.map((act, i) => (
                  <div key={act.id} style={{ display:'flex', gap:'0.875rem', marginBottom: i < cand.activities.length-1 ? '1.25rem' : 0, position:'relative' }}>
                    <div style={{ position:'absolute', left:'-1.1875rem', top:'0.25rem', width:14, height:14, borderRadius:'50%', background: ACT_COLOR[act.type] || 'var(--tertiary)', border:'2px solid var(--surface-container-lowest)' }} />
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

          {/* Interviews */}
          {activeTab === 'interviews' && (
            <div className="card slide-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Interview Rounds</h3>
                <button onClick={() => setSchedule(true)} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 0.875rem', borderRadius:'0.5rem', fontSize:'0.8125rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                  <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Schedule
                </button>
              </div>
              {cand.interviews.length === 0 && (
                <div style={{ textAlign:'center', padding:'2rem', color:'var(--on-surface-variant)' }}>
                  <Icon name="video_call" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.25 }} />
                  No interviews scheduled yet.
                </div>
              )}
              {cand.interviews.map((iv, i) => (
                <div key={iv.id} style={{ padding:'1rem', background: iv.completed ? 'var(--surface-container-low)' : 'rgba(0,74,198,0.04)', borderRadius:'0.75rem', border:`1px solid ${iv.completed ? 'rgba(195,198,215,0.1)' : 'rgba(0,74,198,0.15)'}`, marginBottom: i < cand.interviews.length-1 ? '0.875rem' : 0 }}>
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
                    <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'0.15rem 0.5rem', borderRadius:9999, background: iv.completed ? 'rgba(0,98,67,0.1)' : 'rgba(0,74,198,0.1)', color: iv.completed ? 'var(--tertiary)' : 'var(--primary)' }}>{iv.completed ? 'Completed' : 'Upcoming'}</span>
                  </div>
                  <div style={{ display:'flex', gap:'1rem', marginBottom: iv.feedback ? '0.625rem' : 0 }}>
                    <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                      <Icon name="calendar_today" style={{ fontSize:'0.875rem' }} /> {iv.date} · {iv.time}
                    </span>
                    {iv.rating && <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--tertiary)', display:'flex', alignItems:'center', gap:'0.25rem' }}><Icon name="star" style={{ fontSize:'0.875rem', color:'var(--amber)' }} /> {iv.rating}/10</span>}
                  </div>
                  {iv.feedback && <div style={{ padding:'0.5rem 0.75rem', background:'rgba(0,98,67,0.06)', borderRadius:'0.5rem', borderLeft:'3px solid var(--tertiary)' }}><p style={{ fontSize:'0.8125rem', color:'var(--on-surface)', lineHeight:1.6 }}>{iv.feedback}</p></div>}
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {activeTab === 'notes' && (
            <div className="card slide-in">
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Recruiter Notes</h3>
              <div style={{ background:'var(--surface-container-low)', borderRadius:'0.625rem', padding:'1rem', minHeight:80, marginBottom:'1rem' }}>
                <p style={{ fontSize:'0.875rem', color: cand.notes ? 'var(--on-surface)' : 'var(--on-surface-variant)', whiteSpace:'pre-wrap' }}>{cand.notes || 'No notes yet.'}</p>
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
        </div>{/* end RIGHT */}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && setEditing(false)}>
          <div className="modal modal-lg">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
              <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Edit Candidate</h2>
              <button className="btn-icon" onClick={() => setEditing(false)}><Icon name="close" /></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              {[
                { label:'Full Name *', key:'name',           type:'text',  span:2 },
                { label:'Email',       key:'email',          type:'email' },
                { label:'Phone',       key:'phone',          type:'tel' },
                { label:'Current Role',key:'candidate_role', type:'text' },
                { label:'Applying For',key:'job',            type:'text' },
                { label:'LinkedIn',    key:'linkedin',       type:'text' },
                { label:'Portfolio',   key:'portfolio',      type:'text' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.span === 2 ? '1/-1' : undefined }}>
                  <label className="label">{f.label}</label>
                  <input className="input" type={f.type} value={editForm[f.key]||''} onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Notes</label>
                <textarea className="textarea" rows={4} value={editForm.notes||''} onChange={e => set('notes', e.target.value)} />
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
