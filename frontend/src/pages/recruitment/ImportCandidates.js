import React, { useState, useRef, useCallback } from 'react';
import { candidatesAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

/* ── SheetJS for Excel ─────────────────────────────── */
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

/* ── CRM Candidate Fields ──────────────────────────── */
const CRM_FIELDS = [
  { key: 'full_name',           label: 'Full Name',            required: true  },
  { key: 'candidate_role',      label: 'Role / Technology',    required: false },
  { key: 'total_experience',    label: 'Total Experience',     required: false },
  { key: 'relevant_experience', label: 'Relevant Experience',  required: false },
  { key: 'email',               label: 'Email',                required: false },
  { key: 'phone',               label: 'Phone',                required: false },
  { key: 'location',            label: 'Location',             required: false },
  { key: 'relocation',          label: 'Relocation',           required: false },
  { key: 'visa_status',         label: 'VISA Status',          required: false },
  { key: 'current_company',     label: 'Current Company',      required: false },
  { key: 'linkedin_url',        label: 'LinkedIn URL',         required: false },
  { key: 'source',              label: 'Source',               required: false },
  { key: 'notes',               label: 'Notes',                required: false },
  { key: '__skip__',            label: '— Skip Column —',      required: false },
];

/* ── SYNONYMS ──────────────────────────────────────── */
const SYNONYMS = {
  full_name: ['full name','fullname','name','candidate name','candidate_name','full_name','person name','resource name'],
  _first_name: ['first name','firstname','first_name','fname','first','given name'],
  _last_name:  ['last name','lastname','last_name','lname','surname','last'],
  candidate_role: [
    'role','technology','tech','skill','position','designation','profile',
    'candidate role','job title','title','function','specialization',
    'candidate_role','technology stack','tech stack','expertise',
  ],
  total_experience: [
    'total exp','total experience','experience','exp','years','total_experience',
    'total exp.','yrs','total years','overall experience','overall exp',
  ],
  relevant_experience: [
    'relevant exp','relevant experience','relevant_experience','rel exp',
    'relevant','specific experience','domain experience','domain exp',
  ],
  email: [
    'email','e-mail','email address','work email','contact email','emailaddress','email_address',
  ],
  phone: [
    'phone','mobile','contact','phone number','mobile number','cell',
    'phonenumber','phone_number','mobile_number','contact number','tel',
  ],
  location: [
    'location','city','place','based at','current location','base location',
    'current city','state','region','area',
  ],
  relocation: [
    'relocation','willing to relocate','relocation preference','relocation flexibility',
    'open to relocation','can relocate','mobility',
  ],
  visa_status: [
    'visa','visa status','visa type','work permit','work authorization',
    'visa_status','immigration status','work visa','authorization',
    'h1b','gc','usc','ead','l2',
  ],
  current_company: [
    'current company','company','employer','organization','current employer',
    'current_company','present company','current organization',
  ],
  linkedin_url: [
    'linkedin','linkedin url','linkedin profile','linkedin link','li url',
    'linkedin_url','profile url','social url','linkedin profile url',
  ],
  source: [
    'source','channel','referred by','lead source','how found','origin',
  ],
  notes: [
    'notes','note','comments','remarks','remark','description','additional info','memo',
  ],
};

/* ── Levenshtein / fuzzy ───────────────────────────── */
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i||j));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
};
const strSim = (a,b) => { if(!a||!b) return 0; const mx=Math.max(a.length,b.length); return mx?(mx-levenshtein(a,b))/mx:1; };

const detectMapping = (headers, rows) => {
  const result = {};
  const usedKeys = new Set();
  const firstCols = [], lastCols = [];

  headers.forEach(col => {
    const norm = col.toLowerCase().trim().replace(/[_\-]/g,' ');
    let key = null, conf = 0, method = '';

    for (const [k, syns] of Object.entries(SYNONYMS)) {
      if (syns.some(s => s && (s === norm || s.replace(/[\s_\-]/g,'') === norm.replace(/\s/g,'')))) {
        key = k; conf = 1.0; method = 'exact'; break;
      }
    }
    if (!key) {
      let best = 0.60;
      for (const [k, syns] of Object.entries(SYNONYMS)) {
        for (const s of syns) { if (!s) continue; const sc=strSim(norm,s); if(sc>best){best=sc;key=k;conf=sc;method='fuzzy';} }
      }
    }

    if (key === '_first_name') { firstCols.push(col); result[col]={key:'__skip__',conf:0,method:'split-name'}; return; }
    if (key === '_last_name')  { lastCols.push(col);  result[col]={key:'__skip__',conf:0,method:'split-name'}; return; }
    if (key && key !== '__skip__' && usedKeys.has(key)) { key=null; conf=0; method='duplicate'; }
    if (key && key !== '__skip__') usedKeys.add(key);
    result[col] = { key: key || '__skip__', conf, method: method || 'unmatched' };
  });

  if (!usedKeys.has('full_name') && firstCols.length > 0) {
    result[firstCols[0]] = { key:'full_name', conf:0.95, method:'name-combine' };
    if (lastCols.length > 0) result[lastCols[0]] = { key:'_last_name', conf:0.95, method:'name-combine' };
  }
  return result;
};

/* ── RFC 4180 CSV parser ───────────────────────────── */
const parseCSVRobust = (text) => {
  const src = text.replace(/^\uFEFF/, '');
  const records = [];
  let field = '', row = [], inQ = false, i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i+1]==='"'){field+='"';i+=2;continue;} inQ=false;i++;continue; }
      field+=c;i++;continue;
    }
    if (c==='"'){inQ=true;i++;continue;}
    if (c===','){row.push(field.trim());field='';i++;continue;}
    if (c==='\r'&&src[i+1]==='\n'){row.push(field.trim());field='';if(row.some(v=>v!==''))records.push(row);row=[];i+=2;continue;}
    if (c==='\n'){row.push(field.trim());field='';if(row.some(v=>v!==''))records.push(row);row=[];i++;continue;}
    field+=c;i++;
  }
  if (field||row.length>0){row.push(field.trim());if(row.some(v=>v!==''))records.push(row);}
  if (records.length<2) return {headers:[],rows:[]};
  const headers = records[0].map(h=>h.replace(/^"|"$/g,''));
  const rows = records.slice(1).slice(0,2000).map((r,i)=>{
    const obj={_rowNum:i+2};
    headers.forEach((h,j)=>{obj[h]=r[j]||'';});
    return obj;
  });
  return {headers,rows};
};

const ConfBadge = ({method,crmKey}) => {
  if(crmKey==='__skip__') return <span style={{fontSize:'0.68rem',color:'var(--on-surface-variant)',background:'var(--surface-container)',padding:'0.1rem 0.4rem',borderRadius:'0.25rem'}}>skipped</span>;
  if(method==='exact') return <span style={{fontSize:'0.68rem',color:'#15803d',background:'#dcfce7',padding:'0.1rem 0.4rem',borderRadius:'0.25rem'}}>✓ exact</span>;
  if(method==='name-combine') return <span style={{fontSize:'0.68rem',color:'#0369a1',background:'#e0f2fe',padding:'0.1rem 0.4rem',borderRadius:'0.25rem'}}>⟨ combined</span>;
  if(method==='manual') return <span style={{fontSize:'0.68rem',color:'#0369a1',background:'#e0f2fe',padding:'0.1rem 0.4rem',borderRadius:'0.25rem'}}>✎ manual</span>;
  if(method==='fuzzy') return <span style={{fontSize:'0.68rem',color:'#d97706',background:'#fef3c7',padding:'0.1rem 0.4rem',borderRadius:'0.25rem'}}>⚠ verify</span>;
  return <span style={{fontSize:'0.68rem',color:'#dc2626',background:'#fee2e2',padding:'0.1rem 0.4rem',borderRadius:'0.25rem'}}>? unknown</span>;
};

const STEPS = ['Upload File','Map Columns','Review & Import'];
const StepDot = ({n,current,label}) => {
  const done=n<current, active=n===current;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0.375rem'}}>
      <div style={{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'0.875rem',background:done?'var(--tertiary)':active?'var(--primary)':'var(--surface-container)',color:(done||active)?'#fff':'var(--on-surface-variant)',transition:'all 0.3s'}}>
        {done?<Icon name="check" style={{fontSize:'1rem',color:'#fff'}}/>:n}
      </div>
      <span style={{fontSize:'0.75rem',fontWeight:active?600:400,color:active?'var(--primary)':'var(--on-surface-variant)',whiteSpace:'nowrap'}}>{label}</span>
    </div>
  );
};

export default function ImportCandidates() {
  const [step, setStep]             = useState(1);
  const [candidateType, setCandType]= useState('domestic'); // domestic | international
  const [file, setFile]             = useState(null);
  const [sheetName, setSheetName]   = useState('');
  const [parsed, setParsed]         = useState(null);
  const [detections, setDetections] = useState({});
  const [results, setResults]       = useState(null);
  const [importing, setImporting]   = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const fileRef = useRef();

  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv','xlsx','xls'].includes(ext)) { alert('Only CSV or Excel files are supported'); return; }
    setFile(f);

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const { headers, rows } = parseCSVRobust(e.target.result);
          if (!headers.length) { alert('Could not read CSV — check it has a header row'); return; }
          setSheetName(f.name);
          setParsed({ headers, rows });
          setDetections(detectMapping(headers, rows));
          setStep(2);
        } catch(err) { alert('Error reading file: ' + err.message); }
      };
      reader.readAsText(f, 'utf-8');
    } else {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await getXLSX();
          const wb = XLSX.read(e.target.result, { type:'array' });
          // Let user pick sheet if multiple
          const sheetChoice = wb.SheetNames.length > 1
            ? window.prompt(`Multiple sheets found:\n${wb.SheetNames.join(', ')}\n\nEnter sheet name to import (or leave blank for first sheet):`)
            : null;
          const sName = sheetChoice?.trim() && wb.SheetNames.includes(sheetChoice.trim())
            ? sheetChoice.trim() : wb.SheetNames[0];
          const ws = wb.Sheets[sName];
          // Find first non-empty row for headers
          const raw = XLSX.utils.sheet_to_json(ws, {header:1,defval:''});
          // Find header row (first row with most non-null values)
          let hRow = 0;
          let maxCnt = 0;
          for (let r=0; r<Math.min(4,raw.length); r++) {
            const cnt = raw[r].filter(v=>v!=='').length;
            if (cnt > maxCnt) { maxCnt=cnt; hRow=r; }
          }
          const headers = raw[hRow].map(h=>String(h).trim()).filter(h=>h);
          const rows = raw.slice(hRow+1)
            .filter(r=>r.some(v=>String(v).trim()!==''))
            .map((r,i)=>{
              const obj={_rowNum:i+hRow+2};
              headers.forEach((h,ci)=>{obj[h]=String(r[ci]??'').trim();});
              return obj;
            });
          if (!headers.length) { alert('Could not find headers in file'); return; }
          setSheetName(`${f.name} — ${sName}`);
          setParsed({headers,rows});
          setDetections(detectMapping(headers,rows));
          setStep(2);
        } catch(err) { alert('Failed to read Excel: ' + err.message); }
      };
      reader.readAsArrayBuffer(f);
    }
  }, []);

  const updateMapping = (col, newKey) =>
    setDetections(prev=>({...prev,[col]:{...prev[col],key:newKey,method:'manual',conf:1}}));

  const validatedRows = parsed?.rows.map(row => {
    const errors = [];
    const get = (key) => {
      const col = Object.entries(detections).find(([,d])=>d.key===key)?.[0];
      return col ? (row[col]||'').trim() : '';
    };
    let name = get('full_name');
    if (!name) {
      const fn=Object.entries(detections).find(([,d])=>d.key==='_first_name')?.[0];
      const ln=Object.entries(detections).find(([,d])=>d.key==='_last_name')?.[0];
      name=[fn?row[fn]||'':'',ln?row[ln]||'':''].join(' ').trim();
    }
    if (!name) errors.push('Full Name is required');
    return { errors, name };
  }) || [];

  const successCount = validatedRows.filter(r=>r.errors.length===0).length;

  const doImport = async () => {
    setImporting(true);
    let successCount = 0;
    const errors = [];

    for (let i=0; i<parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const vr = validatedRows[i];
      if (vr.errors.length>0) { errors.push({row:row._rowNum,issues:vr.errors}); continue; }

      const get = (key) => {
        const col=Object.entries(detections).find(([,d])=>d.key===key)?.[0];
        return col?(row[col]||'').trim():'';
      };

      try {
        await candidatesAPI.create({
          full_name:           vr.name,
          candidate_role:      get('candidate_role')      ||null,
          total_experience:    get('total_experience')    ||null,
          relevant_experience: get('relevant_experience') ||null,
          email:               get('email')               ||null,
          phone:               get('phone')               ||null,
          location:            get('location')            ||null,
          relocation:          get('relocation')          ||null,
          visa_status:         get('visa_status')         ||null,
          current_company:     get('current_company')     ||null,
          linkedin_url:        get('linkedin_url')        ||null,
          source:              get('source')              ||sheetName||'Import',
          notes:               get('notes')               ||null,
          candidate_type:      candidateType,
          status:              'sourced',
        });
        successCount++;
      } catch(e) {
        const detail = e?.response?.data?.detail;
        let msg = 'API error';
        if (Array.isArray(detail)) msg = detail.map(d=>d?.msg||JSON.stringify(d)).join('; ');
        else if (typeof detail==='string') msg=detail;
        else if (e?.message) msg=e.message;
        errors.push({row:row._rowNum,issues:[msg]});
      }
    }
    setResults({success:successCount,errors});
    setImporting(false);
    setStep(3);
  };

  const reset = () => { setStep(1);setFile(null);setParsed(null);setDetections({});setResults(null);setSheetName(''); };

  const needsReview = Object.entries(detections).filter(([,d])=>d.key!=='__skip__'&&d.method==='fuzzy');
  const mappedCount = Object.values(detections).filter(d=>d.key!=='__skip__'&&d.key!=='_last_name').length;

  return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:'1.75rem'}}>
        <div>
          <p className="label-sm" style={{marginBottom:'0.25rem',color:'var(--tertiary)'}}>Recruitment ATS</p>
          <h1 className="headline-sm">Import Candidates</h1>
        </div>
        <a href="/recruitment/candidates" className="btn-secondary">
          <Icon name="arrow_back" style={{fontSize:'1rem'}}/> Back to Candidates
        </a>
      </div>

      {/* Candidate Type Toggle */}
      <div className="card" style={{padding:'1rem 1.5rem',marginBottom:'1.25rem',display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
        <p style={{fontSize:'0.875rem',fontWeight:600,color:'var(--on-surface)'}}>Candidate Type:</p>
        <div style={{display:'flex',gap:4,padding:4,background:'var(--surface-container-high)',borderRadius:'0.75rem'}}>
          {[{v:'domestic',label:'🇮🇳 Domestic',desc:'SAP Hotlist, India candidates'},
            {v:'international',label:'🌍 International',desc:'US/Ireland hotlists with VISA'}].map(t=>(
            <button key={t.v} onClick={()=>setCandType(t.v)} style={{
              padding:'0.5rem 1.25rem',borderRadius:'0.625rem',border:'none',cursor:'pointer',
              fontFamily:'var(--font-display)',fontSize:'0.8125rem',fontWeight:candidateType===t.v?600:500,
              background:candidateType===t.v?'var(--surface-container-lowest)':'transparent',
              color:candidateType===t.v?'var(--tertiary)':'var(--on-surface-variant)',
              boxShadow:candidateType===t.v?'var(--ambient-shadow)':'none',transition:'all 0.2s',
            }}>
              {t.label}
            </button>
          ))}
        </div>
        <p style={{fontSize:'0.8125rem',color:'var(--on-surface-variant)'}}>
          {candidateType==='international'
            ? 'VISA column will be detected and saved'
            : 'Role, Total Exp, Relevant Exp will be detected'}
        </p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'7fr 5fr',gap:'1.25rem',alignItems:'start'}}>
        <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>

          {/* Steps */}
          <div className="card" style={{padding:'1.25rem 2rem'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'center',gap:0}}>
              {STEPS.map((label,i)=>(
                <React.Fragment key={label}>
                  <StepDot n={i+1} current={step} label={label}/>
                  {i<STEPS.length-1&&<div style={{flex:1,height:2,background:step>i+1?'var(--tertiary)':'var(--surface-container)',marginTop:15,transition:'background 0.4s'}}/>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* STEP 1 — Upload */}
          {step===1&&(
            <div className="card scale-in">
              <h2 style={{fontSize:'1rem',fontWeight:700,marginBottom:'0.5rem'}}>Upload your file</h2>
              <p style={{color:'var(--on-surface-variant)',fontSize:'0.875rem',marginBottom:'1.5rem'}}>
                Works with <strong>SAP Hotlist, US Hotlist</strong>, any candidate CSV or Excel. Supports <strong>.xlsx and .csv</strong> — upload as-is.
              </p>
              <div onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
                onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
                onClick={()=>fileRef.current?.click()}
                style={{border:`2px dashed ${dragOver?'var(--tertiary)':'rgba(195,198,215,0.5)'}`,borderRadius:'0.875rem',padding:'3rem 2rem',textAlign:'center',cursor:'pointer',background:dragOver?'rgba(0,98,67,0.04)':'var(--surface-container-low)',transition:'all 0.2s'}}>
                <Icon name="upload_file" style={{fontSize:'1.75rem',color:dragOver?'var(--tertiary)':'var(--on-surface-variant)',display:'block',margin:'0 auto 0.75rem'}}/>
                <p style={{fontWeight:600,fontSize:'0.9375rem',color:'var(--on-surface)',marginBottom:'0.375rem'}}>{dragOver?'Drop it here!':'Drag & drop your file here'}</p>
                <p style={{color:'var(--on-surface-variant)',fontSize:'0.875rem',marginBottom:'1rem'}}>or click to browse</p>
                <span className="btn-secondary" style={{pointerEvents:'none',fontSize:'0.8125rem'}}>Choose File</span>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
            </div>
          )}

          {/* STEP 2 — Map */}
          {step===2&&parsed&&(
            <div className="card scale-in">
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1rem'}}>
                <div>
                  <h2 style={{fontSize:'1rem',fontWeight:700,marginBottom:'0.25rem'}}>Map Columns</h2>
                  <p style={{color:'var(--on-surface-variant)',fontSize:'0.8125rem'}}>
                    <Icon name="attach_file" style={{fontSize:'0.875rem',color:'var(--tertiary)'}}/>{' '}
                    {sheetName} · {parsed.rows.length} rows · {mappedCount} fields detected
                  </p>
                </div>
                <button className="btn-ghost" onClick={reset} style={{fontSize:'0.8125rem'}}>
                  <Icon name="restart_alt" style={{fontSize:'1rem'}}/> Start over
                </button>
              </div>

              {needsReview.length>0&&(
                <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'0.5rem',padding:'0.75rem 1rem',marginBottom:'1rem',fontSize:'0.8125rem',color:'#92400e',display:'flex',gap:'0.5rem'}}>
                  <Icon name="warning" style={{fontSize:'1rem',color:'#d97706',flexShrink:0}}/>
                  <span><strong>{needsReview.length} column{needsReview.length>1?'s':''} need verification:</strong> {needsReview.map(([c])=>c).join(', ')}</span>
                </div>
              )}

              <div style={{display:'grid',gridTemplateColumns:'1fr 28px 1fr',gap:'0.75rem',padding:'0.375rem 0.75rem',marginBottom:'0.25rem'}}>
                <p className="label-sm">Your File Column</p><div/><p className="label-sm">CRM Field</p>
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                {parsed.headers.map(col=>{
                  const det=detections[col]||{key:'__skip__',conf:0,method:'unmatched'};
                  const isSkipped=det.key==='__skip__';
                  const isFuzzy=det.method==='fuzzy';
                  const rowBg=isSkipped?'var(--surface-container-low)':isFuzzy?'rgba(251,191,36,0.08)':'rgba(0,98,67,0.04)';
                  const rowBorder=isSkipped?'1px solid transparent':isFuzzy?'1px solid rgba(251,191,36,0.4)':'1px solid rgba(0,98,67,0.15)';
                  const samples=parsed.rows.slice(0,3).map(r=>r[col]).filter(Boolean);
                  return (
                    <div key={col} style={{borderRadius:'0.5rem',background:rowBg,border:rowBorder}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 28px 1fr',gap:'0.75rem',alignItems:'center',padding:'0.625rem 0.75rem'}}>
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:'0.4rem',marginBottom:'0.2rem',flexWrap:'wrap'}}>
                            <Icon name="table_chart" style={{fontSize:'0.9rem',color:isSkipped?'var(--on-surface-variant)':'var(--tertiary)'}}/>
                            <span style={{fontSize:'0.875rem',fontWeight:600,color:'var(--on-surface)'}}>{col}</span>
                            <ConfBadge method={det.key==='_last_name'?'name-combine':det.method} crmKey={det.key}/>
                          </div>
                          {samples.length>0&&(
                            <p style={{fontSize:'0.7rem',color:'var(--on-surface-variant)',margin:0,paddingLeft:'1.4rem'}}>
                              {samples.slice(0,2).map(s=>`"${String(s).slice(0,25)}"`).join(', ')}
                            </p>
                          )}
                        </div>
                        <Icon name="arrow_forward" style={{fontSize:'1rem',color:isSkipped?'var(--outline-variant)':'var(--tertiary)',justifySelf:'center'}}/>
                        <select className="select" value={det.key} onChange={e=>updateMapping(col,e.target.value)}
                          style={{fontSize:'0.8125rem',borderColor:isFuzzy?'#fde68a':undefined}}>
                          {CRM_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}{f.required?' *':''}</option>)}
                          {det.key==='_last_name'&&<option value="_last_name">Last Name (auto-combine)</option>}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginTop:'1.25rem',flexWrap:'wrap'}}>
                <button className="btn-primary" onClick={doImport} disabled={!successCount||importing}
                  style={{opacity:successCount?1:0.5,background:'linear-gradient(135deg,var(--tertiary),#009966)'}}>
                  <Icon name="upload" style={{fontSize:'1rem',color:'#fff'}}/>
                  {importing?'Importing…':`Import ${successCount} Candidates`}
                </button>
                {validatedRows.filter(r=>r.errors.length>0).length>0&&(
                  <span style={{fontSize:'0.8125rem',color:'var(--on-surface-variant)',marginLeft:'auto'}}>
                    {validatedRows.filter(r=>r.errors.length>0).length} rows will be skipped
                  </span>
                )}
              </div>
            </div>
          )}

          {/* STEP 3 — Done */}
          {step===3&&results&&(
            <div className="card scale-in" style={{textAlign:'center',padding:'3rem 2rem'}}>
              <div style={{width:64,height:64,borderRadius:'50%',background:'#dcfce7',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1.25rem'}}>
                <Icon name="check_circle" style={{fontSize:'2rem',color:'#16a34a'}}/>
              </div>
              <h2 style={{fontSize:'1.25rem',fontWeight:700,marginBottom:'0.5rem'}}>Import Complete</h2>
              <p style={{color:'var(--on-surface-variant)',marginBottom:'1.5rem'}}>
                <strong style={{color:'#16a34a'}}>{results.success} candidates</strong> imported as <strong>{candidateType}</strong>
                {results.errors.length>0&&<>, <strong style={{color:'var(--error)'}}>{results.errors.length} skipped</strong></>}
              </p>
              {results.errors.length>0&&(
                <div style={{textAlign:'left',background:'var(--error-container)',borderRadius:'0.625rem',padding:'1rem',marginBottom:'1.5rem',maxHeight:180,overflowY:'auto'}}>
                  {results.errors.map((e,i)=><p key={i} style={{fontSize:'0.8125rem',color:'var(--error)',margin:'0.2rem 0'}}>Row {e.row}: {e.issues.join(', ')}</p>)}
                </div>
              )}
              <div style={{display:'flex',gap:'0.75rem',justifyContent:'center'}}>
                <a href="/recruitment/candidates" className="btn-primary" style={{background:'linear-gradient(135deg,var(--tertiary),#009966)'}}>View Candidates</a>
                <button className="btn-secondary" onClick={reset}>Import Another</button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          <div className="card" style={{padding:'1.25rem'}}>
            <h3 style={{fontSize:'0.875rem',fontWeight:700,marginBottom:'0.875rem'}}>Supported Formats</h3>
            {[
              {icon:'description',title:'SAP Hotlist',desc:'Role, Candidate Name, Total Exp, Relevant Exp → auto-detected'},
              {icon:'flag',      title:'US Hotlist',  desc:'VISA, Candidate Name, Technology, Experience, Location, Relocation'},
              {icon:'table_chart',title:'Any CSV/Excel',desc:'Custom sheets — map columns manually in Step 2'},
            ].map(s=>(
              <div key={s.title} style={{display:'flex',gap:'0.625rem',marginBottom:'0.875rem'}}>
                <div style={{width:28,height:28,borderRadius:'0.5rem',background:'var(--surface-container)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <Icon name={s.icon} style={{fontSize:'0.875rem',color:'var(--tertiary)'}}/>
                </div>
                <div>
                  <p style={{fontSize:'0.8125rem',fontWeight:600,color:'var(--on-surface)',marginBottom:'0.125rem'}}>{s.title}</p>
                  <p style={{fontSize:'0.75rem',color:'var(--on-surface-variant)',margin:0}}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {step===2&&(
            <div className="card" style={{padding:'1.25rem'}}>
              <h3 style={{fontSize:'0.875rem',fontWeight:700,marginBottom:'1rem'}}>Detection Summary</h3>
              {[
                {label:'Exact match',  count:Object.values(detections).filter(d=>d.method==='exact').length,  color:'#15803d',bg:'#dcfce7'},
                {label:'Manually set', count:Object.values(detections).filter(d=>d.method==='manual').length, color:'#0369a1',bg:'#e0f2fe'},
                {label:'Fuzzy — verify!',count:Object.values(detections).filter(d=>d.method==='fuzzy').length,color:'#d97706',bg:'#fef3c7'},
                {label:'Not detected', count:Object.values(detections).filter(d=>d.key==='__skip__'&&d.method!=='split-name').length,color:'#dc2626',bg:'#fee2e2'},
              ].filter(s=>s.count>0).map(s=>(
                <div key={s.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem'}}>
                  <span style={{fontSize:'0.8125rem',color:'var(--on-surface-variant)'}}>{s.label}</span>
                  <span style={{fontSize:'0.8125rem',fontWeight:700,color:s.color,background:s.bg,padding:'0.1rem 0.5rem',borderRadius:'0.75rem'}}>{s.count}</span>
                </div>
              ))}
              <div style={{borderTop:'1px solid var(--outline-variant)',marginTop:'0.75rem',paddingTop:'0.75rem',display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:'0.875rem',fontWeight:600}}>Ready to import</span>
                <span style={{fontSize:'0.875rem',fontWeight:700,color:'#16a34a'}}>{successCount} / {parsed?.rows.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
