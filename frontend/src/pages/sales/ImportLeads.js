import React, { useState, useRef, useCallback } from 'react';
import { leadsAPI } from '../../services/api';

// ── SheetJS for Excel parsing (loaded once from CDN) ──
let XLSX_LIB = null;
async function getXLSX() {
  if (XLSX_LIB) return XLSX_LIB;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => { XLSX_LIB = window.XLSX; resolve(XLSX_LIB); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

/* ═══════════════════════════════════════════════════════
   CRM FIELD DEFINITIONS
═══════════════════════════════════════════════════════ */
const CRM_FIELDS = [
  { key: 'full_name',      label: 'Full Name',       required: true  },
  { key: 'email',          label: 'Email',            required: false },
  { key: 'phone',          label: 'Phone',            required: false },
  { key: 'company',        label: 'Company',          required: false },
  { key: 'job_title',      label: 'Job Title',        required: false },
  { key: 'source',         label: 'Source',           required: false },
  { key: 'status',         label: 'Status',           required: false },
  { key: 'linkedin_url',   label: 'LinkedIn URL',     required: false },
  { key: 'notes',          label: 'Notes',            required: false },
  { key: 'next_follow_up', label: 'Follow-up Date',   required: false },
  { key: '__skip__',       label: '— Skip Column —',  required: false },
];

const VALID_STATUSES = ['new','contacted','called','interested','closed','completed','rejected','lost','follow_up_needed'];

/* ═══════════════════════════════════════════════════════
   LAYER 1 — SYNONYM DICTIONARY
   Covers: Apollo, LinkedIn, ZoomInfo, Lusha, Seamless.ai,
   Hunter.io, Apify, Phantombuster, Clay, manual CSVs
═══════════════════════════════════════════════════════ */
const SYNONYMS = {
  full_name: [
    'full name','fullname','name','contact name','person name','lead name',
    'prospect name','customer name','client name','display name','contact',
    'full_name','contact_name','leadname',
  ],
  _first_name: [
    'first name','firstname','first','given name','fname','forename',
    'first_name','givenname','contact first name',
  ],
  _last_name: [
    'last name','lastname','last','surname','family name','lname','last_name',
    'familyname','contact last name',
  ],
  email: [
    'email','email address','e-mail','e mail','work email','business email',
    'primary email','contact email','corporate email','email 1','email1',
    'person email','emailaddress','email_address','work_email','main email',
    'lead email','prospect email','personal_email',
  ],
  phone: [
    'phone','phone number','mobile','mobile phone','mobile number','work phone',
    'work direct phone','direct phone','cell','cell phone','telephone','tel',
    'contact number','primary phone','work mobile','business phone',
    'phone 1','phone1','phonenumber','phone_number','work_phone','direct dial',
    'office phone','hq phone','main phone','sanitized phone',
    'mobile_number','mobile_phone','contact_phone',
  ],
  company: [
    'company','company name','organization','organisation','account',
    'employer','business','firm','company name for emails','account name',
    'current company','workplace','companyname','company_name',
    'org name','organization name','account_name','employer name',
  ],
  job_title: [
    'title','job title','position','role','designation','occupation','job',
    'function','job function','person title','work title','current title',
    'job_title','jobtitle','contact title','professional title','headline',
    'functional_level',
  ],
  source: [
    'source','lead source','channel','origin','campaign','medium',
    'acquisition','how found','referred by','utm source','leadsource',
    'traffic source','referral','list name','list','industry',
  ],
  linkedin_url: [
    'linkedin','linkedin url','linkedin profile','linkedin link',
    'person linkedin url','li url','linkedin_url','profile url',
    'linkedin profile url','linkedinurl','social url',
    'person_linkedin_url','li_url',
  ],
  notes: [
    'notes','note','comments','comment','description','remarks','remark',
    'memo','observations','details','additional info','message','feedback',
    'bio','about','summary','extra','tags',
  ],
  next_follow_up: [
    'follow up','follow-up','followup','follow up date','next contact',
    'next follow up','callback date','scheduled date','due date',
    'follow_up_date','next_contact_date','next_followup',
  ],
  status: [
    'status','lead status','stage','pipeline stage','deal stage','state',
    'phase','current status','contact stage','lead_status','deal_stage',
    'crm status','crm stage',
  ],
};

/* ═══════════════════════════════════════════════════════
   LAYER 2 — CONTENT / VALUE ANALYSIS
   Detects field type from actual cell data patterns.
═══════════════════════════════════════════════════════ */
const CONTENT_DETECTORS = [
  {
    key: 'email', confidence: 0.95,
    test: (samples) => samples.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())).length / samples.length,
  },
  {
    key: 'phone', confidence: 0.90,
    test: (samples) => samples.filter(v => /^[\d\s\+\-\(\)\.]{7,20}$/.test(v.trim()) && /\d{6,}/.test(v)).length / samples.length,
  },
  {
    key: 'linkedin_url', confidence: 0.99,
    test: (samples) => samples.filter(v => /linkedin\.com\/(in|pub|company)\//i.test(v)).length / samples.length,
  },
  {
    key: 'full_name', confidence: 0.70,
    test: (samples) => samples.filter(v => {
      const words = v.trim().split(/\s+/);
      return words.length >= 2 && words.length <= 4 && !/\d/.test(v) &&
             !/[@\/\.\:]/.test(v) && words.every(w => w.length >= 2 && /^[A-Za-z\-'\.]+$/.test(w));
    }).length / samples.length,
  },
];

/* ═══════════════════════════════════════════════════════
   LAYER 3 — SAVED MAPPING TEMPLATES
═══════════════════════════════════════════════════════ */
const TEMPLATES_KEY = 'crm_import_templates_v1';
const loadTemplates = () => { try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}'); } catch { return {}; } };
const saveTemplate  = (name, mapping) => { const t = loadTemplates(); t[name] = { mapping, savedAt: new Date().toISOString() }; localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t)); };
const deleteTemplate = (name) => { const t = loadTemplates(); delete t[name]; localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t)); };

/* ═══════════════════════════════════════════════════════
   CORE MAPPING ENGINE
═══════════════════════════════════════════════════════ */
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i||j));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
};
const strSim = (a, b) => { if (!a || !b) return 0; const mx = Math.max(a.length, b.length); return mx ? (mx - levenshtein(a, b)) / mx : 1; };

const detectMapping = (headers, rows) => {
  const result = {};
  const usedKeys = new Set();
  const firstCols = [], lastCols = [];

  headers.forEach(col => {
    const norm = col.toLowerCase().trim().replace(/[_\-]/g, ' ');

    // Layer 1a — exact synonym
    let key = null, conf = 0, method = '';
    for (const [k, syns] of Object.entries(SYNONYMS)) {
      if (syns.some(s => s && (s === norm || s.replace(/[\s_\-]/g,'') === norm.replace(/\s/g,'')))) {
        key = k; conf = 1.0; method = 'exact'; break;
      }
    }

    // Layer 1b — fuzzy name match
    if (!key) {
      let best = 0.60;
      for (const [k, syns] of Object.entries(SYNONYMS)) {
        for (const s of syns) { if (!s) continue; const sc = strSim(norm, s); if (sc > best) { best = sc; key = k; conf = sc; method = 'fuzzy'; } }
      }
    }

    // Layer 2 — content analysis (can override fuzzy, confirms exact)
    const samples = rows.map(r => String(r[col] || '').trim()).filter(v => v && v !== 'null' && v !== 'undefined').slice(0, 20);
    if (samples.length >= 3) {
      for (const det of CONTENT_DETECTORS) {
        const score = det.test(samples);
        if (score >= 0.6) {
          const contentConf = score * det.confidence;
          if (!key || contentConf > conf) { key = det.key; conf = contentConf; method = `content (${Math.round(score*100)}% match)`; }
          break;
        }
      }
    }

    // Track split name cols
    if (key === '_first_name') { firstCols.push(col); result[col] = { key:'__skip__', conf:0, method:'split-name' }; return; }
    if (key === '_last_name')  { lastCols.push(col);  result[col] = { key:'__skip__', conf:0, method:'split-name' }; return; }

    // Avoid duplicate assignments
    if (key && key !== '__skip__' && usedKeys.has(key)) { key = null; conf = 0; method = 'duplicate'; }
    if (key && key !== '__skip__') usedKeys.add(key);

    result[col] = { key: key || '__skip__', conf, method: method || 'unmatched' };
  });

  // Combine first + last → full_name
  if (!usedKeys.has('full_name') && firstCols.length > 0) {
    result[firstCols[0]] = { key:'full_name', conf:0.95, method:'name-combine' };
    if (lastCols.length > 0) result[lastCols[0]] = { key:'_last_name', conf:0.95, method:'name-combine' };
  }

  return result;
};

/* ═══════════════════════════════════════════════════════
   CSV PARSER — proper RFC 4180 compliant parser
   Handles: BOM, CRLF row separators, quoted commas,
   AND embedded newlines (LF) inside quoted fields.
   Rows use direct properties: { _rowNum, [header]: value }
═══════════════════════════════════════════════════════ */
const parseCSVRobust = (text) => {
  // Strip BOM
  const src = text.replace(/^\uFEFF/, '');
  const records = [];
  let field = '';
  let row = [];
  let inQ = false;
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped ""
        inQ = false; i++; continue;                                  // closing quote
      }
      // Any character inside quotes (including \n, \r) is part of the field
      field += c; i++; continue;
    }

    // Outside quotes
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field.trim()); field = ''; i++; continue; }
    if (c === '\r' && src[i + 1] === '\n') { // CRLF row separator
      row.push(field.trim()); field = '';
      if (row.some(v => v !== '')) records.push(row);
      row = []; i += 2; continue;
    }
    if (c === '\n') { // LF-only row separator (Unix CSVs)
      row.push(field.trim()); field = '';
      if (row.some(v => v !== '')) records.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  // Flush last field/row
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some(v => v !== '')) records.push(row);
  }

  if (records.length < 2) return { headers: [], rows: [] };

  const headers = records[0].map(h => h.replace(/^"|"$/g, ''));
  const rows = records.slice(1)
    .slice(0, 2000) // safety cap
    .map((r, i) => {
      const obj = { _rowNum: i + 2 };
      headers.forEach((h, j) => { obj[h] = r[j] || ''; });
      return obj;
    });

  return { headers, rows };
};

/* ═══════════════════════════════════════════════════════
   VALIDATE ROW
═══════════════════════════════════════════════════════ */
const validateRow = (row, detections) => {
  const errors = [];
  const mapped = {};
  Object.entries(detections).forEach(([col, det]) => {
    if (det.key !== '__skip__' && det.key !== '_last_name') mapped[det.key] = row[col] || '';
  });
  if (!mapped.full_name?.trim()) errors.push('Full Name is required');
  if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) errors.push('Invalid email');
  if (mapped.phone && !/^[\d\s\+\-\(\)]{7,20}$/.test(mapped.phone)) errors.push('Invalid phone');
  return { mapped, errors };
};

/* ═══════════════════════════════════════════════════════
   CONFIDENCE BADGE
═══════════════════════════════════════════════════════ */
const ConfBadge = ({ method, crmKey }) => {
  if (crmKey === '__skip__') return <span style={{ fontSize:'0.68rem', color:'var(--on-surface-variant)', background:'var(--surface-container)', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>skipped</span>;
  if (method === 'exact')        return <span style={{ fontSize:'0.68rem', color:'#15803d', background:'#dcfce7', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>✓ exact</span>;
  if (method === 'name-combine') return <span style={{ fontSize:'0.68rem', color:'#0369a1', background:'#e0f2fe', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>⟨ combined</span>;
  if (method === 'template')     return <span style={{ fontSize:'0.68rem', color:'#0369a1', background:'#e0f2fe', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>◉ template</span>;
  if (method === 'manual')       return <span style={{ fontSize:'0.68rem', color:'#0369a1', background:'#e0f2fe', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>✎ manual</span>;
  if (method?.startsWith('content')) return <span style={{ fontSize:'0.68rem', color:'#6d28d9', background:'#ede9fe', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>◎ data match</span>;
  if (method === 'fuzzy')        return <span style={{ fontSize:'0.68rem', color:'#d97706', background:'#fef3c7', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>⚠ verify</span>;
  return <span style={{ fontSize:'0.68rem', color:'#dc2626', background:'#fee2e2', padding:'0.1rem 0.4rem', borderRadius:'0.25rem' }}>? unknown</span>;
};

/* ═══════════════════════════════════════════════════════
   STEP DOT
═══════════════════════════════════════════════════════ */
const STEPS = ['Upload File', 'Map Columns', 'Review & Import'];
const StepDot = ({ n, current, label }) => {
  const done = n < current, active = n === current;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.375rem' }}>
      <div style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.875rem', fontFamily:'Inter,sans-serif', background:done?'var(--tertiary)':active?'var(--primary)':'var(--surface-container)', color:(done||active)?'#fff':'var(--on-surface-variant)', transition:'all 0.3s ease' }}>
        {done ? <Icon name="check" style={{ fontSize:'1rem', color:'#fff' }} /> : n}
      </div>
      <span style={{ fontSize:'0.75rem', fontWeight:active?600:400, color:active?'var(--primary)':'var(--on-surface-variant)', whiteSpace:'nowrap' }}>{label}</span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function ImportLeads() {
  const [step, setStep]           = useState(1);
  const [dragOver, setDragOver]   = useState(false);
  const [file, setFile]           = useState(null);
  const [parsed, setParsed]       = useState(null);
  const [detections, setDetections] = useState({});
  const [results, setResults]     = useState(null);
  const [importing, setImporting] = useState(false);
  const [templates, setTemplates] = useState(loadTemplates);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const fileRef = useRef();

  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv','xlsx','xls'].includes(ext)) { alert('Only CSV or Excel files are supported'); return; }
    setFile(f);

    if (ext === 'csv') {
      // CSV — read as text, parse normally
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const { headers, rows } = parseCSVRobust(e.target.result);
          if (!headers.length) { alert('Could not read CSV — check it has a header row'); return; }
          setParsed({ headers, rows });
          setDetections(detectMapping(headers, rows));
          setStep(2);
        } catch (err) {
          alert('Error reading file: ' + (err.message || 'Unknown error') + '\n\nPlease check the file and try again.');
        }
      };
      reader.readAsText(f);
    } else {
      // Excel (.xlsx / .xls) — read as binary, parse with SheetJS
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await getXLSX();
          const wb   = XLSX.read(e.target.result, { type: 'array' });
          const ws   = wb.Sheets[wb.SheetNames[0]]; // first sheet
          // Convert to array-of-arrays, then build header+rows like parseCSV
          const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (!raw || raw.length < 2) { alert('Excel file appears empty or has no data rows'); return; }
          // First non-empty row = headers
          const headers = (raw[0] || []).map(h => String(h).trim());
          const rows    = raw.slice(1)
            .filter(r => r.some(v => String(v).trim() !== '')) // skip blank rows
            .map((r, i) => {
              const obj = { _rowNum: i + 2 };
              headers.forEach((h, ci) => { obj[h] = String(r[ci] ?? '').trim(); });
              return obj;
            });
          if (!headers.length) { alert('Could not find headers in first row'); return; }
          setParsed({ headers, rows });
          setDetections(detectMapping(headers, rows));
          setStep(2);
        } catch (err) {
          alert('Failed to read Excel file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(f);
    }
  }, []);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  const applyTemplate = (tpl) => {
    setDetections(prev => {
      const updated = { ...prev };
      Object.entries(tpl.mapping).forEach(([col, key]) => {
        if (updated[col]) updated[col] = { ...updated[col], key, method:'template', conf:1 };
      });
      return updated;
    });
  };

  const handleSaveTemplate = () => {
    if (!saveTemplateName.trim()) return;
    const mapping = Object.fromEntries(Object.entries(detections).map(([col, det]) => [col, det.key]));
    saveTemplate(saveTemplateName.trim(), mapping);
    setTemplates(loadTemplates());
    setSaveTemplateName(''); setShowSaveTemplate(false);
  };

  const updateMapping = (col, newKey) => {
    setDetections(prev => ({ ...prev, [col]: { ...prev[col], key: newKey, method:'manual', conf:1 } }));
  };

  const validatedRows  = parsed?.rows.map(r => validateRow(r, detections)) || [];
  const successCount   = validatedRows.filter(r => r.errors.length === 0).length;
  const errorRows      = validatedRows.filter(r => r.errors.length > 0);
  const needsReview    = Object.entries(detections).filter(([,d]) => d.key !== '__skip__' && d.method === 'fuzzy');
  const mappedCount    = Object.values(detections).filter(d => d.key !== '__skip__' && d.key !== '_last_name').length;

  const doImport = async () => {
    setImporting(true);
    let successCount = 0;
    const errors = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      const row  = parsed.rows[i];
      const errs = validatedRows[i]?.errors || [];  // validatedRows is 1:1 with parsed.rows
      if (errs.length > 0) { errors.push({ row: row._rowNum, issues: errs }); continue; }

      // Build lead from mapping
      const get = (key) => {
        const col = Object.entries(detections).find(([,d]) => d.key === key)?.[0];
        return col ? (row[col] || '').trim() : '';
      };
      // Handle split first+last name
      let fullName = get('full_name');
      if (!fullName) {
        const fn = Object.entries(detections).find(([,d]) => d.key === '_first_name')?.[0];
        const ln = Object.entries(detections).find(([,d]) => d.key === '_last_name')?.[0];
        fullName = [fn ? row[fn]||'' : '', ln ? row[ln]||'' : ''].join(' ').trim();
      }
      if (!fullName) { errors.push({ row: row._rowNum, issues: ['No name found'] }); continue; }

      try {
        await leadsAPI.create({
          full_name:      fullName,
          email:          get('email')          || null,
          phone:          get('phone')           || null,
          company:        get('company')         || null,
          job_title:      get('job_title')       || null,
          source:         get('source')          || 'CSV Import',
          status:         get('status')          || 'new',
          notes:          get('notes')           || null,
          next_follow_up: get('next_follow_up')  || null,
          linkedin_url:   get('linkedin_url')    || null,
        });
        successCount++;
      } catch (e) {
        errors.push({ row: row._rowNum, issues: [e?.response?.data?.detail || 'API error'] });
      }
    }

    setResults({ success: successCount, errors });
    setImporting(false);
    setStep(3);
  };

  const reset = () => { setStep(1); setFile(null); setParsed(null); setDetections({}); setResults(null); };

  return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div><p className="label-sm" style={{ marginBottom:'0.25rem' }}>Sales CRM</p><h1 className="headline-sm">Import Leads</h1></div>
        <a href="/sales/leads" className="btn-secondary"><Icon name="arrow_back" style={{ fontSize:'1rem' }} /> Back to Leads</a>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem', alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Step progress */}
          <div className="card" style={{ padding:'1.25rem 2rem' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', gap:0 }}>
              {STEPS.map((label, i) => (
                <React.Fragment key={label}>
                  <StepDot n={i+1} current={step} label={label} />
                  {i < STEPS.length-1 && <div style={{ flex:1, height:2, background:step>i+1?'var(--tertiary)':'var(--surface-container)', marginTop:15, transition:'background 0.4s ease' }} />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="card scale-in">
              <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.5rem' }}>Upload your file</h2>
              <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>
                Works with <strong>Apollo, LinkedIn, ZoomInfo, Lusha, Apify, Clay, Hunter.io</strong> and any custom scraper. Supports <strong>Excel (.xlsx) and CSV</strong> — upload as-is, no renaming needed.
              </p>
              <div onDrop={onDrop} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileRef.current?.click()}
                style={{ border:`2px dashed ${dragOver?'var(--primary)':'rgba(195,198,215,0.5)'}`, borderRadius:'0.875rem', padding:'3rem 2rem', textAlign:'center', cursor:'pointer', background:dragOver?'rgba(0,74,198,0.04)':'var(--surface-container-low)', transition:'all 0.2s ease' }}>
                <div style={{ width:56, height:56, borderRadius:'1rem', background:dragOver?'rgba(0,74,198,0.12)':'var(--surface-container)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
                  <Icon name="upload_file" style={{ fontSize:'1.75rem', color:dragOver?'var(--primary)':'var(--on-surface-variant)' }} />
                </div>
                <p style={{ fontWeight:600, fontSize:'0.9375rem', color:'var(--on-surface)', marginBottom:'0.375rem' }}>{dragOver?'Drop it here!':'Drag & drop your file here'}</p>
                <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'1rem' }}>or click to browse</p>
                <span className="btn-secondary" style={{ pointerEvents:'none', fontSize:'0.8125rem' }}>Choose File</span>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])} />

              {Object.keys(templates).length > 0 && (
                <div style={{ marginTop:'1.25rem', padding:'1rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
                  <p style={{ fontSize:'0.75rem', fontWeight:600, color:'var(--on-surface-variant)', marginBottom:'0.625rem', textTransform:'uppercase', letterSpacing:'0.04em' }}>Saved Templates</p>
                  {Object.entries(templates).map(([name, tpl]) => (
                    <div key={name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.5rem 0.75rem', background:'var(--surface)', borderRadius:'0.375rem', border:'1px solid var(--outline-variant)', marginBottom:'0.375rem' }}>
                      <div>
                        <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)' }}>{name}</span>
                        <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginLeft:'0.5rem' }}>{Object.keys(tpl.mapping).length} columns mapped</span>
                      </div>
                      <button onClick={()=>{deleteTemplate(name);setTemplates(loadTemplates());}} style={{ background:'none', border:'none', cursor:'pointer' }}>
                        <Icon name="delete" style={{ fontSize:'1rem', color:'var(--error)' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && parsed && (
            <div className="card scale-in">
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1rem' }}>
                <div>
                  <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.25rem' }}>Review Column Mapping</h2>
                  <p style={{ color:'var(--on-surface-variant)', fontSize:'0.8125rem' }}>
                    <Icon name="attach_file" style={{ fontSize:'0.875rem', color:'var(--primary)' }} />{' '}{file?.name} · {parsed.rows.length} rows · {mappedCount} fields detected
                  </p>
                </div>
                <button className="btn-ghost" onClick={reset} style={{ fontSize:'0.8125rem' }}><Icon name="restart_alt" style={{ fontSize:'1rem' }} /> Start over</button>
              </div>

              {needsReview.length > 0 && (
                <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'0.5rem', padding:'0.75rem 1rem', marginBottom:'1rem', fontSize:'0.8125rem', color:'#92400e', display:'flex', gap:'0.5rem' }}>
                  <Icon name="warning" style={{ fontSize:'1rem', color:'#d97706', flexShrink:0 }} />
                  <span><strong>{needsReview.length} column{needsReview.length>1?'s':''} need verification</strong> (marked ⚠): {needsReview.map(([c])=>c).join(', ')}</span>
                </div>
              )}

              {Object.keys(templates).length > 0 && (
                <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1rem', alignItems:'center' }}>
                  <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>Apply template:</span>
                  {Object.entries(templates).map(([name, tpl]) => (
                    <button key={name} onClick={()=>applyTemplate(tpl)} className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }}>
                      <Icon name="bookmark" style={{ fontSize:'0.875rem' }} /> {name}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1rem' }}>
                {[{l:'✓ exact',bg:'#dcfce7',c:'#15803d'},{l:'◎ data match',bg:'#ede9fe',c:'#6d28d9'},{l:'⟨ combined',bg:'#e0f2fe',c:'#0369a1'},{l:'⚠ verify',bg:'#fef3c7',c:'#d97706'},{l:'? unknown',bg:'#fee2e2',c:'#dc2626'}].map(s=>(
                  <span key={s.l} style={{ fontSize:'0.68rem', background:s.bg, color:s.c, padding:'0.15rem 0.5rem', borderRadius:'0.25rem', fontWeight:600 }}>{s.l}</span>
                ))}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 28px 1fr', gap:'0.75rem', padding:'0.375rem 0.75rem', marginBottom:'0.25rem' }}>
                <p className="label-sm">Your File Column</p><div/><p className="label-sm">CRM Field</p>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {parsed.headers.map(col => {
                  const det = detections[col] || { key:'__skip__', conf:0, method:'unmatched' };
                  const isSkipped = det.key === '__skip__';
                  const isLastName = det.key === '_last_name';
                  const isFuzzy = det.method === 'fuzzy';
                  const rowBg = isSkipped ? 'var(--surface-container-low)' : isFuzzy ? 'rgba(251,191,36,0.08)' : 'rgba(0,74,198,0.04)';
                  const rowBorder = isSkipped ? '1px solid transparent' : isFuzzy ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(0,74,198,0.15)';
                  const samples = parsed.rows.slice(0,3).map(r=>r[col]).filter(Boolean);
                  return (
                    <div key={col} style={{ borderRadius:'0.5rem', background:rowBg, border:rowBorder }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 28px 1fr', gap:'0.75rem', alignItems:'center', padding:'0.625rem 0.75rem' }}>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.2rem', flexWrap:'wrap' }}>
                            <Icon name="table_chart" style={{ fontSize:'0.9rem', color:isSkipped?'var(--on-surface-variant)':'var(--primary)' }} />
                            <span style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)' }}>{col}</span>
                            <ConfBadge method={isLastName?'name-combine':det.method} crmKey={det.key} />
                          </div>
                          {samples.length > 0 && (
                            <p style={{ fontSize:'0.7rem', color:'var(--on-surface-variant)', margin:0, paddingLeft:'1.4rem' }}>
                              {samples.slice(0,2).map(s=>`"${String(s).slice(0,22)}"`).join(', ')}
                            </p>
                          )}
                        </div>
                        <Icon name="arrow_forward" style={{ fontSize:'1rem', color:isSkipped?'var(--outline-variant)':'var(--primary)', justifySelf:'center' }} />
                        <select className="select" value={det.key} onChange={e=>updateMapping(col,e.target.value)}
                          style={{ fontSize:'0.8125rem', borderColor:isFuzzy?'#fde68a':undefined }}>
                          {CRM_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}{f.required?' *':''}</option>)}
                          {isLastName && <option value="_last_name">Last Name (auto-combine with First)</option>}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'1.25rem', flexWrap:'wrap' }}>
                <button className="btn-primary" onClick={doImport} disabled={!successCount||importing} style={{ opacity:successCount?1:0.5 }}>
                  <Icon name="upload" style={{ fontSize:'1rem', color:'#fff' }} />
                  {importing ? 'Importing…' : `Import ${successCount} Leads`}
                </button>
                {!showSaveTemplate ? (
                  <button className="btn-secondary" onClick={()=>setShowSaveTemplate(true)} style={{ fontSize:'0.8125rem' }}>
                    <Icon name="bookmark_add" style={{ fontSize:'1rem' }} /> Save as Template
                  </button>
                ) : (
                  <div style={{ display:'flex', gap:'0.375rem', alignItems:'center' }}>
                    <input placeholder="e.g. Apollo Export, Apify Actor 1" value={saveTemplateName} onChange={e=>setSaveTemplateName(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&handleSaveTemplate()} autoFocus
                      style={{ padding:'0.4rem 0.75rem', borderRadius:'0.375rem', border:'1px solid var(--outline-variant)', fontSize:'0.8125rem', background:'var(--surface)', color:'var(--on-surface)', width:240 }} />
                    <button className="btn-primary" onClick={handleSaveTemplate} style={{ fontSize:'0.8125rem', padding:'0.4rem 0.875rem' }}>Save</button>
                    <button className="btn-ghost" onClick={()=>setShowSaveTemplate(false)} style={{ fontSize:'0.8125rem' }}>Cancel</button>
                  </div>
                )}
                {errorRows.length > 0 && <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', marginLeft:'auto' }}>{errorRows.length} rows will be skipped</span>}
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && results && (
            <div className="card scale-in" style={{ textAlign:'center', padding:'3rem 2rem' }}>
              <div style={{ width:64, height:64, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.25rem' }}>
                <Icon name="check_circle" style={{ fontSize:'2rem', color:'#16a34a' }} />
              </div>
              <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'0.5rem' }}>Import Complete</h2>
              <p style={{ color:'var(--on-surface-variant)', marginBottom:'1.5rem' }}>
                <strong style={{ color:'#16a34a' }}>{results.success} leads</strong> imported
                {results.errors.length > 0 && <>, <strong style={{ color:'var(--error)' }}>{results.errors.length} skipped</strong></>}
              </p>
              {results.errors.length > 0 && (
                <div style={{ textAlign:'left', background:'var(--error-container)', borderRadius:'0.625rem', padding:'1rem', marginBottom:'1.5rem', maxHeight:180, overflowY:'auto' }}>
                  {results.errors.map((e,i)=><p key={i} style={{ fontSize:'0.8125rem', color:'var(--error)', margin:'0.2rem 0' }}>Row {e.row}: {e.issues.join(', ')}</p>)}
                </div>
              )}
              <div style={{ display:'flex', gap:'0.75rem', justifyContent:'center' }}>
                <a href="/sales/leads" className="btn-primary">View Leads</a>
                <button className="btn-secondary" onClick={reset}>Import Another</button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {step === 2 && (
            <div className="card" style={{ padding:'1.25rem' }}>
              <h3 style={{ fontSize:'0.875rem', fontWeight:700, marginBottom:'1rem' }}>Detection Summary</h3>
              {[
                { label:'Exact name match',  count:Object.values(detections).filter(d=>d.method==='exact').length,    color:'#15803d', bg:'#dcfce7' },
                { label:'Data content match',count:Object.values(detections).filter(d=>d.method?.startsWith('content')).length, color:'#6d28d9', bg:'#ede9fe' },
                { label:'Name combined',     count:Object.values(detections).filter(d=>d.method==='name-combine').length, color:'#0369a1', bg:'#e0f2fe' },
                { label:'Template applied',  count:Object.values(detections).filter(d=>d.method==='template').length,  color:'#0369a1', bg:'#e0f2fe' },
                { label:'Manually set',      count:Object.values(detections).filter(d=>d.method==='manual').length,    color:'#0369a1', bg:'#e0f2fe' },
                { label:'Fuzzy — verify!',   count:Object.values(detections).filter(d=>d.method==='fuzzy').length,    color:'#d97706', bg:'#fef3c7' },
                { label:'Not detected',      count:Object.values(detections).filter(d=>d.key==='__skip__'&&d.method!=='split-name').length, color:'#dc2626', bg:'#fee2e2' },
              ].filter(s=>s.count>0).map(s=>(
                <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                  <span style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{s.label}</span>
                  <span style={{ fontSize:'0.8125rem', fontWeight:700, color:s.color, background:s.bg, padding:'0.1rem 0.5rem', borderRadius:'0.75rem' }}>{s.count}</span>
                </div>
              ))}
              <div style={{ borderTop:'1px solid var(--outline-variant)', marginTop:'0.75rem', paddingTop:'0.75rem', display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.875rem', fontWeight:600 }}>Ready to import</span>
                <span style={{ fontSize:'0.875rem', fontWeight:700, color:'#16a34a' }}>{successCount} / {parsed?.rows.length}</span>
              </div>
            </div>
          )}

          <div className="card" style={{ padding:'1.25rem' }}>
            <h3 style={{ fontSize:'0.875rem', fontWeight:700, marginBottom:'0.875rem' }}>How it works</h3>
            {[
              { icon:'search',    title:'1. Name matching', desc:'200+ synonyms from Apollo, LinkedIn, ZoomInfo, Lusha, Apify, Clay, Phantombuster, Hunter.io.' },
              { icon:'analytics', title:'2. Data detection', desc:'Scans actual cell values — emails, phones, LinkedIn URLs detected by pattern regardless of column name.' },
              { icon:'merge',     title:'3. Name combining', desc:'Automatically merges "First Name" + "Last Name" columns into Full Name.' },
              { icon:'bookmark',  title:'4. Save templates', desc:'Map once per scraper, reuse forever. Name it "Apify Actor 1" and it auto-applies next time.' },
            ].map(s=>(
              <div key={s.title} style={{ display:'flex', gap:'0.625rem', marginBottom:'0.875rem' }}>
                <div style={{ width:28, height:28, borderRadius:'0.5rem', background:'var(--surface-container)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon name={s.icon} style={{ fontSize:'0.875rem', color:'var(--primary)' }} />
                </div>
                <div>
                  <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--on-surface)', marginBottom:'0.125rem' }}>{s.title}</p>
                  <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', margin:0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
      </div>
    </div>
  </div>
  );
}
