import React, { useState, useEffect, useCallback } from 'react';
import { leadsAPI, activitiesAPI, submissionsAPI, candidatesAPI } from '../../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const STATUS_MAP = {
  new:              { label:'New',             bg:'var(--surface-container)',   color:'var(--on-surface-variant)' },
  contacted:        { label:'Intro Sent',      bg:'rgba(0,74,198,0.1)',         color:'var(--primary)' },
  called:           { label:'Called',          bg:'rgba(124,58,237,0.1)',       color:'#7c3aed' },
  interested:       { label:'Interested',      bg:'rgba(217,119,6,0.12)',       color:'#92400e' },
  follow_up_needed: { label:'Follow-up Due',   bg:'rgba(217,119,6,0.2)',        color:'#d97706' },
  closed:           { label:'Won / Closed',    bg:'rgba(0,98,67,0.15)',         color:'var(--tertiary)' },
  completed:        { label:'Completed',       bg:'rgba(0,98,67,0.12)',         color:'var(--tertiary)' },
  rejected:         { label:'Not Interested',  bg:'var(--error-container)',     color:'var(--on-error-container)' },
  lost:             { label:'Lost',            bg:'rgba(186,26,26,0.08)',       color:'var(--error)' },
};

const SEGMENT_LABELS = {
  staffing_partner: 'Staffing Partner',
  end_client:       'End Client',
  ireland_company:  'Ireland Company',
  general:          'General',
};

const ACTIVITY_ICON  = { call:'phone', email:'mail', meeting:'video_call', note:'edit_note', status_change:'swap_horiz' };
const ACTIVITY_COLOR = { call:'var(--primary)', email:'var(--tertiary)', meeting:'#7c3aed', note:'var(--amber)', status_change:'var(--secondary)' };

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.new;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'0.25rem 0.75rem',
      borderRadius:9999, fontSize:'0.75rem', fontWeight:700,
      background:s.bg, color:s.color,
    }}>{s.label}</span>
  );
};

// ── Log Activity Modal ───────────────────────────────────────
const LogActivityModal = ({ onClose, onLog }) => {
  const [type, setType] = useState('call');
  const [text, setText] = useState('');
  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Log Activity</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1.25rem' }}>
          {Object.entries(ACTIVITY_ICON).filter(([k]) => k !== 'status_change').map(([k, icon]) => (
            <button key={k} onClick={() => setType(k)} style={{
              flex:1, padding:'0.625rem', border:'none', borderRadius:'0.5rem', cursor:'pointer',
              background: type===k ? 'var(--primary)' : 'var(--surface-container-low)',
              color: type===k ? '#fff' : 'var(--on-surface-variant)',
              fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight:600,
              display:'flex', flexDirection:'column', alignItems:'center', gap:'0.25rem', transition:'all 0.15s',
            }}>
              <Icon name={icon} style={{ fontSize:'1.125rem', color:'inherit' }} />
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="textarea" rows={4} placeholder="Describe what happened…" value={text} onChange={e => setText(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { if (text.trim()) { onLog(type, text); onClose(); } }}>
            <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Log
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Contact Person Card ──────────────────────────────────────
const ContactCard = ({ label, num, name, designation, email, phone, linkedin, accent = 'var(--primary)' }) => {
  if (!name && !email && !phone) return (
    <div style={{
      padding:'0.875rem 1rem', borderRadius:'0.625rem',
      background:'var(--surface-container-lowest)', border:'1px dashed var(--outline-variant)',
      color:'var(--on-surface-variant)', fontSize:'0.8125rem', textAlign:'center',
    }}>
      <Icon name="person_add" style={{ fontSize:'1.25rem', display:'block', margin:'0 auto 0.25rem', opacity:0.4 }} />
      {label} not added
    </div>
  );
  return (
    <div style={{ padding:'0.875rem 1rem', borderRadius:'0.625rem', background:'var(--surface-container-lowest)', border:'1px solid var(--outline-variant)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
        <div style={{
          width:36, height:36, borderRadius:'50%', flexShrink:0,
          background: accent + '18',
          display:'flex', alignItems:'center', justifyContent:'center',
          color: accent, fontWeight:700, fontSize:'0.875rem',
        }}>
          {name ? name.slice(0,2).toUpperCase() : <Icon name="person" style={{ fontSize:'1.125rem', color:'inherit' }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.25rem' }}>
            <p style={{ fontWeight:700, fontSize:'0.9375rem', color:'var(--on-surface)' }}>{name || '—'}</p>
            <span style={{ fontSize:'0.625rem', fontWeight:700, padding:'0.1rem 0.375rem', borderRadius:9999, background: accent+'18', color:accent }}>{label}</span>
          </div>
          {designation && <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginBottom:'0.375rem' }}>{designation}</p>}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            {email && (
              <a href={`mailto:${email}`} style={{ fontSize:'0.8125rem', color:'var(--primary)', textDecoration:'none', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                <Icon name="mail" style={{ fontSize:'0.875rem' }} /> {email}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', textDecoration:'none', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                <Icon name="phone" style={{ fontSize:'0.875rem' }} /> {phone}
              </a>
            )}
            {linkedin && (
              <a href={linkedin} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.8125rem', color:'#0a66c2', textDecoration:'none', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                <Icon name="open_in_new" style={{ fontSize:'0.875rem' }} /> LinkedIn Profile
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Edit Company Modal ───────────────────────────────────────
const EditCompanyModal = ({ lead, onClose, onSave }) => {
  const [form, setForm] = useState({ ...lead });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.company?.trim()) { alert('Company name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        company:          form.company,
        company_type:     form.company_type || null,
        company_linkedin: form.company_linkedin || null,
        hq_location:      form.hq_location || null,
        india_office:     form.india_office || null,
        segment:          form.segment || null,
        domain_focus:     form.domain_focus || null,
        website:          form.website || null,
        source:           form.source || null,
        status:           form.status || 'new',
        notes:            form.notes || null,
        next_follow_up:   form.next_follow_up || null,
        solution_skills:  form.solution_skills || null,
        deal_value:       form.deal_value ? Number(form.deal_value) : null,
        // CP1
        full_name:        form.full_name || form.company,
        job_title:        form.job_title || null,
        email:            form.email || null,
        phone:            form.phone || null,
        linkedin_url:     form.linkedin_url || null,
        // CP2
        contact_person_2_name:        form.contact_person_2_name || null,
        contact_person_2_designation: form.contact_person_2_designation || null,
        contact_person_2_email:       form.contact_person_2_email || null,
        contact_person_2_phone:       form.contact_person_2_phone || null,
        contact_person_2_linkedin:    form.contact_person_2_linkedin || null,
        // CP3
        contact_person_3_name:        form.contact_person_3_name || null,
        contact_person_3_designation: form.contact_person_3_designation || null,
        contact_person_3_email:       form.contact_person_3_email || null,
        contact_person_3_phone:       form.contact_person_3_phone || null,
        contact_person_3_linkedin:    form.contact_person_3_linkedin || null,
      };
      const res = await leadsAPI.update(lead.id, payload);
      onSave(res.data);
      onClose();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const ContactSection = ({ prefix, label, nameKey, desgKey, emailKey, phoneKey, liKey }) => (
    <div>
      <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.625rem' }}>{label}</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
        <div><label className="label">Name</label><input className="input" value={form[nameKey]||''} onChange={e=>set(nameKey,e.target.value)} /></div>
        <div><label className="label">Designation</label><input className="input" value={form[desgKey]||''} onChange={e=>set(desgKey,e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" type="email" value={form[emailKey]||''} onChange={e=>set(emailKey,e.target.value)} /></div>
        <div><label className="label">Phone</label><input className="input" type="tel" value={form[phoneKey]||''} onChange={e=>set(phoneKey,e.target.value)} /></div>
        <div style={{gridColumn:'1/-1'}}><label className="label">LinkedIn URL</label><input className="input" type="url" value={form[liKey]||''} onChange={e=>set(liKey,e.target.value)} placeholder="https://linkedin.com/in/…" /></div>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl" style={{ maxWidth:820, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Edit — {form.company}</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {/* Company */}
        <p style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.75rem' }}>Company Details</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'1rem' }}>
          <div style={{gridColumn:'1/-1'}}><label className="label">Company Name *</label><input className="input" value={form.company||''} onChange={e=>set('company',e.target.value)} /></div>
          <div>
            <label className="label">Company Type</label>
            <select className="select" value={form.company_type||''} onChange={e=>set('company_type',e.target.value)}>
              <option value="">Select…</option>
              {['Consulting','Technology','Recruitment Agency','Banking','Financial Services','MedTech','IT Consulting','Manufacturing','Pharma','Other'].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Segment</label>
            <select className="select" value={form.segment||''} onChange={e=>set('segment',e.target.value)}>
              <option value="">Select…</option>
              <option value="staffing_partner">Staffing Partner</option>
              <option value="end_client">End Client</option>
              <option value="ireland_company">Ireland Company</option>
              <option value="general">General</option>
            </select>
          </div>
          <div><label className="label">HQ Location</label><input className="input" value={form.hq_location||''} onChange={e=>set('hq_location',e.target.value)} placeholder="Dublin, Cork…" /></div>
          <div><label className="label">India Office(s)</label><input className="input" value={form.india_office||''} onChange={e=>set('india_office',e.target.value)} placeholder="Hyderabad…" /></div>
          <div><label className="label">Domain / Skills Focus</label><input className="input" value={form.domain_focus||''} onChange={e=>set('domain_focus',e.target.value)} /></div>
          <div>
            <label className="label">Status</label>
            <select className="select" value={form.status||'new'} onChange={e=>set('status',e.target.value)}>
              {Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div><label className="label">Website</label><input className="input" type="url" value={form.website||''} onChange={e=>set('website',e.target.value)} /></div>
          <div><label className="label">Company LinkedIn</label><input className="input" type="url" value={form.company_linkedin||''} onChange={e=>set('company_linkedin',e.target.value)} /></div>
          <div><label className="label">Source</label><input className="input" value={form.source||''} onChange={e=>set('source',e.target.value)} /></div>
          <div><label className="label">Next Follow-up</label><input className="input" type="date" value={form.next_follow_up||''} onChange={e=>set('next_follow_up',e.target.value)} /></div>
          <div><label className="label">Deal Value (₹)</label><input className="input" type="number" value={form.deal_value||''} onChange={e=>set('deal_value',e.target.value)} /></div>
          <div><label className="label">Solution / Skills Looking For</label><input className="input" value={form.solution_skills||''} onChange={e=>set('solution_skills',e.target.value)} /></div>
          <div style={{gridColumn:'1/-1'}}><label className="label">Notes / Remarks</label><textarea className="textarea" rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)} /></div>
        </div>

        <div style={{ height:1, background:'var(--outline-variant)', margin:'0.5rem 0 1rem' }} />

        {/* Contact Persons */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          <ContactSection label="Contact Person 1" nameKey="full_name" desgKey="job_title" emailKey="email" phoneKey="phone" liKey="linkedin_url" />
          <div style={{ height:1, background:'var(--surface-container)' }} />
          <ContactSection label="Contact Person 2" nameKey="contact_person_2_name" desgKey="contact_person_2_designation" emailKey="contact_person_2_email" phoneKey="contact_person_2_phone" liKey="contact_person_2_linkedin" />
          <div style={{ height:1, background:'var(--surface-container)' }} />
          <ContactSection label="Contact Person 3" nameKey="contact_person_3_name" desgKey="contact_person_3_designation" emailKey="contact_person_3_email" phoneKey="contact_person_3_phone" liKey="contact_person_3_linkedin" />
        </div>

        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.75rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Icon name="save" style={{ fontSize:'1rem', color:'#fff' }} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────
export default function LeadDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const [lead, setLead]       = useState(null);
  const [activities, setActs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [note, setNote]       = useState('');
  const [activeTab, setActiveTab] = useState('contacts');
  const [candidates, setCandidates]   = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selCand, setSelCand]         = useState('');
  const [subLoading, setSubLoading]   = useState(false);

  const fetchLead = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, aRes, cRes, sRes] = await Promise.all([
        leadsAPI.getOne(id),
        activitiesAPI.getAll({ lead_id: id }),
        candidatesAPI.getAll({ limit: 500 }),
        submissionsAPI.getAll({ lead_id: id }),
      ]);
      const l = lRes.data;
      const candData = Array.isArray(cRes.data) ? cRes.data : Array.isArray(cRes.data?.candidates) ? cRes.data.candidates : [];
      setCandidates(candData);
      setSubmissions(Array.isArray(sRes.data) ? sRes.data : []);
      setLead(l);
      const acts = Array.isArray(aRes.data) ? aRes.data : Array.isArray(aRes.data?.data) ? aRes.data.data : [];
      setActs(acts.map(a => ({
        id: a.id, type: a.activity_type, text: a.description,
        date: a.created_at?.slice(0, 16).replace('T', ' '), user: a.user_name || 'You',
      })));
    } catch { navigate('/sales/leads'); }
    finally   { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  const logActivity = async (type, text) => {
    if (!text.trim()) return;
    try {
      await activitiesAPI.create({ lead_id: id, activity_type: type, description: text });
      setActs(prev => [{ id:`a${Date.now()}`, type, text, date: new Date().toLocaleString(), user:'You' }, ...prev]);
    } catch {}
  };

  const addNote = () => { if (note.trim()) { logActivity('note', note); setNote(''); } };

  const changeStatus = async (newStatus) => {
    const prev = lead.status;
    setLead(l => ({ ...l, status: newStatus }));
    try {
      await leadsAPI.update(id, { status: newStatus });
      const actText = `Status changed to ${STATUS_MAP[newStatus]?.label || newStatus}`;
      await activitiesAPI.create({ lead_id: id, activity_type: 'status_change', description: actText });
      setActs(prev2 => [{ id:`a${Date.now()}`, type:'status_change', text:actText, date:new Date().toLocaleString(), user:'You' }, ...prev2]);
    } catch { setLead(l => ({ ...l, status: prev })); }
  };

  const submitCandidate = async () => {
    if (!selCand) return;
    setSubLoading(true);
    try {
      await submissionsAPI.create({ lead_id: id, candidate_id: selCand });
      const sRes = await submissionsAPI.getAll({ lead_id: id });
      setSubmissions(Array.isArray(sRes.data) ? sRes.data : []);
      setSelCand('');
    } catch (e) { alert(e?.response?.data?.detail || 'Failed to link candidate'); }
    finally { setSubLoading(false); }
  };

  const removeSubmission = async (subId) => {
    try { await submissionsAPI.delete(subId); setSubmissions(prev => prev.filter(s => s.id !== subId)); } catch {}
  };

  if (loading) return (
    <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
      <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} /> Loading…
    </div>
  );

  if (!lead) return null;

  const s = STATUS_MAP[lead.status] || { label: lead.status, bg:'var(--surface-container)', color:'var(--on-surface-variant)' };
  // Company initials
  const compInitials = (lead.company || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const TABS = [
    { key:'contacts',    label:'Contacts',                  icon:'contacts' },
    { key:'activity',    label:'Activity',                  icon:'history' },
    { key:'submissions', label:`Submissions (${submissions.length})`, icon:'send' },
    { key:'notes',       label:'Notes',                     icon:'sticky_note_2' },
    { key:'tasks',       label:'Tasks',                     icon:'task_alt' },
  ];

  const InfoRow = ({ icon, label, value, link, isLink }) => (
    <div style={{ display:'flex', gap:'0.75rem', alignItems:'flex-start', marginBottom:'0.75rem' }}>
      <Icon name={icon} style={{ fontSize:'1rem', color:'var(--on-surface-variant)', marginTop:'0.125rem', flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <p className="label-sm" style={{ marginBottom:'0.125rem' }}>{label}</p>
        {isLink && value && value !== '—' ? (
          <a href={link || value} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--primary)', wordBreak:'break-word', textDecoration:'none' }}>{value}</a>
        ) : (
          <p style={{ fontSize:'0.875rem', fontWeight:500, color: value&&value!=='—' ? 'var(--on-surface)' : 'var(--outline)', wordBreak:'break-word' }}>{value || '—'}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.5rem' }}>
        <button className="btn-ghost" onClick={() => navigate('/sales/leads')} style={{ padding:'0.25rem 0.5rem' }}>
          <Icon name="arrow_back" style={{ fontSize:'1rem' }} /> Companies
        </button>
        <Icon name="chevron_right" style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
        <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)' }}>{lead?.company || '…'}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'4fr 8fr', gap:'1.25rem', alignItems:'start' }}>

        {/* LEFT — Company Profile */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Hero Card */}
          <div className="card" style={{ padding:'2rem 1.5rem', textAlign:'center' }}>
            <div style={{
              width:64, height:64, borderRadius:'1rem', margin:'0 auto 1rem',
              background:'linear-gradient(135deg,var(--primary-container),var(--secondary-container))',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1.375rem', fontWeight:700, color:'var(--primary)',
            }}>{compInitials}</div>

            <h2 style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--on-surface)', marginBottom:'0.25rem' }}>
              {lead.company || '—'}
            </h2>
            {(lead.company_type || lead.hq_location) && (
              <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'0.5rem' }}>
                {[lead.company_type, lead.hq_location].filter(Boolean).join(' · ')}
              </p>
            )}
            <StatusBadge status={lead.status} />
            {lead.segment && (
              <div style={{ marginTop:'0.5rem' }}>
                <span style={{ fontSize:'0.6875rem', padding:'0.15rem 0.625rem', borderRadius:9999, background:'var(--surface-container)', color:'var(--on-surface-variant)', fontWeight:600 }}>
                  {({ staffing_partner:'Staffing Partner', end_client:'End Client', ireland_company:'Ireland Company', general:'General' })[lead.segment] || lead.segment}
                </span>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display:'flex', gap:'0.5rem', justifyContent:'center', marginTop:'1.25rem' }}>
              {[
                { icon:'phone',   label:'Call',    fn:() => logActivity('call','Logged a call with this company') },
                { icon:'mail',    label:'Email',   fn:() => logActivity('email','Sent intro email to this company') },
                { icon:'event',   label:'Meeting', fn:() => logActivity('meeting','Scheduled a meeting with this company') },
              ].map(a => (
                <button key={a.label} className="btn-secondary" onClick={a.fn} style={{ flexDirection:'column', gap:'0.25rem', padding:'0.625rem 1rem', fontSize:'0.75rem' }}>
                  <Icon name={a.icon} style={{ fontSize:'1.125rem' }} /> {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Company Info Card */}
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Company Info</h3>
              <button className="btn-ghost" onClick={() => setEditing(true)} style={{ fontSize:'0.8125rem' }}>
                <Icon name="edit" style={{ fontSize:'1rem' }} /> Edit
              </button>
            </div>
            <InfoRow icon="business"    label="Company Name"  value={lead.company} />
            <InfoRow icon="category"    label="Type"          value={lead.company_type} />
            <InfoRow icon="public"      label="HQ Location"   value={lead.hq_location || lead.address} />
            <InfoRow icon="location_on" label="India Office"  value={lead.india_office} />
            <InfoRow icon="psychology"  label="Domain Focus"  value={lead.domain_focus || lead.industry} />
            <InfoRow icon="link"        label="Website"       value={lead.website?.replace(/^https?:\/\//,'')} link={lead.website} isLink />
            <InfoRow icon="groups"      label="Company LinkedIn" value={lead.company_linkedin ? 'View on LinkedIn' : null} link={lead.company_linkedin} isLink />
            <InfoRow icon="hub"         label="Source"        value={lead.source} />
            <InfoRow icon="schedule"    label="Follow-up"     value={lead.next_follow_up} />
            <InfoRow icon="calendar_today" label="Added"      value={lead.created_at?.slice(0,10)} />
            {lead.deal_value > 0 && (
              <InfoRow icon="payments" label="Deal Value" value={`₹${Number(lead.deal_value).toLocaleString('en-IN')}`} />
            )}
            {lead.solution_skills && (
              <InfoRow icon="build" label="Looking For" value={lead.solution_skills} />
            )}
          </div>

          {/* Status Changer */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.875rem' }}>Change Status</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <button key={k} onClick={() => changeStatus(k)} style={{
                  display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.5rem 0.75rem',
                  borderRadius:'0.5rem', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif',
                  fontSize:'0.875rem', fontWeight: lead.status===k ? 700 : 400, textAlign:'left',
                  background: lead.status===k ? 'var(--surface-container-high)' : 'transparent',
                  color: lead.status===k ? 'var(--primary)' : 'var(--on-surface)', transition:'background 0.15s',
                }}>
                  <Icon name={lead.status===k ? 'check_circle' : 'radio_button_unchecked'} style={{ fontSize:'1rem', color: lead.status===k ? 'var(--primary)' : 'var(--outline-variant)' }} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Tabs */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Tab Bar */}
          <div style={{ display:'flex', gap:'2px', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.75rem', flexWrap:'wrap' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                display:'flex', alignItems:'center', gap:'0.375rem',
                padding:'0.5rem 0.875rem', borderRadius:'0.625rem', border:'none', cursor:'pointer',
                fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight: activeTab===t.key ? 600 : 400,
                background: activeTab===t.key ? 'var(--surface-container-lowest)' : 'transparent',
                color: activeTab===t.key ? 'var(--primary)' : 'var(--on-surface-variant)',
                boxShadow: activeTab===t.key ? 'var(--ambient-shadow)' : 'none', transition:'all 0.2s',
              }}>
                <Icon name={t.icon} style={{ fontSize:'1rem', color:'inherit' }} /> {t.label}
              </button>
            ))}
          </div>

          {/* ── Contacts Tab ───────────────────────────────────── */}
          {activeTab === 'contacts' && (
            <div className="card slide-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Contact Persons</h3>
                <button className="btn-ghost" onClick={() => setEditing(true)} style={{ fontSize:'0.8125rem' }}>
                  <Icon name="edit" style={{ fontSize:'1rem' }} /> Edit
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                <ContactCard
                  label="CP 1" num={1}
                  name={lead.full_name !== lead.company ? lead.full_name : null}
                  designation={lead.job_title}
                  email={lead.email}
                  phone={lead.phone}
                  linkedin={lead.linkedin_url}
                  accent="var(--primary)"
                />
                <ContactCard
                  label="CP 2" num={2}
                  name={lead.contact_person_2_name}
                  designation={lead.contact_person_2_designation}
                  email={lead.contact_person_2_email}
                  phone={lead.contact_person_2_phone}
                  linkedin={lead.contact_person_2_linkedin}
                  accent="#7c3aed"
                />
                <ContactCard
                  label="CP 3" num={3}
                  name={lead.contact_person_3_name}
                  designation={lead.contact_person_3_designation}
                  email={lead.contact_person_3_email}
                  phone={lead.contact_person_3_phone}
                  linkedin={lead.contact_person_3_linkedin}
                  accent="var(--tertiary)"
                />
              </div>
            </div>
          )}

          {/* ── Activity Tab ───────────────────────────────────── */}
          {activeTab === 'activity' && (
            <div className="card slide-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Activity History</h3>
                <button className="btn-primary" onClick={() => setShowLog(true)} style={{ fontSize:'0.8125rem', padding:'0.375rem 0.875rem' }}>
                  <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Log Activity
                </button>
              </div>
              <div style={{ position:'relative', paddingLeft:'1.5rem' }}>
                <div style={{ position:'absolute', left:'0.625rem', top:0, bottom:0, width:2, background:'var(--surface-container)', borderRadius:2 }} />
                {activities.length === 0 && (
                  <p style={{ color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem 0' }}>No activity yet. Log a call, email, or meeting.</p>
                )}
                {activities.map((act, i) => (
                  <div key={act.id} style={{ display:'flex', gap:'0.875rem', marginBottom: i < activities.length-1 ? '1.25rem' : 0, position:'relative' }}>
                    <div style={{
                      position:'absolute', left:'-1.1875rem', top:'0.25rem', width:14, height:14, borderRadius:'50%',
                      background: ACTIVITY_COLOR[act.type] || 'var(--primary)',
                      border:'2px solid var(--surface-container-lowest)',
                    }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem' }}>
                        <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--on-surface)' }}>{act.text}</p>
                        <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap', flexShrink:0 }}>{act.date}</span>
                      </div>
                      <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>by {act.user}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Submissions Tab ────────────────────────────────── */}
          {activeTab === 'submissions' && (
            <div className="card slide-in">
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Candidate Submissions</h3>
              <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', alignItems:'flex-end' }}>
                <div style={{ flex:1 }}>
                  <label className="label" style={{ marginBottom:'0.25rem', display:'block' }}>Link a Candidate to this Company</label>
                  <select className="select" value={selCand} onChange={e => setSelCand(e.target.value)}>
                    <option value="">Select candidate…</option>
                    {candidates.filter(c => !submissions.find(s => s.candidate_id === c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} — {c.candidate_role||'—'} ({c.status})</option>
                    ))}
                  </select>
                </div>
                <button onClick={submitCandidate} disabled={!selCand || subLoading} style={{
                  display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1.25rem',
                  borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none',
                  cursor:!selCand?'not-allowed':'pointer',
                  background:!selCand?'var(--outline)':'var(--primary)', whiteSpace:'nowrap',
                }}>
                  <Icon name="send" style={{ fontSize:'1rem', color:'#fff' }} />
                  {subLoading ? 'Linking…' : 'Submit'}
                </button>
              </div>
              {submissions.length === 0 ? (
                <p style={{ color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem 0', fontSize:'0.875rem' }}>No candidates submitted yet.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {submissions.map(sub => (
                    <div key={sub.id} style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.75rem', borderRadius:'0.625rem', background:'var(--surface-container-low)', border:'1px solid var(--outline-variant)' }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(0,74,198,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon name="person" style={{ fontSize:'1.25rem', color:'var(--primary)' }} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:600, fontSize:'0.9375rem' }}>{sub.candidate?.full_name||'—'}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{sub.candidate?.candidate_role||'—'} · {sub.candidate?.status||'—'}</p>
                      </div>
                      <select value={sub.status} onChange={async e => {
                        await submissionsAPI.update(sub.id, { status: e.target.value });
                        setSubmissions(prev => prev.map(s => s.id===sub.id ? {...s, status:e.target.value} : s));
                      }} style={{ fontSize:'0.8125rem', padding:'0.25rem 0.5rem', borderRadius:'0.375rem', border:'1px solid var(--outline-variant)', background:'var(--surface-container-lowest)', color:'var(--on-surface)', cursor:'pointer' }}>
                        {['submitted','feedback_pending','accepted','rejected'].map(st => <option key={st} value={st}>{st.replace('_',' ')}</option>)}
                      </select>
                      <button onClick={() => removeSubmission(sub.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--error)', padding:'0.25rem' }}>
                        <Icon name="close" style={{ fontSize:'1rem' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Notes Tab ─────────────────────────────────────── */}
          {activeTab === 'notes' && (
            <div className="card slide-in">
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Notes</h3>
              <div style={{ background:'var(--surface-container-low)', borderRadius:'0.625rem', padding:'1rem', marginBottom:'1rem', minHeight:80 }}>
                <p style={{ fontSize:'0.875rem', color: lead.notes ? 'var(--on-surface)' : 'var(--on-surface-variant)', whiteSpace:'pre-wrap' }}>
                  {lead.notes || 'No notes yet.'}
                </p>
              </div>
              <div>
                <label className="label">Add Quick Note</label>
                <textarea className="textarea" rows={3} placeholder="Type a note…" value={note} onChange={e => setNote(e.target.value)} />
                <button className="btn-primary" onClick={addNote} style={{ marginTop:'0.75rem', fontSize:'0.875rem' }}>
                  <Icon name="save" style={{ fontSize:'1rem', color:'#fff' }} /> Save Note
                </button>
              </div>
            </div>
          )}

          {/* ── Tasks Tab ─────────────────────────────────────── */}
          {activeTab === 'tasks' && (
            <div className="card slide-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Tasks</h3>
                <button className="btn-primary" style={{ fontSize:'0.8125rem', padding:'0.375rem 0.875rem' }}>
                  <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> New Task
                </button>
              </div>
              <div style={{ color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem 0' }}>
                <Icon name="task_alt" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.3 }} />
                No tasks linked to this company yet.
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && <EditCompanyModal lead={lead} onClose={() => setEditing(false)} onSave={updated => { setLead(updated); }} />}
      {showLog && <LogActivityModal onClose={() => setShowLog(false)} onLog={logActivity} />}
    </div>
  );
}
