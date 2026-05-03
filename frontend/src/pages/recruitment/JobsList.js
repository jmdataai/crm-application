import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { jobsAPI, candidatesAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const EMP_TYPES   = ['Full-time','Part-time','Contract','Internship'];
const DEPARTMENTS = ['Engineering','AI Research','Product','Platform','Design','Operations','Sales'];

// Jobs loaded from API

/* ── Add Job Modal ──────────────────────────────────── */
const AddJobModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({
    title:'', dept:'Engineering', location:'', type:'Full-time',
    desc:'', skills:'', urgent:false,
  });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.title.trim()) return;
    onAdd({
      ...form,
      id:`j${Date.now()}`, apps:0, active:true,
      posted:new Date().toISOString().slice(0,10),
      skills: form.skills.split(',').map(s=>s.trim()).filter(Boolean),
    });
    onClose();
  };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Post New Job</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
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
            <textarea className="textarea" rows={4} placeholder="Describe the role and responsibilities…" value={form.desc} onChange={e => set('desc',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Required Skills (comma separated)</label>
            <input className="input" placeholder="e.g. Python, TensorFlow, Docker" value={form.skills} onChange={e => set('skills',e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'0.625rem', cursor:'pointer' }}>
              <input type="checkbox" checked={form.urgent} onChange={e => set('urgent',e.target.checked)} style={{ width:16, height:16, accentColor:'var(--error)' }} />
              <span style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--on-surface)' }}>Mark as Urgent Hire</span>
            </label>
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={submit} style={{
            display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem',
            borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer',
            background:'linear-gradient(135deg,var(--tertiary),#009966)',
            boxShadow:'0 2px 8px rgba(0,98,67,0.25)',
          }}>
            <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Post Job
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Job Detail Panel ───────────────────────────────── */
const JobPanel = ({ job, onClose, onToggle }) => (
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
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Applications', value:job.apps,   icon:'group' },
          { label:'Posted',       value:job.posted, icon:'calendar_today' },
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

      {/* Actions */}
      <div style={{ display:'flex', gap:'0.75rem' }}>
        <a href="#" onClick={e => { e.preventDefault(); viewApplicants(job.id); }} style={{
          flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
          padding:'0.625rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', textDecoration:'none',
          background:'linear-gradient(135deg,var(--tertiary),#009966)',
        }}>
          <Icon name="person_search" style={{ fontSize:'1rem', color:'#fff' }} /> View Candidates
        </a>
        <button onClick={() => onToggle(job.id)} className="btn-secondary" style={{ flex:1 }}>
          {job.active ? 'Close Position' : 'Reopen Position'}
        </button>
      </div>
    </div>
  </div>
);

/* ── Main ───────────────────────────────────────────── */
export default function JobsList() {
  const navigate = useNavigate();
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [candidateCounts, setCandidateCounts] = useState({}); // {job_id: count}

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobsAPI.getAll({ limit: 200 });
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setJobs(data);
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, []);

  // Fetch candidate counts per job from the candidates table
  const fetchCandidateCounts = useCallback(async () => {
    try {
      const res = await candidatesAPI.getAll({ limit: 500 });
      const all = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.candidates) ? res.data.candidates : [];
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
  const [search, setSearch]   = useState('');
  const [deptFilter, setDept] = useState('all');
  const [typeFilter, setType] = useState('all');
  const [statusFilter, setStat] = useState('active');
  const [view, setView]       = useState('grid'); // grid | list

  const toggle = (id) => {
    setJobs(js => js.map(j => j.id===id ? {...j, active:!j.active} : j));
    setSelected(s => s?.id===id ? {...s, active:!s.active} : s);
  };

  const addJob = (j) => setJobs(js => [j, ...js]);

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
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
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
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1rem' }}>
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
                <div style={{ display:'flex', gap:'0.375rem', alignItems:'center' }}>
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
          <table className="data-table" style={{ margin:0 }}>
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
                  <td style={{ padding:'0.875rem 1rem', fontWeight:700 }}>{job.apps}</td>
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
          <JobPanel job={selected} onClose={() => setSelected(null)} onToggle={toggle} />
        </>
      )}

      {showAdd && <AddJobModal onClose={() => setShowAdd(false)} onAdd={addJob} />}
    </div>
  );
}
