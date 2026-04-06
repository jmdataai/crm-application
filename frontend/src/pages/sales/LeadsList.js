import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { leadsAPI } from '../../services/api';
import { useNavigate, useLocation } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const STATUS_META = {
  new:              { label:'New',             bg:'var(--surface-container)',     color:'var(--on-surface-variant)' },
  contacted:        { label:'Intro Sent',      bg:'rgba(0,74,198,0.1)',           color:'var(--primary)' },
  called:           { label:'Called',          bg:'rgba(124,58,237,0.1)',         color:'#7c3aed' },
  interested:       { label:'Interested',      bg:'rgba(217,119,6,0.12)',         color:'#92400e' },
  follow_up_needed: { label:'Follow-up Due',   bg:'rgba(217,119,6,0.2)',          color:'#d97706' },
  closed:           { label:'Won / Closed',    bg:'rgba(0,98,67,0.15)',           color:'var(--tertiary)' },
  completed:        { label:'Completed',       bg:'rgba(0,98,67,0.12)',           color:'var(--tertiary)' },
  rejected:         { label:'Not Interested',  bg:'var(--error-container)',       color:'var(--on-error-container)' },
  lost:             { label:'Lost',            bg:'rgba(186,26,26,0.08)',         color:'var(--error)' },
};
const StatusBadge = ({ status }) => {
  const s = STATUS_META[status] || STATUS_META.new;
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.6875rem', fontWeight:700, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>{s.label}</span>;
};

const bool_icon = (v) => v
  ? <Icon name="check_circle" style={{ fontSize:'1rem', color:'var(--tertiary)' }}/>
  : <Icon name="radio_button_unchecked" style={{ fontSize:'1rem', color:'var(--outline-variant)' }}/>;

// ── Add Lead Modal ─────────────────────────────────────
const AddLeadModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ full_name:'', company:'', job_title:'', email:'', phone:'', website:'', industry:'', business_type:'', location:'', country:'', source:'', status:'new', notes:'', next_follow_up:'', solution_skills:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const submit = async () => {
    if (!form.full_name.trim() && !form.company.trim()) { alert('Enter at least a name or company'); return; }
    try {
      const res = await leadsAPI.create({
        full_name: form.full_name || form.company || 'Unknown',
        company: form.company||null, job_title: form.job_title||null,
        email: form.email||null, phone: form.phone||null, website: form.website||null,
        industry: form.industry||null, business_type: form.business_type||null,
        address: form.location||null, country: form.country||null,
        source: form.source||null, status: form.status,
        notes: form.notes||null, next_follow_up: form.next_follow_up||null,
        solution_skills: form.solution_skills||null,
      });
      onAdd(normalise(res.data)); onClose();
    } catch(e) { alert(e?.response?.data?.detail || 'Failed to add lead'); }
  };
  return (
    <div className="modal-overlay scale-in" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Add Lead</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close"/></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {[{l:'Company Name *',k:'company',t:'text',s:2},{l:'Contact Name',k:'full_name',t:'text'},{l:'Designation',k:'job_title',t:'text'},{l:'Email',k:'email',t:'email'},{l:'Phone',k:'phone',t:'tel'},{l:'Website',k:'website',t:'url'},{l:'Industry',k:'industry',t:'text'},{l:'Business Type / Skills',k:'business_type',t:'text'},{l:'Location / City',k:'location',t:'text'},{l:'Country',k:'country',t:'text'},{l:'Source / Lead From',k:'source',t:'text'},{l:'Next Follow-up',k:'next_follow_up',t:'date'},{l:'Solution / Looking For',k:'solution_skills',t:'text',s:2}].map(f=>(
            <div key={f.k} style={{ gridColumn:f.s===2?'1/-1':undefined }}>
              <label className="label">{f.l}</label>
              <input className="input" type={f.t} value={form[f.k]||''} onChange={e=>set(f.k,e.target.value)}/>
            </div>
          ))}
          <div>
            <label className="label">Status</label>
            <select className="select" value={form.status} onChange={e=>set('status',e.target.value)}>
              {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}><label className="label">Notes / Remarks</label><textarea className="textarea" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={submit} className="btn-primary"><Icon name="add" style={{ fontSize:'1rem', color:'#fff' }}/> Add Lead</button>
        </div>
      </div>
    </div>
  );
};

const normalise = (l) => ({
  id:                   l.id,
  company:              l.company || l.full_name || '—',
  full_name:            l.full_name || '',
  job_title:            l.job_title || '',
  email:                l.email || '',
  phone:                l.phone || '',
  website:              l.website || '',
  industry:             l.industry || '',
  business_type:        l.business_type || '',
  address:              l.address || '',
  country:              l.country || '',
  status:               l.status || 'new',
  next_follow_up:       l.next_follow_up || '',
  intro_sent:           l.intro_sent || '',
  linkedin_invite_sent: l.linkedin_invite_sent || false,
  solution_skills:      l.solution_skills || '',
  notes:                l.notes || '',
  source_file:          l.source_file || '',
  source:               l.source || '',
  contact2_name:        l.contact_person_2_name || '',
  contact2_designation: l.contact_person_2_designation || '',
  contact2_email:       l.contact_person_2_email || '',
  contact2_phone:       l.contact_person_2_phone || '',
  contact3_name:        l.contact_person_3_name || '',
  contact3_email:       l.contact_person_3_email || '',
  created_at:           l.created_at?.slice(0,10) || '',
  deal_value:           l.deal_value || 0,
  linkedin_url:         l.linkedin_url || '',
});

export default function LeadsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [selected, setSelected]   = useState(new Set());
  const [sortBy, setSortBy]       = useState('created_at');
  const [sortDir, setSortDir]     = useState('desc');
  const [page, setPage]           = useState(1);
  const [statusView, setStatusView] = useState('all');
  const [fileFilter, setFileFilter]   = useState('all');
  const PER_PAGE = 25;

  // Per-column search
  const [cs, setColS] = useState({
    company:'', full_name:'', job_title:'', email:'', phone:'',
    industry:'', business_type:'', country:'', status:'', source_file:'',
    next_follow_up:'', solution_skills:'', source:'',
  });
  const setCS = (k,v) => { setColS(s=>({...s,[k]:v})); setPage(1); };
  const hasCS = Object.values(cs).some(v=>v);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const q = p.get('q'); if (q) setCS('company', q);
  }, [location.search]);

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await leadsAPI.getAll({ limit:1000 });
      const data = Array.isArray(res.data)?res.data:Array.isArray(res.data?.leads)?res.data.leads:Array.isArray(res.data?.data)?res.data.data:[];
      setLeads(data.map(normalise));
    } catch { setError('Failed to load leads.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Distinct source files from all leads
  const sourceFiles = useMemo(() =>
    [...new Set(leads.map(l => l.source_file).filter(Boolean))].sort()
  , [leads]);

  const filtered = useMemo(() => {
    let out = leads.filter(l => {
      if (fileFilter !== 'all' && l.source_file !== fileFilter) return false;
      if (statusView !== 'all' && l.status !== statusView) return false;
      if (cs.company && !l.company?.toLowerCase().includes(cs.company.toLowerCase())) return false;
      if (cs.full_name && !l.full_name?.toLowerCase().includes(cs.full_name.toLowerCase())) return false;
      if (cs.job_title && !l.job_title?.toLowerCase().includes(cs.job_title.toLowerCase())) return false;
      if (cs.email && !l.email?.toLowerCase().includes(cs.email.toLowerCase())) return false;
      if (cs.phone && !l.phone?.toLowerCase().includes(cs.phone.toLowerCase())) return false;
      if (cs.industry && !l.industry?.toLowerCase().includes(cs.industry.toLowerCase())) return false;
      if (cs.business_type && !l.business_type?.toLowerCase().includes(cs.business_type.toLowerCase())) return false;
      if (cs.country && !l.country?.toLowerCase().includes(cs.country.toLowerCase())) return false;
      if (cs.status && !l.status?.toLowerCase().includes(cs.status.toLowerCase())) return false;
      if (cs.source_file && !l.source_file?.toLowerCase().includes(cs.source_file.toLowerCase())) return false;
      if (cs.next_follow_up && !l.next_follow_up?.includes(cs.next_follow_up)) return false;
      if (cs.solution_skills && !l.solution_skills?.toLowerCase().includes(cs.solution_skills.toLowerCase())) return false;
      if (cs.source && !l.source?.toLowerCase().includes(cs.source.toLowerCase())) return false;
      return true;
    });
    out = [...out].sort((a,b) => {
      const av=a[sortBy]||'', bv=b[sortBy]||'';
      if (sortBy==='deal_value') return sortDir==='asc'?Number(av)-Number(bv):Number(bv)-Number(av);
      return sortDir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));
    });
    return out;
  }, [leads, statusView, fileFilter, cs, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const toggleSort = (col) => { if(sortBy===col) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortBy(col);setSortDir('asc');} setPage(1); };
  const SortIcon = ({ col }) => sortBy===col?<Icon name={sortDir==='asc'?'arrow_upward':'arrow_downward'} style={{fontSize:'0.7rem',color:'var(--primary)'}}/>:<Icon name="unfold_more" style={{fontSize:'0.7rem',opacity:0.3}}/>;

  // Status summary counts
  const counts = useMemo(() => {
    const c = { all: leads.length };
    Object.keys(STATUS_META).forEach(k => { c[k] = leads.filter(l=>l.status===k).length; });
    c.follow_due = leads.filter(l=>l.next_follow_up && l.next_follow_up <= new Date().toISOString().slice(0,10)).length;
    return c;
  }, [leads]);

  const today = new Date().toISOString().slice(0,10);

  // Quick-update follow-up date
  const updateFollowUp = async (id, date) => {
    setLeads(ls => ls.map(l => l.id===id ? {...l, next_follow_up: date} : l));
    try { await leadsAPI.update(id, { next_follow_up: date||null }); } catch {}
  };

  // Quick status change
  const updateStatus = async (id, status) => {
    setLeads(ls => ls.map(l => l.id===id ? {...l, status} : l));
    try { await leadsAPI.update(id, { status }); } catch {}
  };

  const colInput = (key, placeholder) => (
    <input placeholder={placeholder||'Search…'} value={cs[key]||''} onChange={e=>setCS(key,e.target.value)}
      style={{ width:'100%', fontSize:'0.7rem', padding:'0.2rem 0.4rem', borderRadius:3, border:'1px solid var(--outline-variant)', background:'var(--surface)', color:'var(--on-surface)', fontFamily:'Inter,sans-serif', boxSizing:'border-box' }}
      onClick={e=>e.stopPropagation()}/>
  );

  const statusSelect = (
    <select value={cs.status||''} onChange={e=>setCS('status',e.target.value)} onClick={e=>e.stopPropagation()}
      style={{ width:'100%', fontSize:'0.7rem', padding:'0.2rem 0.4rem', borderRadius:3, border:'1px solid var(--outline-variant)', background:'var(--surface)', color:'var(--on-surface)', fontFamily:'Inter,sans-serif' }}>
      <option value="">All</option>
      {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
    </select>
  );

  return (
    <div className="fade-in">
      {loading && <div style={{textAlign:'center',padding:'4rem',color:'var(--on-surface-variant)'}}><Icon name="progress_activity" style={{fontSize:'2rem',display:'block',margin:'0 auto 0.75rem',animation:'spin 1s linear infinite'}}/>Loading leads…</div>}
      {error && <div style={{background:'var(--error-container)',color:'var(--error)',padding:'1rem',borderRadius:'0.5rem',marginBottom:'1rem'}}>{error}</div>}
      {!loading && <>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:'1.25rem'}}>
        <div><p className="label-sm" style={{marginBottom:'0.25rem'}}>Sales CRM</p><h1 className="headline-sm">Leads</h1></div>
        <div style={{display:'flex',gap:'0.625rem'}}>
          <a href="/sales/import" className="btn-secondary"><Icon name="upload_file" style={{fontSize:'1rem'}}/> Import CSV</a>
          <button onClick={()=>setShowAdd(true)} className="btn-primary"><Icon name="add" style={{fontSize:'1rem',color:'#fff'}}/> Add Lead</button>
        </div>
      </div>

      {/* File / Dataset Filter */}
      {sourceFiles.length > 0 && (
        <div style={{ marginBottom:'0.875rem', display:'flex', alignItems:'center', gap:'0.625rem', flexWrap:'wrap' }}>
          <Icon name="folder_open" style={{ fontSize:'1.1rem', color:'var(--primary)' }}/>
          <span style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--on-surface-variant)' }}>File:</span>
          <button onClick={() => { setFileFilter('all'); setPage(1); }} style={{
            padding:'0.25rem 0.75rem', borderRadius:9999, border: fileFilter==='all'?'none':'1px solid var(--outline-variant)',
            cursor:'pointer', fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
            background:fileFilter==='all'?'var(--primary)':'transparent', color:fileFilter==='all'?'#fff':'var(--on-surface-variant)', transition:'all 0.15s',
          }}>All ({leads.length})</button>
          {sourceFiles.map(f => {
            const cnt = leads.filter(l => l.source_file === f).length;
            const display = f.length > 40 ? f.slice(0,38) + '…' : f;
            return (
              <button key={f} onClick={() => { setFileFilter(f); setStatusView('all'); setPage(1); }} title={f} style={{
                padding:'0.25rem 0.75rem', borderRadius:9999, border: fileFilter===f?'none':'1px solid var(--outline-variant)',
                cursor:'pointer', fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
                background:fileFilter===f?'var(--primary)':'var(--surface-container-low)',
                color:fileFilter===f?'#fff':'var(--on-surface-variant)',
                display:'inline-flex', alignItems:'center', gap:'0.375rem', transition:'all 0.15s',
              }}>
                <Icon name="description" style={{ fontSize:'0.875rem', color:fileFilter===f?'#fff':'var(--primary)' }}/>
                {display} <span style={{ padding:'0.05rem 0.35rem', borderRadius:9999, fontSize:'0.7rem', fontWeight:700, background:fileFilter===f?'rgba(255,255,255,0.25)':'var(--surface-container)', color:fileFilter===f?'#fff':'var(--on-surface-variant)' }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Status Dashboard */}
      <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',marginBottom:'1.25rem'}}>
        {[
          {k:'all',       label:`All (${counts.all})`,               bg:statusView==='all'?'var(--primary)':'var(--surface-container-low)',       c:statusView==='all'?'#fff':'var(--on-surface-variant)'},
          {k:'new',       label:`New (${counts.new||0})`,             bg:statusView==='new'?'#1e40af':'rgba(0,74,198,0.08)',   c:statusView==='new'?'#fff':'var(--primary)'},
          {k:'contacted', label:`Intro Sent (${counts.contacted||0})`,bg:statusView==='contacted'?'#1e40af':'rgba(0,74,198,0.08)',c:statusView==='contacted'?'#fff':'var(--primary)'},
          {k:'called',    label:`Called (${counts.called||0})`,       bg:statusView==='called'?'#6d28d9':'rgba(124,58,237,0.1)',c:statusView==='called'?'#fff':'#7c3aed'},
          {k:'interested',label:`Interested (${counts.interested||0})`,bg:statusView==='interested'?'#d97706':'rgba(217,119,6,0.12)',c:statusView==='interested'?'#fff':'#92400e'},
          {k:'follow_up_needed',label:`Follow-up (${counts.follow_up_needed||0})`,bg:statusView==='follow_up_needed'?'#d97706':'rgba(217,119,6,0.15)',c:statusView==='follow_up_needed'?'#fff':'#d97706'},
          {k:'closed',    label:`Won (${counts.closed||0})`,          bg:statusView==='closed'?'#059669':'rgba(0,98,67,0.12)', c:statusView==='closed'?'#fff':'var(--tertiary)'},
          {k:'rejected',  label:`Not Interested (${counts.rejected||0})`,bg:statusView==='rejected'?'#dc2626':'var(--error-container)',c:statusView==='rejected'?'#fff':'var(--error)'},
        ].map(s=>(
          <button key={s.k} onClick={()=>{setStatusView(s.k);setPage(1);}} style={{padding:'0.35rem 0.875rem',borderRadius:9999,border:'none',cursor:'pointer',fontSize:'0.8125rem',fontWeight:600,fontFamily:'Inter,sans-serif',background:s.bg,color:s.c,transition:'all 0.15s',whiteSpace:'nowrap'}}>
            {s.label}
          </button>
        ))}
        {hasCS && <button onClick={()=>setColS({company:'',full_name:'',job_title:'',email:'',phone:'',industry:'',business_type:'',country:'',status:'',source_file:'',next_follow_up:'',solution_skills:'',source:''})} style={{marginLeft:'auto',padding:'0.35rem 0.875rem',borderRadius:9999,border:'1px solid var(--outline-variant)',cursor:'pointer',fontSize:'0.8125rem',fontWeight:600,background:'transparent',color:'var(--error)',fontFamily:'Inter,sans-serif'}}><Icon name="filter_alt_off" style={{fontSize:'0.875rem'}}/> Clear filters</button>}
      </div>

      {/* KPI row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'0.75rem',marginBottom:'1.25rem'}}>
        {[
          {label:'Total Leads',     value:counts.all,                                   icon:'group',         color:'var(--primary)'},
          {label:'Interested',      value:counts.interested||0,                          icon:'thumb_up',      color:'#d97706'},
          {label:'Follow-up Due',   value:counts.follow_due||0,                          icon:'alarm',         color:'var(--error)'},
          {label:'Won / Closed',    value:(counts.closed||0)+(counts.completed||0),       icon:'check_circle',  color:'var(--tertiary)'},
          {label:'Pipeline Value',  value:`₹${((leads.reduce((s,l)=>s+(l.deal_value||0),0))/1000).toFixed(0)}K`, icon:'currency_rupee', color:'var(--primary)'},
        ].map(s=>(
          <div key={s.label} className="card-sm" style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <div style={{width:36,height:36,borderRadius:'0.5rem',background:`${s.color}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name={s.icon} style={{fontSize:'1.1rem',color:s.color}}/></div>
            <div><p style={{fontSize:'1.125rem',fontWeight:800,color:'var(--on-surface)',lineHeight:1}}>{s.value}</p><p className="label-sm" style={{marginTop:'0.125rem'}}>{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* Main Data Grid */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8125rem',tableLayout:'auto'}}>
            <thead>
              {/* Header row */}
              <tr style={{background:'var(--surface-container-low)',borderBottom:'1px solid var(--outline-variant)'}}>
                <th style={{padding:'0.625rem 0.75rem',width:36,borderRight:'1px solid var(--outline-variant)'}}>
                  <input type="checkbox" checked={selected.size===paged.length&&paged.length>0}
                    onChange={()=>{if(selected.size===paged.length)setSelected(new Set());else setSelected(new Set(paged.map(l=>l.id)));}}
                    style={{cursor:'pointer',width:14,height:14,accentColor:'var(--primary)'}}/>
                </th>
                {[
                  {label:'#',               key:'_num',          w:'40px',  sort:false},
                  {label:'Company',         key:'company',       w:'160px', sort:true},
                  {label:'Type / Industry', key:'industry',      w:'120px', sort:true},
                  {label:'Status',          key:'status',        w:'130px', sort:true},
                  {label:'Contact 1',       key:'full_name',     w:'140px', sort:true},
                  {label:'Designation',     key:'job_title',     w:'130px', sort:true},
                  {label:'Email',           key:'email',         w:'170px', sort:true},
                  {label:'Phone',           key:'phone',         w:'120px', sort:false},
                  {label:'Contact 2',       key:'contact2_name', w:'130px', sort:false},
                  {label:'C2 Email',        key:'contact2_email',w:'160px', sort:false},
                  {label:'Domain / Skills', key:'solution_skills',w:'150px',sort:true},
                  {label:'Country',         key:'country',       w:'100px', sort:true},
                  {label:'Follow-up',       key:'next_follow_up',w:'120px', sort:true},
                  {label:'Intro Sent',      key:'intro_sent',    w:'100px', sort:true},
                  {label:'Source File',     key:'source_file',   w:'140px', sort:true},
                  {label:'Remarks',         key:'notes',         w:'160px', sort:false},
                ].map(col=>(
                  <th key={col.key} style={{padding:'0.5rem 0.625rem',textAlign:'left',cursor:col.sort?'pointer':'default',userSelect:'none',whiteSpace:'nowrap',minWidth:col.w,borderRight:'1px solid var(--outline-variant)'}}
                    onClick={()=>col.sort&&toggleSort(col.key)}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.2rem',fontSize:'0.7rem',fontWeight:700,color:'var(--on-surface-variant)',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                      {col.label}{col.sort&&<SortIcon col={col.key}/>}
                    </div>
                  </th>
                ))}
                <th style={{padding:'0.5rem 0.625rem',whiteSpace:'nowrap',minWidth:'80px',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:'var(--on-surface-variant)',textTransform:'uppercase'}}>Actions</th>
              </tr>
              {/* Search row */}
              <tr style={{background:'var(--surface-container)',borderBottom:'2px solid var(--outline-variant)'}}>
                <th style={{padding:'0.375rem 0.75rem',borderRight:'1px solid var(--outline-variant)'}}/>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}/>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('company','Company…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('industry','Industry…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{statusSelect}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('full_name','Name…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('job_title','Designation…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('email','Email…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('phone','Phone…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}/>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}/>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('solution_skills','Skills…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('country','Country…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('next_follow_up','YYYY-MM-DD')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}/>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}>{colInput('source_file','File…')}</th>
                <th style={{padding:'0.375rem 0.375rem',borderRight:'1px solid var(--outline-variant)'}}/>
                <th style={{padding:'0.375rem 0.375rem'}}/>
              </tr>
            </thead>
            <tbody>
              {paged.length===0&&<tr><td colSpan={18} style={{textAlign:'center',padding:'3rem',color:'var(--on-surface-variant)'}}><Icon name="search_off" style={{fontSize:'2rem',display:'block',margin:'0 auto 0.5rem'}}/>No leads match your filters.</td></tr>}
              {paged.map((l,idx)=>{
                const isOverdue = l.next_follow_up && l.next_follow_up < today;
                const isDueToday = l.next_follow_up === today;
                const rowBg = isOverdue ? 'rgba(186,26,26,0.03)' : isDueToday ? 'rgba(217,119,6,0.03)' : 'transparent';
                return (
                  <tr key={l.id} style={{borderBottom:'1px solid var(--surface-container)',background:rowBg,transition:'background 0.1s'}}
                    onMouseEnter={e=>{if(!isOverdue&&!isDueToday)e.currentTarget.style.background='var(--surface-container-low)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
                    {/* Checkbox */}
                    <td style={{padding:'0.625rem 0.75rem',borderRight:'1px solid var(--surface-container)'}} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(l.id)} onChange={()=>setSelected(s=>{const n=new Set(s);n.has(l.id)?n.delete(l.id):n.add(l.id);return n;})} style={{cursor:'pointer',width:14,height:14,accentColor:'var(--primary)'}}/>
                    </td>
                    {/* Row # */}
                    <td style={{padding:'0.625rem 0.5rem',color:'var(--on-surface-variant)',fontSize:'0.75rem',borderRight:'1px solid var(--surface-container)',textAlign:'center'}}>{(page-1)*PER_PAGE+idx+1}</td>
                    {/* Company */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',minWidth:'160px'}}>
                      <div style={{fontWeight:700,fontSize:'0.875rem',color:'var(--on-surface)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:155,cursor:'pointer'}} onClick={()=>navigate(`/sales/leads/${l.id}`)}>
                        {l.company}
                      </div>
                      {l.website&&<a href={l.website.startsWith('http')?l.website:'https://'+l.website} target="_blank" rel="noreferrer" style={{fontSize:'0.7rem',color:'var(--primary)',textDecoration:'none',display:'flex',alignItems:'center',gap:2}} onClick={e=>e.stopPropagation()}>
                        <Icon name="open_in_new" style={{fontSize:'0.7rem'}}/>web
                      </a>}
                    </td>
                    {/* Industry */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:120}}>
                      <span style={{fontSize:'0.75rem',color:'var(--on-surface-variant)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}>{l.industry||l.business_type||'—'}</span>
                    </td>
                    {/* Status — inline quick-change */}
                    <td style={{padding:'0.5rem 0.625rem',borderRight:'1px solid var(--surface-container)'}} onClick={e=>e.stopPropagation()}>
                      <select value={l.status} onChange={e=>updateStatus(l.id,e.target.value)}
                        style={{border:'none',background:'transparent',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.75rem',fontWeight:600,color:(STATUS_META[l.status]||STATUS_META.new).color,padding:0,outline:'none'}}>
                        {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </td>
                    {/* Contact 1 name */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:140}}>
                      <p style={{fontSize:'0.8125rem',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.full_name||'—'}</p>
                    </td>
                    {/* Designation */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:130}}>
                      <span style={{fontSize:'0.75rem',color:'var(--on-surface-variant)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}>{l.job_title||'—'}</span>
                    </td>
                    {/* Email */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:170}} onClick={e=>e.stopPropagation()}>
                      {l.email?<a href={`mailto:${l.email}`} style={{fontSize:'0.75rem',color:'var(--primary)',textDecoration:'none',display:'flex',alignItems:'center',gap:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}><Icon name="mail" style={{fontSize:'0.875rem',flexShrink:0}}/>{l.email}</a>:<span style={{color:'var(--outline)'}}>—</span>}
                    </td>
                    {/* Phone */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)'}} onClick={e=>e.stopPropagation()}>
                      {l.phone?<a href={`tel:${l.phone}`} style={{fontSize:'0.75rem',color:'var(--on-surface)',textDecoration:'none',display:'flex',alignItems:'center',gap:3,whiteSpace:'nowrap'}}><Icon name="call" style={{fontSize:'0.875rem',color:'var(--tertiary)'}}/>{l.phone}</a>:<span style={{color:'var(--outline)'}}>—</span>}
                    </td>
                    {/* Contact 2 */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:130}}>
                      {l.contact2_name?<div><p style={{fontSize:'0.8125rem',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.contact2_name}</p><p style={{fontSize:'0.7rem',color:'var(--on-surface-variant)'}}>{l.contact2_designation}</p></div>:<span style={{color:'var(--outline)'}}>—</span>}
                    </td>
                    {/* C2 email */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:160}} onClick={e=>e.stopPropagation()}>
                      {l.contact2_email?<a href={`mailto:${l.contact2_email}`} style={{fontSize:'0.75rem',color:'var(--primary)',textDecoration:'none',display:'flex',alignItems:'center',gap:3}}><Icon name="mail" style={{fontSize:'0.875rem'}}/>{l.contact2_email.slice(0,22)}</a>:<span style={{color:'var(--outline)'}}>—</span>}
                    </td>
                    {/* Domain/Skills */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:150}}>
                      <span style={{fontSize:'0.75rem',color:'var(--on-surface-variant)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}>{l.solution_skills||'—'}</span>
                    </td>
                    {/* Country */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',whiteSpace:'nowrap'}}>
                      <span style={{fontSize:'0.75rem'}}>{l.country||l.address||'—'}</span>
                    </td>
                    {/* Follow-up — inline date picker */}
                    <td style={{padding:'0.5rem 0.625rem',borderRight:'1px solid var(--surface-container)',whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <input type="date" value={l.next_follow_up||''} onChange={e=>updateFollowUp(l.id,e.target.value)}
                        style={{fontSize:'0.75rem',border:'none',background:'transparent',cursor:'pointer',fontFamily:'Inter,sans-serif',color:isOverdue?'var(--error)':isDueToday?'#d97706':'var(--on-surface)',fontWeight:isOverdue||isDueToday?600:400,padding:0,outline:'none',width:'110px'}}/>
                    </td>
                    {/* Intro Sent */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',textAlign:'center'}}>
                      {l.intro_sent?<span style={{fontSize:'0.7rem',color:'var(--tertiary)',fontWeight:600}}>{l.intro_sent}</span>:bool_icon(false)}
                    </td>
                    {/* Source File */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:140}}>
                      <span style={{fontSize:'0.7rem',color:'var(--on-surface-variant)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}} title={l.source_file}>{l.source_file||'—'}</span>
                    </td>
                    {/* Remarks / Notes */}
                    <td style={{padding:'0.625rem 0.625rem',borderRight:'1px solid var(--surface-container)',maxWidth:160}}>
                      <span style={{fontSize:'0.75rem',color:'var(--on-surface-variant)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}} title={l.notes}>{l.notes||'—'}</span>
                    </td>
                    {/* Actions */}
                    <td style={{padding:'0.625rem 0.75rem',textAlign:'right',whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <button className="btn-icon" title="Open" onClick={()=>navigate(`/sales/leads/${l.id}`)}><Icon name="open_in_new" style={{fontSize:'1rem'}}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.875rem 1.25rem',borderTop:'1px solid var(--ghost-border)',background:'var(--surface-container-low)'}}>
          <p style={{fontSize:'0.8125rem',color:'var(--on-surface-variant)'}}>
            Showing <b>{Math.min((page-1)*PER_PAGE+1,filtered.length)}–{Math.min(page*PER_PAGE,filtered.length)}</b> of <b>{filtered.length}</b> leads
            {selected.size>0&&<> · <span style={{color:'var(--primary)',fontWeight:600}}>{selected.size} selected</span></>}
          </p>
          <div style={{display:'flex',gap:'0.375rem'}}>
            <button className="btn-icon" disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{opacity:page===1?0.35:1}}><Icon name="chevron_left"/></button>
            {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((p,i,arr)=>(
              <React.Fragment key={p}>{i>0&&arr[i-1]!==p-1&&<span style={{alignSelf:'center',color:'var(--on-surface-variant)',fontSize:'0.875rem'}}>…</span>}
              <button onClick={()=>setPage(p)} style={{width:32,height:32,borderRadius:'0.375rem',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.875rem',fontWeight:600,background:page===p?'var(--primary)':'transparent',color:page===p?'#fff':'var(--on-surface-variant)',transition:'all 0.15s'}}>{p}</button></React.Fragment>
            ))}
            <button className="btn-icon" disabled={page===totalPages||totalPages===0} onClick={()=>setPage(p=>p+1)} style={{opacity:(page===totalPages||totalPages===0)?0.35:1}}><Icon name="chevron_right"/></button>
          </div>
        </div>
      </div>
      {showAdd&&<AddLeadModal onClose={()=>setShowAdd(false)} onAdd={l=>setLeads(ls=>[l,...ls])}/>}
      </>}
    </div>
  );
}
