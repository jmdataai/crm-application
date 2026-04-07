import React, { useState, useEffect, useCallback } from 'react';
import { leadsAPI, activitiesAPI, submissionsAPI, candidatesAPI } from '../../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const STATUS_MAP = {
  new:              { label:'New',          cls:'chip-new' },
  contacted:        { label:'Contacted',    cls:'chip-contacted' },
  called:           { label:'Called',       cls:'chip-called' },
  interested:       { label:'Interested',   cls:'chip-interested' },
  closed:           { label:'Closed',       cls:'chip-closed' },
  completed:        { label:'Completed',    cls:'chip-completed' },
  rejected:         { label:'Rejected',     cls:'chip-rejected' },
  lost:             { label:'Lost',         cls:'chip-lost' },
  follow_up_needed: { label:'Follow-up',    cls:'chip-follow-up' },
};

const ACTIVITY_ICON = { call:'phone', email:'mail', meeting:'video_call', note:'edit_note', status_change:'swap_horiz' };
const ACTIVITY_COLOR = { call:'var(--primary)', email:'var(--tertiary)', meeting:'#7c3aed', note:'var(--amber)', status_change:'var(--secondary)' };

// Lead data loaded from API


/* ── Log Activity Modal ─────────────────────────────── */
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
          {Object.entries(ACTIVITY_ICON).filter(([k])=>k!=='status_change').map(([k,icon])=>(
            <button key={k} onClick={() => setType(k)} style={{
              flex:1, padding:'0.625rem', border:'none', borderRadius:'0.5rem', cursor:'pointer',
              background: type===k ? 'var(--primary)' : 'var(--surface-container-low)',
              color: type===k ? '#fff' : 'var(--on-surface-variant)',
              fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight:600, display:'flex', flexDirection:'column', alignItems:'center', gap:'0.25rem',
              transition:'all 0.15s',
            }}>
              <Icon name={icon} style={{ fontSize:'1.125rem', color:'inherit' }} />
              {k.charAt(0).toUpperCase()+k.slice(1)}
            </button>
          ))}
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="textarea" rows={4} placeholder="Describe what happened…" value={text} onChange={e => setText(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { if(text.trim()) { onLog(type,text); onClose(); } }}>
            <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Log
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ─────────────────────────────────── */
export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead]         = useState(null);
  const [activities, setActs]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showLog, setShowLog]   = useState(false);
  const [note, setNote]         = useState('');
  const [activeTab, setActiveTab] = useState('activity');
  // Submissions tab state — was missing, caused crash
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
        candidatesAPI.getAll({ limit:500 }),
        submissionsAPI.getAll({ lead_id: id }),
      ]);
      const l = lRes.data;
      const candData = Array.isArray(cRes.data) ? cRes.data : Array.isArray(cRes.data?.candidates) ? cRes.data.candidates : [];
      setCandidates(candData);
      setSubmissions(Array.isArray(sRes.data) ? sRes.data : []);
      setLead(l);
      setEditForm({ ...l, deal_value: l.deal_value || '' });
      const acts = Array.isArray(aRes.data) ? aRes.data
        : Array.isArray(aRes.data?.data) ? aRes.data.data : [];
      setActs(acts.map(a => ({
        id: a.id, type: a.activity_type, text: a.description,
        date: a.created_at?.slice(0,16).replace('T',' '), user: a.user_name || 'You',
      })));
    } catch { navigate('/sales/leads'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  const set = (k,v) => setEditForm(f => ({ ...f, [k]: v }));

  const saveEdit = async () => {
    try {
      const res = await leadsAPI.update(id, editForm);
      setLead(res.data);
      setEditing(false);
    } catch {}
  };

  const logActivity = async (type, text) => {
    if (!text.trim()) return;
    try {
      await activitiesAPI.create({ lead_id: id, activity_type: type, description: text });
      const act = { id:`a${Date.now()}`, type, text, date:new Date().toLocaleString(), user:'You' };
      setActs(prev => [act, ...prev]);
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
      setActs(prev => [{ id:`a${Date.now()}`, type:'status_change', text:actText, date:new Date().toLocaleString(), user:'You' }, ...prev]);
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
    try {
      await submissionsAPI.delete(subId);
      setSubmissions(prev => prev.filter(s => s.id !== subId));
    } catch {}
  };

  if (loading) return (
    <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
      <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />
      Loading lead…
    </div>
  );

  if (!lead) return null;

  // Map activities to match what the UI expects (lead.activities was used before)
  const lead_with_acts = { ...lead, activities: activities };
  const s = STATUS_MAP[lead.status] || { label: lead.status, cls: 'chip-new' };
  const initials = lead.full_name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || '??';


  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.5rem' }}>
        <button className="btn-ghost" onClick={() => navigate('/sales/leads')} style={{ padding:'0.25rem 0.5rem' }}>
          <Icon name="arrow_back" style={{ fontSize:'1rem' }} /> Leads
        </button>
        <Icon name="chevron_right" style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
        <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)' }}>{lead?.full_name || 'Loading…'}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'5fr 7fr', gap:'1.25rem', alignItems:'start' }}>

        {/* LEFT COLUMN — Profile Card */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Hero card */}
          <div className="card" style={{ textAlign:'center', padding:'2rem 1.5rem' }}>
            <div className="avatar" style={{
              width:64, height:64, fontSize:'1.375rem', fontWeight:700,
              background:'linear-gradient(135deg, var(--primary), var(--primary-container))',
              color:'#fff', margin:'0 auto 1rem',
            }}>{initials}</div>

            <h2 style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--on-surface)', marginBottom:'0.25rem' }}>{lead?.full_name || 'Loading…'}</h2>
            <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'0.75rem' }}>
              {lead?.job_title || ''}{lead?.job_title || '' && lead?.company || '' ? ' · ' : ''}{lead?.company || ''}
            </p>
            <span className={`chip ${s.cls}`} style={{ fontSize:'0.8125rem' }}>{s.label}</span>

            {/* Quick actions */}
            <div style={{ display:'flex', gap:'0.5rem', justifyContent:'center', marginTop:'1.25rem' }}>
              {[
                { icon:'phone',      label:'Call',    action:() => logActivity('call','Logged a call') },
                { icon:'mail',       label:'Email',   action:() => logActivity('email','Sent an email') },
                { icon:'event',      label:'Meeting', action:() => logActivity('meeting','Scheduled a meeting') },
              ].map(a => (
                <button key={a.label} className="btn-secondary" onClick={a.action} style={{ flexDirection:'column', gap:'0.25rem', padding:'0.625rem 1rem', fontSize:'0.75rem' }}>
                  <Icon name={a.icon} style={{ fontSize:'1.125rem' }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lead details */}
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Lead Info</h3>
              <button className="btn-ghost" onClick={() => { setEditForm({...lead}); setEditing(true); }} style={{ fontSize:'0.8125rem' }}>
                <Icon name="edit" style={{ fontSize:'1rem' }} /> Edit
              </button>
            </div>

            {[
              { icon:'mail',      label:'Email',       value: lead?.email || '' || '—' },
              { icon:'phone',     label:'Phone',       value: lead?.phone || '' || '—' },
              { icon:'business',  label:'Company',     value: lead?.company || '' || '—' },
              { icon:'badge',     label:'Job Title',   value: lead?.job_title || '' || '—' },
              { icon:'hub',       label:'Source',      value: lead?.source || '' || '—' },
              { icon:'person',    label:'Owner',       value: lead?.assigned_owner || '' || '—' },
              { icon:'schedule',  label:'Follow-up',   value: lead?.next_follow_up || '' || '—' },
              { icon:'calendar_today', label:'Added',  value: lead?.created_at?.slice(0,10) || '' || '—' },
              { icon:'payments',      label:'Deal Value', value: lead?.deal_value ? `₹${Number(lead.deal_value).toLocaleString('en-IN')}` : '—' },
            ].map(f => (
              <div key={f.label} style={{ display:'flex', gap:'0.75rem', alignItems:'flex-start', marginBottom:'0.75rem' }}>
                <Icon name={f.icon} style={{ fontSize:'1rem', color:'var(--on-surface-variant)', marginTop:'0.125rem', flexShrink:0 }} />
                <div>
                  <p className="label-sm" style={{ marginBottom:'0.125rem' }}>{f.label}</p>
                  <p style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--on-surface)', wordBreak:'break-word' }}>{f.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Status changer */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.875rem' }}>Change Status</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
              {Object.entries(STATUS_MAP).map(([k,v]) => (
                <button
                  key={k}
                  onClick={() => changeStatus(k)}
                  style={{
                    display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.5rem 0.75rem',
                    borderRadius:'0.5rem', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif',
                    fontSize:'0.875rem', fontWeight: lead.status===k ? 700 : 400, textAlign:'left',
                    background: lead.status===k ? 'var(--surface-container-high)' : 'transparent',
                    color: lead.status===k ? 'var(--primary)' : 'var(--on-surface)',
                    transition:'background 0.15s',
                  }}
                >
                  {lead.status===k && <Icon name="check_circle" style={{ fontSize:'1rem', color:'var(--primary)' }} />}
                  {lead.status!==k && <Icon name="radio_button_unchecked" style={{ fontSize:'1rem', color:'var(--outline-variant)' }} />}
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Tabs */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Tab bar */}
          <div style={{ display:'flex', gap:'2px', background:'var(--surface-container-low)', padding:'4px', borderRadius:'0.75rem', alignSelf:'flex-start' }}>
            {[
              { key:'activity',    label:'Activity',    icon:'history' },
              { key:'submissions', label:`Submissions (${submissions.length})`, icon:'send' },
              { key:'notes',       label:'Notes',       icon:'sticky_note_2' },
              { key:'tasks',    label:'Tasks',    icon:'task_alt' },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                display:'flex', alignItems:'center', gap:'0.375rem',
                padding:'0.5rem 1rem', borderRadius:'0.625rem', border:'none', cursor:'pointer',
                fontFamily:'Inter,sans-serif', fontSize:'0.875rem', fontWeight: activeTab===t.key ? 600 : 400,
                background: activeTab===t.key ? 'var(--surface-container-lowest)' : 'transparent',
                color: activeTab===t.key ? 'var(--primary)' : 'var(--on-surface-variant)',
                boxShadow: activeTab===t.key ? 'var(--ambient-shadow)' : 'none',
                transition:'all 0.2s',
              }}>
                <Icon name={t.icon} style={{ fontSize:'1rem', color:'inherit' }} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="card slide-in">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Activity History</h3>
                <button className="btn-primary" onClick={() => setShowLog(true)} style={{ fontSize:'0.8125rem', padding:'0.375rem 0.875rem' }}>
                  <Icon name="add" style={{ fontSize:'1rem', color:'#fff' }} /> Log Activity
                </button>
              </div>
              <div style={{ position:'relative', paddingLeft:'1.5rem' }}>
                {/* Timeline line */}
                <div style={{ position:'absolute', left:'0.625rem', top:0, bottom:0, width:2, background:'var(--surface-container)', borderRadius:2 }} />
                {lead_with_acts.activities.length === 0 && (
                  <p style={{ color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem 0' }}>No activity yet.</p>
                )}
                {lead_with_acts.activities.map((act, i) => (
                  <div key={act.id} style={{ display:'flex', gap:'0.875rem', marginBottom: i < lead_with_acts.activities.length-1 ? '1.25rem' : 0, position:'relative' }}>
                    {/* Dot */}
                    <div style={{
                      position:'absolute', left:'-1.1875rem', top:'0.25rem',
                      width:14, height:14, borderRadius:'50%',
                      background: ACTIVITY_COLOR[act.type] || 'var(--primary)',
                      border:'2px solid var(--surface-container-lowest)',
                      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    }}>
                      <Icon name={ACTIVITY_ICON[act.type] || 'circle'} style={{ fontSize:'0.5rem', color:'#fff' }} />
                    </div>
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

          {/* Submissions Tab */}
          {activeTab === 'submissions' && (
            <div>
              <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', alignItems:'flex-end' }}>
                <div style={{ flex:1 }}>
                  <label className="label" style={{ marginBottom:'0.25rem', display:'block' }}>Link a Candidate to this Lead</label>
                  <select className="select" value={selCand} onChange={e => setSelCand(e.target.value)}>
                    <option value="">Select candidate…</option>
                    {candidates.filter(c => !submissions.find(s => s.candidate_id === c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} — {c.candidate_role||'—'} ({c.status})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={submitCandidate}
                  disabled={!selCand || subLoading}
                  style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor:!selCand?'not-allowed':'pointer', background:!selCand?'var(--outline)':'var(--primary)', whiteSpace:'nowrap' }}
                >
                  <Icon name="send" style={{ fontSize:'1rem', color:'#fff' }} />
                  {subLoading ? 'Linking…' : 'Submit Candidate'}
                </button>
              </div>

              {submissions.length === 0 ? (
                <p style={{ color:'var(--on-surface-variant)', textAlign:'center', padding:'2rem 0', fontSize:'0.875rem' }}>No candidates submitted to this client yet.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {submissions.map(sub => (
                    <div key={sub.id} style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.75rem', borderRadius:'0.625rem', background:'var(--surface-container-low)', border:'1px solid var(--outline-variant)' }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(0,74,198,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon name="person" style={{ fontSize:'1.25rem', color:'var(--primary)' }} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:600, fontSize:'0.9375rem' }}>{sub.candidate?.full_name||'—'}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{sub.candidate?.candidate_role||'—'} · <span style={{ textTransform:'capitalize' }}>{sub.candidate?.status||'—'}</span></p>
                      </div>
                      <select
                        value={sub.status}
                        onChange={async e => {
                          await submissionsAPI.update(sub.id, { status: e.target.value });
                          setSubmissions(prev => prev.map(s => s.id===sub.id ? {...s, status:e.target.value} : s));
                        }}
                        style={{ fontSize:'0.8125rem', padding:'0.25rem 0.5rem', borderRadius:'0.375rem', border:'1px solid var(--outline-variant)', background:'var(--surface-container-lowest)', color:'var(--on-surface)', cursor:'pointer' }}
                      >
                        {['submitted','feedback_pending','accepted','rejected'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
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

          {/* Notes Tab */}
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

          {/* Tasks Tab */}
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
                No tasks linked to this lead yet.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && setEditing(false)}>
          <div className="modal modal-lg">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
              <h2 style={{ fontSize:'1.125rem', fontWeight:700 }}>Edit Lead — {lead?.full_name || 'Loading…'}</h2>
              <button className="btn-icon" onClick={() => setEditing(false)}><Icon name="close" /></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              {[
                { label:'Full Name *', key:'full_name', type:'text', span:2 },
                { label:'Email',       key:'email',     type:'email' },
                { label:'Phone',       key:'phone',     type:'tel' },
                { label:'Company',     key:'company',   type:'text' },
                { label:'Job Title',   key:'job_title', type:'text' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.span===2?'1/-1':undefined }}>
                  <label className="label">{f.label}</label>
                  <input className="input" type={f.type} value={editForm[f.key]||''} onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="label">Source</label>
                <select className="select" value={editForm.source} onChange={e => set('source', e.target.value)}>
                  {['Apollo','CSV Import','Manual','LinkedIn','Other'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={editForm.status} onChange={e => set('status', e.target.value)}>
                  {Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Follow-up Date</label>
                <input className="input" type="date" value={editForm.next_follow_up||''} onChange={e => set('next_follow_up', e.target.value)} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Deal Value (₹)</label>
                <input className="input" type="number" min="0" placeholder="Expected contract value" value={editForm.deal_value||''} onChange={e => set('deal_value', e.target.value ? Number(e.target.value) : '')} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Notes</label>
                <textarea className="textarea" rows={4} value={editForm.notes||''} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
              <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}>
                <Icon name="save" style={{ fontSize:'1rem', color:'#fff' }} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showLog && <LogActivityModal onClose={() => setShowLog(false)} onLog={logActivity} />}
    </div>
  );
}
