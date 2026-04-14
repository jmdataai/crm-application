import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { candidatesAPI } from '../../services/api';
import { useNavigate, useLocation } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);
const STAGE_META = {
  sourced:             { label:'Sourced',             bg:'var(--surface-container)',     color:'var(--on-surface-variant)' },
  screened:            { label:'Screened',            bg:'var(--secondary-container)',   color:'#2b3a4e' },
  shortlisted:         { label:'Shortlisted',         bg:'rgba(217,119,6,0.12)',         color:'#92400e' },
  interview_scheduled: { label:'Interview Scheduled', bg:'rgba(0,74,198,0.1)',           color:'var(--primary)' },
  interviewed:         { label:'Interviewed',         bg:'rgba(0,74,198,0.15)',          color:'var(--primary)' },
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
  'H1B': { bg:'rgba(0,74,198,0.1)', color:'var(--primary)' },
  'GC':  { bg:'rgba(0,98,67,0.1)',  color:'var(--tertiary)' },
  'USCitizen': { bg:'rgba(0,98,67,0.15)', color:'var(--tertiary)' },
};
const VisaBadge = ({ visa }) => {
  if (!visa) return <span style={{ color:'var(--outline)' }}>—</span>;
  const style = VISA_COLORS[visa.trim()] || { bg:'rgba(217,119,6,0.1)', color:'#d97706' };
  return <span style={{ padding:'0.15rem 0.5rem', borderRadius:4, fontSize:'0.75rem', fontWeight:700, ...style }}>{visa.trim()}</span>;
};
const extractNumbers = (s) => (String(s).match(/\d+(\.\d+)?/g) || []).map(n => Number(n));
const matchesExperience = (field, query) => {
  if (!query) return true;
  const q = String(query).toLowerCase().trim();
  const f = String(field || '').toLowerCase();
  if (!/\d/.test(q)) return f.includes(q);
  const qNums = extractNumbers(q);
  if (qNums.length === 0) return f.includes(q);
  const fieldNums = extractNumbers(f);
  if (fieldNums.length === 0) return false;
  const qNum = qNums[0];
  return fieldNums.some(n => Math.abs(n - qNum) < 0.01);
};
const AddCandidateModal = ({ onClose, onAdd, defaultType }) => {
  const [form, setForm] = useState({ full_name:'', email:'', phone:'', candidate_role:'', total_experience:'', relevant_experience:'', location:'', visa_status:'', relocation:'', source:'LinkedIn', status:'sourced', notes:'', candidate_type: defaultType || 'domestic' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const isIntl = form.candidate_type === 'international';
  const submit = async () => {
    if (!form.full_name.trim()) return;
    try {
      const res = await candidatesAPI.create({
        full_name: form.full_name, email: form.email||null, phone: form.phone||null,
        candidate_role: form.candidate_role||null, source: form.source, status: form.status,
        notes: form.notes||null, candidate_type: form.candidate_type,
        total_experience: form.total_experience||null, relevant_experience: form.relevant_experience||null,
        location: form.location||null, relocation: form.relocation||null,
        visa_status: isIntl ? (form.visa_status||null) : null,
      });
      onAdd(normalise(res.data)); onClose();
    } catch (err) { alert(err?.response?.data?.detail || 'Failed to add candidate'); }
  };
  return (
    <div className="modal-overlay scale-in" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Add Candidate</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close"/></button>
        </div>
        <div style={{ display:'flex', gap:4, padding:4, background:'var(--surface-container-high)', borderRadius:'0.75rem', marginBottom:'1rem', width:'fit-content' }}>
          {['domestic','international'].map(t=>(
            <button key={t} onClick={()=>set('candidate_type',t)} style={{ padding:'0.4rem 1rem', borderRadius:'0.5rem', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight:form.candidate_type===t?600:500, background:form.candidate_type===t?'var(--surface-container-lowest)':'transparent', color:form.candidate_type===t?'var(--tertiary)':'var(--on-surface-variant)' }}>
              {t==='domestic'?'🇮🇳 Domestic':'🌍 International'}
            </button>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {[{label:'Full Name *',key:'full_name',type:'text',span:2},{label:'Email',key:'email',type:'email'},{label:'Phone',key:'phone',type:'tel'},{label:'Role / Technology',key:'candidate_role',type:'text'},{label:'Location',key:'location',type:'text'},{label:'Total Experience',key:'total_experience',type:'text'},{label:'Relevant Experience',key:'relevant_experience',type:'text'}].map(f=>(
            <div key={f.key} style={{ gridColumn:f.span===2?'1/-1':undefined }}>
              <label className="label">{f.label}</label>
              <input className="input" type={f.type} value={form[f.key]||''} onChange={e=>set(f.key,e.target.value)}/>
            </div>
          ))}
          {isIntl && (<>
            <div><label className="label">VISA Status</label><input className="input" placeholder="H1B, GC, H4EAD…" value={form.visa_status} onChange={e=>set('visa_status',e.target.value)}/></div>
            <div><label className="label">Relocation</label><input className="input" placeholder="Remote, Local, Any…" value={form.relocation} onChange={e=>set('relocation',e.target.value)}/></div>
          </>)}
          <div><label className="label">Source</label><select className="select" value={form.source} onChange={e=>set('source',e.target.value)}>{SOURCES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label className="label">Stage</label><select className="select" value={form.status} onChange={e=>set('status',e.target.value)}>{STAGES.map(s=><option key={s} value={s}>{STAGE_META[s].label}</option>)}</select></div>
          <div style={{ gridColumn:'1/-1' }}><label className="label">Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={submit} style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--tertiary),#009966)' }}>
            <Icon name="person_add" style={{ fontSize:'1rem', color:'#fff' }}/> Add Candidate
          </button>
        </div>
      </div>
    </div>
  );
};
const normalise = (c) => ({
  id: c.id, name: c.full_name, email: c.email, phone: c.phone,
  candidate_role: c.candidate_role, current_company: c.current_company,
  job: c.job?.title||'', dept: c.job?.department||'', exp: c.experience_years||0,
  total_experience: c.total_experience||'', relevant_experience: c.relevant_experience||'',
  location: c.location||'', relocation: c.relocation||'', visa_status: c.visa_status||'',
  source: c.source||'Manual', status: c.status, candidate_type: c.candidate_type||'domestic',
  applied: c.created_at?.slice(0,10), notes: c.notes,
});
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
  const PER_PAGE = 25;
  const [colSearch, setColSearch] = useState({ name:'', candidate_role:'', total_experience:'', relevant_experience:'', location:'', visa_status:'', relocation:'', source:'' });
  const setCS = (k,v) => { setColSearch(s=>({...s,[k]:v})); setPage(1); };
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q'); if (q) setColSearch(s=>({...s,name:q}));
    const type = params.get('type'); if (type) setActiveTab(type);
  }, [location.search]);
  const fetchCandidates = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await candidatesAPI.getAll({ limit:500 });
      const data = Array.isArray(res.data)?res.data:Array.isArray(res.data?.candidates)?res.data.candidates:Array.isArray(res.data?.data)?res.data.data:[];
      setCandidates(data.map(normalise));
    } catch { setError('Failed to load candidates.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);
  const filtered = useMemo(() => {
    let out = candidates.filter(c => {
      if (c.candidate_type !== activeTab) return false;
      if (stageFilter !== 'all' && c.status !== stageFilter) return false;
      const cs = colSearch;
      if (cs.name && !c.name?.toLowerCase().includes(cs.name.toLowerCase())) return false;
      if (cs.candidate_role && !c.candidate_role?.toLowerCase().includes(cs.candidate_role.toLowerCase())) return false;
      if (cs.total_experience && !matchesExperience(c.total_experience, cs.total_experience)) return false;
      if (cs.relevant_experience && !matchesExperience(c.relevant_experience, cs.relevant_experience)) return false;
      if (cs.location && !c.location?.toLowerCase().includes(cs.location.toLowerCase())) return false;
      if (cs.visa_status && !c.visa_status?.toLowerCase().includes(cs.visa_status.toLowerCase())) return false;
      if (cs.relocation && !c.relocation?.toLowerCase().includes(cs.relocation.toLowerCase())) return false;
      if (cs.source && !c.source?.toLowerCase().includes(cs.source.toLowerCase())) return false;
      return true;
    });
    out = [...out].sort((a,b) => {
      const av=a[sortBy]||'', bv=b[sortBy]||'';
      return sortDir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));
    });
    return out;
  }, [candidates, activeTab, stageFilter, colSearch, sortBy, sortDir]);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const toggleSort = (col) => { if(sortBy===col) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortBy(col);setSortDir('asc');} setPage(1); };
  const SortIcon = ({ col }) => sortBy===col?<Icon name={sortDir==='asc'?'arrow_upward':'arrow_downward'} style={{fontSize:'0.75rem',color:'var(--tertiary)'}}/>:<Icon name="unfold_more" style={{fontSize:'0.75rem',opacity:0.3}}/>;
  const tabCounts = { domestic: candidates.filter(c=>c.candidate_type==='domestic').length, international: candidates.filter(c=>c.candidate_type==='international').length };
  const isIntl = activeTab === 'international';
  const hasColSearch = Object.values(colSearch).some(v=>v);
  const domCols = [{label:'Candidate',key:'name'},{label:'Role / Technology',key:'candidate_role'},{label:'Total Exp',key:'total_experience'},{label:'Relevant Exp',key:'relevant_experience'},{label:'Source',key:'source'},{label:'Stage',key:'status'},{label:'Added',key:'applied'}];
  const intlCols = [{label:'Candidate',key:'name'},{label:'VISA',key:'visa_status'},{label:'Role / Technology',key:'candidate_role'},{label:'Experience',key:'total_experience'},{label:'Location',key:'location'},{label:'Relocation',key:'relocation'},{label:'Stage',key:'status'},{label:'Added',key:'applied'}];
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
          <a href="/recruitment/pipeline" className="btn-secondary"><Icon name="account_tree" style={{fontSize:'1rem'}}/> Pipeline</a>
          <button onClick={()=>setShowAdd(true)} style={{display:'inline-flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 1.25rem',borderRadius:'0.5rem',fontSize:'0.875rem',fontWeight:600,color:'#fff',border:'none',cursor:'pointer',background:'linear-gradient(135deg,var(--tertiary),#009966)',boxShadow:'0 2px 8px rgba(0,98,67,0.25)'}}>
            <Icon name="person_add" style={{fontSize:'1rem',color:'#fff'}}/> Add Candidate
          </button>
        </div>
      </div>
      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:'1.25rem',background:'var(--surface-container-high)',padding:4,borderRadius:'0.875rem',width:'fit-content'}}>
        {[{id:'domestic',label:'🇮🇳 Domestic'},{id:'international',label:'🌍 International'}].map(tab=>(
          <button key={tab.id} onClick={()=>{setActiveTab(tab.id);setPage(1);}} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 1.5rem',borderRadius:'0.625rem',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.875rem',fontWeight:activeTab===tab.id?600:500,background:activeTab===tab.id?'var(--surface-container-lowest)':'transparent',color:activeTab===tab.id?'var(--tertiary)':'var(--on-surface-variant)',boxShadow:activeTab===tab.id?'var(--ambient-shadow)':'none',transition:'all 0.2s'}}>
            {tab.label}
            <span style={{padding:'0.1rem 0.5rem',borderRadius:9999,fontSize:'0.75rem',fontWeight:700,background:activeTab===tab.id?'rgba(0,98,67,0.12)':'var(--surface-container)',color:activeTab===tab.id?'var(--tertiary)':'var(--on-surface-variant)'}}>{tabCounts[tab.id]}</span>
          </button>
        ))}
      </div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem',marginBottom:'1.5rem'}}>
        {[{label:'In View',value:filtered.length,icon:'group',color:'var(--tertiary)'},{label:'Active Pipeline',value:filtered.filter(c=>!['rejected','onboarded'].includes(c.status)).length,icon:'pending',color:'var(--tertiary)'},{label:'Interviews Set',value:filtered.filter(c=>c.status==='interview_scheduled').length,icon:'event',color:'var(--primary)'},{label:'Selected/Hired',value:filtered.filter(c=>['selected','onboarded'].includes(c.status)).length,icon:'how_to_reg',color:'var(--tertiary)'}].map(s=>(
          <div key={s.label} className="card-sm" style={{display:'flex',alignItems:'center',gap:'0.875rem'}}>
            <div style={{width:40,height:40,borderRadius:'0.625rem',background:`${s.color}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name={s.icon} style={{fontSize:'1.25rem',color:s.color}}/></div>
            <div><p style={{fontSize:'1.375rem',fontWeight:800,color:'var(--on-surface)',lineHeight:1}}>{s.value}</p><p className="label-sm" style={{marginTop:'0.125rem'}}>{s.label}</p></div>
          </div>
        ))}
      </div>
      {/* Stage filter */}
      <div className="card" style={{padding:'0.875rem 1.25rem',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'0.375rem',flexWrap:'wrap',alignItems:'center'}}>
          {['all',...STAGES].map(s=>(
            <button key={s} onClick={()=>{setStage(s);setPage(1);}} style={{padding:'0.3rem 0.75rem',borderRadius:9999,border:'none',cursor:'pointer',fontSize:'0.8125rem',fontWeight:600,fontFamily:'Inter,sans-serif',background:stageFilter===s?'var(--tertiary)':'var(--surface-container-low)',color:stageFilter===s?'#fff':'var(--on-surface-variant)',transition:'all 0.15s'}}>
              {s==='all'?'All Stages':STAGE_META[s]?.label}
            </button>
          ))}
          {hasColSearch&&<button onClick={()=>setColSearch({name:'',candidate_role:'',total_experience:'',relevant_experience:'',location:'',visa_status:'',relocation:'',source:''})} style={{marginLeft:'auto',padding:'0.3rem 0.75rem',borderRadius:9999,border:'1px solid var(--outline-variant)',cursor:'pointer',fontSize:'0.8125rem',fontWeight:600,background:'transparent',color:'var(--error)',fontFamily:'Inter,sans-serif'}}><Icon name="filter_alt_off" style={{fontSize:'0.875rem'}}/> Clear search</button>}
        </div>
        {selected.size>0&&<div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginTop:'0.875rem',padding:'0.625rem 0.875rem',background:'rgba(0,98,67,0.06)',borderRadius:'0.5rem'}}><span style={{fontSize:'0.875rem',fontWeight:600,color:'var(--tertiary)'}}>{selected.size} selected</span><button className="btn-ghost" onClick={()=>{setCandidates(cs=>cs.filter(c=>!selected.has(c.id)));setSelected(new Set());}} style={{fontSize:'0.8125rem',color:'var(--error)',marginLeft:'auto'}}><Icon name="delete" style={{fontSize:'1rem',color:'var(--error)'}}/> Remove</button></div>}
      </div>
      {/* Table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table className="data-table" style={{margin:0}}>
            <thead>
              <tr style={{background:'var(--surface-container-low)'}}>
                <th style={{padding:'0.75rem 1rem',width:44}}><input type="checkbox" checked={selected.size===paged.length&&paged.length>0} onChange={()=>{if(selected.size===paged.length)setSelected(new Set());else setSelected(new Set(paged.map(c=>c.id)));}} style={{cursor:'pointer',width:16,height:16,accentColor:'var(--tertiary)'}}/></th>
                {cols.map(col=>(
                  <th key={col.key} style={{padding:'0.75rem 1rem',textAlign:'left',cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}} onClick={()=>toggleSort(col.key)}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.25rem',fontSize:'0.7rem',fontWeight:700,color:'var(--on-surface-variant)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{col.label} <SortIcon col={col.key}/></div>
                  </th>
                ))}
                <th style={{padding:'0.75rem 1rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:'var(--on-surface-variant)',textTransform:'uppercase'}}>Actions</th>
              </tr>
              {/* Per-column search row */}
              <tr style={{background:'var(--surface-container)',borderBottom:'2px solid var(--outline-variant)'}}>
                <th style={{padding:'0 1rem 0.5rem'}}/>
                {cols.map(col=>(
                  <th key={col.key} style={{padding:'0 0.5rem 0.5rem'}}>
                    {col.key==='applied'?<div style={{height:26}}/>:col.key==='status'?(
                      <select style={{width:'100%',fontSize:'0.75rem',padding:'0.2rem 0.4rem',borderRadius:4,border:'1px solid var(--outline-variant)',background:'var(--surface)',color:'var(--on-surface)',fontFamily:'Inter,sans-serif'}} value={colSearch[col.key]||''} onChange={e=>setCS(col.key,e.target.value)}>
                        <option value="">All</option>{STAGES.map(s=><option key={s} value={s}>{STAGE_META[s].label}</option>)}
                      </select>
                    ):(
                      <input placeholder="Search…" value={colSearch[col.key]||''} onChange={e=>setCS(col.key,e.target.value)}
                        style={{width:'100%',fontSize:'0.75rem',padding:'0.2rem 0.4rem',borderRadius:4,border:'1px solid var(--outline-variant)',background:'var(--surface)',color:'var(--on-surface)',fontFamily:'Inter,sans-serif',boxSizing:'border-box'}}/>
                    )}
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
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',fontWeight:600,whiteSpace:'nowrap'}}>{c.total_experience||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.location||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.75rem',color:'var(--on-surface-variant)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.relocation||'—'}</td>
                      </>
                    ):(
                      <>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',fontWeight:500,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.candidate_role||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',fontWeight:600,whiteSpace:'nowrap'}}>{c.total_experience||'—'}</td>
                        <td style={{padding:'0.75rem 1rem',fontSize:'0.8125rem',color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{c.relevant_experience||'—'}</td>
                        <td style={{padding:'0.75rem 1rem'}}><span style={{fontSize:'0.75rem',fontWeight:600,padding:'0.175rem 0.5rem',borderRadius:4,background:'rgba(0,74,198,0.08)',color:'var(--primary)'}}>{c.source}</span></td>
                      </>
                    )}
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
              <React.Fragment key={p}>{i>0&&arr[i-1]!==p-1&&<span style={{alignSelf:'center',color:'var(--on-surface-variant)',fontSize:'0.875rem'}}>…</span>}<button onClick={()=>setPage(p)} style={{width:32,height:32,borderRadius:'0.375rem',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.875rem',fontWeight:600,background:page===p?'var(--tertiary)':'transparent',color:page===p?'#fff':'var(--on-surface-variant)',transition:'all 0.15s'}}>{p}</button></React.Fragment>
            ))}
            <button className="btn-icon" disabled={page===totalPages||totalPages===0} onClick={()=>setPage(p=>p+1)} style={{opacity:(page===totalPages||totalPages===0)?0.35:1}}><Icon name="chevron_right"/></button>
          </div>
        </div>
      </div>
      {showAdd&&<AddCandidateModal onClose={()=>setShowAdd(false)} onAdd={c=>setCandidates(cs=>[c,...cs])} defaultType={activeTab}/>}
      </>}
    </div>
  );
}
