import React, { useState, useRef, useCallback } from 'react';
import { leadsAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

// Enrichment via /api/enrich/* — Apify key stored securely in HuggingFace env

/* ── Proper RFC 4180 CSV parser ──────────────────────────────
   Handles: BOM, CRLF row separators, quoted commas,
   AND embedded LF newlines inside quoted fields.        ── */
function parseCSVRobust(text) {
  const src = text.replace(/^\uFEFF/, '');
  const records = [];
  let field = '', row = [], inQ = false, i = 0;

  while (i < src.length) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped ""
        inQ = false; i++; continue;                                  // closing quote
      }
      field += c; i++; continue; // embedded newlines are part of field when in quotes
    }
    if (c === '"')  { inQ = true; i++; continue; }
    if (c === ',')  { row.push(field.trim()); field = ''; i++; continue; }
    if (c === '\r' && src[i + 1] === '\n') { // CRLF
      row.push(field.trim()); field = '';
      if (row.some(v => v !== '')) records.push(row);
      row = []; i += 2; continue;
    }
    if (c === '\n') { // LF-only (Unix)
      row.push(field.trim()); field = '';
      if (row.some(v => v !== '')) records.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some(v => v !== '')) records.push(row);
  }
  if (records.length < 2) return { headers: [], rows: [] };
  const headers = records[0].map(h => h.replace(/^"|"$/g, ''));
  const rows = records.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = r[j] || ''; });
    return obj;
  });
  return { headers, rows };
}

/* ── Smart column detection — covers all known CSV formats ── */
const SYNONYMS = {
  email:     ['email','e-mail','work email','business email','emailaddress','email_address','person email','work_email','primary email','contact email'],
  phone:     ['phone','mobile','mobile_number','mobile number','phone number','cell','telephone','contact number','work phone','direct phone','phonenumber','phone_number'],
  linkedin:  ['linkedin','linkedin_url','linkedin url','profile url','linkedin profile','profileurl','linkedin profile url','linkedin_profile_url','person linkedin url'],
  full_name: ['full name','fullname','name','full_name','contact name','person name','lead name'],
  first_name:['first name','firstname','first_name','fname','given name','first'],
  last_name: ['last name','lastname','last_name','lname','surname','last'],
  company:   ['company','company_name','company name','organization','employer','account'],
  title:     ['title','job title','jobtitle','job_title','position','role','headline'],
};

function detectCol(headers, field) {
  return headers.find(h => (SYNONYMS[field]||[]).includes(h.toLowerCase().trim())) || null;
}

/* ── Detect ALL columns from a header row ────────────────── */
function detectAllCols(headers) {
  const cols = {};
  for (const field of Object.keys(SYNONYMS)) {
    cols[field] = detectCol(headers, field);
  }
  return cols;
}

/* ── Get display name from a row ─────────────────────────── */
function getRowName(row, cols) {
  if (cols.full_name && row[cols.full_name]?.trim()) return row[cols.full_name].trim();
  const f = cols.first_name ? row[cols.first_name]?.trim() : '';
  const l = cols.last_name  ? row[cols.last_name]?.trim()  : '';
  if (f || l) return [f, l].filter(Boolean).join(' ');
  return '(no name)';
}

/* ── Small UI helpers ─────────────────────────────────────── */
const Pill = ({ children, color, bg }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'0.15rem 0.55rem', borderRadius:9999, fontSize:'0.6875rem', fontWeight:700, color, background:bg, whiteSpace:'nowrap' }}>
    {children}
  </span>
);

const StatCard = ({ label, value, icon, color }) => (
  <div className="card hover-lift" style={{ padding:'1rem', position:'relative', overflow:'hidden' }}>
    <div style={{ position:'absolute', top:8, right:10, opacity:0.07 }}>
      <Icon name={icon} style={{ fontSize:'3rem', color }} />
    </div>
    <p className="label-sm" style={{ marginBottom:'0.5rem' }}>{label}</p>
    <span style={{ fontSize:'2rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{value}</span>
  </div>
);

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════ */
export default function EnrichLeads() {
  const fileRef = useRef();

  const [rows,     setRows]     = useState([]);
  const [headers,  setHeaders]  = useState([]);
  const [cols,     setCols]     = useState({});
  const [fileName, setFileName] = useState('');

  // enrichment state
  const [enriching, setEnriching] = useState(false);
  const [runId,     setRunId]     = useState(null);
  const [progress,  setProgress]  = useState({ done:0, total:0 });
  const [pollTimer, setPollTimer] = useState(null);
  const [enriched,  setEnriched]  = useState([]);   // merged rows after enrichment
  const [step,      setStep]      = useState('upload');  // upload | preview | enriching | done
  const [error,     setError]     = useState('');

  // import state
  const [importing, setImporting] = useState(false);
  const [imported,  setImported]  = useState(0);
  // table view toggle
  const [showAllRows, setShowAllRows] = useState(false);

  /* ── Parse uploaded file ─────────────────────────────── */
  const handleFile = useCallback((file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      alert('Please save your Excel file as CSV first:\nFile → Save As → CSV (Comma-delimited).\nThis is needed to read the data correctly.');
      return;
    }
    if (ext !== 'csv') {
      alert('Only CSV files are supported.');
      return;
    }
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { headers: hdrs, rows: rs } = parseCSVRobust(e.target.result);
        if (!hdrs.length || !rs.length) throw new Error('File appears empty or could not be parsed.');
        const detectedCols = detectAllCols(hdrs);
        setHeaders(hdrs);
        setCols(detectedCols);
        setRows(rs);
        setEnriched([]);
        setStep('preview');
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  /* ── Compute what's missing (the core dynamic logic) ─── */
  const linkedinCol = cols.linkedin;
  const emailCol    = cols.email;
  const phoneCol    = cols.phone;

  // Which rows are enrichable (have LinkedIn URL)
  const enrichableRows = rows.filter(r => linkedinCol && r[linkedinCol]?.trim());

  // Rows missing email that have LinkedIn
  const missingEmail = rows.filter(r =>
    linkedinCol && r[linkedinCol]?.trim() &&
    (!emailCol || !r[emailCol]?.trim())
  );

  // Rows missing phone that have LinkedIn
  const missingPhone = rows.filter(r =>
    linkedinCol && r[linkedinCol]?.trim() &&
    (!phoneCol || !r[phoneCol]?.trim())
  );

  // Rows to enrich = any row with LinkedIn that is missing email OR phone
  const toEnrich = rows.filter(r =>
    linkedinCol && r[linkedinCol]?.trim() && (
      (!emailCol || !r[emailCol]?.trim()) ||
      (!phoneCol || !r[phoneCol]?.trim())
    )
  );

  /* ── Start enrichment ────────────────────────────────── */
  const startEnrich = async () => {
    if (!linkedinCol)          { setError('No LinkedIn URL column detected.'); return; }
    if (toEnrich.length === 0) { setError('All rows already have email and phone. Nothing to enrich.'); return; }

    if (pollTimer) { clearInterval(pollTimer); setPollTimer(null); }
    setEnriching(true);
    setError('');
    setStep('enriching');
    setProgress({ done:0, total: toEnrich.length });

    const linkedin_urls = toEnrich.map(r => r[linkedinCol].trim());

    try {
      // Call backend — Apify key stays secure on server, never exposed to browser
      const startRes = await fetch('/api/enrich/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ linkedin_urls }),
      });

      if (!startRes.ok) {
        const e = await startRes.json().catch(() => ({}));
        throw new Error(e?.detail || `Server error ${startRes.status}`);
      }

      const { run_id } = await startRes.json();
      setRunId(run_id);

      // Poll backend every 5 seconds
      const timer = setInterval(async () => {
        try {
          const pollRes  = await fetch(`/api/enrich/status/${run_id}`, { credentials:'include' });
          const pollData = await pollRes.json();
          const status   = pollData.status;

          if (pollData.processed !== undefined)
            setProgress({ done: pollData.processed, total: toEnrich.length });

          if (status === 'SUCCEEDED') {
            clearInterval(timer); setPollTimer(null);
            const lookup = pollData.results || {};
            const merged = rows.map(row => {
              const li = linkedinCol ? (row[linkedinCol]?.trim() || '').replace(/\/$/, '').toLowerCase() : '';
              const found = lookup[li] || null;
              return { ...row, _e: found?.email || null, _p: found?.phone || null };
            });
            setEnriched(merged); setStep('done'); setEnriching(false);
          } else if (['FAILED','ABORTED','TIMED-OUT'].includes(status)) {
            clearInterval(timer); setPollTimer(null);
            setEnriching(false); setStep('preview');
            setError(`Enrichment run ended with: ${status}. Check your Apify console.`);
          }
        } catch (pe) {
          clearInterval(timer); setPollTimer(null);
          setEnriching(false); setStep('preview');
          setError(`Polling error: ${pe.message}`);
        }
      }, 5000);
      setPollTimer(timer);

    } catch (err) {
      setEnriching(false); setStep('preview');
      setError(`Failed to start enrichment: ${err.message}`);
    }
  };

  /* ── Download enriched CSV ───────────────────────────── */
  const downloadCSV = () => {
    const source = enriched.length ? enriched : rows;
    // Build output headers — original + any new cols we added
    const outHeaders = [...headers];
    if (!emailCol) outHeaders.push('enriched_email');
    if (!phoneCol) outHeaders.push('enriched_phone');

    const lines = [outHeaders.map(h => `"${h}"`).join(',')];
    source.forEach(row => {
      const vals = headers.map(h => {
        let v = row[h] || '';
        if (h === emailCol && !v && row._e) v = row._e;
        if (h === phoneCol && !v && row._p) v = row._p;
        return `"${String(v).replace(/"/g, '""')}"`;
      });
      if (!emailCol && row._e) vals.push(`"${row._e}"`);
      if (!phoneCol && row._p) vals.push(`"${row._p}"`);
      lines.push(vals.join(','));
    });

    const blob = new Blob([lines.join('\n')], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `enriched_${fileName}`;
    a.click();
  };

  /* ── Import to CRM ───────────────────────────────────── */
  const importToCRM = async () => {
    setImporting(true);
    setImported(0);
    const source = enriched.length ? enriched : rows;
    let count = 0;
    for (const row of source) {
      try {
        const name  = getRowName(row, cols);
        if (!name || name === '(no name)') continue;
        const email = (emailCol && row[emailCol]?.trim()) || row._e || null;
        const phone = (phoneCol && row[phoneCol]?.trim()) || row._p || null;
        await leadsAPI.create({
          full_name:    name,
          email:        email || null,
          phone:        phone || null,
          company:      cols.company ? row[cols.company]?.trim() || null : null,
          job_title:    cols.title   ? row[cols.title]?.trim()   || null : null,
          source:       'CSV Import',
          status:       'new',
          linkedin_url: linkedinCol  ? row[linkedinCol]?.trim()  || null : null,
        });
        count++;
        setImported(count);
      } catch { /* skip broken row */ }
    }
    setImporting(false);
    alert(`✅ Successfully imported ${count} leads into your CRM.`);
  };

  /* ── Reset ───────────────────────────────────────────── */
  const reset = () => {
    if (pollTimer) { clearInterval(pollTimer); setPollTimer(null); }
    setRows([]); setHeaders([]); setCols({});
    setEnriched([]); setFileName('');
    setError(''); setRunId(null);
    setStep('upload');
    setEnriching(false);
  };

  /* ── Derived counts for "done" summary ───────────────── */
  const foundEmails = enriched.filter(r => r._e).length;
  const foundPhones = enriched.filter(r => r._p).length;

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div className="fade-in">

      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Enrich Leads</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>
            Upload any leads CSV → missing emails & phones are auto-detected and filled via LinkedIn
          </p>
        </div>
        {step !== 'upload' && (
          <button onClick={reset} className="btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
            <Icon name="upload_file" style={{ fontSize:'1rem' }} /> Upload New File
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom:'1.25rem', padding:'0.875rem 1.25rem', borderRadius:'0.625rem', background:'var(--error-container)', color:'var(--on-error-container)', fontSize:'0.875rem', display:'flex', gap:'0.625rem', alignItems:'flex-start' }}>
          <Icon name="error" style={{ fontSize:'1.1rem', flexShrink:0 }} />
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'inherit' }}><Icon name="close" style={{ fontSize:'1rem' }} /></button>
        </div>
      )}

      {/* ── STEP: UPLOAD ──────────────────────────────────── */}
      {step === 'upload' && (
        <>
          <div
            className="card"
            style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4rem 2rem', textAlign:'center', border:'2px dashed var(--outline-variant)', cursor:'pointer', transition:'all 0.2s' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--primary)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor='var(--outline-variant)'; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--outline-variant)'; handleFile(e.dataTransfer.files[0]); }}
          >
            <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
            <Icon name="upload_file" style={{ fontSize:'3.5rem', color:'var(--primary)', display:'block', marginBottom:'1rem' }} />
            <h2 style={{ fontSize:'1.125rem', fontWeight:700, marginBottom:'0.5rem' }}>Drop your CSV here or click to browse</h2>
            <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'1.5rem', maxWidth:480 }}>
              Works with any leads CSV — Apify, Apollo, LinkedIn exports, manual sheets. We automatically detect which columns have emails and phones and enrich only what's missing.
            </p>
            <button className="btn-primary">Choose CSV File</button>
          </div>

          {/* How it works */}
          <div className="card" style={{ marginTop:'1.5rem', padding:'1.5rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem' }}>How it works</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1.25rem' }}>
              {[
                { n:'1', icon:'upload_file',   title:'Upload any CSV',            desc:'Drop the file. We scan every column automatically — no manual mapping needed.' },
                { n:'2', icon:'auto_fix_high', title:'Auto-detect what\'s missing', desc:'We check which rows are missing email or phone, then use their LinkedIn URL to find both.' },
                { n:'3', icon:'download',      title:'Download or import to CRM',  desc:'Get the enriched CSV back, or push all leads straight into your CRM with one click.' },
              ].map(s => (
                <div key={s.n} style={{ display:'flex', gap:'0.875rem' }}>
                  <div style={{ width:36, height:36, borderRadius:'0.75rem', background:'var(--primary)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:700, fontSize:'1rem' }}>{s.n}</div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:'0.875rem', marginBottom:'0.25rem' }}>{s.title}</p>
                    <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', lineHeight:1.5 }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:'1.25rem', padding:'0.875rem 1rem', borderRadius:'0.625rem', background:'rgba(68,104,176,0.05)', border:'1px solid rgba(68,104,176,0.15)', fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
              <Icon name="info" style={{ fontSize:'1rem', color:'var(--primary)', verticalAlign:'middle', marginRight:'0.375rem' }} />
              Powered by <strong>dev_fusion/linkedin-profile-scraper</strong> — rated 4.8★ from 126 reviews on Apify, 45K+ users.
              Finds emails and publicly visible phone numbers. Requires your Apify API key (free tier included with your $39 plan).
            </div>
          </div>
        </>
      )}

      {/* ── STEPS: PREVIEW / ENRICHING / DONE ─────────────── */}
      {(step === 'preview' || step === 'enriching' || step === 'done') && (
        <>
          {/* Stat cards — DYNAMIC based on actual data */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
            <StatCard label="Rows in File"        value={rows.length}                    icon="group"          color="var(--primary)" />
            <StatCard label="Need Enrichment"     value={toEnrich.length}                icon="auto_fix_high"  color="var(--primary)" />
            <StatCard label="Missing Email"       value={missingEmail.length}            icon="mail_off"       color="var(--amber)" />
            <StatCard label="Missing Phone"       value={missingPhone.length}            icon="phone_disabled" color="var(--amber)" />
          </div>

          {/* Column detection */}
          <div className="card" style={{ marginBottom:'1.25rem', padding:'1rem 1.5rem' }}>
            <p style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.75rem' }}>Detected columns from "{fileName}"</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
              {[
                { label:'Name',     val: cols.full_name || `${cols.first_name||''} + ${cols.last_name||''}`, icon:'person', required:true },
                { label:'Email',    val: emailCol,    icon:'mail',    required:false },
                { label:'Phone',    val: phoneCol,    icon:'phone',   required:false },
                { label:'LinkedIn', val: linkedinCol, icon:'link',    required:true },
                { label:'Company',  val: cols.company,icon:'business',required:false },
              ].map(({ label, val, icon, required }) => {
                const found = val && val.trim() !== '+';
                return (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.375rem 0.75rem', borderRadius:'0.5rem', background: found?'var(--surface-container-low)':'rgba(186,26,26,0.06)', border: required && !found ? '1px solid rgba(186,26,26,0.25)':'none', fontSize:'0.8125rem' }}>
                    <Icon name={icon} style={{ fontSize:'1rem', color: found?'var(--tertiary)':'var(--error)' }} />
                    <span style={{ color:'var(--on-surface-variant)' }}>{label}:</span>
                    <span style={{ fontWeight:600, color: found?'var(--on-surface)':'var(--error)' }}>{found ? val : (required ? '❌ Not found' : '—')}</span>
                  </div>
                );
              })}
            </div>
            {!linkedinCol && (
              <p style={{ marginTop:'0.75rem', fontSize:'0.8125rem', color:'var(--error)', fontWeight:500 }}>
                ⚠️ No LinkedIn URL column detected — enrichment not possible. Check your CSV has a LinkedIn profile URL column.
              </p>
            )}
          </div>

          {/* Enrichment panel */}
          {step !== 'done' && linkedinCol && toEnrich.length > 0 && (
            <div className="card" style={{ marginBottom:'1.25rem', border:'1px solid rgba(68,104,176,0.2)', background:'rgba(68,104,176,0.025)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:'1rem', flexWrap:'wrap' }}>
                <div style={{ width:44, height:44, borderRadius:'0.875rem', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name="auto_fix_high" style={{ fontSize:'1.375rem', color:'#fff' }} />
                </div>
                <div style={{ flex:1, minWidth:240 }}>
                  <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.25rem' }}>
                    Enrich {toEnrich.length} {toEnrich.length===1?'row':'rows'} automatically
                  </h2>
                  <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.875rem' }}>
                    {missingEmail.length > 0 && <Pill color="var(--primary)" bg="rgba(68,104,176,0.1)"><Icon name="mail" style={{ fontSize:'0.875rem' }} /> {missingEmail.length} missing email</Pill>}
                    {missingPhone.length > 0 && <Pill color="#d97706"       bg="rgba(217,119,6,0.1)"><Icon name="phone" style={{ fontSize:'0.875rem' }} /> {missingPhone.length} missing phone</Pill>}
                  </div>
                  <div>
                    <button
                      onClick={startEnrich}
                      disabled={enriching}
                      style={{ display:'inline-flex', alignItems:'center', gap:'0.5rem', padding:'0.625rem 1.5rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor: enriching ? 'not-allowed':'pointer', background: enriching ? 'var(--outline)':'linear-gradient(135deg,var(--primary),#0055cc)', whiteSpace:'nowrap' }}
                    >
                      <Icon name={enriching ? 'hourglass_top':'auto_fix_high'} style={{ fontSize:'1rem', color:'#fff' }} />
                      {enriching ? 'Running…' : `Enrich ${toEnrich.length} Rows`}
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress */}
              {step === 'enriching' && (
                <div style={{ marginTop:'1.25rem', paddingTop:'1.25rem', borderTop:'1px solid var(--outline-variant)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.375rem', fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
                    <span>
                      Apify run: <code style={{ fontSize:'0.75rem', background:'var(--surface-container)', padding:'0.1rem 0.375rem', borderRadius:4 }}>{runId}</code>
                    </span>
                    <span>{progress.done} / {progress.total} processed</span>
                  </div>
                  <div style={{ height:8, background:'var(--surface-container-low)', borderRadius:9999, overflow:'hidden' }}>
                    <div style={{ height:'100%', width: progress.total ? `${Math.max(5,(progress.done/progress.total)*100)}%`:'5%', background:'linear-gradient(90deg,var(--primary),#00aaff)', borderRadius:9999, transition:'width 0.6s ease' }} />
                  </div>
                  <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.375rem' }}>
                    Typically 30–120 seconds for up to 100 profiles. Do not close this page.
                  </p>
                </div>
              )}
            </div>
          )}

          {toEnrich.length === 0 && linkedinCol && step === 'preview' && (
            <div className="card" style={{ marginBottom:'1.25rem', display:'flex', alignItems:'center', gap:'0.75rem', padding:'1rem 1.5rem', background:'rgba(0,98,67,0.04)', border:'1px solid rgba(0,98,67,0.2)' }}>
              <Icon name="check_circle" style={{ fontSize:'1.5rem', color:'var(--tertiary)' }} />
              <p style={{ fontWeight:600 }}>All rows with LinkedIn URLs already have both email and phone. Nothing to enrich!</p>
            </div>
          )}

          {/* Done banner */}
          {step === 'done' && (
            <div className="card" style={{ marginBottom:'1.25rem', border:'1px solid rgba(0,98,67,0.3)', background:'rgba(0,98,67,0.04)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.875rem' }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:'var(--tertiary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon name="check" style={{ fontSize:'1.375rem', color:'#fff' }} />
                  </div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:'1rem' }}>Enrichment complete!</p>
                    <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.25rem', flexWrap:'wrap' }}>
                      {foundEmails > 0 && <Pill color="var(--tertiary)" bg="rgba(0,98,67,0.1)"><Icon name="mail" style={{ fontSize:'0.875rem' }} /> {foundEmails} emails found</Pill>}
                      {foundPhones > 0 && <Pill color="var(--tertiary)" bg="rgba(0,98,67,0.1)"><Icon name="phone" style={{ fontSize:'0.875rem' }} /> {foundPhones} phones found</Pill>}
                      {(missingEmail.length - foundEmails) > 0 && <Pill color="var(--on-surface-variant)" bg="var(--surface-container)">ℹ {missingEmail.length - foundEmails} emails not publicly available</Pill>}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
                  <button onClick={downloadCSV} className="btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
                    <Icon name="download" style={{ fontSize:'1rem' }} /> Download CSV
                  </button>
                  <button onClick={importToCRM} disabled={importing} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor: importing?'not-allowed':'pointer', background: importing?'var(--outline)':'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                    <Icon name={importing?'hourglass_top':'upload'} style={{ fontSize:'1rem', color:'#fff' }} />
                    {importing ? `Importing… (${imported}/${enriched.length})` : 'Import All to CRM'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action bar for preview step */}
          {step === 'preview' && (
            <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1.25rem', flexWrap:'wrap' }}>
              <button onClick={downloadCSV} className="btn-secondary" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem' }}>
                <Icon name="download" style={{ fontSize:'1rem' }} /> Download as CSV
              </button>
              <button onClick={importToCRM} disabled={importing} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', fontSize:'0.875rem', fontWeight:600, color:'#fff', border:'none', cursor: importing?'not-allowed':'pointer', background: importing?'var(--outline)':'linear-gradient(135deg,var(--tertiary),#009966)' }}>
                <Icon name={importing?'hourglass_top':'upload'} style={{ fontSize:'1rem', color:'#fff' }} />
                {importing ? `Importing… (${imported}/${rows.length})` : 'Import All to CRM (current data)'}
              </button>
            </div>
          )}

          {/* Data table */}
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid var(--outline-variant)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
              <div>
                <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.125rem' }}>{fileName}</h2>
                <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', margin:0 }}>
                  {showAllRows ? `All ${rows.length} rows` : toEnrich.length > 0 ? `Showing ${toEnrich.length} rows that need enrichment` : `${rows.length} rows — all complete`}
                </p>
              </div>
              <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap', alignItems:'center' }}>
                {rows.filter(r => emailCol && r[emailCol]?.trim()).length > 0 && (
                  <Pill color="var(--tertiary)" bg="rgba(0,98,67,0.1)">✅ {rows.filter(r => emailCol && r[emailCol]?.trim()).length} have email</Pill>
                )}
                {missingEmail.length > 0 && <Pill color="#d97706" bg="rgba(217,119,6,0.1)">📧 {missingEmail.length} missing email</Pill>}
                {missingPhone.length > 0 && <Pill color="#7c3aed" bg="rgba(124,58,237,0.08)">📞 {missingPhone.length} missing phone</Pill>}
                {foundEmails > 0 && <Pill color="var(--primary)" bg="rgba(68,104,176,0.1)">✨ {foundEmails} enriched</Pill>}
                {toEnrich.length > 0 && toEnrich.length < rows.length && (
                  <button onClick={() => setShowAllRows(v => !v)} style={{ fontSize:'0.75rem', padding:'0.25rem 0.625rem', borderRadius:'0.375rem', border:'1px solid var(--outline-variant)', background:'var(--surface)', color:'var(--on-surface-variant)', cursor:'pointer' }}>
                    {showAllRows ? `Show ${toEnrich.length} to enrich` : `Show all ${rows.length} rows`}
                  </button>
                )}
              </div>
            </div>

            <div style={{ overflowX:'auto', maxHeight:500, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                <thead style={{ position:'sticky', top:0, background:'var(--surface-container-low)', zIndex:1 }}>
                  <tr>
                    {['#','Name','Company','Email','Phone','LinkedIn','Status'].map(h => (
                      <th key={h} style={{ padding:'0.625rem 1rem', textAlign:'left', fontWeight:700, color:'var(--on-surface-variant)', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--outline-variant)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(showAllRows ? (enriched.length ? enriched : rows) : (toEnrich.length > 0 ? (enriched.length ? enriched.filter(r => linkedinCol && r[linkedinCol]?.trim() && (r._e || r._p || (!emailCol || !r[emailCol]?.trim()) || (!phoneCol || !r[phoneCol]?.trim()))) : toEnrich) : (enriched.length ? enriched : rows))).map((row, idx) => {
                    const email   = emailCol ? row[emailCol]?.trim()   : '';
                    const phone   = phoneCol ? row[phoneCol]?.trim()   : '';
                    const li      = linkedinCol ? row[linkedinCol]?.trim() : '';
                    const company = cols.company ? row[cols.company]?.trim() : '';
                    const eEnriched = row._e;
                    const pEnriched = row._p;
                    const displayEmail = email || eEnriched || '';
                    const displayPhone = phone || pEnriched || '';
                    const emailNew  = !email && !!eEnriched;
                    const phoneNew  = !phone && !!pEnriched;

                    const rowStatus = (() => {
                      if (emailNew || phoneNew) return { label:'✨ Enriched',    color:'var(--primary)',   bg:'rgba(68,104,176,0.1)' };
                      if (email && phone)        return { label:'✅ Complete',    color:'var(--tertiary)',  bg:'rgba(0,98,67,0.1)' };
                      if (email && !phone)        return { label:'📞 No phone',   color:'#7c3aed',          bg:'rgba(124,58,237,0.08)' };
                      if (!email && phone)        return { label:'📧 No email',   color:'#d97706',          bg:'rgba(217,119,6,0.08)' };
                      if (li && step === 'enriching') return { label:'⏳ Searching', color:'var(--primary)', bg:'rgba(68,104,176,0.08)' };
                      if (li)                     return { label:'⚠ Both missing', color:'var(--error)',    bg:'var(--error-container)' };
                      return { label:'✗ No LinkedIn', color:'var(--on-surface-variant)', bg:'var(--surface-container)' };
                    })();

                    return (
                      <tr key={idx} onMouseEnter={e=>e.currentTarget.style.background='var(--surface-container-low)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'} style={{ borderBottom:'1px solid var(--surface-container)', transition:'background 0.1s' }}>
                        <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)' }}>{idx+1}</td>
                        <td style={{ padding:'0.625rem 1rem', fontWeight:600, whiteSpace:'nowrap' }}>{getRowName(row, cols)}</td>
                        <td style={{ padding:'0.625rem 1rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap' }}>{company||'—'}</td>
                        <td style={{ padding:'0.625rem 1rem', whiteSpace:'nowrap' }}>
                          {displayEmail ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:emailNew?'var(--primary)':'var(--on-surface)' }}>
                              {emailNew && <Icon name="auto_fix_high" style={{ fontSize:'0.875rem', color:'var(--primary)' }} />}
                              {displayEmail}
                            </span>
                          ) : (
                            <span style={{ color: li?'var(--amber)':'var(--outline)' }}>{li?'will search':'—'}</span>
                          )}
                        </td>
                        <td style={{ padding:'0.625rem 1rem', whiteSpace:'nowrap' }}>
                          {displayPhone ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:phoneNew?'var(--primary)':'var(--on-surface)' }}>
                              {phoneNew && <Icon name="auto_fix_high" style={{ fontSize:'0.875rem', color:'var(--primary)' }} />}
                              {displayPhone}
                            </span>
                          ) : (
                            <span style={{ color: li?'var(--amber)':'var(--outline)' }}>{li?'will search':'—'}</span>
                          )}
                        </td>
                        <td style={{ padding:'0.625rem 1rem' }}>
                          {li ? <a href={li} target="_blank" rel="noreferrer" style={{ color:'var(--primary)', fontSize:'0.75rem', display:'inline-flex', alignItems:'center', gap:3, textDecoration:'none' }}><Icon name="link" style={{ fontSize:'0.875rem' }} />View</a> : '—'}
                        </td>
                        <td style={{ padding:'0.625rem 1rem' }}>
                          <Pill color={rowStatus.color} bg={rowStatus.bg}>{rowStatus.label}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
