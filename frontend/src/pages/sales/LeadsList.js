import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { leadsAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

/* ── Phone popup ───────────────────────────────────── */
const PhonePopup = ({ phone, onClose }) => {
  const [copied, setCopied] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  const copy = () => {
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div ref={ref} style={{
      position:'absolute', zIndex:100, right:0, top:'calc(100% + 6px)',
      background:'var(--surface-container-lowest)', border:'1px solid var(--outline-variant)',
      borderRadius:'0.625rem', padding:'0.875rem 1rem', boxShadow:'0 4px 16px rgba(0,0,0,0.12)',
      minWidth:200, display:'flex', flexDirection:'column', gap:'0.5rem',
    }}>
      <p style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em', margin:0 }}>Phone Number</p>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <span style={{ fontSize:'0.95rem', fontWeight:600, color:'var(--on-surface)' }}>{phone || '—'}</span>
        {phone && (
          <button onClick={copy} title="Copy" style={{ background:'none', border:'1px solid var(--outline-variant)', borderRadius:'0.375rem', padding:'0.2rem 0.5rem', cursor:'pointer', fontSize:'0.7rem', color:'var(--primary)', fontWeight:600 }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
      {!phone && <p style={{ fontSize:'0.8rem', color:'var(--on-surface-variant)', margin:0 }}>No phone number on record</p>}
    </div>
  );
};

/* ── Status helpers ─────────────────────────────────── */
const STATUS_MAP = {
  new:              { label: 'New',             cls: 'chip-new' },
  contacted:        { label: 'Contacted',       cls: 'chip-contacted' },
  called:           { label: 'Called',          cls: 'chip-called' },
  interested:       { label: 'Interested',      cls: 'chip-interested' },
  closed:           { label: 'Closed',          cls: 'chip-closed' },
  completed:        { label: 'Completed',       cls: 'chip-completed' },
  rejected:         { label: 'Rejected',        cls: 'chip-rejected' },
  lost:             { label: 'Lost',            cls: 'chip-lost' },
  follow_up_needed: { label: 'Follow-up',       cls: 'chip-follow-up' },
};

const Chip = ({ status }) => {
  const s = STATUS_MAP[status] || { label: status, cls: 'chip-new' };
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
};

const SOURCE_COLORS = {
  Apollo: 'var(--primary)', 'CSV Import': 'var(--tertiary)',
  Manual: 'var(--amber)', LinkedIn: '#0077b5', Other: 'var(--outline)',
};

/* ── Seed data ──────────────────────────────────────── */
// Leads loaded from API

const STATUSES = ['all', ...Object.keys(STATUS_MAP)];
const SOURCES  = ['all', 'Apollo', 'CSV Import', 'Manual', 'LinkedIn'];

/* ── Add Lead Modal ─────────────────────────────────── */
const AddLeadModal = ({ onClose, onAdd }) => {
  // uses leadsAPI from outer scope
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', company: '', job_title: '',
    source: 'Manual', status: 'new', notes: '', next_follow_up: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.full_name.trim()) return;
    try {
      const res = await leadsAPI.create({
        full_name:      form.full_name,
        email:          form.email   || null,
        phone:          form.phone   || null,
        company:        form.company || null,
        job_title:      form.job_title || null,
        source:         form.source,
        status:         form.status,
        notes:          form.notes   || null,
        next_follow_up: form.next_follow_up || null,
      });
      onAdd(res.data);
      onClose();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to add lead');
    }
  };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700, color:'var(--on-surface)' }}>Add New Lead</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {[
            { label:'Full Name *', key:'full_name', type:'text', span:2 },
            { label:'Email',       key:'email',     type:'email' },
            { label:'Phone',       key:'phone',     type:'tel' },
            { label:'Company',     key:'company',   type:'text' },
            { label:'Job Title',   key:'job_title', type:'text' },
          ].map(f => (
            <div key={f.key} style={{ gridColumn: f.span === 2 ? '1/-1' : undefined }}>
              <label className="label">{f.label}</label>
              <input className="input" type={f.type} value={form[f.key]} onChange={e => set(f.key, e.target.value)} />
            </div>
          ))}

          <div>
            <label className="label">Source</label>
            <select className="select" value={form.source} onChange={e => set('source', e.target.value)}>
              {SOURCES.filter(s => s !== 'all').map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Follow-up Date</label>
            <input className="input" type="date" value={form.next_follow_up} onChange={e => set('next_follow_up', e.target.value)} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="label">Notes</label>
            <textarea className="textarea" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>
            <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Lead
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ─────────────────────────────────── */
export default function LeadsList() {
  const navigate = useNavigate();
  const location = useLocation();
  // Pick up ?q= search from top bar
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) setSearch(q);
  }, [location.search]);
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatus] = useState('all');
  const [sourceFilter, setSource] = useState('all');
  const [sortBy, setSortBy]     = useState('created_at');
  const [sortDir, setSortDir]   = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [showAdd, setShowAdd]   = useState(false);
  const [page, setPage]         = useState(1);
  const [phonePopup, setPhonePopup] = useState(null);
  const PER_PAGE = 8;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leadsAPI.getAll({ limit:500 });
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setLeads(data);
    } catch { /* show empty state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* Filter + sort */
  const filtered = useMemo(() => {
    let out = leads.filter(l => {
      const q = search.toLowerCase();
      const matchQ = !q || [l.full_name, l.company, l.email, l.job_title].some(f => f?.toLowerCase().includes(q));
      const matchS = statusFilter === 'all' || l.status === statusFilter;
      const matchSrc = sourceFilter === 'all' || l.source === sourceFilter;
      return matchQ && matchS && matchSrc;
    });
    out = [...out].sort((a, b) => {
      const av = a[sortBy] || '', bv = b[sortBy] || '';
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return out;
  }, [leads, search, statusFilter, sourceFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map(l => l.id)));
  };

  const SortIcon = ({ col }) => (
    sortBy === col
      ? <Icon name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} style={{ fontSize:'0.875rem', color:'var(--primary)' }} />
      : <Icon name="unfold_more" style={{ fontSize:'0.875rem', opacity:0.3 }} />
  );

  const overdue = leads.filter(l => l.next_follow_up && l.next_follow_up < new Date().toISOString().slice(0,10) && !['closed','completed','rejected','lost'].includes(l.status)).length;

  return (
    <div className="fade-in">
      {loading && <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}><Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />Loading leads…</div>}
      {!loading && <>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Leads</h1>
        </div>
        <div style={{ display:'flex', gap:'0.625rem' }}>
          <a href="/sales/import" className="btn-secondary">
            <Icon name="upload_file" style={{ fontSize:'1rem' }} /> Import CSV
          </a>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Icon name="person_add" style={{ fontSize:'1rem', color:'#fff' }} /> Add Lead
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Leads',    value: leads.length,                                                       icon:'group',          color:'var(--primary)' },
          { label:'Interested',     value: leads.filter(l=>l.status==='interested').length,                    icon:'thumb_up',       color:'var(--tertiary)' },
          { label:'Follow-up Due',  value: overdue,                                                            icon:'schedule',       color:'var(--amber)' },
          { label:'Closed',         value: leads.filter(l=>['closed','completed'].includes(l.status)).length,  icon:'check_circle',   color:'var(--tertiary)' },
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

      {/* Filters bar */}
      <div className="card" style={{ padding:'1rem 1.25rem', marginBottom:'1rem' }}>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
          {/* Search */}
          <div className="search-bar" style={{ maxWidth:280, flex:'1 1 auto' }}>
            <Icon name="search" style={{ position:'absolute', left:'0.625rem', top:'50%', transform:'translateY(-50%)', color:'var(--on-surface-variant)', fontSize:'1.1rem' }} />
            <input
              placeholder="Search leads…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ paddingLeft:'2.25rem', width:'100%' }}
            />
          </div>

          {/* Status filter pills */}
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', flex:'2 1 auto' }}>
            {['all','new','contacted','interested','closed','follow_up_needed','rejected'].map(s => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                style={{
                  padding:'0.3rem 0.75rem', borderRadius:9999, border:'none', cursor:'pointer',
                  fontSize:'0.8125rem', fontWeight:600, fontFamily:'Inter,sans-serif',
                  background: statusFilter===s ? 'var(--primary)' : 'var(--surface-container-low)',
                  color: statusFilter===s ? '#fff' : 'var(--on-surface-variant)',
                  transition:'all 0.15s ease',
                }}
              >
                {s === 'all' ? 'All' : STATUS_MAP[s]?.label || s}
              </button>
            ))}
          </div>

          {/* Source + sort */}
          <div style={{ display:'flex', gap:'0.5rem', flexShrink:0 }}>
            <select className="select" style={{ width:'auto', minWidth:130 }} value={sourceFilter} onChange={e => { setSource(e.target.value); setPage(1); }}>
              {SOURCES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Sources' : s}</option>)}
            </select>
          </div>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.875rem', padding:'0.625rem 0.875rem', background:'var(--surface-container)', borderRadius:'0.5rem' }}>
            <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--primary)' }}>{selected.size} selected</span>
            <button className="btn-secondary" style={{ fontSize:'0.8125rem', padding:'0.25rem 0.75rem' }}>
              <Icon name="edit" style={{ fontSize:'1rem' }} /> Bulk Update Status
            </button>
            <button className="btn-secondary" style={{ fontSize:'0.8125rem', padding:'0.25rem 0.75rem' }}>
              <Icon name="download" style={{ fontSize:'1rem' }} /> Export Selected
            </button>
            <button className="btn-ghost" style={{ fontSize:'0.8125rem', color:'var(--error)', marginLeft:'auto' }}
              onClick={() => { setLeads(ls => ls.filter(l => !selected.has(l.id))); setSelected(new Set()); }}>
              <Icon name="delete" style={{ fontSize:'1rem', color:'var(--error)' }} /> Delete
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
                <th style={{ padding:'0.875rem 1.25rem', textAlign:'left', width:44 }}>
                  <input type="checkbox" checked={selected.size===paged.length && paged.length>0}
                    onChange={toggleAll} style={{ cursor:'pointer', width:16, height:16, accentColor:'var(--primary)' }} />
                </th>
                {[
                  { label:'Name',      key:'full_name' },
                  { label:'Company',   key:'company' },
                  { label:'Title',     key:'job_title' },
                  { label:'Source',    key:'source' },
                  { label:'Status',    key:'status' },
                  { label:'Follow-up', key:'next_follow_up' },
                  { label:'Added',     key:'created_at' },
                ].map(col => (
                  <th key={col.key} style={{ padding:'0.875rem 1rem', textAlign:'left', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
                    onClick={() => toggleSort(col.key)}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.25rem' }}>
                      {col.label} <SortIcon col={col.key} />
                    </div>
                  </th>
                ))}
                <th style={{ padding:'0.875rem 1rem', textAlign:'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign:'center', padding:'3rem', color:'var(--on-surface-variant)' }}>
                    <Icon name="search_off" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} />
                    No leads match your filters.
                  </td>
                </tr>
              )}
              {paged.map(lead => {
                const isOver = lead.next_follow_up && lead.next_follow_up < new Date().toISOString().slice(0,10) && !['closed','completed','rejected','lost'].includes(lead.status);
                const initials = lead.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                return (
                  <tr
                    key={lead.id}
                    onClick={() => navigate(`/sales/leads/${lead.id}`)}
                    style={{ cursor:'pointer' }}
                  >
                    <td style={{ padding:'0.875rem 1.25rem' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(lead.id)}
                        onChange={() => setSelected(s => { const n=new Set(s); n.has(lead.id)?n.delete(lead.id):n.add(lead.id); return n; })}
                        style={{ cursor:'pointer', width:16, height:16, accentColor:'var(--primary)' }} />
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                        <div className="avatar" style={{ width:34, height:34, fontSize:'0.6875rem', background:'var(--surface-container)', color:'var(--primary)', fontWeight:700 }}>
                          {initials}
                        </div>
                        <div>
                          <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--on-surface)' }}>{lead.full_name}</p>
                          <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'0.875rem 1rem', fontWeight:500 }}>{lead.company || '—'}</td>
                    <td style={{ padding:'0.875rem 1rem', color:'var(--on-surface-variant)', fontSize:'0.8125rem' }}>{lead.job_title || '—'}</td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:'0.25rem',
                        fontSize:'0.75rem', fontWeight:600, padding:'0.175rem 0.5rem', borderRadius:4,
                        background:`${SOURCE_COLORS[lead.source] || 'var(--outline)'}14`,
                        color: SOURCE_COLORS[lead.source] || 'var(--outline)',
                      }}>{lead.source}</span>
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}><Chip status={lead.status} /></td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      {lead.next_follow_up ? (
                        <span style={{ fontSize:'0.8125rem', fontWeight:500, color: isOver ? 'var(--error)' : 'var(--on-surface-variant)', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                          {isOver && <Icon name="warning" style={{ fontSize:'0.875rem', color:'var(--error)' }} />}
                          {lead.next_follow_up}
                        </span>
                      ) : <span style={{ color:'var(--on-surface-variant)', opacity:0.4 }}>—</span>}
                    </td>
                    <td style={{ padding:'0.875rem 1rem', color:'var(--on-surface-variant)', fontSize:'0.8125rem' }}>{lead.created_at}</td>
                    <td style={{ padding:'0.875rem 1rem', textAlign:'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'0.25rem', justifyContent:'flex-end' }}>
                        <button className="btn-icon" title="View" onClick={() => navigate(`/sales/leads/${lead.id}`)}>
                          <Icon name="open_in_new" style={{ fontSize:'1rem' }} />
                        </button>
                        <div style={{ position:'relative' }}>
                          <button className="btn-icon" title="Show phone number" onClick={(e) => { e.stopPropagation(); setPhonePopup(phonePopup === lead.id ? null : lead.id); }}>
                            <Icon name="phone" style={{ fontSize:'1rem' }} />
                          </button>
                          {phonePopup === lead.id && <PhonePopup phone={lead.phone} onClose={() => setPhonePopup(null)} />}
                        </div>
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="btn-icon" title="Open email client" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }} onClick={e => e.stopPropagation()}>
                            <Icon name="mail" style={{ fontSize:'1rem' }} />
                          </a>
                        )}
                        {!lead.email && (
                          <button className="btn-icon" title="No email on record" disabled style={{ opacity:0.35 }}>
                            <Icon name="mail" style={{ fontSize:'1rem' }} />
                          </button>
                        )}
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
            Showing <b>{(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)}</b> of <b>{filtered.length}</b> leads
          </p>
          <div style={{ display:'flex', gap:'0.375rem' }}>
            <button className="btn-icon" disabled={page===1} onClick={() => setPage(p=>p-1)} style={{ opacity:page===1?0.35:1 }}>
              <Icon name="chevron_left" />
            </button>
            {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((p,i,arr)=>(
              <React.Fragment key={p}>
                {i>0 && arr[i-1]!==p-1 && <span style={{ alignSelf:'center', color:'var(--on-surface-variant)', fontSize:'0.875rem' }}>…</span>}
                <button
                  onClick={() => setPage(p)}
                  style={{
                    width:32, height:32, borderRadius:'0.375rem', border:'none', cursor:'pointer',
                    fontFamily:'Inter,sans-serif', fontSize:'0.875rem', fontWeight:600,
                    background: page===p ? 'var(--primary)' : 'transparent',
                    color: page===p ? '#fff' : 'var(--on-surface-variant)',
                    transition:'all 0.15s',
                  }}
                >{p}</button>
              </React.Fragment>
            ))}
            <button className="btn-icon" disabled={page===totalPages} onClick={() => setPage(p=>p+1)} style={{ opacity:page===totalPages?0.35:1 }}>
              <Icon name="chevron_right" />
            </button>
          </div>
        </div>
      </div>

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onAdd={l => setLeads(ls => [l, ...ls])} />}
      </>}
    </div>
  );
}
