import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { leadsAPI } from '../../services/api';

const STATUS_VALUES = ['new','contacted','called','interested','follow_up_needed','closed','completed','rejected','lost'];

const AddLeadModal = ({ onClose, onAdd }) => {
  const [form, setForm] = React.useState({ company:'', full_name:'', job_title:'', email:'', phone:'', website:'', industry:'', business_type:'', address:'', country:'', source:'', status:'new', notes:'', next_follow_up:'', solution_skills:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const submit = async () => {
    if (!form.company.trim()) { alert('Company name is required'); return; }
    try {
      const res = await leadsAPI.create({
        full_name: form.full_name || form.company,
        company: form.company, job_title: form.job_title||null, email: form.email||null,
        phone: form.phone||null, website: form.website||null, industry: form.industry||null,
        business_type: form.business_type||null, address: form.address||null, country: form.country||null,
        source: form.source||null, status: form.status, notes: form.notes||null,
        next_follow_up: form.next_follow_up||null, solution_skills: form.solution_skills||null,
      });
      onAdd(res.data); onClose();
    } catch(e) { alert(e?.response?.data?.detail || 'Failed to add'); }
  };
  return (
    <div className="modal-overlay scale-in" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
          <h2 style={{fontSize:'1.125rem',fontWeight:700}}>Add Company / Lead</h2>
          <button className="btn-icon" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
          {[{l:'Company Name *',k:'company',t:'text',s:2},{l:'Contact Name',k:'full_name',t:'text'},{l:'Designation',k:'job_title',t:'text'},{l:'Email',k:'email',t:'email'},{l:'Phone',k:'phone',t:'tel'},{l:'Website',k:'website',t:'url'},{l:'Industry Type',k:'industry',t:'text'},{l:'Business Type / Skills',k:'business_type',t:'text'},{l:'Address / City',k:'address',t:'text'},{l:'Country',k:'country',t:'text'},{l:'Lead From (Source)',k:'source',t:'text'},{l:'Next Follow-up',k:'next_follow_up',t:'date'},{l:'Solution / Looking Skills',k:'solution_skills',t:'text',s:2}].map(f=>(
            <div key={f.k} style={{gridColumn:f.s===2?'1/-1':undefined}}>
              <label style={{fontSize:'0.75rem',fontWeight:600,color:'var(--on-surface-variant)',display:'block',marginBottom:'0.25rem'}}>{f.l}</label>
              <input className="input" type={f.t} value={form[f.k]||''} onChange={e=>set(f.k,e.target.value)}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:'0.75rem',fontWeight:600,color:'var(--on-surface-variant)',display:'block',marginBottom:'0.25rem'}}>Status</label>
            <select className="select" value={form.status} onChange={e=>set('status',e.target.value)}>
              {STATUS_VALUES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={{fontSize:'0.75rem',fontWeight:600,color:'var(--on-surface-variant)',display:'block',marginBottom:'0.25rem'}}>Remarks / Notes</label>
            <textarea className="textarea" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/>
          </div>
        </div>
        <div style={{display:'flex',gap:'0.75rem',justifyContent:'flex-end',marginTop:'1.5rem'}}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}><span className="material-symbols-outlined" style={{fontSize:'1rem',color:'#fff',verticalAlign:'middle'}}>add</span> Add Company</button>
        </div>
      </div>
    </div>
  );
};
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

/* ── Status config ─────────────────────────────────────── */
const STATUS_META = {
  new:              { label:'New',            bg:'#f1f5f9', color:'#64748b',  dot:'#94a3b8' },
  contacted:        { label:'Intro Sent',     bg:'#eff6ff', color:'#1d4ed8',  dot:'#3b82f6' },
  called:           { label:'Called',         bg:'#f5f3ff', color:'#6d28d9',  dot:'#8b5cf6' },
  interested:       { label:'Interested',     bg:'#fffbeb', color:'#d97706',  dot:'#f59e0b' },
  follow_up_needed: { label:'Follow-up Due',  bg:'#fff7ed', color:'#ea580c',  dot:'#f97316' },
  closed:           { label:'Won',            bg:'#f0fdf4', color:'#16a34a',  dot:'#22c55e' },
  completed:        { label:'Completed',      bg:'#f0fdf4', color:'#15803d',  dot:'#16a34a' },
  rejected:         { label:'Not Interested', bg:'#fef2f2', color:'#dc2626',  dot:'#ef4444' },
  lost:             { label:'Lost',           bg:'#fef2f2', color:'#b91c1c',  dot:'#dc2626' },
};

/* ── Category tabs — mirrors the Excel sheets ──────────── */
const CATEGORY_TABS = [
  { id:'all',         label:'All Companies',     icon:'grid_view',  desc:'Every company across all sheets' },
  { id:'recruitment', label:'Recruitment Partners', icon:'people',  desc:'Staffing & recruitment agencies' },
  { id:'endclient',   label:'End Clients',       icon:'business',   desc:'Direct clients — Banking, Pharma, Tech' },
  { id:'consulting',  label:'Consulting',        icon:'cases',      desc:'SAP, IT consulting firms' },
  { id:'technology',  label:'Technology',        icon:'computer',   desc:'Tech companies & SaaS' },
  { id:'other',       label:'Others',            icon:'more_horiz', desc:'Other types' },
];

const categorise = (lead) => {
  const t = (lead.business_type || lead.industry || '').toLowerCase();
  if (t.includes('recruit') || t.includes('staffing') || t.includes('talent')) return 'recruitment';
  if (t.includes('consult')) return 'consulting';
  if (t.includes('technology') || t.includes('software') || t.includes('saas') || t.includes('tech')) return 'technology';
  if (t.includes('bank') || t.includes('pharma') || t.includes('medical') || t.includes('financial') ||
      t.includes('insurance') || t.includes('telecom') || t.includes('utilities') || t.includes('manufacturing') ||
      t.includes('energy') || t.includes('food') || t.includes('chemical')) return 'endclient';
  if (t) return 'other';
  return 'other';
};

/* ── Normalise API response ────────────────────────────── */
const norm = (l) => ({
  id:         l.id,
  company:    l.company || l.full_name || '—',
  type:       l.business_type || l.industry || '',
  status:     l.status || 'new',
  location:   l.address || l.country || '',
  country:    l.country || '',
  domain:     l.solution_skills || l.industry || '',
  website:    l.website || '',
  linkedin:   l.linkedin_url || '',
  c1_name:    l.full_name || '',
  c1_desig:   l.job_title || '',
  c1_email:   l.email || '',
  c1_phone:   l.phone || '',
  c2_name:    l.contact_person_2_name || '',
  c2_desig:   l.contact_person_2_designation || '',
  c2_email:   l.contact_person_2_email || '',
  c2_phone:   l.contact_person_2_phone || '',
  c3_name:    l.contact_person_3_name || '',
  c3_email:   l.contact_person_3_email || '',
  remark:     l.notes || '',
  follow_up:  l.next_follow_up || '',
  intro_sent: l.intro_sent || '',
  source_file:l.source_file || '',
  deal_value: l.deal_value || 0,
  created_at: l.created_at?.slice(0,10) || '',
  category:   categorise(l),
});

/* ── Status badge ──────────────────────────────────────── */
const StatusBadge = ({ status, onChange, id }) => {
  const s = STATUS_META[status] || STATUS_META.new;
  return (
    <select value={status} onChange={e => onChange(id, e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{ border:'none', background:s.bg, color:s.color, fontWeight:700, fontSize:'0.7rem', borderRadius:4, padding:'0.15rem 0.4rem', cursor:'pointer', fontFamily:'Inter,sans-serif', outline:'none', minWidth:80 }}>
      {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
    </select>
  );
};

/* ── Contact cell ──────────────────────────────────────── */
const ContactCell = ({ name, desig, email, phone }) => {
  if (!name && !email) return <span style={{ color:'var(--outline)' }}>—</span>;
  return (
    <div style={{ minWidth:0 }}>
      {name && <p style={{ fontSize:'0.8rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:150, margin:0 }}>{name}</p>}
      {desig && <p style={{ fontSize:'0.7rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:150, margin:0 }}>{desig}</p>}
      <div style={{ display:'flex', gap:6, marginTop:2 }}>
        {email && <a href={`mailto:${email}`} onClick={e=>e.stopPropagation()} style={{ fontSize:'0.7rem', color:'var(--primary)', textDecoration:'none', display:'flex', alignItems:'center', gap:2, whiteSpace:'nowrap' }}><Icon name="mail" style={{fontSize:'0.75rem'}}/>{email.split('@')[0]}</a>}
        {phone && <a href={`tel:${phone}`} onClick={e=>e.stopPropagation()} style={{ fontSize:'0.7rem', color:'var(--tertiary)', textDecoration:'none', display:'flex', alignItems:'center', gap:2, whiteSpace:'nowrap' }}><Icon name="call" style={{fontSize:'0.75rem'}}/></a>}
      </div>
    </div>
  );
};

/* ── Main SalesDashboard ───────────────────────────────── */
export default function SalesDashboard() {
  const navigate      = useNavigate();
  const { user }      = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [leads,   setLeads]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('all');
  const [fileFilter, setFileFilter] = useState('all');
  const changeFile = (f) => { setFileFilter(f); setTab('all'); setPage(1); setCS({ company:'', type:'', status:'', location:'', domain:'', c1_name:'', remark:'', follow_up:'', source_file:'' }); };
  const [sortBy, setSortBy]   = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage]       = useState(1);
  const PER_PAGE = 30;

  // Per-column search
  const [cs, setCS] = useState({ company:'', type:'', status:'', location:'', domain:'', c1_name:'', remark:'', follow_up:'', source_file:'' });
  const setCol = (k,v) => { setCS(s=>({...s,[k]:v})); setPage(1); };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leadsAPI.getAll({ limit:1000 });
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.leads) ? res.data.leads
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setLeads(data.map(norm));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* quick updates inline */
  const updateStatus = async (id, status) => {
    setLeads(ls => ls.map(l => l.id===id ? {...l, status} : l));
    try { await leadsAPI.update(id, { status }); } catch {}
  };
  const updateFollowUp = async (id, date) => {
    setLeads(ls => ls.map(l => l.id===id ? {...l, follow_up:date} : l));
    try { await leadsAPI.update(id, { next_follow_up: date||null }); } catch {}
  };

  const today = new Date().toISOString().slice(0,10);

  /* tab counts */
  const tabCounts = useMemo(() => {
    const c = { all: leads.length };
    CATEGORY_TABS.slice(1).forEach(t => { c[t.id] = leads.filter(l => l.category === t.id).length; });
    return c;
  }, [leads]);

  /* summary counts */
  const summary = useMemo(() => ({
    total:        leads.length,
    follow_due:   leads.filter(l => l.follow_up && l.follow_up <= today).length,
    interested:   leads.filter(l => l.status === 'interested').length,
    intro_sent:   leads.filter(l => l.status === 'contacted').length,
    won:          leads.filter(l => ['closed','completed'].includes(l.status)).length,
    not_started:  leads.filter(l => l.status === 'new').length,
  }), [leads, today]);

  /* distinct source files for the file picker */
  const sourceFiles = useMemo(() => {
    const files = [...new Set(leads.map(l => l.source_file).filter(Boolean))].sort();
    return files;
  }, [leads]);

  /* filtering + sorting */
  const filtered = useMemo(() => {
    let out = leads.filter(l => {
      if (fileFilter !== 'all' && l.source_file !== fileFilter) return false;
      if (tab !== 'all' && l.category !== tab) return false;
      if (cs.company && !l.company?.toLowerCase().includes(cs.company.toLowerCase())) return false;
      if (cs.type    && !l.type?.toLowerCase().includes(cs.type.toLowerCase())) return false;
      if (cs.status  && !l.status?.toLowerCase().includes(cs.status.toLowerCase())) return false;
      if (cs.location&& !l.location?.toLowerCase().includes(cs.location.toLowerCase()) && !l.country?.toLowerCase().includes(cs.location.toLowerCase())) return false;
      if (cs.domain  && !l.domain?.toLowerCase().includes(cs.domain.toLowerCase())) return false;
      if (cs.c1_name && !l.c1_name?.toLowerCase().includes(cs.c1_name.toLowerCase())) return false;
      if (cs.remark  && !l.remark?.toLowerCase().includes(cs.remark.toLowerCase())) return false;
      if (cs.follow_up && !l.follow_up?.includes(cs.follow_up)) return false;
      if (cs.source_file && !l.source_file?.toLowerCase().includes(cs.source_file.toLowerCase())) return false;
      return true;
    });
    out = [...out].sort((a,b) => {
      const av = a[sortBy]||'', bv = b[sortBy]||'';
      return sortDir==='asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return out;
  }, [leads, tab, cs, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged      = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const toggleSort = (col) => {
    if (sortBy===col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };
  const SortTh = ({ col, label, w, align }) => (
    <th onClick={() => toggleSort(col)} style={{ padding:'0.5rem 0.625rem', textAlign:align||'left', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', minWidth:w||100, borderRight:'1px solid var(--outline-variant)', background:'var(--surface-container-low)', position:'sticky', top:0, zIndex:1 }}>
      <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:'0.68rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {label}
        {sortBy===col
          ? <Icon name={sortDir==='asc'?'arrow_upward':'arrow_downward'} style={{fontSize:'0.7rem',color:'var(--primary)'}}/>
          : <Icon name="unfold_more" style={{fontSize:'0.7rem',opacity:0.25}}/>}
      </div>
    </th>
  );

  const hasCS = Object.values(cs).some(v=>v);

  const colInput = (key, ph) => (
    <input placeholder={ph||'Filter…'} value={cs[key]||''} onChange={e=>setCol(key,e.target.value)}
      onClick={e=>e.stopPropagation()}
      style={{ width:'100%', fontSize:'0.68rem', padding:'0.2rem 0.375rem', borderRadius:3, border:'1px solid var(--outline-variant)', background:'var(--surface)', color:'var(--on-surface)', fontFamily:'Inter,sans-serif', boxSizing:'border-box' }}/>
  );
  const statusFilter = (
    <select value={cs.status||''} onChange={e=>setCol('status',e.target.value)} onClick={e=>e.stopPropagation()}
      style={{ width:'100%', fontSize:'0.68rem', padding:'0.2rem 0.375rem', borderRadius:3, border:'1px solid var(--outline-variant)', background:'var(--surface)', color:'var(--on-surface)', fontFamily:'Inter,sans-serif' }}>
      <option value="">All</option>
      {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
    </select>
  );

  const greetHour = new Date().getHours();
  const greet = greetHour < 12 ? 'Good morning' : greetHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="fade-in">
      {/* ── Header ───────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.5rem' }}>
        <div>
          <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginBottom:'0.25rem' }}>{greet}, {user?.name?.split(' ')[0] || 'Kajal'} 👋</p>
          <h1 style={{ fontSize:'1.625rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>Sales Tracker</h1>
          <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>{new Date().toLocaleDateString('en-IN', {weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        <div style={{ display:'flex', gap:'0.625rem' }}>
          <a href="/sales/import" className="btn-secondary"><Icon name="upload_file" style={{fontSize:'1rem'}}/> Import</a>
          <a href="/sales/leads" className="btn-secondary"><Icon name="table_rows" style={{fontSize:'1rem'}}/> All Leads</a>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Icon name="add" style={{fontSize:'1rem',color:'#fff'}}/> Add Company
          </button>
        </div>
      </div>

      {/* ── File / Dataset Picker ─────────────────────── */}
      {sourceFiles.length > 0 && (
        <div style={{ marginBottom:'1.25rem', display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
            <Icon name="folder_open" style={{ fontSize:'1.1rem', color:'var(--primary)' }}/>
            <span style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--on-surface)' }}>Viewing:</span>
          </div>
          {/* All files option */}
          <button onClick={() => changeFile('all')} style={{
            padding:'0.35rem 0.875rem', borderRadius:9999, border: fileFilter==='all' ? 'none' : '1px solid var(--outline-variant)',
            cursor:'pointer', fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
            background: fileFilter==='all' ? 'var(--primary)' : 'transparent',
            color: fileFilter==='all' ? '#fff' : 'var(--on-surface-variant)',
            transition:'all 0.15s',
          }}>
            All Files ({leads.length})
          </button>
          {sourceFiles.map(f => {
            const count = leads.filter(l => l.source_file === f).length;
            // Shorten filename for display
            const display = f.length > 35 ? f.slice(0, 32) + '…' : f;
            return (
              <button key={f} onClick={() => changeFile(f)} title={f} style={{
                padding:'0.35rem 0.875rem', borderRadius:9999,
                border: fileFilter===f ? 'none' : '1px solid var(--outline-variant)',
                cursor:'pointer', fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
                background: fileFilter===f ? 'var(--primary)' : 'var(--surface-container-low)',
                color: fileFilter===f ? '#fff' : 'var(--on-surface-variant)',
                display:'inline-flex', alignItems:'center', gap:'0.375rem',
                transition:'all 0.15s',
              }}>
                <Icon name="description" style={{ fontSize:'0.875rem', color: fileFilter===f ? '#fff' : 'var(--primary)' }}/>
                {display}
                <span style={{ padding:'0.1rem 0.4rem', borderRadius:9999, fontSize:'0.7rem', fontWeight:700, background: fileFilter===f ? 'rgba(255,255,255,0.25)' : 'var(--surface-container)', color: fileFilter===f ? '#fff' : 'var(--on-surface-variant)' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Summary KPI row ───────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'0.75rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Companies',  value:summary.total,       icon:'business',      color:'#1d4ed8', bg:'#eff6ff' },
          { label:'Not Yet Contacted',value:summary.not_started, icon:'pending',        color:'#64748b', bg:'#f1f5f9' },
          { label:'Intro Sent',        value:summary.intro_sent,  icon:'send',           color:'#1d4ed8', bg:'#eff6ff' },
          { label:'Interested',        value:summary.interested,  icon:'thumb_up',       color:'#d97706', bg:'#fffbeb' },
          { label:'Follow-up Due',     value:summary.follow_due,  icon:'alarm',          color:'#dc2626', bg:'#fef2f2' },
          { label:'Won / Closed',      value:summary.won,         icon:'check_circle',   color:'#16a34a', bg:'#f0fdf4' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--surface-container-lowest)', border:'1px solid var(--outline-variant)', borderRadius:'0.75rem', padding:'0.875rem 1rem', display:'flex', gap:'0.75rem', alignItems:'center' }}>
            <div style={{ width:36, height:36, borderRadius:'0.5rem', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon name={s.icon} style={{ fontSize:'1.1rem', color:s.color }}/>
            </div>
            <div>
              <p style={{ fontSize:'1.375rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{s.value}</p>
              <p style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--on-surface-variant)', marginTop:2, lineHeight:1.2 }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Follow-up alert strip ─────────────────────── */}
      {summary.follow_due > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1.25rem', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'0.75rem', marginBottom:'1.25rem' }}>
          <Icon name="alarm" style={{ fontSize:'1.25rem', color:'#dc2626', flexShrink:0 }}/>
          <p style={{ fontSize:'0.875rem', fontWeight:600, color:'#b91c1c' }}>
            {summary.follow_due} compan{summary.follow_due===1?'y':'ies'} with overdue follow-ups — action needed today
          </p>
          <button onClick={() => { setCS(s=>({...s,status:'follow_up_needed'})); }} style={{ marginLeft:'auto', fontSize:'0.8125rem', padding:'0.3rem 0.875rem', borderRadius:9999, background:'#dc2626', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, fontFamily:'Inter,sans-serif' }}>
            Show them
          </button>
        </div>
      )}

      {/* ── Category tabs — like Excel sheet tabs ─────── */}
      <div style={{ display:'flex', gap:0, borderBottom:'2px solid var(--outline-variant)', marginBottom:0, overflowX:'auto' }}>
        {CATEGORY_TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setPage(1); }}
            style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.625rem 1.125rem', border:'none', borderBottom: tab===t.id ? '2px solid var(--primary)' : '2px solid transparent', cursor:'pointer', fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight: tab===t.id ? 700 : 500, color: tab===t.id ? 'var(--primary)' : 'var(--on-surface-variant)', background:'transparent', marginBottom:'-2px', whiteSpace:'nowrap', transition:'all 0.15s' }}>
            <Icon name={t.icon} style={{ fontSize:'1rem', color: tab===t.id ? 'var(--primary)' : 'var(--on-surface-variant)' }}/>
            {t.label}
            <span style={{ padding:'0.1rem 0.4rem', borderRadius:9999, fontSize:'0.7rem', fontWeight:700, background: tab===t.id ? 'rgba(0,74,198,0.1)' : 'var(--surface-container)', color: tab===t.id ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
              {tabCounts[t.id] || 0}
            </span>
          </button>
        ))}
        {hasCS && (
          <button onClick={() => setCS({ company:'', type:'', status:'', location:'', domain:'', c1_name:'', remark:'', follow_up:'', source_file:'' })}
            style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1rem', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight:600, color:'var(--error)', background:'transparent' }}>
            <Icon name="filter_alt_off" style={{ fontSize:'1rem' }}/> Clear filters
          </button>
        )}
      </div>

      {/* ── Excel-style data grid ─────────────────────── */}
      <div style={{ border:'1px solid var(--outline-variant)', borderTop:'none', borderRadius:'0 0 0.875rem 0.875rem', overflow:'hidden', background:'var(--surface-container-lowest)' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
            <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem', animation:'spin 1s linear infinite' }}/>
            Loading companies…
          </div>
        ) : (
          <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'calc(100vh - 340px)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem', tableLayout:'auto' }}>
              <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                {/* ── Column headers ── */}
                <tr>
                  <th style={{ padding:'0.5rem 0.75rem', width:36, background:'var(--surface-container-low)', borderRight:'1px solid var(--outline-variant)', position:'sticky', top:0 }}>
                    <span style={{ fontSize:'0.68rem', color:'var(--on-surface-variant)', fontWeight:700 }}>#</span>
                  </th>
                  <SortTh col="company"    label="Company Name"     w="180px"/>
                  <SortTh col="type"       label="Type"             w="120px"/>
                  <SortTh col="status"     label="Status"           w="130px"/>
                  <SortTh col="location"   label="Location"         w="110px"/>
                  <SortTh col="domain"     label="Domain / Focus"   w="140px"/>
                  <th style={{ padding:'0.5rem 0.625rem', minWidth:60, background:'var(--surface-container-low)', borderRight:'1px solid var(--outline-variant)', fontSize:'0.68rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Web</th>
                  <SortTh col="c1_name"    label="Contact Person 1" w="170px"/>
                  <th style={{ padding:'0.5rem 0.625rem', minWidth:170, background:'var(--surface-container-low)', borderRight:'1px solid var(--outline-variant)', fontSize:'0.68rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Contact Person 2</th>
                  <th style={{ padding:'0.5rem 0.625rem', minWidth:140, background:'var(--surface-container-low)', borderRight:'1px solid var(--outline-variant)', fontSize:'0.68rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Contact Person 3</th>
                  <SortTh col="remark"     label="Remark"           w="160px"/>
                  <SortTh col="follow_up"  label="Follow Up"        w="120px"/>
                  <SortTh col="source_file"label="Source File"      w="130px"/>
                  <th style={{ padding:'0.5rem 0.625rem', minWidth:80, background:'var(--surface-container-low)', position:'sticky', right:0, zIndex:2, textAlign:'right', fontSize:'0.68rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase' }}>Actions</th>
                </tr>
                {/* ── Per-column search row ── */}
                <tr style={{ background:'var(--surface-container)', borderBottom:'2px solid var(--outline-variant)' }}>
                  <th style={{ padding:'0.3rem 0.75rem', borderRight:'1px solid var(--outline-variant)' }}/>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('company','Company…')}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('type','Type…')}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{statusFilter}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('location','Location…')}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('domain','Domain…')}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}/>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('c1_name','Name…')}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}/>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}/>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('remark','Remark…')}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('follow_up','YYYY-MM-DD')}</th>
                  <th style={{ padding:'0.3rem 0.375rem', borderRight:'1px solid var(--outline-variant)' }}>{colInput('source_file','File…')}</th>
                  <th style={{ padding:'0.3rem 0.375rem' }}/>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 && (
                  <tr><td colSpan={14} style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
                    <Icon name="search_off" style={{ fontSize:'2.5rem', display:'block', margin:'0 auto 0.75rem', opacity:0.3 }}/>
                    <p style={{ fontWeight:600 }}>No companies found</p>
                    <p style={{ fontSize:'0.8125rem', marginTop:'0.25rem' }}>Try adjusting your filters or <a href="/sales/import" style={{ color:'var(--primary)' }}>import from Excel</a></p>
                  </td></tr>
                )}
                {paged.map((l, idx) => {
                  const isOverdue  = l.follow_up && l.follow_up < today;
                  const isDueToday = l.follow_up === today;
                  const sm         = STATUS_META[l.status] || STATUS_META.new;
                  const rowBg      = isOverdue  ? 'rgba(220,38,38,0.04)'
                                   : isDueToday ? 'rgba(234,88,12,0.04)' : 'var(--surface-container-lowest)';
                  return (
                    <tr key={l.id} style={{ borderBottom:'1px solid var(--outline-variant)', background:rowBg, transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,74,198,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                      {/* # */}
                      <td style={{ padding:'0.5rem 0.75rem', borderRight:'1px solid var(--surface-container)', color:'var(--on-surface-variant)', fontSize:'0.7rem', textAlign:'center' }}>
                        {(page-1)*PER_PAGE + idx + 1}
                      </td>
                      {/* Company */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)', minWidth:180 }}>
                        <p onClick={() => navigate(`/sales/leads/${l.id}`)} style={{ fontWeight:700, fontSize:'0.875rem', cursor:'pointer', color:'var(--on-surface)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:170, margin:0 }}>{l.company}</p>
                        {l.intro_sent && <p style={{ fontSize:'0.65rem', color:'var(--tertiary)', margin:0 }}>Intro: {l.intro_sent}</p>}
                      </td>
                      {/* Type */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)', maxWidth:120 }}>
                        <span style={{ fontSize:'0.72rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{l.type||'—'}</span>
                      </td>
                      {/* Status — inline */}
                      <td style={{ padding:'0.375rem 0.5rem', borderRight:'1px solid var(--surface-container)' }}>
                        <StatusBadge status={l.status} onChange={updateStatus} id={l.id}/>
                      </td>
                      {/* Location */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)', whiteSpace:'nowrap' }}>
                        <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{l.location||'—'}</span>
                      </td>
                      {/* Domain */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)', maxWidth:140 }}>
                        <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{l.domain||'—'}</span>
                      </td>
                      {/* Website */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)', textAlign:'center' }} onClick={e=>e.stopPropagation()}>
                        {l.website ? <a href={l.website.startsWith('http')?l.website:'https://'+l.website} target="_blank" rel="noreferrer" style={{ color:'var(--primary)', fontSize:'0.75rem', textDecoration:'none', display:'flex', alignItems:'center', gap:2, justifyContent:'center' }}><Icon name="open_in_new" style={{fontSize:'0.875rem'}}/></a> : <span style={{ color:'var(--outline)', fontSize:'0.75rem' }}>—</span>}
                      </td>
                      {/* Contact 1 */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)' }}>
                        <ContactCell name={l.c1_name} desig={l.c1_desig} email={l.c1_email} phone={l.c1_phone}/>
                      </td>
                      {/* Contact 2 */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)' }}>
                        <ContactCell name={l.c2_name} desig={l.c2_desig} email={l.c2_email} phone={l.c2_phone}/>
                      </td>
                      {/* Contact 3 */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)' }}>
                        <ContactCell name={l.c3_name} desig={''} email={l.c3_email} phone={''}/>
                      </td>
                      {/* Remark */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)', maxWidth:160 }}>
                        <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }} title={l.remark}>{l.remark||'—'}</span>
                      </td>
                      {/* Follow-up — inline date */}
                      <td style={{ padding:'0.375rem 0.5rem', borderRight:'1px solid var(--surface-container)', whiteSpace:'nowrap' }} onClick={e=>e.stopPropagation()}>
                        <input type="date" value={l.follow_up||''} onChange={e=>updateFollowUp(l.id,e.target.value)}
                          style={{ fontSize:'0.75rem', border:'none', background:'transparent', cursor:'pointer', fontFamily:'Inter,sans-serif', color:isOverdue?'#dc2626':isDueToday?'#ea580c':'var(--on-surface)', fontWeight:isOverdue||isDueToday?700:400, padding:0, outline:'none', width:'110px' }}/>
                      </td>
                      {/* Source file */}
                      <td style={{ padding:'0.5rem 0.625rem', borderRight:'1px solid var(--surface-container)', maxWidth:130 }}>
                        <span style={{ fontSize:'0.68rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }} title={l.source_file}>{l.source_file||'—'}</span>
                      </td>
                      {/* Actions */}
                      <td style={{ padding:'0.5rem 0.625rem', textAlign:'right', whiteSpace:'nowrap', position:'sticky', right:0, background:rowBg }} onClick={e=>e.stopPropagation()}>
                        <button className="btn-icon" title="Open" onClick={()=>navigate(`/sales/leads/${l.id}`)}><Icon name="open_in_new" style={{fontSize:'1rem'}}/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Footer / pagination ── */}
        {!loading && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1.25rem', borderTop:'1px solid var(--outline-variant)', background:'var(--surface-container-low)' }}>
            <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
              Showing <b>{Math.min((page-1)*PER_PAGE+1,filtered.length)}–{Math.min(page*PER_PAGE,filtered.length)}</b> of <b>{filtered.length}</b> companies
            </p>
            <div style={{ display:'flex', gap:'0.375rem' }}>
              <button className="btn-icon" disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{ opacity:page===1?0.35:1 }}><Icon name="chevron_left"/></button>
              {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((p,i,arr)=>(
                <React.Fragment key={p}>{i>0&&arr[i-1]!==p-1&&<span style={{alignSelf:'center',color:'var(--on-surface-variant)',fontSize:'0.875rem'}}>…</span>}
                <button onClick={()=>setPage(p)} style={{ width:32,height:32,borderRadius:'0.375rem',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.875rem',fontWeight:600,background:page===p?'var(--primary)':'transparent',color:page===p?'#fff':'var(--on-surface-variant)',transition:'all 0.15s' }}>{p}</button></React.Fragment>
              ))}
              <button className="btn-icon" disabled={page===totalPages||totalPages===0} onClick={()=>setPage(p=>p+1)} style={{ opacity:(page===totalPages||totalPages===0)?0.35:1 }}><Icon name="chevron_right"/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
