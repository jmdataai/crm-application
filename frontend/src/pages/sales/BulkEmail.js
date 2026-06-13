import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { bulkEmailAPI, emailTrackingAPI } from '../../services/api';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DEFAULT_SUBJECT = 'Introduction – JM Data Talent | IT Staffing & Consulting';

// Change this value to update the PIN. No backend redeploy needed.
const SEND_PIN = '1234';

// Default plain text body (shown in Plain Text mode)
const DEFAULT_PLAIN_BODY = `Hi {name},

I hope you are doing well.

I would like to take this opportunity to introduce our company, JM Data Talent, an Ireland-based IT staffing and consulting firm specializing in providing highly skilled technology professionals across various domains.

At JM Data Talent, we support clients with contract, C2C, and full-time hiring requirements across technologies such as:
• Salesforce
• SAP
• Data Engineering
• Cloud Technologies
• Java & Full Stack
• Business Intelligence
• DevOps
• AI & Analytics

We have a strong network of experienced consultants and technical professionals available for immediate and upcoming project requirements. Our focus is on delivering quality resources with quick turnaround time while maintaining long-term business relationships with our clients and partners.

We would be glad to collaborate with your organization and support your hiring needs. Please let us know your current requirements, and we will be happy to share suitable profiles for your review.

Looking forward to the opportunity to work together.

Best regards,
JM Data Talent Team
jmdatatalent.com`;

// Default HTML body (shown in HTML mode)
const DEFAULT_HTML_BODY = `<p>Hi {name},</p>

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

/** Convert plain text (with blank-line paragraphs) to Outlook-style HTML */
function plainTextToHtml(text) {
  if (!text) return '';
  const paragraphs = text.split(/\n\n+/);
  const parts = paragraphs.map(para => {
    const escaped = para
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `<p style="margin:0 0 14px 0;">${escaped}</p>`;
  });
  return `<div style="font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:14px;color:#000;line-height:1.6;">${parts.join('')}</div>`;
}

const parseEmailInput = (value) =>
  value
    .split(/[\s,;]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => e && e.includes('@'));

export default function BulkEmail() {
  const { isMobile } = useBreakpoint();
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [subject, setSubject]       = useState(DEFAULT_SUBJECT);

  // Editor mode: 'text' = plain (no HTML knowledge needed) | 'html' = raw HTML
  const [editorMode, setEditorMode] = useState('text');
  const [plainBody, setPlainBody]   = useState(DEFAULT_PLAIN_BODY);
  const [htmlBody, setHtmlBody]     = useState(DEFAULT_HTML_BODY);
  const [preview, setPreview]       = useState(false);

  const [extraInput, setExtraInput]   = useState('');
  const [extraEmails, setExtraEmails] = useState([]);
  const [testInput, setTestInput]     = useState('');
  const [testEmails, setTestEmails]   = useState([]);

  const [sending, setSending]         = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [result, setResult]           = useState(null);
  const [testResult, setTestResult]   = useState(null);
  const [error, setError]             = useState('');
  const [testError, setTestError]     = useState('');

  // PIN confirmation modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput]         = useState('');
  const [pinError, setPinError]         = useState('');

  const [tab, setTab]             = useState('compose');
  const [history, setHistory]     = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // ── Feature 1: Email Analytics state ─────────────────────────
  const [analytics, setAnalytics]       = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [detailDrawer, setDetailDrawer]   = useState(null); // campaign subject for details drawer

  // Manually skipped emails (✕ button) — only excluded for this send session
  const [excluded, setExcluded] = useState(new Set());

  // Cascading filters: location (single) → company (multi, scoped to location)
  const [search, setSearch]                   = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');     // '' = all locations
  const [selectedCompanies, setSelectedCompanies] = useState(new Set()); // '' set = all companies
  const [companyDropOpen, setCompanyDropOpen] = useState(false);

  // The HTML body to actually send, computed from current editor mode
  const currentHtmlBody = editorMode === 'text' ? plainTextToHtml(plainBody) : htmlBody;

  const loadRecipients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bulkEmailAPI.getRecipients();
      setRecipients(res.data?.recipients || []);
    } catch {
      setError('Failed to load recipients.');
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
  useEffect(() => { if (tab === 'history')   loadHistory(); }, [tab, loadHistory]);

  // ── Feature 1: load analytics when tab switches ───────────────
  useEffect(() => {
    if (tab !== 'analytics') return;
    setAnalyticsLoading(true);
    Promise.allSettled([
      bulkEmailAPI.getSent(),
      emailTrackingAPI.getStats().catch(() => ({ data: null })),
    ]).then(([sentRes, statsRes]) => {
      const sent  = sentRes.status  === 'fulfilled' ? (sentRes.value?.data  || []) : [];
      const stats = statsRes.status === 'fulfilled' ? (statsRes.value?.data || null) : null;
      // Build campaigns from sent history — group by subject
      const campaignMap = {};
      for (const s of sent) {
        const key = s.subject || '(no subject)';
        if (!campaignMap[key]) campaignMap[key] = { subject: key, date: s.sent_at, recipients: 0, opens: 0, clicks: 0, rows: [] };
        campaignMap[key].recipients++;
        campaignMap[key].rows.push(s);
        if (s.sent_at > campaignMap[key].date) campaignMap[key].date = s.sent_at;
      }
      // Merge events data if available
      const events = stats?.events || [];
      for (const ev of events) {
        const key = ev.subject || '(no subject)';
        if (campaignMap[key]) {
          if (ev.event_type === 'open')  campaignMap[key].opens++;
          if (ev.event_type === 'click') campaignMap[key].clicks++;
        }
      }
      const campaigns = Object.values(campaignMap).sort((a, b) => (b.date||'').localeCompare(a.date||''));
      const hotLeads  = stats?.hot_leads || [];
      const totalSent = sent.length;
      const totalOpens= events.filter(e => e.event_type === 'open').length;
      const totalClicks = events.filter(e => e.event_type === 'click').length;
      setAnalytics({ campaigns, hotLeads, totalSent, totalOpens, totalClicks, sent });
    }).finally(() => setAnalyticsLoading(false));
  }, [tab]);

  // Close company dropdown on outside click
  useEffect(() => {
    if (!companyDropOpen) return;
    const h = (e) => { if (!e.target.closest('[data-company-drop]')) setCompanyDropOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [companyDropOpen]);

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

  const toggleExclude   = (email) => setExcluded(prev => { const n=new Set(prev); n.has(email)?n.delete(email):n.add(email); return n; });
  const toggleCompany   = (co)    => setSelectedCompanies(prev => { const n=new Set(prev); n.has(co)?n.delete(co):n.add(co); return n; });

  // When location changes, reset company selection
  const handleLocationChange = (loc) => { setSelectedLocation(loc); setSelectedCompanies(new Set()); };

  const allLocations = useMemo(() =>
    [...new Set(recipients.map(r => r.hq_location).filter(Boolean))].sort()
  , [recipients]);

  // Companies available for the currently selected location (or all if none selected)
  const companiesForLocation = useMemo(() => {
    const base = selectedLocation
      ? recipients.filter(r => r.hq_location === selectedLocation)
      : recipients;
    return [...new Set(base.map(r => r.company).filter(Boolean))].sort();
  }, [recipients, selectedLocation]);

  /**
   * FILTERED = recipients matching search + location + company selections.
   * No "already sent" exclusion — she controls list only via filters + ✕ skip.
   */
  const filtered = useMemo(() => recipients.filter(r => {
    const q = search.toLowerCase();
    const matchSearch  = !search || r.email.includes(q) || r.name?.toLowerCase().includes(q) || r.company?.toLowerCase().includes(q);
    const matchLoc     = !selectedLocation || r.hq_location === selectedLocation;
    const matchCompany = selectedCompanies.size === 0 || selectedCompanies.has(r.company);
    return matchSearch && matchLoc && matchCompany;
  }), [recipients, search, selectedLocation, selectedCompanies]);

  // Recipients who will receive the email on Send
  const activeRecipients = useMemo(() =>
    filtered.filter(r => !excluded.has(r.email))
  , [filtered, excluded]);

  const totalToSend = activeRecipients.length + extraEmails.filter(e => !excluded.has(e)).length;
  const sentCount   = recipients.filter(r => r.already_sent).length; // visual info only

  const hasFilters = search || selectedLocation || selectedCompanies.size > 0;

  // Step 1: validate → open PIN modal
  const requestSend = () => {
    const body = editorMode === 'text' ? plainBody : htmlBody;
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required.'); return; }
    if (totalToSend === 0) { setError('No recipients to send to after current filters.'); return; }
    setError(''); setPinInput(''); setPinError('');
    setShowPinModal(true);
  };

  // Step 2: verify PIN → send
  const handleSend = async () => {
    if (pinInput !== SEND_PIN) { setPinError('Incorrect PIN. Please try again.'); setPinInput(''); return; }
    setShowPinModal(false);
    setSending(true); setError(''); setResult(null);
    try {
      const targetEmails = [
        ...activeRecipients.map(r => r.email),
        ...extraEmails.filter(e => !excluded.has(e)),
      ];
      const res = await bulkEmailAPI.send({
        subject,
        html_body: currentHtmlBody,
        extra_emails: [],
        target_emails: targetEmails,
        excluded_emails: [],
      });
      setResult(res.data);
      setExcluded(new Set());
      await loadRecipients();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Send failed. Check Microsoft Graph / Azure configuration.');
    } finally { setSending(false); }
  };

  const handleTestSend = async () => {
    const body = editorMode === 'text' ? plainBody : htmlBody;
    if (!subject.trim() || !body.trim()) { setTestError('Subject and body are required.'); return; }
    if (testEmails.length === 0) { setTestError('Add at least one test email address.'); return; }
    setTestSending(true); setTestError(''); setTestResult(null);
    try {
      const res = await bulkEmailAPI.sendTest({ subject, html_body: currentHtmlBody, test_emails: testEmails });
      setTestResult(res.data);
    } catch (e) {
      setTestError(e?.response?.data?.detail || 'Test send failed.');
    } finally { setTestSending(false); }
  };

  const chipStyle = { display:'inline-flex', alignItems:'center', gap:4, padding:'0.2rem 0.625rem', borderRadius:9999, fontSize:'0.75rem', fontWeight:600, background:'rgba(68,104,176,0.1)', color:'var(--primary)' };

  return (
    <div className="fade-in">

      {/* ── Header ── */}
      <div style={{ marginBottom:'1.5rem' }}>
        <p className="label-sm" style={{ color:'var(--tertiary)', marginBottom:'0.25rem' }}>Sales</p>
        <h1 className="headline-sm">Bulk Welcome Email</h1>
        <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>
          Send personalised emails from your Outlook mailbox.
          Use <code style={{ background:'rgba(68,104,176,0.1)', padding:'0 4px', borderRadius:3 }}>{'{name}'}</code> for the contact's first name and{' '}
          <code style={{ background:'rgba(68,104,176,0.1)', padding:'0 4px', borderRadius:3 }}>[Client Name]</code> for the company — auto-replaced per recipient.
          Filter the list on the right, then click Send — emails go to everyone currently showing (minus anyone you manually skip with ✕).
        </p>
      </div>

      {/* ── Test send card ── */}
      <div className="card" style={{ marginBottom:'1.25rem', background:'linear-gradient(135deg,rgba(68,104,176,0.08),rgba(0,98,67,0.06))' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'1rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
          <div>
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.25rem' }}>
              <Icon name="science" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} />
              Send a test first
            </h3>
            <p style={{ margin:0, fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
              Previews your current subject and body. Variables will appear literally in the test.
            </p>
          </div>
          <button onClick={handleTestSend} disabled={testSending || testEmails.length === 0} className="btn-secondary" style={{ whiteSpace:'nowrap' }}>
            <Icon name={testSending ? 'progress_activity' : 'send'} style={{ fontSize:'1rem' }} />
            {testSending ? 'Sending...' : `Send test to ${testEmails.length || 0}`}
          </button>
        </div>
        <div style={{ marginBottom:'0.75rem' }}>
          <label className="label">Test emails</label>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <input className="input" type="text" value={testInput} onChange={e => setTestInput(e.target.value)}
              onKeyDown={e => (e.key==='Enter'||e.key===',') && addTestEmail()}
              placeholder="tester@example.com..." style={{ flex:1 }} />
            <button onClick={addTestEmail} className="btn-secondary">Add</button>
          </div>
          {testEmails.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem', marginTop:'0.625rem' }}>
              {testEmails.map(email => (
                <span key={email} style={chipStyle}>
                  {email}
                  <button onClick={() => setTestEmails(prev => prev.filter(x=>x!==email))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--primary)', fontWeight:700, fontSize:'0.875rem', padding:0, lineHeight:1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        {testError && <div style={{ padding:'0.625rem 0.875rem', background:'var(--error-container)', borderRadius:'0.5rem', fontSize:'0.8125rem', color:'var(--error)' }}><Icon name="error" style={{ fontSize:'1rem', marginRight:'0.375rem' }} />{testError}</div>}
        {testResult && (
          <div style={{ marginTop:'0.75rem', padding:'0.875rem', background:'rgba(0,98,67,0.08)', borderRadius:'0.625rem', border:'1px solid rgba(0,98,67,0.2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.25rem' }}>
              <Icon name="check_circle" style={{ fontSize:'1.125rem', color:'var(--tertiary)' }} />
              <strong style={{ color:'var(--tertiary)' }}>Test sent!</strong>
            </div>
            <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', margin:0 }}>
              Sent to {testResult.sent_count} address{testResult.sent_count!==1?'es':''} from <strong>{testResult.sent_from}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div style={{ display:'flex', gap:'0.875rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
        {[
          { label:'Total Contacts', value:recipients.length,   icon:'contacts',        color:'var(--primary)' },
          { label:'Previously Sent', value:sentCount,          icon:'mark_email_read', color:'var(--tertiary)' },
          { label:'Sending Now',    value:totalToSend,         icon:'send',            color:'#D97706' },
          { label:'Skipped Today',  value:excluded.size,       icon:'block',           color:'var(--error)' },
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

      {/* ── Tab switcher ── */}
      <div style={{ display:'flex', gap:0, marginBottom:'1.25rem', background:'var(--surface-container-high)', padding:4, borderRadius:'0.875rem', width:'fit-content' }}>
        {[{id:'compose',label:'Compose & Send'},{id:'history',label:'Sent History'},{id:'analytics',label:'📊 Analytics'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'0.5rem 1.25rem', borderRadius:'0.625rem', border:'none', cursor:'pointer',
            fontFamily:'var(--font-display)', fontSize:'0.875rem', fontWeight:tab===t.id?600:500,
            background:tab===t.id?'var(--surface-container-lowest)':'transparent',
            color:tab===t.id?'var(--primary)':'var(--on-surface-variant)',
            boxShadow:tab===t.id?'var(--ambient-shadow)':'none', transition:'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'compose' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 400px', gap:'1.25rem', alignItems:'start' }}>

          {/* ── Left: Compose ── */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>
              <Icon name="subject" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} />
              Email Content
            </h3>

            <div style={{ marginBottom:'0.875rem' }}>
              <label className="label">Subject *</label>
              <input className="input" type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…" />
            </div>

            {/* Editor mode toggle */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem' }}>
              <label className="label" style={{ margin:0 }}>
                Body
                {editorMode==='text' && <span style={{ fontWeight:400, color:'var(--on-surface-variant)', marginLeft:6 }}>— <code style={{ background:'rgba(68,104,176,0.1)', padding:'0 4px', borderRadius:3 }}>{'{name}'}</code> = first name · <code style={{ background:'rgba(68,104,176,0.1)', padding:'0 4px', borderRadius:3 }}>[Client Name]</code> = company</span>}
                {editorMode==='html' && <span style={{ fontWeight:400, color:'var(--on-surface-variant)', marginLeft:6 }}>(HTML)</span>}
              </label>
              <div style={{ display:'flex', gap:3, background:'var(--surface-container-high)', padding:3, borderRadius:'0.5rem' }}>
                {[{id:'text',icon:'text_fields',label:'Plain Text'},{id:'html',icon:'code',label:'HTML'}].map(m => (
                  <button key={m.id} onClick={() => { setEditorMode(m.id); setPreview(false); }} style={{
                    padding:'0.25rem 0.75rem', borderRadius:'0.375rem', border:'none', cursor:'pointer',
                    fontSize:'0.75rem', fontWeight:editorMode===m.id?700:500,
                    background:editorMode===m.id?'var(--surface)':'transparent',
                    color:editorMode===m.id?'var(--primary)':'var(--on-surface-variant)',
                  }}>
                    <Icon name={m.icon} style={{ fontSize:'0.875rem', marginRight:2 }} /> {m.label}
                  </button>
                ))}
                <button onClick={() => setPreview(p=>!p)} style={{
                  padding:'0.25rem 0.75rem', borderRadius:'0.375rem', border:'none', cursor:'pointer',
                  fontSize:'0.75rem', fontWeight:preview?700:500,
                  background:preview?'var(--surface)':'transparent',
                  color:preview?'var(--tertiary)':'var(--on-surface-variant)',
                }}>
                  <Icon name="preview" style={{ fontSize:'0.875rem', marginRight:2 }} /> Preview
                </button>
              </div>
            </div>

            <div style={{ marginBottom:'0.875rem' }}>
              {preview ? (
                <div style={{ border:'1px solid var(--outline-variant)', borderRadius:'0.5rem', padding:'1rem', minHeight:280, background:'#fff', color:'#111', fontSize:'0.9rem', lineHeight:1.6 }}
                  dangerouslySetInnerHTML={{ __html: currentHtmlBody.replace(/\{name\}/g,'<strong style="color:#4468B0">{name}</strong>').replace(/\[Client Name\]/g,'<strong style="color:#4468B0">[Client Name]</strong>') }} />
              ) : editorMode==='text' ? (
                <textarea className="textarea" rows={18} value={plainBody} onChange={e => setPlainBody(e.target.value)}
                  placeholder={`Hi {name},\n\nWrite your message here...`}
                  style={{ fontSize:'0.875rem', resize:'vertical', lineHeight:1.6 }} />
              ) : (
                <textarea className="textarea" rows={16} value={htmlBody} onChange={e => setHtmlBody(e.target.value)}
                  style={{ fontFamily:'monospace', fontSize:'0.8125rem', resize:'vertical' }} />
              )}
            </div>

            {/* Extra emails */}
            <div style={{ borderTop:'1px solid var(--outline-variant)', paddingTop:'0.875rem' }}>
              <label className="label">Add Extra Emails <span style={{ fontWeight:400, color:'var(--on-surface-variant)' }}>(not in the leads list)</span></label>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <input className="input" type="text" value={extraInput} onChange={e=>setExtraInput(e.target.value)}
                  onKeyDown={e=>(e.key==='Enter'||e.key===',')&&addExtraEmail()}
                  placeholder="email@example.com..." style={{ flex:1 }} />
                <button onClick={addExtraEmail} className="btn-secondary">Add</button>
              </div>
              {extraEmails.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem', marginTop:'0.625rem' }}>
                  {extraEmails.map(e => (
                    <span key={e} style={chipStyle}>
                      {e}
                      <button onClick={()=>setExtraEmails(prev=>prev.filter(x=>x!==e))} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--primary)',fontWeight:700,fontSize:'0.875rem',padding:0,lineHeight:1 }}>×</button>
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
                  {result.failed_count > 0 && ` · ⚠️ ${result.failed_count} failed`}
                </p>
              </div>
            )}

            <button onClick={requestSend} disabled={sending||totalToSend===0} style={{
              marginTop:'1rem', width:'100%', padding:'0.75rem', borderRadius:'0.625rem', border:'none',
              fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9375rem', color:'#fff',
              background:(sending||totalToSend===0)?'var(--outline-variant)':'linear-gradient(135deg,var(--tertiary),#009966)',
              cursor:(sending||totalToSend===0)?'not-allowed':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
            }}>
              <Icon name={sending?'progress_activity':'send'} style={{ fontSize:'1.125rem', color:'#fff' }} />
              {sending ? 'Sending…' : `Send to ${totalToSend} Recipient${totalToSend!==1?'s':''}`}
              {selectedLocation && !sending && <span style={{ fontSize:'0.75rem', fontWeight:500, opacity:0.85 }}>({selectedLocation}{selectedCompanies.size>0?` · ${selectedCompanies.size} co.`:''})</span>}
            </button>
          </div>

          {/* ── Right: Recipient list ── */}
          <div className="card" style={{ padding:'1.25rem', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.875rem' }}>
              <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>
                <Icon name="group" style={{ fontSize:'1rem', marginRight:'0.375rem', color:'var(--primary)' }} />
                Recipients
              </h3>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                {excluded.size > 0 && (
                  <button onClick={() => setExcluded(new Set())} style={{ fontSize:'0.6875rem', padding:'0.2rem 0.5rem', borderRadius:9999, border:'1px solid var(--error)', color:'var(--error)', background:'transparent', cursor:'pointer', fontWeight:600 }}>
                    Restore {excluded.size}
                  </button>
                )}
                <span style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)' }}>{filtered.length} shown</span>
              </div>
            </div>

            {/* Name / email search */}
            <input className="input" type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name or email…" style={{ marginBottom:'0.5rem', fontSize:'0.8125rem' }} />

            {/* Step 1: Location single-select */}
            {allLocations.length > 0 && (
              <div style={{ marginBottom:'0.375rem' }}>
                <select
                  value={selectedLocation}
                  onChange={e => handleLocationChange(e.target.value)}
                  style={{
                    width:'100%', padding:'0.35rem 0.75rem', borderRadius:'0.5rem', fontSize:'0.8125rem',
                    border:`1px solid ${selectedLocation ? 'var(--primary)' : 'var(--outline-variant)'}`,
                    background: selectedLocation ? 'rgba(68,104,176,0.08)' : 'var(--surface-container-low)',
                    color: selectedLocation ? 'var(--primary)' : 'var(--on-surface-variant)',
                    cursor:'pointer', fontFamily:'var(--font-display)', fontWeight:600, outline:'none',
                  }}
                >
                  <option value="">📍 All Locations ({recipients.length})</option>
                  {allLocations.map(loc => {
                    const cnt = recipients.filter(r => r.hq_location === loc).length;
                    return <option key={loc} value={loc}>📍 {loc} ({cnt})</option>;
                  })}
                </select>
              </div>
            )}

            {/* Step 2: Company multi-select — scoped to selected location */}
            {companiesForLocation.length > 0 && (
              <div data-company-drop style={{ position:'relative', marginBottom:'0.5rem' }}>
                <button
                  onClick={() => setCompanyDropOpen(o => !o)}
                  style={{
                    width:'100%', padding:'0.35rem 0.75rem', borderRadius:'0.5rem', fontSize:'0.8125rem',
                    border:`1px solid ${selectedCompanies.size > 0 ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                    background: selectedCompanies.size > 0 ? 'rgba(0,98,67,0.08)' : 'var(--surface-container-low)',
                    color: selectedCompanies.size > 0 ? 'var(--tertiary)' : 'var(--on-surface-variant)',
                    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between',
                    fontFamily:'var(--font-display)', fontWeight:600,
                  }}
                >
                  <span>
                    🏢 {selectedCompanies.size > 0
                      ? `${selectedCompanies.size} compan${selectedCompanies.size > 1 ? 'ies' : 'y'} selected`
                      : `All Companies (${companiesForLocation.length})`}
                  </span>
                  <Icon name={companyDropOpen ? 'expand_less' : 'expand_more'} style={{ fontSize:'1rem' }} />
                </button>
                {companyDropOpen && (
                  <div style={{
                    position:'absolute', top:'100%', left:0, right:0, zIndex:300,
                    background:'var(--surface-container-lowest)', border:'1px solid var(--outline-variant)',
                    borderRadius:'0.5rem', boxShadow:'0 4px 20px rgba(0,0,0,0.14)',
                    padding:'0.375rem 0', marginTop:2,
                  }}>
                    <div style={{ padding:'0.25rem 0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:'0.6875rem', fontWeight:700, color:'var(--on-surface-variant)', textTransform:'uppercase' }}>
                        {selectedLocation || 'All'} Companies
                      </span>
                      {selectedCompanies.size > 0 && (
                        <button onClick={() => setSelectedCompanies(new Set())}
                          style={{ fontSize:'0.6875rem', background:'none', border:'none', color:'var(--tertiary)', cursor:'pointer', fontWeight:600 }}>
                          Clear
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight:200, overflowY:'auto' }}>
                      {companiesForLocation.map(co => {
                        const cnt = filtered.filter(r => r.company === co).length;
                        return (
                          <label key={co} style={{
                            display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.3rem 0.75rem',
                            cursor:'pointer', fontSize:'0.8125rem', color:'var(--on-surface)',
                            background: selectedCompanies.has(co) ? 'rgba(0,98,67,0.08)' : 'transparent',
                          }}>
                            <input type="checkbox" checked={selectedCompanies.has(co)} onChange={() => toggleCompany(co)}
                              style={{ accentColor:'var(--tertiary)' }} />
                            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{co}</span>
                            <span style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)', flexShrink:0 }}>{cnt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Clear all filters */}
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); handleLocationChange(''); setSelectedCompanies(new Set()); setCompanyDropOpen(false); }}
                style={{ fontSize:'0.6875rem', padding:'0.2rem 0.5rem', borderRadius:9999, border:'1px solid var(--outline-variant)', color:'var(--on-surface-variant)', background:'transparent', cursor:'pointer', marginBottom:'0.375rem', fontWeight:600, alignSelf:'flex-start' }}>
                <Icon name="filter_alt_off" style={{ fontSize:'0.875rem', marginRight:2 }} /> Clear filters
              </button>
            )}

            {/* Recipient rows */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {loading ? (
                <div style={{ textAlign:'center', padding:'2rem', color:'var(--on-surface-variant)' }}>
                  <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} /> Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign:'center', padding:'2rem', color:'var(--on-surface-variant)' }}>
                  <Icon name="search_off" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.3 }} />
                  No recipients match your filters.
                </div>
              ) : (
                filtered.map((r, i) => {
                  const isExcluded = excluded.has(r.email);
                  return (
                    <div key={r.email} style={{
                      display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.45rem 0.625rem',
                      borderRadius:'0.5rem', marginBottom:'0.2rem',
                      background:isExcluded?'rgba(239,68,68,0.06)':i%2===0?'transparent':'var(--surface-container-low)',
                      opacity:isExcluded?0.6:1,
                    }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                        background:isExcluded?'rgba(239,68,68,0.1)':r.already_sent?'rgba(0,98,67,0.1)':'rgba(68,104,176,0.1)' }}>
                        <Icon name={isExcluded?'block':r.already_sent?'check':'person'}
                          style={{ fontSize:'0.875rem', color:isExcluded?'var(--error)':r.already_sent?'var(--tertiary)':'var(--primary)' }} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:600, fontSize:'0.8125rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--on-surface)', textDecoration:isExcluded?'line-through':'none' }}>
                          {r.name || r.company || r.email}
                        </p>
                        <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.email}{r.company?` · ${r.company}`:''}{r.hq_location?` · ${r.hq_location}`:''}
                        </p>
                      </div>
                      {r.already_sent && !isExcluded && (
                        <span style={{ fontSize:'0.6rem', fontWeight:700, padding:'0.1rem 0.375rem', borderRadius:9999, background:'rgba(0,98,67,0.1)', color:'var(--tertiary)', whiteSpace:'nowrap', flexShrink:0 }}>Sent before</span>
                      )}
                      <button onClick={()=>toggleExclude(r.email)} title={isExcluded?'Restore':'Skip this send'}
                        style={{ background:'none', border:'none', cursor:'pointer', flexShrink:0, padding:2, color:isExcluded?'var(--tertiary)':'var(--error)', opacity:0.7 }}>
                        <Icon name={isExcluded?'undo':'remove_circle_outline'} style={{ fontSize:'1rem' }} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sent History tab ── */}
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
              <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem' }} /> Loading…
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
                      <td style={{ padding:'0.625rem 1rem', fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>{h.sent_by_name||h.sent_by_email||'—'}</td>
                      <td style={{ padding:'0.625rem 1rem', fontSize:'0.875rem', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.subject||'—'}</td>
                      <td style={{ padding:'0.625rem 1rem', fontSize:'0.875rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>
                        {h.sent_at ? new Date(h.sent_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ Feature 1: Analytics Tab ═══════════════════════════ */}
      {tab === 'analytics' && (
        <div>
          {analyticsLoading ? (
            <div style={{ textAlign:'center', padding:'4rem', color:'var(--on-surface-variant)' }}>
              <Icon name="progress_activity" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.75rem' }} />
              Loading analytics…
            </div>
          ) : !analytics ? null : (
            <>
              {/* Summary cards */}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap:'0.875rem', marginBottom:'1.5rem' }}>
                {[
                  { label:'Emails Sent',    value: analytics.totalSent,                            icon:'send',          color:'var(--primary)' },
                  { label:'Total Opens',    value: analytics.totalOpens,                           icon:'mark_email_read',color:'#8b5cf6' },
                  { label:'Total Clicks',   value: analytics.totalClicks,                          icon:'ads_click',      color:'#f59e0b' },
                  { label:'Open Rate',      value: analytics.totalSent ? `${Math.round((analytics.totalOpens/analytics.totalSent)*100)}%` : '—', icon:'percent', color:'#10b981' },
                  { label:'Hot Leads 🔥',   value: analytics.hotLeads.length,                     icon:'local_fire_department', color:'#ef4444' },
                ].map(k => (
                  <div key={k.label} className="card" style={{ padding:'1rem', position:'relative', overflow:'hidden' }}>
                    <div style={{ position:'absolute', top:8, right:10, opacity:0.07 }}>
                      <Icon name={k.icon} style={{ fontSize:'2.5rem', color:k.color }} />
                    </div>
                    <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', fontWeight:600, marginBottom:'0.25rem' }}>{k.label}</p>
                    <p style={{ fontSize:'1.5rem', fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Hot leads */}
              {analytics.hotLeads.length > 0 && (
                <div className="card" style={{ marginBottom:'1.25rem', padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'0.875rem 1.25rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                    <span style={{ fontSize:'1.125rem' }}>🔥</span>
                    <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Hot Leads — Opened 3+ Times</h3>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                      <thead style={{ background:'var(--surface-container-low)' }}>
                        <tr>{['Company / Email','Opens','Last Opened','Subject'].map(h => <th key={h} style={{ padding:'0.5rem 1rem', textAlign:'left', fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', color:'var(--on-surface-variant)', borderBottom:'1px solid var(--outline-variant)' }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {analytics.hotLeads.map((h, i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--surface-container)', background:'rgba(239,68,68,0.03)' }}>
                            <td style={{ padding:'0.625rem 1rem', fontWeight:600 }}>{h.email}</td>
                            <td style={{ padding:'0.625rem 1rem' }}><span style={{ fontWeight:800, color:'#ef4444', padding:'0.15rem 0.5rem', background:'rgba(239,68,68,0.1)', borderRadius:9999 }}>{h.open_count}×</span></td>
                            <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)' }}>{h.last_opened ? new Date(h.last_opened).toLocaleDateString('en-IE',{day:'2-digit',month:'short'}) : '—'}</td>
                            <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.subject||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Campaigns table */}
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'0.875rem 1.25rem', borderBottom:'1px solid var(--outline-variant)' }}>
                  <h3 style={{ fontWeight:700, fontSize:'0.9375rem' }}>Sent Campaigns</h3>
                </div>
                {analytics.campaigns.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'3rem', color:'var(--on-surface-variant)' }}>
                    <Icon name="mark_email_unread" style={{ fontSize:'2rem', display:'block', margin:'0 auto 0.5rem', opacity:0.3 }} />
                    No campaigns yet. Send some emails first.
                  </div>
                ) : (
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                      <thead style={{ background:'var(--surface-container-low)' }}>
                        <tr>{['Subject','Date','Recipients','Opened','Clicked','Open Rate',''].map(h => <th key={h} style={{ padding:'0.5rem 1rem', textAlign:'left', fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', color:'var(--on-surface-variant)', borderBottom:'1px solid var(--outline-variant)', whiteSpace:'nowrap' }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {analytics.campaigns.map((c, i) => {
                          const openRate = c.recipients ? Math.round((c.opens / c.recipients) * 100) : 0;
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid var(--surface-container)' }}>
                              <td style={{ padding:'0.625rem 1rem', fontWeight:600, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.subject}</td>
                              <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>{c.date ? new Date(c.date).toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
                              <td style={{ padding:'0.625rem 1rem', fontWeight:600, textAlign:'center' }}>{c.recipients}</td>
                              <td style={{ padding:'0.625rem 1rem', textAlign:'center' }}><span style={{ color:'#8b5cf6', fontWeight:700 }}>{c.opens}</span></td>
                              <td style={{ padding:'0.625rem 1rem', textAlign:'center' }}><span style={{ color:'#f59e0b', fontWeight:700 }}>{c.clicks}</span></td>
                              <td style={{ padding:'0.625rem 1rem', textAlign:'center' }}>
                                <div style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
                                  <div style={{ width:48, height:5, background:'var(--surface-container)', borderRadius:9999, overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:`${openRate}%`, background:openRate>30?'#006243':openRate>10?'#B45309':'#BA1A1A', borderRadius:9999 }} />
                                  </div>
                                  <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--on-surface-variant)' }}>{openRate}%</span>
                                </div>
                              </td>
                              <td style={{ padding:'0.625rem 1rem' }}>
                                <button onClick={() => setDetailDrawer(c)} style={{ fontSize:'0.75rem', color:'var(--primary)', fontWeight:600, background:'none', border:'none', cursor:'pointer' }}>Details →</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Campaign details drawer */}
              {detailDrawer && (
                <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex' }}>
                  <div onClick={() => setDetailDrawer(null)} style={{ flex:1, background:'rgba(12,22,42,0.4)' }} />
                  <div style={{ width:Math.min(440,window.innerWidth-32), background:'var(--surface-container-lowest)', borderLeft:'1px solid var(--outline-variant)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
                    <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                      <h3 style={{ fontWeight:700, fontSize:'0.9375rem', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:'1rem' }}>{detailDrawer.subject}</h3>
                      <button onClick={() => setDetailDrawer(null)} style={{ background:'none', border:'none', cursor:'pointer' }}><Icon name="close" /></button>
                    </div>
                    <div style={{ padding:'1.25rem 1.5rem', flex:1 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.75rem', marginBottom:'1.25rem' }}>
                        {[
                          { l:'Recipients', v: detailDrawer.recipients },
                          { l:'Opened',     v: detailDrawer.opens,  c:'#8b5cf6' },
                          { l:'Clicked',    v: detailDrawer.clicks, c:'#f59e0b' },
                        ].map(k => (
                          <div key={k.l} style={{ padding:'0.75rem', background:'var(--surface-container-low)', borderRadius:'0.625rem', textAlign:'center' }}>
                            <p style={{ fontSize:'1.25rem', fontWeight:800, color:k.c||'var(--primary)', lineHeight:1 }}>{k.v}</p>
                            <p style={{ fontSize:'0.7rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>{k.l}</p>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--on-surface-variant)', marginBottom:'0.75rem' }}>Recipients</p>
                      {detailDrawer.rows.map((r, i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 0', borderBottom:'1px solid var(--surface-container)' }}>
                          <p style={{ fontSize:'0.8125rem', fontWeight:500 }}>{r.sent_to}</p>
                          <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-IE',{day:'2-digit',month:'short'}) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PIN confirmation modal ── */}
      {showPinModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)', backdropFilter:'blur(3px)' }}
          onClick={e => { if (e.target===e.currentTarget) { setShowPinModal(false); setPinError(''); } }}>
          <div style={{ background:'var(--surface)', borderRadius:'1rem', padding:'2rem', width:340, boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:'1px solid var(--outline-variant)' }}>
            <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(68,104,176,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
                <Icon name="lock" style={{ fontSize:'1.75rem', color:'var(--primary)' }} />
              </div>
              <h2 style={{ fontWeight:800, fontSize:'1.125rem', color:'var(--on-surface)', margin:'0 0 0.375rem' }}>Confirm Send</h2>
              <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', margin:0 }}>
                Enter the 4-digit PIN to send to <strong>{totalToSend}</strong> recipient{totalToSend!==1?'s':''}.
                {selectedLocation && <span style={{ display:'block', marginTop:'0.25rem', fontSize:'0.8125rem', color:'var(--primary)' }}>Location: {selectedLocation}{selectedCompanies.size>0?` · ${selectedCompanies.size} companies`:''}</span>}
              </p>
            </div>
            <input type="password" maxLength={4} value={pinInput}
              onChange={e=>{setPinInput(e.target.value.replace(/\D/g,'')); setPinError('');}}
              onKeyDown={e=>e.key==='Enter'&&pinInput.length===4&&handleSend()}
              placeholder="• • • •" autoFocus
              style={{ width:'100%', textAlign:'center', fontSize:'2rem', letterSpacing:'0.5rem', padding:'0.75rem', borderRadius:'0.625rem', boxSizing:'border-box', border:`2px solid ${pinError?'var(--error)':'var(--outline-variant)'}`, background:'var(--surface-container-low)', color:'var(--on-surface)', outline:'none', fontFamily:'monospace', marginBottom:'0.625rem' }}
            />
            {pinError && <p style={{ textAlign:'center', color:'var(--error)', fontSize:'0.8125rem', margin:'0 0 0.75rem', fontWeight:600 }}><Icon name="error" style={{ fontSize:'0.875rem', marginRight:'0.25rem' }} />{pinError}</p>}
            <div style={{ display:'flex', gap:'0.75rem', marginTop:'0.25rem' }}>
              <button onClick={()=>{setShowPinModal(false);setPinError('');setPinInput('');}}
                style={{ flex:1, padding:'0.625rem', borderRadius:'0.5rem', border:'1px solid var(--outline-variant)', background:'transparent', color:'var(--on-surface-variant)', cursor:'pointer', fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.875rem' }}>
                Cancel
              </button>
              <button onClick={handleSend} disabled={pinInput.length!==4}
                style={{ flex:1, padding:'0.625rem', borderRadius:'0.5rem', border:'none',
                  background:pinInput.length===4?'linear-gradient(135deg,var(--tertiary),#009966)':'var(--outline-variant)',
                  color:'#fff', cursor:pinInput.length===4?'pointer':'not-allowed',
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
