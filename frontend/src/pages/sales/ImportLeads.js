import React, { useState, useRef, useCallback } from 'react';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

/* ── Column mapping config ──────────────────────────── */
const CRM_FIELDS = [
  { key: 'full_name',     label: 'Full Name',      required: true },
  { key: 'email',         label: 'Email',           required: false },
  { key: 'phone',         label: 'Phone',           required: false },
  { key: 'company',       label: 'Company',         required: false },
  { key: 'job_title',     label: 'Job Title',       required: false },
  { key: 'source',        label: 'Source',          required: false },
  { key: 'status',        label: 'Status',          required: false },
  { key: 'notes',         label: 'Notes',           required: false },
  { key: 'next_follow_up',label: 'Follow-up Date',  required: false },
  { key: '__skip__',      label: '— Skip Column —', required: false },
];

const VALID_STATUSES = ['new','contacted','called','interested','closed','completed','rejected','lost','follow_up_needed'];

/* ── Parse CSV text ─────────────────────────────────── */
const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line, i) => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return { _rowNum: i + 2, _raw: vals, cells: headers.reduce((acc, h, j) => ({ ...acc, [h]: vals[j] || '' }), {}) };
  });
  return { headers, rows };
};

/* ── Validate a mapped row ──────────────────────────── */
const validateRow = (row, mapping) => {
  const errors = [];
  const mapped = {};
  Object.entries(mapping).forEach(([csvCol, crmKey]) => {
    if (crmKey !== '__skip__') mapped[crmKey] = row.cells[csvCol] || '';
  });

  if (!mapped.full_name?.trim())        errors.push('Full Name is required');
  if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) errors.push('Invalid email format');
  if (mapped.phone && !/^[\d\s\+\-\(\)]{7,20}$/.test(mapped.phone))     errors.push('Invalid phone format');
  if (mapped.status && !VALID_STATUSES.includes(mapped.status.toLowerCase().replace(/ /g,'_')))
    errors.push(`Unknown status "${mapped.status}"`);

  return { mapped, errors };
};

/* ── Import History seed ────────────────────────────── */
const HISTORY = [
  { id:'h1', filename:'apollo_leads_march.csv',    total:120, success:118, failed:2,  date:'2026-03-28 09:15', status:'done' },
  { id:'h2', filename:'linkedin_export_q1.csv',    total:55,  success:50,  failed:5,  date:'2026-03-22 14:30', status:'done' },
  { id:'h3', filename:'manual_leads_feb.xlsx',     total:30,  success:30,  failed:0,  date:'2026-03-10 11:00', status:'done' },
];

/* ── Step indicators ────────────────────────────────── */
const STEPS = ['Upload File', 'Map Columns', 'Review & Import'];

const StepDot = ({ n, current, label }) => {
  const done = n < current;
  const active = n === current;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.375rem' }}>
      <div style={{
        width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
        fontWeight:700, fontSize:'0.875rem', fontFamily:'Inter,sans-serif',
        background: done ? 'var(--tertiary)' : active ? 'var(--primary)' : 'var(--surface-container)',
        color: (done || active) ? '#fff' : 'var(--on-surface-variant)',
        transition:'all 0.3s ease',
      }}>
        {done ? <Icon name="check" style={{ fontSize:'1rem', color:'#fff' }} /> : n}
      </div>
      <span style={{ fontSize:'0.75rem', fontWeight: active ? 600 : 400, color: active ? 'var(--primary)' : 'var(--on-surface-variant)', whiteSpace:'nowrap' }}>{label}</span>
    </div>
  );
};

/* ── Main ───────────────────────────────────────────── */
export default function ImportLeads() {
  const [step, setStep] = useState(1);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile]         = useState(null);
  const [parsed, setParsed]     = useState(null);   // { headers, rows }
  const [mapping, setMapping]   = useState({});      // { csvCol → crmKey }
  const [results, setResults]   = useState(null);   // { success, errors[] }
  const [importing, setImporting] = useState(false);
  const [history]               = useState(HISTORY);
  const fileRef = useRef();

  /* ── File handling ── */
  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv','xlsx','xls'].includes(ext)) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, rows } = parseCSV(e.target.result);
      setParsed({ headers, rows });
      // Auto-map by name similarity
      const autoMap = {};
      headers.forEach(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g,'');
        const match = CRM_FIELDS.find(f =>
          f.key !== '__skip__' &&
          (norm.includes(f.key.replace(/_/g,'')) || f.key.replace(/_/g,'').includes(norm))
        );
        autoMap[h] = match ? match.key : '__skip__';
      });
      setMapping(autoMap);
      setStep(2);
    };
    reader.readAsText(f);
  }, []);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  /* ── Validation summary ── */
  const validatedRows = parsed?.rows.map(row => validateRow(row, mapping)) || [];
  const successCount = validatedRows.filter(r => r.errors.length === 0).length;
  const errorCount   = validatedRows.filter(r => r.errors.length > 0).length;

  /* ── Simulate import ── */
  const doImport = async () => {
    setImporting(true);
    await new Promise(r => setTimeout(r, 1800)); // simulate API call
    setResults({ success: successCount, errors: validatedRows.filter(r => r.errors.length > 0).map((r, i) => ({ row: parsed.rows[i]._rowNum, issues: r.errors })) });
    setImporting(false);
    setStep(3);
  };

  const reset = () => { setStep(1); setFile(null); setParsed(null); setMapping({}); setResults(null); };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Import Leads</h1>
        </div>
        <a href="/sales/leads" className="btn-secondary">
          <Icon name="arrow_back" style={{ fontSize:'1rem' }} /> Back to Leads
        </a>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'7fr 5fr', gap:'1.25rem', alignItems:'start' }}>

        {/* LEFT — Main import flow */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Step progress */}
          <div className="card" style={{ padding:'1.25rem 2rem' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', gap:'0' }}>
              {STEPS.map((label, i) => (
                <React.Fragment key={label}>
                  <StepDot n={i+1} current={step} label={label} />
                  {i < STEPS.length - 1 && (
                    <div style={{ flex:1, height:2, background: step > i+1 ? 'var(--tertiary)' : 'var(--surface-container)', marginTop:15, transition:'background 0.4s ease' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ── STEP 1: Upload ── */}
          {step === 1 && (
            <div className="card scale-in">
              <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.5rem' }}>Upload your file</h2>
              <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>
                Supports <strong>.csv</strong>, <strong>.xlsx</strong>, and <strong>.xls</strong> files. Max 10 MB.
              </p>

              {/* Drop zone */}
              <div
                onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                onClick={() => fileRef.current?.click()}
                style={{
                  border:`2px dashed ${dragOver ? 'var(--primary)' : 'rgba(195,198,215,0.5)'}`,
                  borderRadius:'0.875rem', padding:'3rem 2rem', textAlign:'center', cursor:'pointer',
                  background: dragOver ? 'rgba(0,74,198,0.04)' : 'var(--surface-container-low)',
                  transition:'all 0.2s ease',
                }}
              >
                <div style={{
                  width:56, height:56, borderRadius:'1rem',
                  background: dragOver ? 'rgba(0,74,198,0.12)' : 'var(--surface-container)',
                  display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem',
                }}>
                  <Icon name="upload_file" style={{ fontSize:'1.75rem', color: dragOver ? 'var(--primary)' : 'var(--on-surface-variant)' }} />
                </div>
                <p style={{ fontWeight:600, fontSize:'0.9375rem', color:'var(--on-surface)', marginBottom:'0.375rem' }}>
                  {dragOver ? 'Drop it here!' : 'Drag & drop your file here'}
                </p>
                <p style={{ color:'var(--on-surface-variant)', fontSize:'0.875rem', marginBottom:'1rem' }}>or click to browse</p>
                <span className="btn-secondary" style={{ pointerEvents:'none', fontSize:'0.8125rem' }}>
                  Choose File
                </span>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />

              {/* Template download */}
              <div style={{ marginTop:'1.25rem', display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.875rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
                <Icon name="description" style={{ fontSize:'1.125rem', color:'var(--primary)' }} />
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)' }}>Need a template?</p>
                  <p style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>Download our CSV template with the correct column headers.</p>
                </div>
                <button className="btn-secondary" style={{ fontSize:'0.8125rem', padding:'0.375rem 0.875rem', flexShrink:0 }}>
                  <Icon name="download" style={{ fontSize:'1rem' }} /> Template
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Map columns ── */}
          {step === 2 && parsed && (
            <div className="card scale-in">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
                <div>
                  <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'0.25rem' }}>Map Columns</h2>
                  <p style={{ color:'var(--on-surface-variant)', fontSize:'0.8125rem' }}>
                    <Icon name="attach_file" style={{ fontSize:'0.875rem', color:'var(--primary)' }} /> {file?.name} · {parsed.rows.length} rows detected
                  </p>
                </div>
                <button className="btn-ghost" onClick={reset} style={{ fontSize:'0.8125rem' }}>
                  <Icon name="restart_alt" style={{ fontSize:'1rem' }} /> Start over
                </button>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                {/* Header row */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 32px 1fr', gap:'0.75rem', padding:'0.5rem 0', marginBottom:'0.25rem' }}>
                  <p className="label-sm">CSV Column</p>
                  <div/>
                  <p className="label-sm">Maps to CRM Field</p>
                </div>

                {parsed.headers.map(col => (
                  <div key={col} style={{ display:'grid', gridTemplateColumns:'1fr 32px 1fr', gap:'0.75rem', alignItems:'center', padding:'0.625rem 0.75rem', background:'var(--surface-container-low)', borderRadius:'0.5rem' }}>
                    {/* CSV col */}
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      <Icon name="table_chart" style={{ fontSize:'1rem', color:'var(--on-surface-variant)' }} />
                      <span style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--on-surface)' }}>{col}</span>
                    </div>
                    {/* Arrow */}
                    <Icon name="arrow_forward" style={{ fontSize:'1rem', color:'var(--outline-variant)', justifySelf:'center' }} />
                    {/* CRM field */}
                    <select
                      className="select"
                      value={mapping[col] || '__skip__'}
                      onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}
                      style={{ fontSize:'0.8125rem' }}
                    >
                      {CRM_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {parsed.rows.length > 0 && (
                <div style={{ marginTop:'1.25rem' }}>
                  <p className="label-sm" style={{ marginBottom:'0.625rem' }}>Preview (first 3 rows)</p>
                  <div style={{ overflowX:'auto', borderRadius:'0.5rem', border:'1px solid var(--ghost-border)' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                      <thead>
                        <tr style={{ background:'var(--surface-container-low)' }}>
                          {parsed.headers.map(h => (
                            <th key={h} style={{ padding:'0.5rem 0.75rem', textAlign:'left', fontWeight:600, whiteSpace:'nowrap', color:'var(--on-surface-variant)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.slice(0,3).map((row, i) => (
                          <tr key={i} style={{ borderTop:'1px solid var(--ghost-border)' }}>
                            {parsed.headers.map(h => (
                              <td key={h} style={{ padding:'0.5rem 0.75rem', color:'var(--on-surface)', whiteSpace:'nowrap', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis' }}>
                                {row.cells[h] || <span style={{ opacity:0.3 }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
                <button className="btn-secondary" onClick={reset}>Back</button>
                <button className="btn-primary" onClick={() => setStep(3)}>
                  Review Import <Icon name="arrow_forward" style={{ fontSize:'1rem', color:'#fff' }} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Review & Import ── */}
          {step === 3 && !results && (
            <div className="card scale-in">
              <h2 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem' }}>Review & Confirm</h2>

              {/* Summary cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.875rem', marginBottom:'1.5rem' }}>
                {[
                  { label:'Total Rows',     value: parsed?.rows.length || 0, icon:'table_rows',    color:'var(--primary)' },
                  { label:'Ready to Import',value: successCount,             icon:'check_circle',  color:'var(--tertiary)' },
                  { label:'Rows with Errors',value: errorCount,              icon:'error',         color: errorCount > 0 ? 'var(--error)' : 'var(--outline)' },
                ].map(s => (
                  <div key={s.label} style={{ padding:'1rem', background:'var(--surface-container-low)', borderRadius:'0.75rem', textAlign:'center' }}>
                    <Icon name={s.icon} style={{ fontSize:'1.5rem', color:s.color, display:'block', margin:'0 auto 0.375rem' }} />
                    <p style={{ fontSize:'1.5rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{s.value}</p>
                    <p className="label-sm" style={{ marginTop:'0.25rem' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Errors list */}
              {errorCount > 0 && (
                <div style={{ marginBottom:'1.25rem', padding:'1rem', background:'rgba(186,26,26,0.05)', borderRadius:'0.625rem', border:'1px solid rgba(186,26,26,0.15)' }}>
                  <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--error)', marginBottom:'0.625rem', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                    <Icon name="warning" style={{ fontSize:'1rem', color:'var(--error)' }} /> {errorCount} rows have issues and will be skipped
                  </p>
                  <div style={{ maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.375rem' }}>
                    {validatedRows.filter(r => r.errors.length > 0).map((r, i) => (
                      <div key={i} style={{ fontSize:'0.8125rem', color:'var(--on-error-container)', display:'flex', gap:'0.5rem' }}>
                        <span style={{ fontWeight:600, flexShrink:0 }}>Row {parsed.rows[i]?._rowNum}:</span>
                        <span>{r.errors.join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p style={{ fontSize:'0.875rem', color:'var(--on-surface-variant)', marginBottom:'1.25rem' }}>
                {successCount} leads will be added to your CRM. This action cannot be undone.
              </p>

              <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
                <button className="btn-secondary" onClick={() => setStep(2)}>Back to Mapping</button>
                <button className="btn-primary" onClick={doImport} disabled={importing || successCount === 0}
                  style={{ minWidth:160, justifyContent:'center', opacity: successCount===0 ? 0.5 : 1 }}>
                  {importing ? (
                    <>
                      <span style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', animation:'spin 0.7s linear infinite', display:'inline-block', marginRight:'0.5rem' }} />
                      Importing…
                    </>
                  ) : (
                    <><Icon name="cloud_upload" style={{ fontSize:'1rem', color:'#fff' }} /> Import {successCount} Leads</>
                  )}
                </button>
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── DONE state ── */}
          {step === 3 && results && (
            <div className="card scale-in" style={{ textAlign:'center', padding:'3rem 2rem' }}>
              <div style={{
                width:64, height:64, borderRadius:'50%',
                background: results.errors.length === 0 ? 'rgba(0,125,87,0.12)' : 'rgba(217,119,6,0.1)',
                display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.25rem',
              }}>
                <Icon name={results.errors.length===0 ? 'check_circle' : 'task_alt'} style={{ fontSize:'2rem', color: results.errors.length===0 ? 'var(--tertiary)' : 'var(--amber)' }} />
              </div>
              <h2 style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--on-surface)', marginBottom:'0.5rem' }}>Import Complete!</h2>
              <p style={{ color:'var(--on-surface-variant)', marginBottom:'1.5rem', fontSize:'0.9375rem' }}>
                <strong style={{ color:'var(--tertiary)' }}>{results.success} leads</strong> imported successfully.
                {results.errors.length > 0 && <> <strong style={{ color:'var(--error)' }}>{results.errors.length} rows</strong> were skipped.</>}
              </p>
              <div style={{ display:'flex', gap:'0.75rem', justifyContent:'center' }}>
                <button className="btn-secondary" onClick={reset}>Import Another File</button>
                <a href="/sales/leads" className="btn-primary">
                  <Icon name="group" style={{ fontSize:'1rem', color:'#fff' }} /> View Leads
                </a>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Import history + help */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Requirements card */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.875rem' }}>
              <Icon name="info" style={{ fontSize:'1rem', color:'var(--primary)', marginRight:'0.375rem' }} />
              File Requirements
            </h3>
            {[
              { icon:'check', text:'CSV, XLSX, or XLS format' },
              { icon:'check', text:'First row must be column headers' },
              { icon:'check', text:'Full Name column is required' },
              { icon:'check', text:'Email must be valid if provided' },
              { icon:'check', text:'Max 5,000 rows per import' },
              { icon:'warning', text:'Duplicate emails will be flagged', warn:true },
            ].map((r,i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem', marginBottom:'0.5rem' }}>
                <Icon name={r.icon} style={{ fontSize:'1rem', color: r.warn ? 'var(--amber)' : 'var(--tertiary)', marginTop:'0.0625rem', flexShrink:0 }} />
                <span style={{ fontSize:'0.875rem', color: r.warn ? 'var(--amber)' : 'var(--on-surface-variant)' }}>{r.text}</span>
              </div>
            ))}
          </div>

          {/* Supported column names */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.875rem' }}>
              <Icon name="table_chart" style={{ fontSize:'1rem', color:'var(--primary)', marginRight:'0.375rem' }} />
              Accepted Column Names
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {[
                { crm:'Full Name',     examples:'full_name, name, contact_name' },
                { crm:'Email',         examples:'email, email_address' },
                { crm:'Phone',         examples:'phone, mobile, contact' },
                { crm:'Company',       examples:'company, organization, account' },
                { crm:'Job Title',     examples:'title, job_title, position' },
                { crm:'Source',        examples:'source, lead_source, channel' },
              ].map(f => (
                <div key={f.crm} style={{ padding:'0.5rem 0.75rem', background:'var(--surface-container-low)', borderRadius:'0.5rem' }}>
                  <p style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--on-surface)', marginBottom:'0.125rem' }}>{f.crm}</p>
                  <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', fontFamily:'monospace' }}>{f.examples}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Import history */}
          <div className="card">
            <h3 style={{ fontWeight:700, fontSize:'0.9375rem', marginBottom:'0.875rem' }}>
              <Icon name="history" style={{ fontSize:'1rem', color:'var(--primary)', marginRight:'0.375rem' }} />
              Import History
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
              {history.map(h => (
                <div key={h.id} style={{ padding:'0.75rem', background:'var(--surface-container-low)', borderRadius:'0.625rem' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                    <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{h.filename}</p>
                    <span style={{
                      fontSize:'0.6875rem', fontWeight:700, padding:'0.15rem 0.5rem', borderRadius:9999,
                      background:'rgba(0,125,87,0.1)', color:'var(--tertiary)',
                    }}>Done</span>
                  </div>
                  <div style={{ display:'flex', gap:'0.75rem' }}>
                    <span style={{ fontSize:'0.75rem', color:'var(--tertiary)', fontWeight:600 }}>✓ {h.success}</span>
                    {h.failed > 0 && <span style={{ fontSize:'0.75rem', color:'var(--error)', fontWeight:600 }}>✗ {h.failed}</span>}
                    <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginLeft:'auto' }}>{h.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
