import React, { useState, useEffect, useCallback } from 'react';
import { bulkEmailAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DEFAULT_SUBJECT = 'Welcome to JM Data Talent — Let\'s Connect!';
const DEFAULT_BODY = `<p>Hi there,</p>

<p>I hope this message finds you well. My name is [Your Name] from <strong>JM Data Talent</strong>, and I wanted to reach out to introduce ourselves.</p>

<p>We specialize in connecting top talent with leading organizations across data, technology, and finance sectors. Whether you're looking to grow your team or explore new opportunities, we'd love to be your trusted partner.</p>

<p>I'd welcome the opportunity to connect briefly — please feel free to reply to this email or schedule a call at your convenience.</p>

<p>Looking forward to hearing from you.</p>

<p>Best regards,<br/>
<strong>[Your Name]</strong><br/>
JM Data Talent<br/>
<a href="https://jmdatatalent.com">jmdatatalent.com</a></p>`;

export default function BulkEmail() {
  const [recipients, setRecipients]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [subject, setSubject]             = useState(DEFAULT_SUBJECT);
  const [body, setBody]                   = useState(DEFAULT_BODY);
  const [extraInput, setExtraInput]       = useState('');
  const [extraEmails, setExtraEmails]     = useState([]);
  const [sending, setSending]             = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState('');
  const [filterSent, setFilterSent]       = useState('pending'); // 'all' | 'pending' | 'sent'
  const [search, setSearch]               = useState('');
  const [tab, setTab]                     = useState('compose'); // 'compose' | 'history'
  const [history, setHistory]             = useState([]);
  const [histLoading, setHistLoading]     = useState(false);
  const [preview, setPreview]             = useState(false);

  const loadRecipients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bulkEmailAPI.getRecipients();
      setRecipients(res.data?.recipients || []);
    } catch (e) {
      setError('Failed to load recipients. Check your connection.');
    } finally { setLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await bulkEmailAPI.getSent();
      setHistory(res.data?.sent || []);
    } catch {}
    finally { setHistLoading(false); }
  }, []);

  useEffect(() => { loadRecipients(); }, [loadRecipients]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

  const addExtraEmail = () => {
    const emails = extraInput.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => e && e.includes('@'));
    const newOnes = emails.filter(e => !extraEmails.includes(e));
    if (newOnes.length) setExtraEmails(prev => [...prev, ...newOnes]);
    setExtraInput('');
  };

  const filtered = recipients.filter(r => {
    const matchSearch = !search || r.email.includes(search.toLowerCase()) || r.name?.toLowerCase().includes(search.toLowerCase()) || r.company?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterSent === 'all' || (filterSent === 'pending' && !r.already_sent) || (filterSent === 'sent' && r.already_sent);
    return matchSearch && matchFilter;
  });

  const pendingCount = recipients.filter(r => !r.already_sent).length;
  const sentCount    = recipients.filter(r => r.already_sent).length;
  const totalNew     = pendingCount + extraEmails.length;

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required.'); return;
    }
    if (totalNew === 0) {
      setError('No new recipients to send to.'); return;
    }
    setSending(true); setError(''); setResult(null);
    try {
      const res = await bulkEmailAPI.send({ subject, html_body: body, extra_emails: extraEmails });
      setResult(res.data);
      await loadRecipients();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Send failed. Check Microsoft Graph / Azure configuration.');
    } finally { setSending(false); }
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <p className="label-sm" style={{ color:'var(--tertiary)', marginBottom:'0.25rem' }}>Sales</p>
        <h1 className="headline-sm">Bulk Welcome Email</h1>
        <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>
          Send welcome emails from your Outlook mailbox to all new lead contacts. Already-contacted addresses are automatically skipped.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display:'flex', gap:'0.875rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        {[
          { label:'Total Contacts', value: recipients.length, icon:'contacts', color:'var(--primary)' },
          { label:'Pending',        value: pendingCount,       icon:'schedule_send', color:'#D97706' },
          { label:'Already Sent',  value: sentCount,          icon:'mark_email_read', color:'var(--tertiary)' },
          { label:'Extra Emails',  value: extraEmails.length, icon:'add_circle', color:'var(--primary)' },
        ].map(s => (
          <div key={s.label} style={{ flex:'1 1 140px', padding:'0.875rem 1rem', borderRadius:'0.75rem', background:'var(--surface-container-low)', border:'1px solid var(--outline-variant)', display:'flex', gap:'0.75rem', alignItems:'center' }}>
            <div style={{ width:36, height:36, borderRadius:'0.625rem', background:`${s.color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon name={s.icon} style={{ fontSize:'1.125rem', color:s.color }} />
            </div>
            <div>
              <p style={{ fontSize:'1.375rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{s.value}</p>
              <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:2 }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div style={{ display:'flex', gap:0, marginBottom:'1.25rem', background:'var(--surface-container-high)', padding:4, borderRadius:'0.875rem', width:'fit-content' }}>
        {[{ id:'compose', label:'Compose & Send' },{ id:'history', label:'Sent History' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'0.5rem 1.25rem', borderRadius:'0.625rem', border:'none', cursor:'pointer',
            fontFamily:'var(--font-display)', fontSize:'0.875rem', fontWeight: tab===t.id ? 600 : 500,
            background: tab===t.id ? 'var(--surface-container-lowest)' : 'transparent',
            color: tab===t.id ? 'var(--primary)' : 'var(--on-surface-variant)',
            boxShadow: tab===t.id ? 'var(--ambient-shadow)' : 'none', transition:'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'compose' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:'1.25rem', alignItems:'start' }}>

          {/* Left: Compose */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

            {/* Email subject */}
            <div className="card">
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>
                <Icon name="subject" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} />
                Email Content
              </h3>
              <div style={{ marginBottom:'0.875rem' }}>
                <label className="label">Subject *</label>
                <input className="input" type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…" />
              </div>
              <div style={{ marginBottom:'0.875rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.375rem' }}>
                  <label className="label" style={{ margin:0 }}>Body <span style={{ fontWeight:400, color:'var(--on-surface-variant)' }}>(HTML)</span></label>
                  <button onClick={() => setPreview(p => !p)} className="btn-ghost" style={{ fontSize:'0.8125rem', padding:'0.25rem 0.625rem' }}>
                    <Icon name={preview ? 'code' : 'preview'} style={{ fontSize:'0.875rem' }} /> {preview ? 'Edit' : 'Preview'}
                  </button>
                </div>
                {preview ? (
                  <div style={{ border:'1px solid var(--outline-variant)', borderRadius:'0.5rem', padding:'1rem', minHeight:280, background:'#fff', color:'#111', fontSize:'0.9rem', lineHeight:1.6 }}
                    dangerouslySetInnerHTML={{ __html: body }} />
                ) : (
                  <textarea className="textarea" rows={14} value={body} onChange={e => setBody(e.target.value)}
                    style={{ fontFamily:'monospace', fontSize:'0.8125rem', resize:'vertical' }} />
                )}
              </div>

              {/* Extra emails */}
              <div style={{ borderTop:'1px solid var(--outline-variant)', paddingTop:'0.875rem' }}>
                <label className="label">Add Extra Emails <span style={{ fontWeight:400, color:'var(--on-surface-variant)' }}>(optional — comma or space separated)</span></label>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <input className="input" type="text" value={extraInput} onChange={e => setExtraInput(e.target.value)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ',') && addExtraEmail()}
                    placeholder="email@example.com, another@example.com…" style={{ flex:1 }} />
                  <button onClick={addExtraEmail} className="btn-secondary">Add</button>
                </div>
                {extraEmails.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem', marginTop:'0.625rem' }}>
                    {extraEmails.map(e => (
                      <span key={e} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.75rem', fontWeight:600, background:'rgba(68,104,176,0.1)', color:'var(--primary)' }}>
                        {e}
                        <button onClick={() => setExtraEmails(prev => prev.filter(x => x !== e))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--primary)', fontWeight:700, fontSize:'0.875rem', padding:0, lineHeight:1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div style={{ marginTop:'0.875rem', padding:'0.625rem 0.875rem', background:'var(--error-container)', borderRadius:'0.5rem', fontSize:'0.8125rem', color:'var(--error)' }}>
                  <Icon name="error" style={{ fontSize:'1rem', marginRight:'0.375rem' }} />{error}
                </div>
              )}

              {result && (
                <div style={{ marginTop:'0.875rem', padding:'1rem', background:'rgba(0,98,67,0.08)', borderRadius:'0.625rem', border:'1px solid rgba(0,98,67,0.2)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.375rem' }}>
                    <Icon name="check_circle" style={{ fontSize:'1.25rem', color:'var(--tertiary)' }} />
                    <strong style={{ color:'var(--tertiary)' }}>Emails Sent!</strong>
                  </div>
                  <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', margin:0 }}>
                    ✅ {result.sent_count} sent successfully from <strong>{result.sent_from}</strong>
                    {result.failed_count > 0 && ` · ⚠️ ${result.failed_count} failed`}
                  </p>
                </div>
              )}

              <button onClick={handleSend} disabled={sending || totalNew === 0} style={{
                marginTop:'1rem', width:'100%', padding:'0.75rem', borderRadius:'0.625rem', border:'none',
                fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9375rem', color:'#fff',
                background: (sending || totalNew === 0) ? 'var(--outline-variant)' : 'linear-gradient(135deg,var(--tertiary),#009966)',
                cursor: (sending || totalNew === 0) ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
              }}>
                <Icon name={sending ? 'progress_activity' : 'send'} style={{ fontSize:'1.125rem', color:'#fff' }} />
                {sending ? 'Sending…' : `Send to ${totalNew} Recipient${totalNew !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          {/* Right: Recipient list */}
          <div className="card" style={{ padding:'1.25rem', maxHeight:'75vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.875rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>
                <Icon name="group" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} />
                Recipients
              </h3>
              <span style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>{pendingCount} pending</span>
            </div>

            <input className="input" type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, company…" style={{ marginBottom:'0.625rem', fontSize:'0.8125rem' }} />

            <div style={{ display:'flex', gap:'0.375rem', marginBottom:'0.875rem', flexWrap:'wrap' }}>
              {[{ id:'pending', label:'Pending' },{ id:'sent', label:'Sent' },{ id:'all', label:'All' }].map(f => (
                <button key={f.id} onClick={() => setFilterSent(f.id)} style={{
                  padding:'0.25rem 0.75rem', borderRadius:9999, fontSize:'0.75rem', fontWeight:600, border:'1px solid',
                  borderColor: filterSent===f.id ? 'var(--primary)' : 'var(--outline-variant)',
                  background: filterSent===f.id ? 'rgba(68,104,176,0.1)' : 'transparent',
                  color: filterSent===f.id ? 'var(--primary)' : 'var(--on-surface-variant)', cursor:'pointer',
                }}>{f.label}</button>
              ))}
            </div>

            <div style={{ flex:1, overflowY:'auto' }}>
              {loading ? (
                <div style={{ textAlign:'center', padding:'2rem', color:'var(--on-surface-variant)' }}>
                  <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign:'center', padding:'2rem', color:'var(--on-surface-variant)' }}>
                  <Icon name="search_off" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.3 }} />
                  No recipients match.
                </div>
              ) : (
                filtered.map((r, i) => (
                  <div key={r.email} style={{
                    display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.5rem 0.625rem',
                    borderRadius:'0.5rem', marginBottom:'0.25rem',
                    background: i % 2 === 0 ? 'transparent' : 'var(--surface-container-low)',
                  }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                      background: r.already_sent ? 'rgba(0,98,67,0.1)' : 'rgba(68,104,176,0.1)' }}>
                      <Icon name={r.already_sent ? 'check' : 'person'} style={{ fontSize:'0.875rem', color: r.already_sent ? 'var(--tertiary)' : 'var(--primary)' }} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:600, fontSize:'0.8125rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--on-surface)' }}>
                        {r.name || r.email}
                      </p>
                      <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {r.email}{r.company ? ` · ${r.company}` : ''}
                      </p>
                    </div>
                    {r.already_sent && (
                      <span style={{ fontSize:'0.625rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)', whiteSpace:'nowrap' }}>Sent</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>
              <Icon name="history" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} /> Sent History
            </h3>
            <button onClick={loadHistory} className="btn-ghost" style={{ fontSize:'0.8125rem' }}>
              <Icon name="refresh" style={{ fontSize:'1rem' }} /> Refresh
            </button>
          </div>
          {histLoading ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--on-surface-variant)' }}>
              <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} /> Loading history…
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--on-surface-variant)' }}>
              <Icon name="mark_email_unread" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.3 }} />
              No emails sent yet.
            </div>
          ) : (
            <div className="table-scroll-wrapper">
              <table className="data-table" style={{ margin:0 }}>
                <thead>
                  <tr style={{ background:'var(--surface-container-low)' }}>
                    {['Sent To','Sent By','Subject','Date'].map(h => (
                      <th key={h} style={{ padding:'0.625rem 1rem', textAlign:'left', fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', color:'var(--on-surface-variant)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td style={{ padding:'0.625rem 1rem', fontSize:'0.875rem' }}>{h.sent_to}</td>
                      <td style={{ padding:'0.625rem 1rem', fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>{h.sent_by_name || h.sent_by_email || '—'}</td>
                      <td style={{ padding:'0.625rem 1rem', fontSize:'0.875rem', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.subject || '—'}</td>
                      <td style={{ padding:'0.625rem 1rem', fontSize:'0.875rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>{h.sent_at ? new Date(h.sent_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
