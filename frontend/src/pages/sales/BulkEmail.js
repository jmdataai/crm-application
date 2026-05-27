import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { bulkEmailAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DEFAULT_SUBJECT = 'Introduction – JM Data Talent | IT Staffing & Consulting';

// ── Send confirmation PIN ──────────────────────────────────────
// Change this value to update the PIN. No redeploy of backend needed.
const SEND_PIN = '1234';

const DEFAULT_BODY = `<p>Hi [Client Name],</p>

<p>I hope you are doing well.</p>

<p>I would like to take this opportunity to introduce our company, <strong>JM Data Talent</strong>, an Ireland-based IT staffing and consulting firm specializing in providing highly skilled technology professionals across various domains.</p>

<p>At JM Data Talent, we support clients with contract, C2C, and full-time hiring requirements across technologies such as:</p>
<ul>
  <li>Salesforce</li>
  <li>SAP</li>
  <li>Data Engineering</li>
  <li>Cloud Technologies</li>
  <li>Java &amp; Full Stack</li>
  <li>Business Intelligence</li>
  <li>DevOps</li>
  <li>AI &amp; Analytics</li>
</ul>

<p>We have a strong network of experienced consultants and technical professionals available for immediate and upcoming project requirements. Our focus is on delivering quality resources with quick turnaround time while maintaining long-term business relationships with our clients and partners.</p>

<p>We would be glad to collaborate with your organization and support your hiring needs. Please let us know your current requirements, and we will be happy to share suitable profiles for your review.</p>

<p>Looking forward to the opportunity to work together.</p>

<p>Best regards,<br/>
<strong>JM Data Talent Team</strong><br/>
<a href="https://jmdatatalent.com">jmdatatalent.com</a></p>`;

const parseEmailInput = (value) =>
  value
    .split(/[\s,;]+/)
    .map(email => email.trim().toLowerCase())
    .filter(email => email && email.includes('@'));

export default function BulkEmail() {
  const [recipients, setRecipients]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [subject, setSubject]             = useState(DEFAULT_SUBJECT);
  const [body, setBody]                   = useState(DEFAULT_BODY);
  const [extraInput, setExtraInput]       = useState('');
  const [extraEmails, setExtraEmails]     = useState([]);
  const [testInput, setTestInput]         = useState('');
  const [testEmails, setTestEmails]       = useState([]);
  const [sending, setSending]             = useState(false);
  const [testSending, setTestSending]     = useState(false);
  const [result, setResult]               = useState(null);
  const [testResult, setTestResult]       = useState(null);
  const [error, setError]                 = useState('');
  const [testError, setTestError]         = useState('');

  // PIN confirmation modal
  const [showPinModal, setShowPinModal]   = useState(false);
  const [pinInput, setPinInput]           = useState('');
  const [pinError, setPinError]           = useState('');
  const [filterSent, setFilterSent]       = useState('pending');
  const [search, setSearch]               = useState('');
  const [tab, setTab]                     = useState('compose');
  const [history, setHistory]             = useState([]);
  const [histLoading, setHistLoading]     = useState(false);
  const [preview, setPreview]             = useState(false);

  // Manually excluded emails (user clicks ✕ on a pending recipient)
  const [excluded, setExcluded]           = useState(new Set());

  // Location multi-select
  const [locationFilter, setLocationFilter] = useState(new Set());
  const [locationDropOpen, setLocationDropOpen] = useState(false);

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

  // Close location dropdown on outside click
  useEffect(() => {
    if (!locationDropOpen) return;
    const h = (e) => { if (!e.target.closest('[data-loc-drop]')) setLocationDropOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [locationDropOpen]);

  const addExtraEmail = () => {
    const emails = parseEmailInput(extraInput);
    const newOnes = emails.filter(e => !extraEmails.includes(e));
    if (newOnes.length) setExtraEmails(prev => [...prev, ...newOnes]);
    setExtraInput('');
  };

  const addTestEmail = () => {
    const emails = parseEmailInput(testInput);
    const newOnes = emails.filter(e => !testEmails.includes(e));
    if (newOnes.length) setTestEmails(prev => [...prev, ...newOnes]);
    setTestInput('');
  };

  const toggleExclude = (email) => {
    setExcluded(prev => {
      const n = new Set(prev);
      n.has(email) ? n.delete(email) : n.add(email);
      return n;
    });
  };

  const toggleLocation = (loc) => {
    setLocationFilter(prev => {
      const n = new Set(prev);
      n.has(loc) ? n.delete(loc) : n.add(loc);
      return n;
    });
  };

  // All unique locations from recipients
  const allLocations = useMemo(() =>
    [...new Set(recipients.map(r => r.hq_location).filter(Boolean))].sort()
  , [recipients]);

  const filtered = useMemo(() => recipients.filter(r => {
    const matchSearch = !search || r.email.includes(search.toLowerCase()) || r.name?.toLowerCase().includes(search.toLowerCase()) || r.company?.toLowerCase().includes(search.toLowerCase());
    const matchSent   = filterSent === 'all' || (filterSent === 'pending' && !r.already_sent) || (filterSent === 'sent' && r.already_sent);
    const matchLoc    = locationFilter.size === 0 || locationFilter.has(r.hq_location);
    return matchSearch && matchSent && matchLoc;
  }), [recipients, search, filterSent, locationFilter]);

  const pendingCount = recipients.filter(r => !r.already_sent).length;
  const sentCount    = recipients.filter(r => r.already_sent).length;

  // Active send targets = pending recipients visible in current filter, minus manually excluded
  const activePending = useMemo(() =>
    filtered.filter(r => !r.already_sent && !excluded.has(r.email))
  , [filtered, excluded]);

  const totalToSend = activePending.length + extraEmails.filter(e => !excluded.has(e)).length;

  // Step 1: validate inputs, open PIN modal
  const requestSend = () => {
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required.'); return; }
    if (totalToSend === 0) { setError('No recipients to send to.'); return; }
    setError('');
    setPinInput('');
    setPinError('');
    setShowPinModal(true);
  };

  // Step 2: verify PIN then actually send
  const handleSend = async () => {
    if (pinInput !== SEND_PIN) {
      setPinError('Incorrect PIN. Please try again.');
      setPinInput('');
      return;
    }
    setShowPinModal(false);
    setSending(true); setError(''); setResult(null);
    try {
      const targetEmails = [
        ...activePending.map(r => r.email),
        ...extraEmails.filter(e => !excluded.has(e)),
      ];
      const res = await bulkEmailAPI.send({
        subject,
        html_body: body,
        extra_emails: [],
        target_emails: targetEmails,
        excluded_emails: [...excluded],
      });
      setResult(res.data);
      setExcluded(new Set());
      await loadRecipients();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Send failed. Check Microsoft Graph / Azure configuration.');
    } finally { setSending(false); }
  };

  const handleTestSend = async () => {
    if (!subject.trim() || !body.trim()) { setTestError('Subject and body are required.'); return; }
    if (testEmails.length === 0) { setTestError('Add at least one test email address.'); return; }
    setTestSending(true); setTestError(''); setTestResult(null);
    try {
      const res = await bulkEmailAPI.sendTest({ subject, html_body: body, test_emails: testEmails });
      setTestResult(res.data);
    } catch (e) {
      setTestError(e?.response?.data?.detail || 'Test send failed.');
    } finally { setTestSending(false); }
  };

  const chipStyle = (color = 'var(--primary)') => ({
    display:'inline-flex', alignItems:'center', gap:4, padding:'0.2rem 0.625rem',
    borderRadius:9999, fontSize:'0.75rem', fontWeight:600,
    background:`rgba(68,104,176,0.1)`, color,
  });

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <p className="label-sm" style={{ color:'var(--tertiary)', marginBottom:'0.25rem' }}>Sales</p>
        <h1 className="headline-sm">Bulk Welcome Email</h1>
        <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>
          Send personalised welcome emails from your Outlook mailbox. <strong>[Client Name]</strong> is auto-replaced with each company's name.
          Filter by location to send in batches — recipients already contacted are automatically skipped.
        </p>
      </div>

      {/* Test send card */}
      <div className="card" style={{ marginBottom:'1.25rem', background:'linear-gradient(135deg, rgba(68,104,176,0.08), rgba(0,98,67,0.06))' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'1rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
          <div>
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.25rem' }}>
              <Icon name="science" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} />
              Send a test first
            </h3>
            <p style={{ margin:0, fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
              Uses your current subject and body. <strong>[Client Name]</strong> will appear literally in the test.
            </p>
          </div>
          <button onClick={handleTestSend} disabled={testSending || testEmails.length === 0} className="btn-secondary" style={{ whiteSpace:'nowrap' }}>
            <Icon name={testSending ? 'progress_activity' : 'send'} style={{ fontSize:'1rem' }} />
            {testSending ? 'Sending test...' : `Send test to ${testEmails.length || 0}`}
          </button>
        </div>
        <div style={{ marginBottom:'0.75rem' }}>
          <label className="label">Test emails</label>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <input className="input" type="text" value={testInput} onChange={e => setTestInput(e.target.value)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ',') && addTestEmail()}
              placeholder="tester@example.com..." style={{ flex:1 }} />
            <button onClick={addTestEmail} className="btn-secondary">Add</button>
          </div>
          {testEmails.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem', marginTop:'0.625rem' }}>
              {testEmails.map(email => (
                <span key={email} style={chipStyle()}>
                  {email}
                  <button onClick={() => setTestEmails(prev => prev.filter(x => x !== email))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--primary)', fontWeight:700, fontSize:'0.875rem', padding:0, lineHeight:1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        {testError && <div style={{ marginTop:'0.75rem', padding:'0.625rem 0.875rem', background:'var(--error-container)', borderRadius:'0.5rem', fontSize:'0.8125rem', color:'var(--error)' }}><Icon name="error" style={{ fontSize:'1rem', marginRight:'0.375rem' }} />{testError}</div>}
        {testResult && (
          <div style={{ marginTop:'0.75rem', padding:'0.875rem', background:'rgba(0,98,67,0.08)', borderRadius:'0.625rem', border:'1px solid rgba(0,98,67,0.2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.25rem' }}>
              <Icon name="check_circle" style={{ fontSize:'1.125rem', color:'var(--tertiary)' }} />
              <strong style={{ color:'var(--tertiary)' }}>Test email sent</strong>
            </div>
            <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', margin:0 }}>
              Sent to {testResult.sent_count} address{testResult.sent_count !== 1 ? 'es' : ''} from <strong>{testResult.sent_from}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ display:'flex', gap:'0.875rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        {[
          { label:'Total Contacts', value: recipients.length,    icon:'contacts',         color:'var(--primary)' },
          { label:'Pending',        value: pendingCount,         icon:'schedule_send',    color:'#D97706' },
          { label:'Already Sent',   value: sentCount,            icon:'mark_email_read',  color:'var(--tertiary)' },
          { label:'Sending Today',  value: totalToSend,          icon:'send',             color:'var(--primary)' },
          { label:'Skipped',        value: excluded.size,        icon:'block',            color:'var(--error)' },
        ].map(s => (
          <div key={s.label} style={{ flex:'1 1 130px', padding:'0.875rem 1rem', borderRadius:'0.75rem', background:'var(--surface-container-low)', border:'1px solid var(--outline-variant)', display:'flex', gap:'0.75rem', alignItems:'center' }}>
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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 400px', gap:'1.25rem', alignItems:'start' }}>

          {/* Left: Compose */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
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
                  <label className="label" style={{ margin:0 }}>Body <span style={{ fontWeight:400, color:'var(--on-surface-variant)' }}>(HTML) — use <code style={{ background:'rgba(68,104,176,0.1)', padding:'0 4px', borderRadius:3 }}>[Client Name]</code> for personalisation</span></label>
                  <button onClick={() => setPreview(p => !p)} className="btn-ghost" style={{ fontSize:'0.8125rem', padding:'0.25rem 0.625rem' }}>
                    <Icon name={preview ? 'code' : 'preview'} style={{ fontSize:'0.875rem' }} /> {preview ? 'Edit' : 'Preview'}
                  </button>
                </div>
                {preview ? (
                  <div style={{ border:'1px solid var(--outline-variant)', borderRadius:'0.5rem', padding:'1rem', minHeight:280, background:'#fff', color:'#111', fontSize:'0.9rem', lineHeight:1.6 }}
                    dangerouslySetInnerHTML={{ __html: body.replace(/\[Client Name\]/g, '<strong style="color:#4468B0">[Client Name]</strong>') }} />
                ) : (
                  <textarea className="textarea" rows={16} value={body} onChange={e => setBody(e.target.value)}
                    style={{ fontFamily:'monospace', fontSize:'0.8125rem', resize:'vertical' }} />
                )}
              </div>

              {/* Extra emails */}
              <div style={{ borderTop:'1px solid var(--outline-variant)', paddingTop:'0.875rem' }}>
                <label className="label">Add Extra Emails <span style={{ fontWeight:400, color:'var(--on-surface-variant)' }}>(optional)</span></label>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <input className="input" type="text" value={extraInput} onChange={e => setExtraInput(e.target.value)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ',') && addExtraEmail()}
                    placeholder="email@example.com..." style={{ flex:1 }} />
                  <button onClick={addExtraEmail} className="btn-secondary">Add</button>
                </div>
                {extraEmails.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem', marginTop:'0.625rem' }}>
                    {extraEmails.map(e => (
                      <span key={e} style={chipStyle()}>
                        {e}
                        <button onClick={() => setExtraEmails(prev => prev.filter(x => x !== e))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--primary)', fontWeight:700, fontSize:'0.875rem', padding:0, lineHeight:1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {error && <div style={{ marginTop:'0.875rem', padding:'0.625rem 0.875rem', background:'var(--error-container)', borderRadius:'0.5rem', fontSize:'0.8125rem', color:'var(--error)' }}><Icon name="error" style={{ fontSize:'1rem', marginRight:'0.375rem' }} />{error}</div>}

              {result && (
                <div style={{ marginTop:'0.875rem', padding:'1rem', background:'rgba(0,98,67,0.08)', borderRadius:'0.625rem', border:'1px solid rgba(0,98,67,0.2)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.375rem' }}>
                    <Icon name="check_circle" style={{ fontSize:'1.25rem', color:'var(--tertiary)' }} />
                    <strong style={{ color:'var(--tertiary)' }}>Emails Sent!</strong>
                  </div>
                  <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', margin:0 }}>
                    ✅ {result.sent_count} sent from <strong>{result.sent_from}</strong>
                    {result.skipped_count > 0 && ` · ⏭ ${result.skipped_count} skipped`}
                    {result.failed_count > 0 && ` · ⚠️ ${result.failed_count} failed`}
                  </p>
                </div>
              )}

              <button onClick={requestSend} disabled={sending || totalToSend === 0} style={{
                marginTop:'1rem', width:'100%', padding:'0.75rem', borderRadius:'0.625rem', border:'none',
                fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9375rem', color:'#fff',
                background: (sending || totalToSend === 0) ? 'var(--outline-variant)' : 'linear-gradient(135deg,var(--tertiary),#009966)',
                cursor: (sending || totalToSend === 0) ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
              }}>
                <Icon name={sending ? 'progress_activity' : 'send'} style={{ fontSize:'1.125rem', color:'#fff' }} />
                {sending ? 'Sending…' : `Send to ${totalToSend} Recipient${totalToSend !== 1 ? 's' : ''}`}
                {locationFilter.size > 0 && !sending && <span style={{ fontSize:'0.75rem', fontWeight:500, opacity:0.85 }}>({[...locationFilter].join(', ')})</span>}
              </button>
            </div>
          </div>

          {/* Right: Recipient list */}
          <div className="card" style={{ padding:'1.25rem', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.875rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>
                <Icon name="group" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} />
                Recipients
              </h3>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                {excluded.size > 0 && (
                  <button onClick={() => setExcluded(new Set())} style={{ fontSize:'0.6875rem', padding:'0.2rem 0.5rem', borderRadius:9999, border:'1px solid var(--error)', color:'var(--error)', background:'transparent', cursor:'pointer', fontFamily:'var(--font-display)', fontWeight:600 }}>
                    Restore {excluded.size}
                  </button>
                )}
                <span style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>{pendingCount} pending</span>
              </div>
            </div>

            {/* Search */}
            <input className="input" type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, company…" style={{ marginBottom:'0.5rem', fontSize:'0.8125rem' }} />

            {/* Location filter */}
            {allLocations.length > 0 && (
              <div data-loc-drop style={{ position:'relative', marginBottom:'0.5rem' }}>
                <button onClick={() => setLocationDropOpen(o => !o)} style={{
                  width:'100%', padding:'0.35rem 0.75rem', borderRadius:'0.5rem', fontSize:'0.8125rem',
                  border:`1px solid ${locationFilter.size > 0 ? 'var(--primary)' : 'var(--outline-variant)'}`,
                  background: locationFilter.size > 0 ? 'rgba(68,104,176,0.08)' : 'var(--surface-container-low)',
                  color: locationFilter.size > 0 ? 'var(--primary)' : 'var(--on-surface-variant)',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between',
                  fontFamily:'var(--font-display)', fontWeight:600,
                }}>
                  <span><Icon name="location_on" style={{ fontSize:'0.9rem', marginRight:'0.25rem' }} />
                    {locationFilter.size > 0 ? `${[...locationFilter].join(', ')}` : 'Filter by Location'}
                  </span>
                  <Icon name={locationDropOpen ? 'expand_less' : 'expand_more'} style={{ fontSize:'1rem' }} />
                </button>
                {locationDropOpen && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:200, background:'var(--surface-container-lowest)', border:'1px solid var(--outline-variant)', borderRadius:'0.5rem', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', padding:'0.375rem 0', marginTop:2 }}>
                    <div style={{ padding:'0.25rem 0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:'0.6875rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase' }}>Locations</span>
                      {locationFilter.size > 0 && <button onClick={() => { setLocationFilter(new Set()); setLocationDropOpen(false); }} style={{ fontSize:'0.6875rem', background:'none', border:'none', color:'var(--primary)', cursor:'pointer', fontWeight:600 }}>Clear all</button>}
                    </div>
                    <div style={{ maxHeight:180, overflowY:'auto' }}>
                      {allLocations.map(loc => {
                        const cnt = recipients.filter(r => r.hq_location === loc && !r.already_sent).length;
                        return (
                          <label key={loc} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.3rem 0.75rem', cursor:'pointer', fontSize:'0.8125rem', color:'var(--on-surface)', background: locationFilter.has(loc) ? 'rgba(68,104,176,0.08)' : 'transparent' }}>
                            <input type="checkbox" checked={locationFilter.has(loc)} onChange={() => toggleLocation(loc)} style={{ accentColor:'var(--primary)' }} />
                            <span style={{ flex:1 }}>{loc}</span>
                            <span style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)' }}>{cnt} pending</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sent / Pending / All tabs */}
            <div style={{ display:'flex', gap:'0.375rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
              {[{ id:'pending', label:'Pending' },{ id:'sent', label:'Sent' },{ id:'all', label:'All' }].map(f => (
                <button key={f.id} onClick={() => setFilterSent(f.id)} style={{
                  padding:'0.25rem 0.75rem', borderRadius:9999, fontSize:'0.75rem', fontWeight:600, border:'1px solid',
                  borderColor: filterSent===f.id ? 'var(--primary)' : 'var(--outline-variant)',
                  background: filterSent===f.id ? 'rgba(68,104,176,0.1)' : 'transparent',
                  color: filterSent===f.id ? 'var(--primary)' : 'var(--on-surface-variant)', cursor:'pointer',
                }}>{f.label}</button>
              ))}
              {excluded.size > 0 && (
                <span style={{ fontSize:'0.75rem', color:'var(--error)', alignSelf:'center', marginLeft:'auto' }}>
                  {excluded.size} skipped today
                </span>
              )}
            </div>

            {/* Recipient rows */}
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
                filtered.map((r, i) => {
                  const isExcluded = excluded.has(r.email);
                  return (
                    <div key={r.email} style={{
                      display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.45rem 0.625rem',
                      borderRadius:'0.5rem', marginBottom:'0.2rem',
                      background: isExcluded ? 'rgba(239,68,68,0.06)' : i % 2 === 0 ? 'transparent' : 'var(--surface-container-low)',
                      opacity: isExcluded ? 0.6 : 1,
                    }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                        background: r.already_sent ? 'rgba(0,98,67,0.1)' : isExcluded ? 'rgba(239,68,68,0.1)' : 'rgba(68,104,176,0.1)' }}>
                        <Icon name={r.already_sent ? 'check' : isExcluded ? 'block' : 'person'} style={{ fontSize:'0.875rem', color: r.already_sent ? 'var(--tertiary)' : isExcluded ? 'var(--error)' : 'var(--primary)' }} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:600, fontSize:'0.8125rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--on-surface)', textDecoration: isExcluded ? 'line-through' : 'none' }}>
                          {r.name || r.company || r.email}
                        </p>
                        <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.email}{r.company ? ` · ${r.company}` : ''}{r.hq_location ? ` · ${r.hq_location}` : ''}
                        </p>
                      </div>
                      {r.already_sent ? (
                        <span style={{ fontSize:'0.625rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)', whiteSpace:'nowrap', flexShrink:0 }}>Sent</span>
                      ) : (
                        <button onClick={() => toggleExclude(r.email)} title={isExcluded ? 'Restore' : 'Skip today'} style={{
                          background:'none', border:'none', cursor:'pointer', flexShrink:0, padding:2,
                          color: isExcluded ? 'var(--tertiary)' : 'var(--error)', opacity:0.7,
                        }}>
                          <Icon name={isExcluded ? 'undo' : 'remove_circle_outline'} style={{ fontSize:'1rem' }} />
                        </button>
                      )}
                    </div>
                  );
                })
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

      {/* ── PIN confirmation modal ── */}
      {showPinModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)', backdropFilter:'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowPinModal(false); setPinError(''); } }}>
          <div style={{ background:'var(--surface)', borderRadius:'1rem', padding:'2rem', width:340, boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:'1px solid var(--outline-variant)' }}>
            <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(68,104,176,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
                <Icon name="lock" style={{ fontSize:'1.75rem', color:'var(--primary)' }} />
              </div>
              <h2 style={{ fontWeight:800, fontSize:'1.125rem', color:'var(--on-surface)', margin:'0 0 0.375rem' }}>Confirm Send</h2>
              <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', margin:0 }}>
                Enter the 4-digit PIN to send to <strong>{totalToSend}</strong> recipient{totalToSend !== 1 ? 's' : ''}.
                {locationFilter.size > 0 && <span style={{ display:'block', marginTop:'0.25rem', fontSize:'0.8125rem', color:'var(--primary)' }}>Location: {[...locationFilter].join(', ')}</span>}
              </p>
            </div>

            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={e => { setPinInput(e.target.value.replace(/\D/g,'')); setPinError(''); }}
              onKeyDown={e => e.key === 'Enter' && pinInput.length === 4 && handleSend()}
              placeholder="• • • •"
              autoFocus
              style={{
                width:'100%', textAlign:'center', fontSize:'2rem', letterSpacing:'0.5rem',
                padding:'0.75rem', borderRadius:'0.625rem', boxSizing:'border-box',
                border: `2px solid ${pinError ? 'var(--error)' : 'var(--outline-variant)'}`,
                background:'var(--surface-container-low)', color:'var(--on-surface)',
                outline:'none', fontFamily:'monospace', marginBottom:'0.625rem',
              }}
            />

            {pinError && (
              <p style={{ textAlign:'center', color:'var(--error)', fontSize:'0.8125rem', margin:'0 0 0.75rem', fontWeight:600 }}>
                <Icon name="error" style={{ fontSize:'0.875rem', marginRight:'0.25rem' }} />{pinError}
              </p>
            )}

            <div style={{ display:'flex', gap:'0.75rem', marginTop:'0.25rem' }}>
              <button onClick={() => { setShowPinModal(false); setPinError(''); setPinInput(''); }}
                style={{ flex:1, padding:'0.625rem', borderRadius:'0.5rem', border:'1px solid var(--outline-variant)', background:'transparent', color:'var(--on-surface-variant)', cursor:'pointer', fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.875rem' }}>
                Cancel
              </button>
              <button onClick={handleSend} disabled={pinInput.length !== 4}
                style={{ flex:1, padding:'0.625rem', borderRadius:'0.5rem', border:'none',
                  background: pinInput.length === 4 ? 'linear-gradient(135deg,var(--tertiary),#009966)' : 'var(--outline-variant)',
                  color:'#fff', cursor: pinInput.length === 4 ? 'pointer' : 'not-allowed',
                  fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.875rem' }}>
                Confirm Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
