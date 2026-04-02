import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { candidatesAPI } from '../../services/api';
import { useNavigate, useLocation } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const STAGE_META = {
  sourced:             { label:'Sourced',              bg:'var(--surface-container)',       color:'var(--on-surface-variant)' },
  screened:            { label:'Screened',             bg:'var(--secondary-container)',     color:'#2b3a4e' },
  shortlisted:         { label:'Shortlisted',          bg:'rgba(217,119,6,0.12)',           color:'#92400e' },
  interview_scheduled: { label:'Interview Scheduled',  bg:'rgba(0,74,198,0.1)',             color:'var(--primary)' },
  interviewed:         { label:'Interviewed',          bg:'rgba(0,74,198,0.15)',            color:'var(--primary)' },
  selected:            { label:'Selected',             bg:'rgba(0,98,67,0.12)',             color:'var(--tertiary)' },
  rejected:            { label:'Rejected',             bg:'var(--error-container)',         color:'var(--on-error-container)' },
  onboarded:           { label:'Onboarded',            bg:'rgba(0,98,67,0.22)',             color:'var(--tertiary)' },
};

const Chip = ({ status }) => {
  const s = STAGE_META[status] || STAGE_META.sourced;
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.6875rem', fontWeight:700, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>{s.label}</span>;
};

// Data loaded from API

const SOURCES = ['LinkedIn','Referral','AngelList','Resume','Campus','Portfolio'];
const STAGES  = Object.keys(STAGE_META);

/* ── Add Candidate Modal ────────────────────────────── */
const AddCandidateModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ full_name:'', email:'', phone:'', candidate_role:'', job:'', exp:'', source:'LinkedIn', status:'sourced', notes:'' });
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.full_name.trim()) return;
    try {
      const res = await candidatesAPI.create({
        full_name:        form.full_name,
        email:            form.email || null,
        phone:            form.phone || null,
        candidate_role:   form.candidate_role || null,
        experience_years: Number(form.exp) || 0,
        source:           form.source,
        status:           form.status,
        notes:            form.notes || null,
      });
      onAdd(normalise(res.data));
      onClose();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to add candidate');
    }
  };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Add Candidate</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {[
            { label:'Full Name *', key:'full_name',  type:'text',  span:2 },
            { label:'Email',       key:'email', type:'email' },
            { label:'Phone',       key:'phone', type:'tel' },
            { label:'Current Role',key:'candidate_role', type:'text' },
            { label:'Applying For',key:'job',   type:'text' },
          ].map(f => (
            <div key={f.key} style={{ gridColumn:f.span===2?'1/-1':undefined }}>
              <label className="label">{f.label}</label>
              <input className="input" type={f.type} value={form[f.key] || ''} onChange={e => set(f.key,e.target.value)} />
            </div>
          ))}
          <div>
            <label className="label">Experience (years)</label>
            <input className="input" type="number" min="0" max="30" value={form.exp} onChange={e => set('exp',e.target.value)} />
          </div>
          <div>
            <label className="label">Source</label>
            <select className="select" value={form.source} onChange={e => set('source',e.target.value)}>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Initial Stage</label>
            <select className="select" value={form.status} onChange={e => set('status',e.target.value)}>
              {STAGES.map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Notes</label>
            <textarea className="textarea" rows={3} value={form.notes} onChange={e => set('notes',e.target.value)} />
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={submit} style={{
            display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem',
            borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer',
            background:'linear-gradient(135deg,var(--tertiary),#009966)',
          }}>
            <Icon name="person_add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Candidate
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main ───────────────────────────────────────────── */
// Normalise API response to component shape
const normalise = (c) => ({
  id:             c.id,
  name:           c.full_name,
  email:          c.email,
  phone:          c.phone,
  candidate_role: c.candidate_role,
  job:            c.job?.title || '',
  dept:           c.job?.department || '',
  exp:            c.experience_years || 0,
  source:         c.source || 'Manual',
  status:         c.status,
  applied:        c.created_at?.slice(0,10),
  notes:          c.notes,
});

export default function CandidatesList() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) setSearch(q);
  }, [location.search]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [stageFilter, setStage]     = useState('all');
  const [sourceFilter, setSource]   = useState('all');
  const [selected, setSelected]     = useState(new Set());
  const [showAdd, setShowAdd]       = useState(false);
  const [sortBy, setSortBy]         = useState('applied');
  const [sortDir, setSortDir]       = useState('desc');
  const [page, setPage]             = useState(1);
  const PER_PAGE = 9;

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await candidatesAPI.getAll({ limit: 200 });
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.candidates) ? res.data.candidates
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setCandidates(data.map(normalise));
    } catch {
      setError('Failed to load candidates. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const filtered = useMemo(() => {
    let out = candidates.filter(c => {
      const q = search.toLowerCase();
      const mQ = !q || [c.name,c.candidate_role,c.job,c.email].some(f=>f?.toLowerCase().includes(q));
      const mS = stageFilter==='all' || c.status===stageFilter;
      const mSrc = sourceFilter==='all' || c.source===sourceFilter;
      return mQ && mS && mSrc;
    });
    out = [...out].sort((a,b) => {
      const av=a[sortBy]||'', bv=b[sortBy]||'';
      if (typeof av==='number') return sortDir==='asc' ? av-bv : bv-av;
      return sortDir==='asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return out;
  }, [candidates, search, stageFilter, sourceFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const toggleSort = (col) => { if(sortBy===col) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortBy(col); setSortDir('asc'); } setPage(1); };
  const toggleAll  = () => { if(selected.size===paged.length) setSelected(new Set()); else setSelected(new Set(paged.map(c=>c.id))); };

  const SortIcon = ({ col }) => (
    sortBy===col
      ? <Icon name={sortDir==='asc'?'arrow_upward':'arrow_downward'} style={{ fontSize:'0.875rem', color:'var(--tertiary)' }} />
      : <Icon name="unfold_more" style={{ fontSize:'0.875rem', opacity:0.3 }} />
  );

  const statCounts = {
    total: candidates.length,
    active: candidates.filter(c=>!['rejected','onboarded'].includes(c.status)).length,
    interviews: candidates.filter(c=>c.status==='interview_scheduled').length,
    hired: candidates.filter(c=>['selected','onboarded'].includes(c.status)).length,
  };

  return (
    <div className="fade-in">
      {loading && <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}><Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem', animation:'spin 1s linear infinite' }} />Loading candidates…</div>}
      {error && <div style={{ background:'var(--error-container)', color:'var(--error)', padding:'1rem', borderRadius:'0.5rem', marginBottom:'1rem' }}>{error}</div>}
      {!loading && <>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Candidates</h1>
        </div>
        <div style={{ display:'flex', gap:'0.625rem' }}>
          <a href="/recruitment/pipeline" className="btn-secondary">
            <Icon name="account_tree" style={{ fontSize:'1rem' }} /> Pipeline View
          </a>
          <button onClick={() => setShowAdd(true)} style={{
            display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem',
            borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer',
            background:'linear-gradient(135deg,var(--tertiary),#009966)',
            boxShadow:'0 2px 8px rgba(0,98,67,0.25)',
          }}>
            <Icon name="person_add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Candidate
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Candidates', value:statCounts.total,      icon:'group',       color:'var(--tertiary)' },
          { label:'In Pipeline',      value:statCounts.active,     icon:'pending',     color:'var(--tertiary)' },
          { label:'Interviews Set',   value:statCounts.interviews, icon:'event',       color:'var(--primary)' },
          { label:'Selected/Hired',   value:statCounts.hired,      icon:'how_to_reg',  color:'var(--tertiary)' },
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

      {/* Stage filter pills */}
      <div className="card" style={{ padding:'0.875rem 1.25rem', marginBottom:'1rem' }}>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
          <div className="search-bar" style={{ maxWidth:280, flex:'1 1 auto' }}>
            <Icon name="search" style={{ position:'absolute', left:'0.625rem', top:'50%', transform:'translateY(-50%)', color:'var(--on-surface-variant)', fontSize:'1.1rem' }} />
            <input placeholder="Search candidates…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} style={{ paddingLeft:'2.25rem', width:'100%' }} />
          </div>

          {/* Stage pills */}
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', flex:'2 1 auto' }}>
            {['all','sourced','screened','shortlisted','interview_scheduled','selected','rejected','onboarded'].map(s => (
              <button key={s} onClick={() => {setStage(s);setPage(1);}} style={{
                padding:'0.3rem 0.75rem', borderRadius:9999, border:'none', cursor:'pointer',
                fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
                background: stageFilter===s ? 'var(--tertiary)' : 'var(--surface-container-low)',
                color: stageFilter===s ? '#fff' : 'var(--on-surface-variant)',
                transition:'all 0.15s ease',
              }}>
                {s==='all' ? 'All Stages' : STAGE_META[s]?.label}
              </button>
            ))}
          </div>

          <select className="select" style={{ width:'auto', minWidth:130 }} value={sourceFilter} onChange={e=>{setSource(e.target.value);setPage(1);}}>
            <option value="all">All Sources</option>
            {SOURCES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.875rem', padding:'0.625rem 0.875rem', background:'rgba(0,98,67,0.06)', borderRadius:'0.5rem', border:'1px solid rgba(0,98,67,0.15)' }}>
            <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--tertiary)' }}>{selected.size} selected</span>
            <button className="btn-secondary" style={{ fontSize:'0.8125rem', padding:'0.25rem 0.75rem' }}>
              <Icon name="swap_horiz" style={{ fontSize:'1rem' }} /> Move Stage
            </button>
            <button className="btn-secondary" style={{ fontSize:'0.8125rem', padding:'0.25rem 0.75rem' }}>
              <Icon name="download" style={{ fontSize:'1rem' }} /> Export
            </button>
            <button className="btn-ghost" onClick={() => {setCandidates(cs=>cs.filter(c=>!selected.has(c.id)));setSelected(new Set());}} style={{ fontSize:'0.8125rem', color:'var(--error)', marginLeft:'auto' }}>
              <Icon name="delete" style={{ fontSize:'1rem', color:'var(--error)' }} /> Remove
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table className="data-table" style={{ margin:0 }}>
            <thead>
              <tr style={{ background:'var(--surface-container-low)' }}>
                <th style={{ padding:'0.875rem 1.25rem', width:44 }}>
                  <input type="checkbox" checked={selected.size===paged.length&&paged.length>0} onChange={toggleAll} style={{ cursor:'pointer', width:16, height:16, accentColor:'var(--tertiary)' }} />
                </th>
                {[
                  { label:'Candidate', key:'name' },
                  { label:'Applied For', key:'job' },
                  { label:'Dept',       key:'dept' },
                  { label:'Exp',        key:'exp' },
                  { label:'Source',     key:'source' },
                  { label:'Stage',      key:'status' },
                  { label:'Applied',    key:'applied' },
                ].map(col => (
                  <th key={col.key} style={{ padding:'0.875rem 1rem', textAlign:'left', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }} onClick={() => toggleSort(col.key)}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.25rem' }}>{col.label} <SortIcon col={col.key} /></div>
                  </th>
                ))}
                <th style={{ padding:'0.875rem 1rem', textAlign:'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:'3rem', color:'var(--on-surface-variant)' }}>
                  <Icon name="person_search" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} />
                  No candidates match your filters.
                </td></tr>
              )}
              {paged.map(c => {
                const initials = c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                return (
                  <tr key={c.id} onClick={() => navigate(`/recruitment/candidates/${c.id}`)} style={{ cursor:'pointer' }}>
                    <td style={{ padding:'0.875rem 1.25rem' }} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => setSelected(s=>{const n=new Set(s);n.has(c.id)?n.delete(c.id):n.add(c.id);return n;})} style={{ cursor:'pointer', width:16, height:16, accentColor:'var(--tertiary)' }} />
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                        <div className="avatar" style={{ width:34, height:34, fontSize:'0.6875rem', background:'rgba(0,98,67,0.1)', color:'var(--tertiary)', fontWeight:700 }}>{initials}</div>
                        <div>
                          <p style={{ fontWeight:600, fontSize:'0.875rem' }}>{c.name}</p>
                          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{c.candidate_role}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'0.875rem 1rem', fontSize:'0.875rem', fontWeight:500 }}>{c.job}</td>
                    <td style={{ padding:'0.875rem 1rem', fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{c.dept}</td>
                    <td style={{ padding:'0.875rem 1rem', fontWeight:600, fontSize:'0.875rem' }}>{c.exp}y</td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <span style={{ fontSize:'0.75rem', fontWeight:600, padding:'0.175rem 0.5rem', borderRadius:4, background:'rgba(0,74,198,0.08)', color:'var(--primary)' }}>{c.source}</span>
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}><Chip status={c.status} /></td>
                    <td style={{ padding:'0.875rem 1rem', fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{c.applied}</td>
                    <td style={{ padding:'0.875rem 1rem', textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'0.25rem', justifyContent:'flex-end' }}>
                        <button className="btn-icon" onClick={() => navigate(`/recruitment/candidates/${c.id}`)}><Icon name="open_in_new" style={{ fontSize:'1rem' }} /></button>
                        <button className="btn-icon" title="Schedule interview"><Icon name="event" style={{ fontSize:'1rem' }} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.875rem 1.25rem', borderTop:'1px solid var(--ghost-border)', background:'var(--surface-container-low)' }}>
          <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
            Showing <b>{(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,filtered.length)}</b> of <b>{filtered.length}</b>
          </p>
          <div style={{ display:'flex', gap:'0.375rem' }}>
            <button className="btn-icon" disabled={page===1} onClick={() => setPage(p=>p-1)} style={{ opacity:page===1?0.35:1 }}><Icon name="chevron_left" /></button>
            {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((p,i,arr)=>(
              <React.Fragment key={p}>
                {i>0&&arr[i-1]!==p-1&&<span style={{ alignSelf:'center', color:'var(--on-surface-variant)', fontSize:'0.875rem' }}>…</span>}
                <button onClick={() => setPage(p)} style={{ width:32, height:32, borderRadius:'0.375rem', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', fontSize:'0.875rem', fontWeight:600, background:page===p?'var(--tertiary)':'transparent', color:page===p?'#fff':'var(--on-surface-variant)', transition:'all 0.15s' }}>{p}</button>
              </React.Fragment>
            ))}
            <button className="btn-icon" disabled={page===totalPages||totalPages===0} onClick={() => setPage(p=>p+1)} style={{ opacity:(page===totalPages||totalPages===0)?0.35:1 }}><Icon name="chevron_right" /></button>
          </div>
        </div>
      </div>

      {showAdd && <AddCandidateModal onClose={() => setShowAdd(false)} onAdd={c => setCandidates(cs=>[c,...cs])} />}
      </>}
    </div>
  );
}
