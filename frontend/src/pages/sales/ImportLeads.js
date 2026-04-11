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
   CRM FIELD DEFINITIONS — v4 (Company-Centric)
═══════════════════════════════════════════════════════ */
const CRM_FIELDS = [
  // ── COMPANY ─────────────────────────────────────────
  { key: 'company',                      label: 'Company Name ★',           required: true,  group: 'company' },
  { key: 'company_type',                 label: 'Company Type',             required: false, group: 'company' },
  { key: 'segment',                      label: 'Segment',                  required: false, group: 'company' },
  { key: 'hq_location',                  label: 'HQ Location (Irish)',       required: false, group: 'company' },
  { key: 'india_office',                 label: 'India Office(s)',           required: false, group: 'company' },
  { key: 'domain_focus',                 label: 'Domain / Skills Focus',    required: false, group: 'company' },
  { key: 'website',                      label: 'Website',                  required: false, group: 'company' },
  { key: 'company_linkedin',             label: 'Company LinkedIn URL',     required: false, group: 'company' },
  { key: 'status',                       label: 'Status',                   required: false, group: 'company' },
  { key: 'source',                       label: 'Source / Lead From',       required: false, group: 'company' },
  { key: 'next_follow_up',               label: 'Next Follow-up Date',      required: false, group: 'company' },
  { key: 'intro_sent',                   label: 'Intro Sent Date',          required: false, group: 'company' },
  { key: 'solution_skills',             label: 'Solution / Skills Looking', required: false, group: 'company' },
  { key: 'notes',                        label: 'Remarks / Notes',          required: false, group: 'company' },
  { key: 'turnover_headcount',           label: 'Turnover / Headcount',     required: false, group: 'company' },
  // ── CONTACT PERSON 1 ─────────────────────────────────
  { key: 'full_name',                    label: 'CP1 — Name',               required: false, group: 'cp1' },
  { key: 'job_title',                    label: 'CP1 — Designation',        required: false, group: 'cp1' },
  { key: 'email',                        label: 'CP1 — Email',              required: false, group: 'cp1' },
  { key: 'phone',                        label: 'CP1 — Phone / Mobile',     required: false, group: 'cp1' },
  { key: 'linkedin_url',                 label: 'CP1 — LinkedIn URL',       required: false, group: 'cp1' },
  // ── CONTACT PERSON 2 ─────────────────────────────────
  { key: 'contact_person_2_name',        label: 'CP2 — Name',               required: false, group: 'cp2' },
  { key: 'contact_person_2_designation', label: 'CP2 — Designation',        required: false, group: 'cp2' },
  { key: 'contact_person_2_email',       label: 'CP2 — Email',              required: false, group: 'cp2' },
  { key: 'contact_person_2_phone',       label: 'CP2 — Phone / Mobile',     required: false, group: 'cp2' },
  { key: 'contact_person_2_linkedin',    label: 'CP2 — LinkedIn URL',       required: false, group: 'cp2' },
  // ── CONTACT PERSON 3 ─────────────────────────────────
  { key: 'contact_person_3_name',        label: 'CP3 — Name',               required: false, group: 'cp3' },
  { key: 'contact_person_3_designation', label: 'CP3 — Designation',        required: false, group: 'cp3' },
  { key: 'contact_person_3_email',       label: 'CP3 — Email',              required: false, group: 'cp3' },
  { key: 'contact_person_3_phone',       label: 'CP3 — Phone / Mobile',     required: false, group: 'cp3' },
  { key: 'contact_person_3_linkedin',    label: 'CP3 — LinkedIn URL',       required: false, group: 'cp3' },
  // ── SKIP ─────────────────────────────────────────────
  { key: '__skip__',                     label: '— Skip Column —',          required: false, group: 'skip' },
];

const VALID_STATUSES = ['new','contacted','called','interested','closed','completed','rejected','lost','follow_up_needed'];

/* ═══════════════════════════════════════════════════════
   SYNONYM DICTIONARY
   Handles: Apollo, LinkedIn, ZoomInfo, manual CSVs,
   and the specific Ireland sheet column names
═══════════════════════════════════════════════════════ */
const SYNONYMS = {
  // ── COMPANY ─────────────────────────────────────────
  company: [
    'company name','company','organisation','organization','account',
    'employer','business','firm','companyname','account name','account_name',
    'company name for emails','current company','workplace',
  ],
  company_type: [
    'type','company type','company_type','firm type','org type','entity type',
    'business type','businesstype',
  ],
  segment: [
    'segment','category','tier','group','client type','partner type',
  ],
  hq_location: [
    'location','hq location','irish hq','ireland location','hq','office location',
    'city','hq city','address','head office','registered office','registered address',
    'hq_location','loc','office','base location',
  ],
  india_office: [
    'india office','india office(s)','india offices','india_office',
    'offshore location','india location','hyderabad office',
  ],
  domain_focus: [
    'domain focus','domain','core services','skills','technology focus',
    'industry type','business type / skills','type of business/ skills',
    'tech stack','specialisation','specialization','services','capabilities',
    'domain_focus','technology','tech','focus area',
    'solution using/looking skills','solution skills',
  ],
  website: [
    'website','web','url','site','web address','company website','homepage',
    'web site','company url','website url',
  ],
  company_linkedin: [
    'linkedn','linkedin','linkedin url','company linkedin','company_linkedin',
    'linkedin page','organization linkedin','org linkedin','li page',
    'company li','link',  // "link" col in SPOC sheet maps here first
  ],
  status: [
    'status','lead status','stage','state','pipeline stage','crm status',
    'deal stage','opportunity stage','contact status',
  ],
  source: [
    'source','lead source','lead come from','channel','origin','referred by',
    'how found','utm source','acquisition','referral','traffic source',
    'list name','lead_source',
  ],
  next_follow_up: [
    'follow up','follow-up','followup','next f date','next follow up date',
    'next follow date','callback date','next contact','due date',
    'follow_up_date','next_contact_date','next f-date',
  ],
  intro_sent: [
    'intro sent','f- date','first contact date','intro date','first email date',
    'outreach date','sent date','intro_sent',
  ],
  solution_skills: [
    'solution using/looking skills','solution skills','looking for','requirements',
    'solution_skills','skills required','tech looking for','domain looking',
  ],
  notes: [
    'remark','remarks','notes','note','comments','comment','description',
    'additional info','observations','memo','feedback','about','extra',
    'remark ','remarks ','remarks1','remarks2','follow up notes',
  ],
  turnover_headcount: [
    'turnover/ headcount','turnover/headcount','turnover','headcount',
    'company size','employees','size','revenue','annual revenue',
  ],

  // ── CONTACT PERSON 1 ─────────────────────────────────
  full_name: [
    'contact person-1','contact person 1','contact person1','name','full name',
    'contact name','person name','fullname','full_name','spoc','poc',
    'primary contact','contact_name',
  ],
  _first_name: ['first name','firstname','given name','fname'],
  _last_name:  ['last name','lastname','surname','family name','lname'],
  job_title: [
    'designtaion',   // intentional typo from her sheet
    'designation','title','job title','position','role','occupation',
    'job_title','jobtitle','contact title','functional_level',
  ],
  email: [
    'e-mail','email','email address','work email','primary email',
    'contact email','email 1','email1','email_address','work_email',
    'person email',
  ],
  phone: [
    'mobile number','mobile','phone','contact','contact no. ','contact no.',
    'phone number','work direct phone','cell','telephone','tel',
    'contact number','primary phone','phonenumber','phone_number',
    'mobile_number','mobile_phone','contact_phone','contact no',
    'contact number 1','contact no. 1',
  ],
  linkedin_url: [
    'linkden',       // intentional typo from her sheet
    'linkedin_url','person linkedin url','li url','linkedin profile url',
    'social url','profile link','personal linkedin',
  ],

  // ── CONTACT PERSON 2 — pandas renames duplicates with .1 ──
  contact_person_2_name: [
    'contact person-2','contact person 2','contact person2','contact person 1.1',
    'contact_person_2_name','contact 2','cp2 name','contact2',
  ],
  contact_person_2_designation: [
    'designtaion.1','designation.1','title.1','job title.1',
    'contact_person_2_designation','contact 2 designation','cp2 designation',
  ],
  contact_person_2_email: [
    'e-mail.1','email.1','email 1','contact_person_2_email',
    'contact 2 email','cp2 email','email1.1',
  ],
  contact_person_2_phone: [
    'mobile number.1','mobile.1','phone.1','contact.1',
    'contact person 1 mobile','contact person1 mobile',
    'contact_person_2_phone','contact 2 phone','cp2 phone',
    'contact no. 1','contact no.1',
  ],
  contact_person_2_linkedin: [
    'linkden.1','linkedin.1','link.1','linkedin url.1',
    'contact_person_2_linkedin','cp2 linkedin','contact 2 linkedin',
    'person linkedin url.1',
  ],

  // ── CONTACT PERSON 3 — pandas renames duplicates with .2 ──
  contact_person_3_name: [
    'contact person-3','contact person 3','contact person3','contact person 1.2',
    'contact_person_3_name','contact 3','cp3 name','contact3',
  ],
  contact_person_3_designation: [
    'designtaion.2','designation.2','title.2','job title.2',
    'contact_person_3_designation','contact 3 designation','cp3 designation',
  ],
  contact_person_3_email: [
    'e-mail.2','email.2','email 2','contact_person_3_email',
    'contact 2 email','cp3 email','email2',
  ],
  contact_person_3_phone: [
    'mobile number.2','mobile.2','phone.2','contact.2',
    'contact person 2 mobile','contact person2 mobile',
    'contact_person_3_phone','contact 3 phone','cp3 phone',
    'contact no. 2','contact no.2',
  ],
  contact_person_3_linkedin: [
    'linkden.2','linkedin.2','link.2','linkedin url.2',
    'contact_person_3_linkedin','cp3 linkedin','contact 3 linkedin',
    'person linkedin url.2',
  ],
};

// Cols to skip entirely (row numbers etc.)
const SKIP_COLS_AUTO = new Set([
  'no.','no','sr. no','sr no','s.no.','sl no','sl. no.','#',
  'sno','srl no','serial no','serial number','#','row','id',
  'in crm','crm','ded',
]);

/* ═══════════════════════════════════════════════════════
   AUTO-MAPPER
═══════════════════════════════════════════════════════ */
function autoMap(sheetCols) {
  const result = {};
  const lc = (s) => String(s).toLowerCase().trim();

  sheetCols.forEach((col) => {
    const colLC = lc(col);

    // Auto-skip row-number columns
    if (SKIP_COLS_AUTO.has(colLC)) { result[col] = '__skip__'; return; }

    // Check each CRM field's synonyms
    for (const [crmKey, synonymList] of Object.entries(SYNONYMS)) {
      if (crmKey.startsWith('_')) continue; // internal keys
      if (synonymList.map(lc).includes(colLC)) {
        result[col] = crmKey;
        return;
      }
    }

    // Default: skip unmapped cols
    result[col] = '__skip__';
  });
  return result;
}

/* ═══════════════════════════════════════════════════════
   ROW TRANSFORMER
   Converts a raw sheet row + mapping → CRM payload
═══════════════════════════════════════════════════════ */
function transformRow(row, mapping, filename) {
  const get = (key) => {
    const col = Object.entries(mapping).find(([, v]) => v === key)?.[0];
    if (!col) return null;
    const val = String(row[col] ?? '').trim();
    return val === '' || val.toLowerCase() === 'nan' || val.toLowerCase() === 'none' ? null : val;
  };

  const getEmail = (key) => {
    const v = get(key);
    if (!v) return null;
    // Handle multi-line phone/email cells — take first valid email
    const candidates = v.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    for (const c of candidates) {
      if (c.includes('@') && c.includes('.')) return c;
    }
    return null;
  };

  const getPhone = (key) => {
    const v = get(key);
    if (!v) return null;
    // Handle multi-line cells — take first phone
    return v.split(/[\n]+/)[0].trim() || null;
  };

  const getDate = (key) => {
    const v = get(key);
    if (!v) return null;
    // Accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
    const clean = v.replace(/[/\\]/g, '-');
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 2) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean.slice(0, 10);
  };

  const getBool = (key) => {
    const v = get(key);
    if (!v) return null;
    return ['yes','true','1','y'].includes(v.toLowerCase()) ? true
         : ['no','false','0','n'].includes(v.toLowerCase()) ? false
         : null;
  };

  // Handle Apollo first+last name split
  let cp1Name = get('full_name');
  const firstName = get('_first_name');
  const lastName  = get('_last_name');
  if (!cp1Name && (firstName || lastName)) {
    cp1Name = [firstName, lastName].filter(Boolean).join(' ');
  }

  const company = get('company');
  const hqLoc   = get('hq_location');

  if (!company && !cp1Name) return null; // Skip fully empty rows

  // Detect segment from filename
  const fl = filename.toLowerCase();
  let autoSegment = get('segment');
  if (!autoSegment) {
    if (fl.includes('staffing')) autoSegment = 'staffing_partner';
    else if (fl.includes('end client') || fl.includes('end_client')) autoSegment = 'end_client';
    else if (fl.includes('ireland')) autoSegment = 'ireland_company';
    else if (fl.includes('spoc')) autoSegment = 'general';
  }

  const coerceStatus = (v) => {
    if (!v) return 'new';
    const map = {
      new:'new', contacted:'contacted', called:'called', interested:'interested',
      closed:'closed', completed:'completed', rejected:'rejected', lost:'lost',
      follow_up_needed:'follow_up_needed', 'follow up needed':'follow_up_needed',
      'follow-up needed':'follow_up_needed', won:'closed',
    };
    return map[v.toLowerCase()] || 'new';
  };

  return {
    // Company
    company:          company || cp1Name || 'Unknown',
    company_type:     get('company_type'),
    segment:          autoSegment,
    hq_location:      hqLoc,
    india_office:     get('india_office'),
    domain_focus:     get('domain_focus'),
    website:          get('website'),
    company_linkedin: get('company_linkedin'),
    status:           coerceStatus(get('status')),
    source:           get('source') || 'Import',
    source_file:      filename,
    next_follow_up:   getDate('next_follow_up'),
    intro_sent:       getDate('intro_sent'),
    solution_skills:  get('solution_skills'),
    notes:            get('notes'),
    turnover_headcount: get('turnover_headcount'),
    // Legacy aliases
    address:          hqLoc,
    industry:         get('domain_focus'),
    // CP1
    full_name:        cp1Name || company || 'Unknown',
    job_title:        get('job_title'),
    email:            getEmail('email'),
    phone:            getPhone('phone'),
    linkedin_url:     get('linkedin_url'),
    // CP2
    contact_person_2_name:        get('contact_person_2_name'),
    contact_person_2_designation: get('contact_person_2_designation'),
    contact_person_2_email:       getEmail('contact_person_2_email'),
    contact_person_2_phone:       getPhone('contact_person_2_phone'),
    contact_person_2_linkedin:    get('contact_person_2_linkedin'),
    // CP3
    contact_person_3_name:        get('contact_person_3_name'),
    contact_person_3_designation: get('contact_person_3_designation'),
    contact_person_3_email:       getEmail('contact_person_3_email'),
    contact_person_3_phone:       getPhone('contact_person_3_phone'),
    contact_person_3_linkedin:    get('contact_person_3_linkedin'),
  };
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function ImportLeads() {
  // ── State ─────────────────────────────────────────────
  const [step, setStep]           = useState(1); // 1=upload 2=map 3=preview 4=result
  const [file, setFile]           = useState(null);
  const [sheets, setSheets]       = useState([]);
  const [activeSheet, setSheet]   = useState(0);
  const [rawData, setRawData]     = useState([]);    // all rows
  const [cols, setCols]           = useState([]);    // sheet column names
  const [mapping, setMapping]     = useState({});    // col → crmKey
  const [preview, setPreview]     = useState([]);    // transformed rows for preview
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const fileRef                   = useRef();

  // ── File loading ──────────────────────────────────────
  const loadFile = useCallback(async (f) => {
    setFile(f);
    const XLSX = await getXLSX();
    const buf  = await f.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
    setSheets(wb.SheetNames);

    const loadSheet = (sheetName) => {
      const ws   = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
      if (!rows.length) return { cols: [], rows: [] };
      // Detect column names (handle pandas-style .1 .2 duplicate suffixes)
      const colNames = Object.keys(rows[0]);
      return { cols: colNames, rows };
    };

    const { cols: c, rows: r } = loadSheet(wb.SheetNames[0]);
    setCols(c);
    setRawData(r);
    setMapping(autoMap(c));
    setStep(2);
  }, []);

  const switchSheet = useCallback(async (idx) => {
    setSheet(idx);
    const XLSX = await getXLSX();
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
    const ws   = wb.Sheets[wb.SheetNames[idx]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
    if (!rows.length) { setCols([]); setRawData([]); setMapping({}); return; }
    const c = Object.keys(rows[0]);
    setCols(c);
    setRawData(rows);
    setMapping(autoMap(c));
  }, [file]);

  const onFileSelect = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv','xlsx','xls'].includes(ext)) { alert('Please upload a CSV or Excel file.'); return; }
    loadFile(f);
  };

  // ── Build preview ─────────────────────────────────────
  const buildPreview = () => {
    const fname = file?.name || '';
    const rows  = rawData.map(row => transformRow(row, mapping, fname)).filter(Boolean);
    setPreview(rows);
    setStep(3);
  };

  // ── Upload ────────────────────────────────────────────
  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // We send the raw file — server handles transformation
      // (server_sales_patch.py is authoritative for the backend transform)
      const form = new FormData();
      form.append('file', file);
      const res = await leadsAPI.import(form);
      setResult(res.data);
      setStep(4);
    } catch (e) {
      alert(e?.response?.data?.detail || 'Upload failed — check console');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setStep(1); setFile(null); setSheets([]); setSheet(0);
    setRawData([]); setCols([]); setMapping({}); setPreview([]); setResult(null);
  };

  // ── Render helpers ─────────────────────────────────────
  const GROUP_COLORS = {
    company: { bg:'rgba(0,74,198,0.07)',   border:'rgba(0,74,198,0.25)',   label:'Company',    color:'var(--primary)' },
    cp1:     { bg:'rgba(0,74,198,0.05)',   border:'rgba(0,74,198,0.15)',   label:'Contact 1',  color:'var(--primary)' },
    cp2:     { bg:'rgba(124,58,237,0.07)', border:'rgba(124,58,237,0.2)', label:'Contact 2',  color:'#7c3aed' },
    cp3:     { bg:'rgba(0,150,80,0.07)',   border:'rgba(0,150,80,0.2)',   label:'Contact 3',  color:'var(--tertiary)' },
    skip:    { bg:'var(--surface-container)', border:'var(--outline-variant)', label:'Skip', color:'var(--on-surface-variant)' },
  };

  const fieldGroup = (key) => CRM_FIELDS.find(f => f.key === key)?.group || 'skip';

  // ── Step 1 — Upload ────────────────────────────────────
  if (step === 1) return (
    <div className="fade-in" style={{ maxWidth:640, margin:'0 auto' }}>
      <h1 style={{ fontSize:'1.375rem', fontWeight:800, marginBottom:'0.375rem' }}>Import Companies</h1>
      <p style={{ color:'var(--on-surface-variant)', marginBottom:'1.75rem', fontSize:'0.9375rem' }}>
        Upload your Ireland companies sheet, staffing partners list, or any Excel / CSV file.
        The importer auto-detects all contact person columns including LinkedIn.
      </p>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFileSelect(f); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--outline-variant)'}`,
          borderRadius:'1rem', padding:'3rem 2rem', textAlign:'center', cursor:'pointer',
          background: dragOver ? 'rgba(0,74,198,0.04)' : 'var(--surface-container-lowest)',
          transition:'all 0.2s',
        }}
      >
        <Icon name="upload_file" style={{ fontSize:'3rem', color: dragOver ? 'var(--primary)' : 'var(--on-surface-variant)', display:'block', margin:'0 auto 0.875rem' }} />
        <p style={{ fontWeight:700, fontSize:'1rem', color:'var(--on-surface)', marginBottom:'0.375rem' }}>
          {dragOver ? 'Drop to upload' : 'Drop your file here or click to browse'}
        </p>
        <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem' }}>
          Supports .xlsx, .xls, .csv — all sheet formats (Ireland Companies, SPOC, Staffing Partners, End Clients)
        </p>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={e => onFileSelect(e.target.files[0])} />
      </div>

      {/* Format guide */}
      <div className="card" style={{ marginTop:'1.5rem' }}>
        <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'1rem' }}>Supported Sheet Formats</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
          {[
            { icon:'table_chart', label:'Ireland Companies Sheet',  desc:'Company Name, Type, Location, Domain Focus, 3 Contact Persons' },
            { icon:'handshake',   label:'End Client Sheet',         desc:'Company, Type, Location, Domain, 3 Contact Persons' },
            { icon:'groups',      label:'Staffing Partners Sheet',  desc:'Company, Irish HQ, India Office, Core Services, Website, LinkedIn' },
            { icon:'person_pin',  label:'SPOC / Contacts Sheet',    desc:'Company, Name, Contact, Email, LinkedIn' },
          ].map(f => (
            <div key={f.label} style={{ padding:'0.75rem', borderRadius:'0.625rem', background:'var(--surface-container-low)', display:'flex', gap:'0.625rem' }}>
              <Icon name={f.icon} style={{ fontSize:'1.25rem', color:'var(--primary)', flexShrink:0, marginTop:'0.125rem' }} />
              <div>
                <p style={{ fontWeight:600, fontSize:'0.8125rem' }}>{f.label}</p>
                <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.125rem' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Step 2 — Column Mapping ────────────────────────────
  if (step === 2) return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1.25rem' }}>
        <button className="btn-ghost" onClick={reset} style={{ padding:'0.25rem 0.5rem' }}>
          <Icon name="arrow_back" style={{ fontSize:'1rem' }} /> Back
        </button>
        <div>
          <h1 style={{ fontSize:'1.25rem', fontWeight:800 }}>Map Columns — {file?.name}</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>
            {cols.length} columns auto-detected. Review the mapping below.
          </p>
        </div>
      </div>

      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div style={{ display:'flex', gap:'0.375rem', marginBottom:'1rem', overflowX:'auto' }}>
          {sheets.map((sh, i) => (
            <button key={sh} onClick={() => switchSheet(i)} style={{
              padding:'0.375rem 0.875rem', borderRadius:9999, border:'none', cursor:'pointer',
              fontSize:'0.8125rem', fontWeight: activeSheet===i ? 700 : 400, whiteSpace:'nowrap',
              background: activeSheet===i ? 'var(--primary)' : 'var(--surface-container)',
              color: activeSheet===i ? '#fff' : 'var(--on-surface-variant)',
            }}>{sh}</button>
          ))}
        </div>
      )}

      {/* Mapping legend */}
      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
        {Object.entries(GROUP_COLORS).filter(([k]) => k !== 'skip').map(([k, v]) => (
          <span key={k} style={{ fontSize:'0.75rem', padding:'0.2rem 0.625rem', borderRadius:9999, background:v.bg, border:`1px solid ${v.border}`, color:v.color, fontWeight:600 }}>
            {v.label}
          </span>
        ))}
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
          <thead>
            <tr style={{ background:'var(--surface-container-low)', borderBottom:'2px solid var(--outline-variant)' }}>
              <th style={{ padding:'0.625rem 1rem', textAlign:'left', fontWeight:700, color:'var(--on-surface-variant)', fontSize:'0.6875rem', textTransform:'uppercase' }}>Sheet Column</th>
              <th style={{ padding:'0.625rem 0.5rem', textAlign:'left', fontWeight:700, color:'var(--on-surface-variant)', fontSize:'0.6875rem', textTransform:'uppercase' }}>Sample Data</th>
              <th style={{ padding:'0.625rem 1rem', textAlign:'left', fontWeight:700, color:'var(--on-surface-variant)', fontSize:'0.6875rem', textTransform:'uppercase' }}>Maps To CRM Field</th>
            </tr>
          </thead>
          <tbody>
            {cols.map((col, i) => {
              const mapped = mapping[col] || '__skip__';
              const grp    = fieldGroup(mapped);
              const gc     = GROUP_COLORS[grp] || GROUP_COLORS.skip;
              const sample = rawData.slice(0,3).map(r => String(r[col] ?? '')).filter(v => v && v !== 'nan' && v !== '').join(', ').slice(0, 60);
              return (
                <tr key={col} style={{ borderBottom:'1px solid var(--outline-variant)', background: i%2===0 ? 'transparent' : 'var(--surface-container-lowest)' }}>
                  <td style={{ padding:'0.5rem 1rem', fontWeight:600, color:'var(--on-surface)', fontFamily:'monospace', fontSize:'0.8125rem' }}>{col}</td>
                  <td style={{ padding:'0.5rem', color:'var(--on-surface-variant)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'0.75rem' }}>
                    {sample || <em style={{ opacity:0.5 }}>empty</em>}
                  </td>
                  <td style={{ padding:'0.5rem 1rem' }}>
                    <select
                      value={mapped}
                      onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}
                      style={{
                        fontSize:'0.8125rem', padding:'0.3125rem 0.5rem', borderRadius:'0.375rem',
                        border:`1px solid ${gc.border}`, background: gc.bg, color: gc.color,
                        cursor:'pointer', fontWeight:600, outline:'none',
                      }}
                    >
                      {CRM_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.25rem', gap:'0.75rem' }}>
        <button className="btn-secondary" onClick={reset}>Cancel</button>
        <button className="btn-primary" onClick={buildPreview}>
          Preview Import <Icon name="arrow_forward" style={{ fontSize:'1rem', color:'#fff' }} />
        </button>
      </div>
    </div>
  );

  // ── Step 3 — Preview ──────────────────────────────────
  if (step === 3) return (
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div>
          <button className="btn-ghost" onClick={() => setStep(2)} style={{ padding:'0.25rem 0.5rem', marginBottom:'0.375rem' }}>
            <Icon name="arrow_back" style={{ fontSize:'1rem' }} /> Back to mapping
          </button>
          <h1 style={{ fontSize:'1.25rem', fontWeight:800 }}>Preview — {preview.length} companies</h1>
          <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)' }}>Showing first 10 rows. Verify before uploading.</p>
        </div>
        <button className="btn-primary" onClick={doUpload} disabled={uploading || !preview.length} style={{ minWidth:140 }}>
          {uploading ? (
            <><Icon name="progress_activity" style={{ fontSize:'1rem', color:'#fff' }} /> Uploading…</>
          ) : (
            <><Icon name="cloud_upload" style={{ fontSize:'1rem', color:'#fff' }} /> Upload {preview.length} Companies</>
          )}
        </button>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
        {preview.slice(0, 10).map((row, i) => (
          <div key={i} className="card" style={{ padding:'1rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr 1fr 1fr', gap:'0.75rem', alignItems:'start' }}>
              {/* Company */}
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.25rem' }}>
                  <div style={{
                    width:32, height:32, borderRadius:'0.5rem', flexShrink:0,
                    background:'rgba(0,74,198,0.1)', display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <Icon name="business" style={{ fontSize:'1rem', color:'var(--primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:'0.9375rem' }}>{row.company || '—'}</p>
                    <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{[row.company_type, row.hq_location].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                </div>
                {row.domain_focus && <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>🎯 {row.domain_focus}</p>}
                {row.website && <p style={{ fontSize:'0.75rem', color:'var(--primary)' }}>🌐 {row.website}</p>}
              </div>
              {/* CP1 */}
              <div>
                <p style={{ fontSize:'0.625rem', fontWeight:700, color:'var(--primary)', textTransform:'uppercase', marginBottom:'0.25rem' }}>Contact 1</p>
                {row.full_name && row.full_name !== row.company ? <p style={{ fontWeight:600, fontSize:'0.8125rem' }}>{row.full_name}</p> : <p style={{ color:'var(--outline)', fontSize:'0.75rem' }}>—</p>}
                {row.job_title && <p style={{ fontSize:'0.6875rem', color:'var(--on-surface-variant)' }}>{row.job_title}</p>}
                {row.email && <p style={{ fontSize:'0.6875rem', color:'var(--primary)' }}>{row.email}</p>}
                {row.linkedin_url && <p style={{ fontSize:'0.6875rem', color:'#0a66c2' }}>LinkedIn ✓</p>}
              </div>
              {/* CP2 */}
              <div>
                <p style={{ fontSize:'0.625rem', fontWeight:700, color:'#7c3aed', textTransform:'uppercase', marginBottom:'0.25rem' }}>Contact 2</p>
                {row.contact_person_2_name ? <p style={{ fontWeight:600, fontSize:'0.8125rem' }}>{row.contact_person_2_name}</p> : <p style={{ color:'var(--outline)', fontSize:'0.75rem' }}>—</p>}
                {row.contact_person_2_email && <p style={{ fontSize:'0.6875rem', color:'var(--primary)' }}>{row.contact_person_2_email}</p>}
                {row.contact_person_2_linkedin && <p style={{ fontSize:'0.6875rem', color:'#0a66c2' }}>LinkedIn ✓</p>}
              </div>
              {/* CP3 */}
              <div>
                <p style={{ fontSize:'0.625rem', fontWeight:700, color:'var(--tertiary)', textTransform:'uppercase', marginBottom:'0.25rem' }}>Contact 3</p>
                {row.contact_person_3_name ? <p style={{ fontWeight:600, fontSize:'0.8125rem' }}>{row.contact_person_3_name}</p> : <p style={{ color:'var(--outline)', fontSize:'0.75rem' }}>—</p>}
                {row.contact_person_3_email && <p style={{ fontSize:'0.6875rem', color:'var(--primary)' }}>{row.contact_person_3_email}</p>}
                {row.contact_person_3_linkedin && <p style={{ fontSize:'0.6875rem', color:'#0a66c2' }}>LinkedIn ✓</p>}
              </div>
            </div>
          </div>
        ))}
        {preview.length > 10 && (
          <p style={{ textAlign:'center', color:'var(--on-surface-variant)', fontSize:'0.875rem', padding:'0.5rem' }}>
            … and {preview.length - 10} more companies
          </p>
        )}
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.25rem', gap:'0.75rem' }}>
        <button className="btn-secondary" onClick={() => setStep(2)}>← Back to Mapping</button>
        <button className="btn-primary" onClick={doUpload} disabled={uploading || !preview.length} style={{ minWidth:160 }}>
          {uploading ? 'Uploading…' : `Upload ${preview.length} Companies`}
        </button>
      </div>
    </div>
  );

  // ── Step 4 — Result ───────────────────────────────────
  if (step === 4) return (
    <div className="fade-in" style={{ maxWidth:560, margin:'0 auto', textAlign:'center' }}>
      <div style={{
        width:72, height:72, borderRadius:'50%', margin:'0 auto 1.25rem',
        background: result?.failed === 0 ? 'rgba(0,150,80,0.1)' : 'rgba(217,119,6,0.1)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={result?.failed === 0 ? 'check_circle' : 'warning'} style={{ fontSize:'2.5rem', color: result?.failed === 0 ? 'var(--tertiary)' : '#d97706' }} />
      </div>
      <h2 style={{ fontSize:'1.375rem', fontWeight:800, marginBottom:'0.5rem' }}>
        Import {result?.failed === 0 ? 'Complete' : 'Done with Warnings'}
      </h2>

      <div style={{ display:'flex', gap:'1rem', justifyContent:'center', margin:'1.25rem 0' }}>
        {[
          { label:'Total Rows',  value: result?.total_rows, color:'var(--on-surface)' },
          { label:'Imported',    value: result?.successful, color:'var(--tertiary)' },
          { label:'Skipped',     value: result?.failed,     color: result?.failed > 0 ? 'var(--error)' : 'var(--tertiary)' },
        ].map(s => (
          <div key={s.label} style={{ padding:'1rem 1.5rem', borderRadius:'0.75rem', background:'var(--surface-container-low)', minWidth:100 }}>
            <p style={{ fontSize:'1.75rem', fontWeight:800, color:s.color }}>{s.value ?? '—'}</p>
            <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginTop:'0.25rem' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {result?.errors?.length > 0 && (
        <div style={{ textAlign:'left', margin:'1rem 0', background:'var(--error-container)', borderRadius:'0.625rem', padding:'0.875rem', maxHeight:200, overflowY:'auto' }}>
          <p style={{ fontWeight:700, color:'var(--on-error-container)', fontSize:'0.875rem', marginBottom:'0.5rem' }}>
            <Icon name="warning" style={{ fontSize:'1rem', color:'inherit' }} /> Skipped rows:
          </p>
          {result.errors.map((e, i) => (
            <p key={i} style={{ fontSize:'0.75rem', color:'var(--on-error-container)', marginBottom:'0.25rem' }}>
              Row {e.row}: {e.error}
            </p>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:'0.75rem', justifyContent:'center', marginTop:'1.25rem' }}>
        <button className="btn-secondary" onClick={reset}>Import Another File</button>
        <button className="btn-primary" onClick={() => window.location.href = '/sales/leads'}>
          <Icon name="table_rows" style={{ fontSize:'1rem', color:'#fff' }} /> View All Companies
        </button>
      </div>
    </div>
  );

  return null;
}
