import React, { useState, useMemo, useEffect, useCallback } from 'react';
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

const SEGMENT_META = {
  staffing_partner: { label:'Staffing Partner', color:'#7c3aed' },
  end_client:       { label:'End Client',        color:'var(--tertiary)' },
  ireland_company:  { label:'Ireland Company',   color:'var(--primary)' },
  general:          { label:'General',           color:'var(--on-surface-variant)' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_META[status] || STATUS_META.new;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'0.2rem 0.625rem',
      borderRadius:9999, fontSize:'0.6875rem', fontWeight:700,
      background:s.bg, color:s.color, whiteSpace:'nowrap',
    }}>{s.label}</span>
  );
};

const SegmentBadge = ({ segment }) => {
  if (!segment) return null;
  const s = SEGMENT_META[segment] || { label: segment, color:'var(--on-surface-variant)' };
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'0.15rem 0.5rem',
      borderRadius:9999, fontSize:'0.625rem', fontWeight:600,
      background:'var(--surface-container)', color:s.color, whiteSpace:'nowrap',
      border:`1px solid ${s.color}33`,
    }}>{s.label}</span>
  );
};

// ── Add Company Modal ────────────────────────────────────────
const CONTACT_INIT = { name:'', designation:'', email:'', phone:'', linkedin:'' };

const AddCompanyModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({
    company:'', company_type:'', segment:'', hq_location:'', india_office:'',
    domain_focus:'', website:'', company_linkedin:'',
    status:'new', source:'', next_follow_up:'', notes:'',
  });
  const [cp1, setCp1] = useState({ ...CONTACT_INIT });
  const [cp2, setCp2] = useState({ ...CONTACT_INIT });
  const [cp3, setCp3] = useState({ ...CONTACT_INIT });
  const [saving, setSaving] = useState(false);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCp = (setter, k, v) => setter(c => ({ ...c, [k]: v }));

  const submit = async () => {
    if (!form.company.trim()) { alert('Company name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        company:          form.company,
        company_type:     form.company_type || null,
        segment:          form.segment || null,
        hq_location:      form.hq_location || null,
        india_office:     form.india_office || null,
        domain_focus:     form.domain_focus || null,
        website:          form.website || null,
        company_linkedin: form.company_linkedin || null,
        status:           form.status,
        source:           form.source || null,
        next_follow_up:   form.next_follow_up || null,
        notes:            form.notes || null,
        // CP1
        full_name:        cp1.name || null,
        job_title:        cp1.designation || null,
        email:            cp1.email || null,
        phone:            cp1.phone || null,
        linkedin_url:     cp1.linkedin || null,
        // CP2
        contact_person_2_name:        cp2.name || null,
        contact_person_2_designation: cp2.designation || null,
        contact_person_2_email:       cp2.email || null,
        contact_person_2_phone:       cp2.phone || null,
        contact_person_2_linkedin:    cp2.linkedin || null,
        // CP3
        contact_person_3_name:        cp3.name || null,
        contact_person_3_designation: cp3.designation || null,
        contact_person_3_email:       cp3.email || null,
        contact_person_3_phone:       cp3.phone || null,
        contact_person_3_linkedin:    cp3.linkedin || null,
      };
      const res = await leadsAPI.create(payload);
      onAdd(normalise(res.data));
      onClose();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to add company');
    } finally {
      setSaving(false);
    }
  };

  const ContactPersonSection = ({ label, values, setter }) => (
    <div style={{ marginTop:'0.5rem' }}>
      <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.625rem' }}>{label}</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
        {[
          { l:'Name',        k:'name',        t:'text' },
          { l:'Designation', k:'designation', t:'text' },
          { l:'Email',       k:'email',       t:'email' },
          { l:'Phone',       k:'phone',       t:'tel' },
          { l:'LinkedIn URL',k:'linkedin',    t:'url', span:2 },
        ].map(f => (
          <div key={f.k} style={{ gridColumn: f.span===2 ? '1/-1' : undefined }}>
            <label className="label">{f.l}</label>
            <input className="input" type={f.t} value={values[f.k]} onChange={e => setCp(setter, f.k, e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl" style={{ maxWidth:820, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <div>
            <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Add Company</h2>
            <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>Company is the primary entity — contacts are linked below</p>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {/* Company Details */}
        <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.75rem' }}>Company Information</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Company Name *</label>
            <input className="input" type="text" value={form.company} onChange={e => setF('company', e.target.value)} placeholder="e.g. Accenture Ireland" />
          </div>
          <div>
            <label className="label">Company Type</label>
            <select className="select" value={form.company_type} onChange={e => setF('company_type', e.target.value)}>
              <option value="">Select type…</option>
              {['Consulting','Technology','Recruitment Agency','Banking','Financial Services','MedTech','IT Consulting','Manufacturing','Pharma','Other'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Segment</label>
            <select className="select" value={form.segment} onChange={e => setF('segment', e.target.value)}>
              <option value="">Select segment…</option>
              <option value="staffing_partner">Staffing Partner</option>
              <option value="end_client">End Client</option>
              <option value="ireland_company">Ireland Company</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <label className="label">HQ Location (Irish)</label>
            <input className="input" type="text" value={form.hq_location} onChange={e => setF('hq_location', e.target.value)} placeholder="e.g. Dublin, Cork, Galway" />
          </div>
          <div>
            <label className="label">India Office(s)</label>
            <input className="input" type="text" value={form.india_office} onChange={e => setF('india_office', e.target.value)} placeholder="e.g. Hyderabad (Kukatpally)" />
          </div>
          <div>
            <label className="label">Domain Focus / Skills</label>
            <input className="input" type="text" value={form.domain_focus} onChange={e => setF('domain_focus', e.target.value)} placeholder="e.g. SAP, Analytics, AI, ERP" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="select" value={form.status} onChange={e => setF('status', e.target.value)}>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Website</label>
            <input className="input" type="url" value={form.website} onChange={e => setF('website', e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="label">Company LinkedIn</label>
            <input className="input" type="url" value={form.company_linkedin} onChange={e => setF('company_linkedin', e.target.value)} placeholder="https://linkedin.com/company/…" />
          </div>
          <div>
            <label className="label">Source / Lead From</label>
            <input className="input" type="text" value={form.source} onChange={e => setF('source', e.target.value)} placeholder="e.g. LinkedIn, Referral, Import" />
          </div>
          <div>
            <label className="label">Next Follow-up Date</label>
            <input className="input" type="date" value={form.next_follow_up} onChange={e => setF('next_follow_up', e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Notes / Remarks</label>
            <textarea className="textarea" rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Any remarks about this company…" />
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin:'1.25rem 0', height:1, background:'var(--outline-variant)' }} />

        {/* Contact Persons */}
        <ContactPersonSection label="Contact Person 1" values={cp1} setter={setCp1} />
        <div style={{ margin:'1rem 0', height:1, background:'var(--surface-container)' }} />
        <ContactPersonSection label="Contact Person 2" values={cp2} setter={setCp2} />
        <div style={{ margin:'1rem 0', height:1, background:'var(--surface-container)' }} />
        <ContactPersonSection label="Contact Person 3" values={cp3} setter={setCp3} />

        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.75rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            <Icon name="business" style={{ fontSize:'1rem', color:'#fff' }} />
            {saving ? 'Saving…' : 'Add Company'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Normalise API response ──────────────────────────────────
const normalise = (l) => ({
  id:               l.id,
  // Company
  company:          l.company || l.full_name || '—',
  company_type:     l.company_type || '',
  company_linkedin: l.company_linkedin || '',
  hq_location:      l.hq_location || l.address || '',
  india_office:     l.india_office || '',
  segment:          l.segment || '',
  domain_focus:     l.domain_focus || l.industry || '',
  website:          l.website || '',
  status:           l.status || 'new',
  source:           l.source || '',
  source_file:      l.source_file || '',
  next_follow_up:   l.next_follow_up || '',
  intro_sent:       l.intro_sent || '',
  notes:            l.notes || '',
  solution_skills:  l.solution_skills || '',
  turnover_headcount: l.turnover_headcount || '',
  linkedin_invite_sent:     l.linkedin_invite_sent || false,
  linkedin_invite_accepted: l.linkedin_invite_accepted || false,
  lead_share_date:          l.lead_share_date || '',
  created_at:       l.created_at?.slice(0, 10) || '',
  deal_value:       l.deal_value || 0,
  // Contact Person 1
  cp1_name:         l.full_name || '',
  cp1_designation:  l.job_title || '',
  cp1_email:        l.email || '',
  cp1_phone:        l.phone || '',
  cp1_linkedin:     l.linkedin_url || '',
  // Contact Person 2
  cp2_name:         l.contact_person_2_name || '',
  cp2_designation:  l.contact_person_2_designation || '',
  cp2_email:        l.contact_person_2_email || '',
  cp2_phone:        l.contact_person_2_phone || '',
  cp2_linkedin:     l.contact_person_2_linkedin || '',
  // Contact Person 3
  cp3_name:         l.contact_person_3_name || '',
  cp3_designation:  l.contact_person_3_designation || '',
  cp3_email:        l.contact_person_3_email || '',
  cp3_phone:        l.contact_person_3_phone || '',
  cp3_linkedin:     l.contact_person_3_linkedin || '',
});

// ── Main Component ──────────────────────────────────────────
export default function LeadsList() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [selected, setSelected]   = useState(new Set());
  const [sortBy, setSortBy]       = useState('created_at');
  const [sortDir, setSortDir]     = useState('desc');
  const [page, setPage]           = useState(1);
  const [statusView, setStatusView]   = useState('all');
  const [segmentView, setSegmentView] = useState('all');
  const [fileFilter, setFileFilter]   = useState('all');
  const PER_PAGE = 25;

  // Per-column search
  const [cs, setColS] = useState({
    company:'', company_type:'', hq_location:'', domain_focus:'', status:'',
    cp1_name:'', cp1_email:'', cp2_name:'', cp3_name:'',
    next_follow_up:'', source_file:'', source:'',
  });
  const setCS = (k, v) => { setColS(s => ({ ...s, [k]: v })); setPage(1); };
  const hasCS = Object.values(cs).some(v => v);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const q = p.get('q'); if (q) setCS('company', q);
  }, [location.search]);

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await leadsAPI.getAll({ limit: 1000 });
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.leads)   ? res.data.leads
        : Array.isArray(res.data?.data)    ? res.data.data : [];
      setLeads(data.map(normalise));
    } catch { setError('Failed to load companies.'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const sourceFiles = useMemo(() =>
    [...new Set(leads.map(l => l.source_file).filter(Boolean))].sort()
  , [leads]);

  const filtered = useMemo(() => {
    let out = leads.filter(l => {
      if (fileFilter !== 'all' && l.source_file !== fileFilter) return false;
      if (statusView !== 'all' && l.status !== statusView) return false;
      if (segmentView !== 'all' && l.segment !== segmentView) return false;
      const q = (field) => !field || true; // helper
      if (cs.company      && !l.company?.toLowerCase().includes(cs.company.toLowerCase())) return false;
      if (cs.company_type && !l.company_type?.toLowerCase().includes(cs.company_type.toLowerCase())) return false;
      if (cs.hq_location  && !l.hq_location?.toLowerCase().includes(cs.hq_location.toLowerCase())) return false;
      if (cs.domain_focus && !l.domain_focus?.toLowerCase().includes(cs.domain_focus.toLowerCase())) return false;
      if (cs.cp1_name     && !l.cp1_name?.toLowerCase().includes(cs.cp1_name.toLowerCase())) return false;
      if (cs.cp1_email    && !l.cp1_email?.toLowerCase().includes(cs.cp1_email.toLowerCase())) return false;
      if (cs.cp2_name     && !l.cp2_name?.toLowerCase().includes(cs.cp2_name.toLowerCase())) return false;
      if (cs.cp3_name     && !l.cp3_name?.toLowerCase().includes(cs.cp3_name.toLowerCase())) return false;
      if (cs.status       && !l.status?.toLowerCase().includes(cs.status.toLowerCase())) return false;
      if (cs.source_file  && !l.source_file?.toLowerCase().includes(cs.source_file.toLowerCase())) return false;
      if (cs.source       && !l.source?.toLowerCase().includes(cs.source.toLowerCase())) return false;
      if (cs.next_follow_up && !l.next_follow_up?.includes(cs.next_follow_up)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      const av = a[sortBy] || '', bv = b[sortBy] || '';
      if (sortBy === 'deal_value') return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return out;
  }, [leads, statusView, segmentView, fileFilter, cs, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };
  const SortIcon = ({ col }) => sortBy === col
    ? <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} style={{ fontSize:'0.7rem', color:'var(--primary)' }} />
    : <Icon name="unfold_more" style={{ fontSize:'0.7rem', opacity:0.3 }} />;

  // Status summary counts
  const statusCounts = useMemo(() => {
    const out = { all: leads.length };
    Object.keys(STATUS_META).forEach(k => { out[k] = leads.filter(l => l.status === k).length; });
    return out;
  }, [leads]);

  // Segment counts
  const segCounts = useMemo(() => {
    const out = { all: leads.length };
    Object.keys(SEGMENT_META).forEach(k => { out[k] = leads.filter(l => l.segment === k).length; });
    return out;
  }, [leads]);

  const deleteSelected = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} company record(s)? This cannot be undone.`)) return;
    for (const id of selected) {
      try { await leadsAPI.delete(id); } catch {}
    }
    setLeads(prev => prev.filter(l => !selected.has(l.id)));
    setSelected(new Set());
  };

  const th = (label, col, minW = 80) => (
    <th style={{ padding:'0.5rem 0.75rem', textAlign:'left', fontSize:'0.6875rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', cursor:'pointer', minWidth:minW }}
        onClick={() => col && toggleSort(col)}>
      {label} {col && <SortIcon col={col} />}
    </th>
  );

  const SearchInput = ({ col, placeholder, width = 100 }) => (
    <input
      value={cs[col] || ''}
      onChange={e => setCS(col, e.target.value)}
      placeholder={placeholder || '🔍'}
      style={{ width, padding:'0.2rem 0.4rem', fontSize:'0.6875rem', border:'1px solid var(--outline-variant)', borderRadius:'0.25rem', background:'var(--surface-container-lowest)', color:'var(--on-surface)', outline:'none' }}
    />
  );

  if (error) return (
    <div className="card" style={{ textAlign:'center', padding:'3rem', color:'var(--error)' }}>
      <Icon name="error" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} />
      {error}
      <br /><button className="btn-secondary" style={{ marginTop:'1rem' }} onClick={fetchLeads}>Retry</button>
    </div>
  );

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div>
          <h1 style={{ fontSize:'1.375rem', fontWeight:800, color:'var(--on-surface)' }}>Sales — Companies</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>
            {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
            {hasCS || statusView !== 'all' || segmentView !== 'all' ? ' (filtered)' : ''}
          </p>
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center' }}>
          {selected.size > 0 && (
            <button onClick={deleteSelected} className="btn-secondary" style={{ color:'var(--error)', borderColor:'var(--error)' }}>
              <Icon name="delete" style={{ fontSize:'1rem' }} /> Delete ({selected.size})
            </button>
          )}
          {hasCS && (
            <button onClick={() => { setColS(Object.fromEntries(Object.keys(cs).map(k=>[k,'']))); setStatusView('all'); setSegmentView('all'); setFileFilter('all'); }} className="btn-ghost" style={{ fontSize:'0.8125rem' }}>
              <Icon name="filter_alt_off" style={{ fontSize:'1rem' }} /> Clear Filters
            </button>
          )}
          <button onClick={() => navigate('/sales/import')} className="btn-secondary">
            <Icon name="upload_file" style={{ fontSize:'1rem' }} /> Import Sheet
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Icon name="add_business" style={{ fontSize:'1rem', color:'#fff' }} /> Add Company
          </button>
        </div>
      </div>

      {/* Segment filter tabs */}
      <div style={{ display:'flex', gap:'0.375rem', marginBottom:'0.875rem', flexWrap:'wrap' }}>
        {[['all','All'], ...Object.entries(SEGMENT_META).map(([k,v]) => [k, v.label])].map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setSegmentView(key); setPage(1); }}
            style={{
              padding:'0.3125rem 0.875rem', borderRadius:9999, border:'none', cursor:'pointer',
              fontSize:'0.8125rem', fontWeight: segmentView === key ? 700 : 400,
              background: segmentView === key ? 'var(--primary)' : 'var(--surface-container)',
              color: segmentView === key ? '#fff' : 'var(--on-surface-variant)',
              transition:'all 0.15s',
            }}
          >
            {label}
            <span style={{ marginLeft:'0.375rem', fontSize:'0.6875rem', opacity:0.8 }}>
              ({segCounts[key] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div style={{ display:'flex', gap:'0.375rem', marginBottom:'1rem', flexWrap:'wrap' }}>
        {[['all','All'], ...Object.entries(STATUS_META).map(([k,v]) => [k, v.label])].map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setStatusView(key); setPage(1); }}
            style={{
              padding:'0.25rem 0.75rem', borderRadius:9999, border:'1px solid transparent', cursor:'pointer',
              fontSize:'0.75rem', fontWeight: statusView === key ? 700 : 400,
              background: statusView === key ? (STATUS_META[key]?.bg || 'var(--primary)') : 'transparent',
              color: statusView === key ? (STATUS_META[key]?.color || '#fff') : 'var(--on-surface-variant)',
              borderColor: statusView === key ? (STATUS_META[key]?.color || 'var(--primary)') + '44' : 'transparent',
            }}
          >
            {label} <span style={{ opacity:0.7 }}>({statusCounts[key] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* File filter */}
      {sourceFiles.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.875rem' }}>
          <Icon name="table_chart" style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
          <select
            className="select" style={{ fontSize:'0.8125rem', padding:'0.3125rem 0.5rem', width:'auto' }}
            value={fileFilter} onChange={e => { setFileFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Files</option>
            {sourceFiles.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />
          Loading companies…
        </div>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--outline-variant)', background:'var(--surface-container-low)' }}>
                  <th style={{ padding:'0.5rem 0.75rem', width:36 }}>
                    <input type="checkbox"
                      checked={selected.size === paged.length && paged.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(paged.map(l=>l.id)) : new Set())}
                    />
                  </th>
                  {th('Company', 'company', 160)}
                  {th('Type', 'company_type', 100)}
                  {th('Location', 'hq_location', 100)}
                  {th('Domain / Skills', 'domain_focus', 120)}
                  {th('Contact 1', 'cp1_name', 120)}
                  {th('Email 1', 'cp1_email', 140)}
                  {th('Contact 2', 'cp2_name', 110)}
                  {th('Status', 'status', 100)}
                  {th('Follow-up', 'next_follow_up', 90)}
                  {th('Segment', 'segment', 110)}
                  <th style={{ padding:'0.5rem 0.75rem', width:40 }} />
                </tr>
                {/* Per-column search row */}
                <tr style={{ background:'var(--surface-container-lowest)', borderBottom:'1px solid var(--outline-variant)' }}>
                  <td />
                  <td style={{ padding:'0.25rem 0.75rem' }}><SearchInput col="company" width={140} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="company_type" width={80} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="hq_location" width={80} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="domain_focus" width={100} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="cp1_name" width={100} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="cp1_email" width={120} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="cp2_name" width={90} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="status" width={80} /></td>
                  <td style={{ padding:'0.25rem 0.5rem' }}><SearchInput col="next_follow_up" width={80} /></td>
                  <td colSpan={2} />
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding:'3rem', textAlign:'center', color:'var(--on-surface-variant)' }}>
                      <Icon name="domain_disabled" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.3 }} />
                      No companies found.
                    </td>
                  </tr>
                )}
                {paged.map((l, ri) => (
                  <tr
                    key={l.id}
                    onClick={() => navigate(`/sales/leads/${l.id}`)}
                    style={{
                      cursor:'pointer', borderBottom:'1px solid var(--outline-variant)',
                      background: selected.has(l.id) ? 'rgba(0,74,198,0.06)' : ri%2===0 ? 'transparent' : 'var(--surface-container-lowest)',
                      transition:'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container)'}
                    onMouseLeave={e => e.currentTarget.style.background = selected.has(l.id) ? 'rgba(0,74,198,0.06)' : ri%2===0 ? 'transparent' : 'var(--surface-container-lowest)'}
                  >
                    <td style={{ padding:'0.625rem 0.75rem' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={e => {
                          const s = new Set(selected);
                          e.target.checked ? s.add(l.id) : s.delete(l.id);
                          setSelected(s);
                        }}
                      />
                    </td>
                    <td style={{ padding:'0.625rem 0.75rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                        <div style={{
                          width:30, height:30, borderRadius:'50%', flexShrink:0,
                          background:'linear-gradient(135deg,var(--primary-container),var(--secondary-container))',
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          <Icon name="business" style={{ fontSize:'0.875rem', color:'var(--primary)' }} />
                        </div>
                        <div style={{ minWidth:0 }}>
                          <p style={{ fontWeight:600, color:'var(--on-surface)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:140 }}>{l.company}</p>
                          {l.website && (
                            <a href={l.website} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize:'0.6875rem', color:'var(--primary)', textDecoration:'none' }}>
                              {l.website.replace(/^https?:\/\//, '').split('/')[0]}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>
                      {l.company_type || '—'}
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>
                      {l.hq_location || '—'}
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem', color:'var(--on-surface-variant)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {l.domain_focus || '—'}
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem' }}>
                      {l.cp1_name ? (
                        <div>
                          <p style={{ fontWeight:500 }}>{l.cp1_name}</p>
                          {l.cp1_designation && <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)' }}>{l.cp1_designation}</p>}
                        </div>
                      ) : <span style={{ color:'var(--outline)' }}>—</span>}
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem' }}>
                      {l.cp1_email ? (
                        <a href={`mailto:${l.cp1_email}`} onClick={e => e.stopPropagation()}
                          style={{ color:'var(--primary)', textDecoration:'none', fontSize:'0.8125rem' }}>
                          {l.cp1_email}
                        </a>
                      ) : <span style={{ color:'var(--outline)' }}>—</span>}
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem', color:'var(--on-surface-variant)' }}>
                      {l.cp2_name || <span style={{ color:'var(--outline)' }}>—</span>}
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem' }}><StatusBadge status={l.status} /></td>
                    <td style={{ padding:'0.625rem 0.5rem', color: l.next_follow_up && l.next_follow_up < new Date().toISOString().slice(0,10) ? 'var(--error)' : 'var(--on-surface-variant)', whiteSpace:'nowrap', fontWeight: l.next_follow_up ? 500 : 400 }}>
                      {l.next_follow_up || '—'}
                    </td>
                    <td style={{ padding:'0.625rem 0.5rem' }}><SegmentBadge segment={l.segment} /></td>
                    <td style={{ padding:'0.625rem 0.5rem' }} onClick={e => e.stopPropagation()}>
                      <button className="btn-icon" onClick={() => navigate(`/sales/leads/${l.id}`)} style={{ opacity:0.6 }}>
                        <Icon name="open_in_new" style={{ fontSize:'1rem' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1rem', borderTop:'1px solid var(--outline-variant)', background:'var(--surface-container-lowest)' }}>
              <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
                Page {page} of {totalPages} · {filtered.length} total
              </p>
              <div style={{ display:'flex', gap:'0.375rem' }}>
                <button className="btn-secondary" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={{ padding:'0.375rem 0.75rem', fontSize:'0.8125rem' }}>← Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pn = Math.max(1, Math.min(page-2, totalPages-4)) + i;
                  return pn <= totalPages ? (
                    <button key={pn} onClick={() => setPage(pn)} style={{
                      padding:'0.375rem 0.625rem', fontSize:'0.8125rem', border:'none', borderRadius:'0.375rem',
                      background: pn===page ? 'var(--primary)' : 'var(--surface-container)',
                      color: pn===page ? '#fff' : 'var(--on-surface)', cursor:'pointer',
                    }}>{pn}</button>
                  ) : null;
                })}
                <button className="btn-secondary" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} style={{ padding:'0.375rem 0.75rem', fontSize:'0.8125rem' }}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showAdd && <AddCompanyModal onClose={() => setShowAdd(false)} onAdd={l => setLeads(prev => [l, ...prev])} />}
    </div>
  );
}
