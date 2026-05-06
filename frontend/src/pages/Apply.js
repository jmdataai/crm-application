/**
 * Apply.js — Public job application form
 *
 * URL: /apply?key=<apply_key>
 * No authentication required.
 *
 * Security:
 *   • apply_key validated server-side — wrong key → 404, nothing exposed
 *   • job_title NEVER taken from user input (fetched from DB via key)
 *   • All inputs sanitized, length-capped, and type-checked client + server side
 *   • HTML/script injection blocked at input level and on submit
 *   • Phone split into country-code dropdown + number — prevents format confusion
 *   • URL fields validated to correct domain patterns
 *   • Rate-limited 5/min per IP on the backend
 */

import { useBreakpoint } from '../hooks/useBreakpoint';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || '';

// ─────────────────────────────────────────────────────────────
// Country codes — ordered by relevance to JMData markets
// ─────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { flag: '🇮🇳', name: 'India',        code: '91'  },
  { flag: '🇮🇪', name: 'Ireland',      code: '353' },
  { flag: '🇬🇧', name: 'UK',           code: '44'  },
  { flag: '🇺🇸', name: 'USA',          code: '1'   },
  { flag: '🇦🇺', name: 'Australia',    code: '61'  },
  { flag: '🇸🇬', name: 'Singapore',    code: '65'  },
  { flag: '🇦🇪', name: 'UAE',          code: '971' },
  { flag: '🇩🇪', name: 'Germany',      code: '49'  },
  { flag: '🇳🇱', name: 'Netherlands',  code: '31'  },
  { flag: '🇫🇷', name: 'France',       code: '33'  },
  { flag: '🇨🇦', name: 'Canada',       code: '1'   },
  { flag: '🇳🇿', name: 'New Zealand',  code: '64'  },
  { flag: '🇿🇦', name: 'South Africa', code: '27'  },
  { flag: '🇲🇾', name: 'Malaysia',     code: '60'  },
  { flag: '🇵🇭', name: 'Philippines',  code: '63'  },
  { flag: '🇧🇩', name: 'Bangladesh',   code: '880' },
  { flag: '🇵🇰', name: 'Pakistan',     code: '92'  },
  { flag: '🇱🇰', name: 'Sri Lanka',    code: '94'  },
  { flag: '🇳🇵', name: 'Nepal',        code: '977' },
  { flag: '🇧🇭', name: 'Bahrain',      code: '973' },
  { flag: '🇶🇦', name: 'Qatar',        code: '974' },
  { flag: '🇸🇦', name: 'Saudi Arabia', code: '966' },
  { flag: '🇰🇼', name: 'Kuwait',       code: '965' },
  { flag: '🇴🇲', name: 'Oman',         code: '968' },
];

// ─────────────────────────────────────────────────────────────
// Security helpers
// ─────────────────────────────────────────────────────────────
const stripTags  = (v) => String(v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
const normName   = (v) => v.replace(/\s+/g, ' ').trim();

// ─────────────────────────────────────────────────────────────
// Validators — return null (ok) or error string
// ─────────────────────────────────────────────────────────────
const V = {
  name: (v, label = 'This field') => {
    const s = normName(v);
    if (!s) return `${label} is required.`;
    if (s.length > 50) return `${label} must be 50 characters or less.`;
    if (/^\d+$/.test(s)) return `${label} cannot be a number.`;
    if (!/^[\p{L}\p{M}'\-\.\s,]{1,50}$/u.test(s))
      return `${label} can only contain letters, spaces, hyphens, and apostrophes.`;
    if (/script|alert|onerror|onload|javascript/i.test(s))
      return `${label} contains invalid content.`;
    return null;
  },

  email: (v) => {
    const s = v.trim().toLowerCase();
    if (!s) return 'Email address is required.';
    if (s.length > 254) return 'Email address is too long (max 254 characters).';
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(s))
      return 'Enter a valid email address (e.g. name@example.com).';
    if (/\.\./.test(s)) return 'Email address cannot contain consecutive dots.';
    return null;
  },

  phone: (code, number) => {
    const digits = number.replace(/\D/g, '');
    if (!digits) return 'Phone number is required.';
    if (digits.length < 5)  return 'Number is too short — enter the local number without the country code.';
    if (digits.length > 12) return 'Number is too long — enter only the local part (no country code).';
    const total = code.replace(/\D/g, '').length + digits.length;
    if (total < 8)  return 'Phone number is too short including country code.';
    if (total > 15) return 'Phone number is too long (max 15 digits total including country code).';
    if (/^(\d)\1+$/.test(digits)) return 'Please enter a valid phone number.';
    return null;
  },

  linkedin: (v) => {
    if (!v.trim()) return null;
    const s = v.trim();
    if (s.length > 300) return 'URL is too long (max 300 characters).';
    if (!/^https?:\/\//i.test(s))
      return 'LinkedIn URL must start with https:// (e.g. https://linkedin.com/in/yourname).';
    if (!/linkedin\.com\/(in|pub|profile|company|school)\/[a-zA-Z0-9\-_%\.]{2,}/i.test(s))
      return 'Enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/yourname).';
    return null;
  },

  url: (v, label = 'URL') => {
    if (!v.trim()) return null;
    const s = v.trim();
    if (s.length > 500) return `${label} is too long (max 500 characters).`;
    if (!/^https?:\/\//i.test(s))
      return `${label} must start with https:// or http://`;
    if (!/^https?:\/\/[^\/]+\.[a-zA-Z]{2,}/.test(s))
      return `${label} must include a valid domain (e.g. https://github.com/yourname).`;
    return null;
  },

  resume: (file) => {
    if (!file) return 'Please upload your resume.';
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExt = ['pdf', 'doc', 'docx'];
    const dangerousExt = ['exe','bat','cmd','sh','ps1','js','vbs','com','scr','php','py','rb'];
    if (dangerousExt.includes(ext)) return 'This file type is not allowed.';
    if (!allowed.includes(file.type) && !allowedExt.includes(ext))
      return 'Resume must be a PDF, DOC, or DOCX file.';
    if (file.size === 0) return 'This file appears to be empty.';
    if (file.size > 10 * 1024 * 1024)
      return `File is too large (${(file.size/1024/1024).toFixed(1)} MB). Maximum is 10 MB.`;
    return null;
  },

  text: (v, label = 'Field', max = 100) => {
    if (!v.trim()) return null;
    if (v.trim().length > max) return `${label} must be ${max} characters or less.`;
    if (/<[^>]*>/.test(v) || /[<>]/.test(v)) return `${label} cannot contain angle brackets or HTML.`;
    if (/script|alert|onerror|onload|javascript/i.test(v)) return `${label} contains invalid content.`;
    return null;
  },

  experience: (v) => {
    if (!v.toString().trim()) return null;
    const n = parseInt(v, 10);
    if (isNaN(n)) return 'Must be a whole number (e.g. 5).';
    if (n < 0)  return 'Cannot be negative.';
    if (n > 50) return 'Please enter a realistic value (max 50 years).';
    return null;
  },
};

// ─────────────────────────────────────────────────────────────
// UI Primitives
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = '1.25rem', color, style: s = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle', color, lineHeight: 1, ...s }}>{name}</span>
);

const FieldError = ({ error }) => !error ? null : (
  <div style={{ display:'flex', alignItems:'flex-start', gap:'0.25rem', marginTop:'0.3rem' }}>
    <Icon name="error" size="0.875rem" color="#E53935" s={{ marginTop:1, flexShrink:0 }} />
    <p style={{ margin:0, fontSize:'0.75rem', color:'#E53935', lineHeight:1.4 }}>{error}</p>
  </div>
);

const Field = ({ label, required, error, hint, children }) => (
  <div style={{ marginBottom:'1.25rem' }}>
    <label style={{ display:'block', fontSize:'0.8125rem', fontWeight:600, color:'var(--on-surface-variant)', marginBottom:'0.375rem' }}>
      {label}{required && <span style={{ color:'#E53935', marginLeft:3 }}>*</span>}
    </label>
    {children}
    {hint && !error && <p style={{ margin:'0.25rem 0 0', fontSize:'0.725rem', color:'var(--on-surface-variant)', opacity:0.8, lineHeight:1.4 }}>{hint}</p>}
    <FieldError error={error} />
  </div>
);

const inputBase = (hasError) => ({
  width:'100%', padding:'0.625rem 0.875rem',
  border:`1.5px solid ${hasError ? '#E53935' : 'var(--outline-variant)'}`,
  borderRadius:'0.5rem', fontSize:'0.9375rem',
  background:'var(--surface-container-lowest)',
  color:'var(--on-surface)', outline:'none',
  transition:'border-color 0.15s', boxSizing:'border-box',
});

const STATES = { VALIDATING:'validating', NOT_FOUND:'not_found', FORM:'form', SUBMITTING:'submitting', SUCCESS:'success' };

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function Apply() {
  const { isMobile } = useBreakpoint();
  const [searchParams] = useSearchParams();
  const applyKey = (searchParams.get('key') || '').trim().slice(0, 64);

  const [pageState, setPageState]   = useState(STATES.VALIDATING);
  const [job,       setJob]         = useState(null);
  const [errors,    setErrors]      = useState({});
  const [serverErr, setServerErr]   = useState('');
  const [touched,   setTouched]     = useState({});
  const [resume,    setResume]      = useState(null);
  const fileRef = useRef();

  const [form, setForm] = useState({
    first_name:'', last_name:'', email:'',
    phoneCode:'91', phoneNumber:'',
    current_company:'', candidate_role:'',
    experience_years:'', linkedin_url:'', portfolio_url:'',
  });

  const setF  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const touch = (k)    => setTouched(t => ({ ...t, [k]: true }));

  // ── Validate key on mount ───────────────────────────────────
  useEffect(() => {
    if (!applyKey) { setPageState(STATES.NOT_FOUND); return; }
    fetch(`${API_BASE}/api/public/jobs/by-key/${encodeURIComponent(applyKey)}`)
      .then(r => r.json())
      .then(d => { if (d.success) { setJob(d); setPageState(STATES.FORM); } else setPageState(STATES.NOT_FOUND); })
      .catch(() => setPageState(STATES.NOT_FOUND));
  }, [applyKey]);

  // ── Run full validation, return errors object ───────────────
  const runValidation = useCallback(() => {
    const e = {};
    const fn = V.name(form.first_name, 'First name');             if (fn) e.first_name       = fn;
    const ln = V.name(form.last_name,  'Last name');              if (ln) e.last_name        = ln;
    const em = V.email(form.email);                               if (em) e.email            = em;
    const ph = V.phone(form.phoneCode, form.phoneNumber);         if (ph) e.phone            = ph;
    const rv = V.resume(resume);                                  if (rv) e.resume           = rv;
    const co = V.text(form.current_company, 'Company', 100);      if (co) e.current_company  = co;
    const cr = V.text(form.candidate_role,  'Role',    100);      if (cr) e.candidate_role   = cr;
    const ex = V.experience(form.experience_years);               if (ex) e.experience_years = ex;
    const li = V.linkedin(form.linkedin_url);                     if (li) e.linkedin_url     = li;
    const po = V.url(form.portfolio_url, 'Portfolio URL');        if (po) e.portfolio_url    = po;
    return e;
  }, [form, resume]);

  // Live-validate touched fields only
  useEffect(() => {
    if (!Object.keys(touched).length) return;
    const allErrors = runValidation();
    setErrors(prev => {
      const next = { ...prev };
      Object.keys(touched).forEach(k => {
        if (allErrors[k]) next[k] = allErrors[k]; else delete next[k];
      });
      return next;
    });
  }, [form, resume, touched, runValidation]);

  // ── Submit ──────────────────────────────────────────────────
  const submit = async () => {
    const allTouched = { first_name:1, last_name:1, email:1, phone:1, resume:1,
      current_company:1, candidate_role:1, experience_years:1, linkedin_url:1, portfolio_url:1 };
    setTouched(allTouched);

    const e = runValidation();
    setErrors(e);
    if (Object.keys(e).length) {
      setTimeout(() => {
        const el = document.querySelector('[data-haserror="true"]');
        if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
      }, 50);
      return;
    }

    setPageState(STATES.SUBMITTING);
    setServerErr('');

    const phone = `+${form.phoneCode}${form.phoneNumber.replace(/\D/g, '')}`;
    const fd = new FormData();
    fd.append('first_name', normName(stripTags(form.first_name)));
    fd.append('last_name',  normName(stripTags(form.last_name)));
    fd.append('email',      form.email.trim().toLowerCase());
    fd.append('phone',      phone);
    fd.append('apply_key',  applyKey);
    fd.append('resume',     resume);
    if (form.current_company.trim())  fd.append('current_company',  stripTags(form.current_company.trim()));
    if (form.candidate_role.trim())   fd.append('candidate_role',   stripTags(form.candidate_role.trim()));
    if (form.experience_years.trim()) fd.append('experience_years', parseInt(form.experience_years, 10).toString());
    if (form.linkedin_url.trim())     fd.append('linkedin_url',     form.linkedin_url.trim());
    if (form.portfolio_url.trim())    fd.append('portfolio_url',    form.portfolio_url.trim());

    try {
      const res  = await fetch(`${API_BASE}/api/public/apply`, { method:'POST', body:fd });
      const data = await res.json();
      if (res.ok && data.success)  { setPageState(STATES.SUCCESS); return; }
      if (res.status === 404)      { setPageState(STATES.NOT_FOUND); return; }
      if (res.status === 409) { setServerErr('You have already applied for this position. Our team will be in touch.'); }
      else if (res.status === 429) { setServerErr('Too many submissions. Please wait a minute and try again.'); }
      else { setServerErr(data?.detail?.message || data?.message || 'Submission failed. Please try again.'); }
      setPageState(STATES.FORM);
    } catch {
      setServerErr('Network error — please check your connection and try again.');
      setPageState(STATES.FORM);
    }
  };

  // ── Input binder ────────────────────────────────────────────
  const bind = (key, opts = {}) => ({
    value: form[key],
    onChange: e => {
      let v = e.target.value;
      if (opts.maxLen)    v = v.slice(0, opts.maxLen);
      if (opts.noTags)    v = v.replace(/[<>]/g, '');
      if (opts.digitsOnly) v = v.replace(/\D/g, '');
      setF(key, v);
    },
    onBlur:  () => touch(key),
    onFocus: e  => { e.target.style.borderColor = 'var(--tertiary)'; },
    style:   inputBase(!!errors[key]),
    'data-haserror': String(!!errors[key]),
  });

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection: isMobile ? 'column' : 'row', background:'var(--surface)', fontFamily:'var(--font-ui, system-ui, sans-serif)' }}>

      {/* ── Left branding — hidden on mobile, compact header instead ── */}
      {isMobile ? (
        <div style={{ background:'linear-gradient(135deg, #0C162A 0%, #141B34 100%)', padding:'1.25rem 1.5rem', display:'flex', alignItems:'center', gap:'0.875rem' }}>
          <img src="/jm-logo.png" alt="JMData Talent" style={{ width:36, height:36, borderRadius:'0.5rem', objectFit:'cover' }} />
          <div>
            <p style={{ margin:0, fontSize:'0.625rem', fontWeight:500, letterSpacing:'0.2em', textTransform:'uppercase', color:'#92A0BA' }}>JMData Talent</p>
            <p style={{ margin:0, fontSize:'0.9375rem', fontWeight:700, color:'#FAF7FB' }}>Recruitment</p>
          </div>
        </div>
      ) : (
      <div style={{ width:380, flexShrink:0, background:'linear-gradient(160deg, #0C162A 0%, #141B34 60%, #1e2d52 100%)', display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'3rem 2.5rem', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-80, right:-80, width:320, height:320, borderRadius:'50%', border:'1px solid rgba(68,104,176,0.15)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', border:'1px solid rgba(68,104,176,0.2)', pointerEvents:'none' }} />

        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.875rem', marginBottom:'2.5rem' }}>
            <img src="/jm-logo.png" alt="JMData Talent" style={{ width:44, height:44, borderRadius:'0.625rem', objectFit:'cover' }} />
            <div>
              <p style={{ margin:0, fontSize:'0.625rem', fontWeight:500, letterSpacing:'0.25em', textTransform:'uppercase', color:'#92A0BA' }}>JMData Talent</p>
              <p style={{ margin:0, fontSize:'0.9375rem', fontWeight:700, color:'#FAF7FB' }}>Recruitment</p>
            </div>
          </div>

          {job && (pageState === STATES.FORM || pageState === STATES.SUBMITTING) && (
            <div style={{ marginBottom:'2rem', padding:'1.25rem', borderRadius:'0.875rem', background:'rgba(68,104,176,0.1)', border:'1px solid rgba(68,104,176,0.2)' }}>
              <p style={{ margin:'0 0 0.375rem', fontSize:'0.6875rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#92A0BA' }}>You are applying for</p>
              <h2 style={{ margin:0, fontSize:'1.375rem', fontWeight:700, color:'#FAF7FB', lineHeight:1.25 }}>{job.title}</h2>
              {(job.department || job.location) && (
                <p style={{ margin:'0.375rem 0 0', fontSize:'0.875rem', color:'#92A0BA' }}>{[job.department, job.location].filter(Boolean).join(' · ')}</p>
              )}
              {job.employment_type && (
                <span style={{ display:'inline-block', marginTop:'0.625rem', padding:'0.2rem 0.625rem', borderRadius:9999, background:'rgba(68,104,176,0.25)', fontSize:'0.75rem', fontWeight:600, color:'#B8C8E8' }}>{job.employment_type}</span>
              )}
            </div>
          )}

          <h1 style={{ fontSize:'2rem', fontWeight:700, lineHeight:1.2, letterSpacing:'-0.02em', color:'#FAF7FB', margin:0 }}>
            Your next role<br />
            <span style={{ color:'#4468B0' }}>starts here.</span>
          </h1>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          {[
            { icon:'lock',         text:'Your data is secure and never shared with third parties.' },
            { icon:'bolt',         text:'Applications reviewed within 3–5 business days.' },
            { icon:'check_circle', text:'Confirmation shown immediately on submission.' },
          ].map(({ icon, text }) => (
            <div key={icon} style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize:'1rem', color:'#4468B0', marginTop:2, flexShrink:0 }}>{icon}</span>
              <p style={{ margin:0, fontSize:'0.8125rem', color:'#92A0BA', lineHeight:1.5 }}>{text}</p>
            </div>
          ))}
        </div>
      </div>
      )}{/* end left panel */}

      {/* ── Right: form panel ── */}
      <div style={{ flex:1, display:'flex', alignItems:'flex-start', justifyContent:'center', padding: isMobile ? '1.5rem 1rem' : '3rem 2.5rem', overflowY:'auto' }}>
        <div style={{ width:'100%', maxWidth:560 }}>

          {/* Validating */}
          {pageState === STATES.VALIDATING && (
            <div style={{ textAlign:'center', paddingTop:'6rem' }}>
              <div style={{ width:48, height:48, border:'3px solid var(--outline-variant)', borderTopColor:'var(--tertiary)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 1.5rem' }} />
              <p style={{ color:'var(--on-surface-variant)' }}>Verifying application link…</p>
              <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Not found */}
          {pageState === STATES.NOT_FOUND && (
            <div style={{ textAlign:'center', paddingTop:'5rem' }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--error-container)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.5rem' }}>
                <Icon name="link_off" size="2rem" color="var(--on-error-container)" />
              </div>
              <h2 style={{ fontSize:'1.375rem', fontWeight:700, color:'var(--on-surface)', marginBottom:'0.75rem' }}>Position not found</h2>
              <p style={{ color:'var(--on-surface-variant)', lineHeight:1.7, maxWidth:360, margin:'0 auto 2rem', fontSize:'0.9375rem' }}>
                This job posting is no longer available, or the link may have changed. Contact us directly if you believe this is an error.
              </p>
              <a href="https://jmdatatalent.com/jobs" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1.5rem', borderRadius:'0.5rem', background:'var(--tertiary)', color:'#fff', fontWeight:600, textDecoration:'none' }}>
                View all openings <Icon name="arrow_forward" size="1rem" color="#fff" />
              </a>
            </div>
          )}

          {/* Success */}
          {pageState === STATES.SUCCESS && (
            <div style={{ textAlign:'center', paddingTop:'5rem' }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(0,98,67,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.5rem' }}>
                <Icon name="check_circle" size="2.5rem" color="var(--tertiary)" />
              </div>
              <h2 style={{ fontSize:'1.5rem', fontWeight:700, color:'var(--on-surface)', marginBottom:'0.75rem' }}>Application submitted!</h2>
              <p style={{ color:'var(--on-surface-variant)', lineHeight:1.7, maxWidth:380, margin:'0 auto 0.375rem' }}>
                Thank you for applying for <strong style={{ color:'var(--on-surface)' }}>{job?.title}</strong>.
              </p>
              <p style={{ color:'var(--on-surface-variant)', lineHeight:1.7, maxWidth:380, margin:'0 auto 2rem' }}>
                Our team will review your application and be in touch within 3–5 business days.
              </p>
              <a href="https://jmdatatalent.com/jobs" style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1.5rem', borderRadius:'0.5rem', background:'var(--tertiary)', color:'#fff', fontWeight:600, textDecoration:'none' }}>
                View other openings <Icon name="arrow_forward" size="1rem" color="#fff" />
              </a>
            </div>
          )}

          {/* Form */}
          {(pageState === STATES.FORM || pageState === STATES.SUBMITTING) && (<>
            <div style={{ marginBottom:'2rem' }}>
              <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'var(--on-surface)', margin:'0 0 0.375rem' }}>Submit your application</h1>
              <p style={{ margin:0, color:'var(--on-surface-variant)', fontSize:'0.9375rem' }}>Fields marked <span style={{ color:'#E53935' }}>*</span> are required.</p>
            </div>

            {serverErr && (
              <div style={{ padding:'0.875rem 1rem', borderRadius:'0.625rem', background:'var(--error-container)', border:'1px solid rgba(183,28,28,0.25)', marginBottom:'1.5rem', display:'flex', gap:'0.625rem', alignItems:'flex-start' }}>
                <Icon name="error_outline" size="1.125rem" color="var(--on-error-container)" />
                <p style={{ margin:0, fontSize:'0.875rem', color:'var(--on-error-container)', lineHeight:1.5 }}>{serverErr}</p>
              </div>
            )}

            {/* Name row */}
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'1rem' }}>
              <Field label="First name" required error={errors.first_name}>
                <input {...bind('first_name', { maxLen:50, noTags:true })} placeholder="Ravi" autoComplete="given-name" />
              </Field>
              <Field label="Last name" required error={errors.last_name}>
                <input {...bind('last_name', { maxLen:50, noTags:true })} placeholder="Teja" autoComplete="family-name" />
              </Field>
            </div>

            {/* Email */}
            <Field label="Email address" required error={errors.email} hint="Double-check your email — we will use this to contact you.">
              <input type="email" {...bind('email', { maxLen:254 })} placeholder="ravi@example.com" autoComplete="email" />
            </Field>

            {/* Phone — split UI */}
            <Field label="Phone number" required error={errors.phone} hint="Enter your local number only — do not repeat the country code.">
              <div style={{ display:'flex', gap:'0.5rem' }} data-haserror={String(!!errors.phone)}>

                {/* Country code select */}
                <div style={{ position:'relative', flexShrink:0, width:155 }}>
                  <select
                    value={form.phoneCode}
                    onChange={e => { setF('phoneCode', e.target.value); touch('phone'); }}
                    onBlur={() => touch('phone')}
                    style={{
                      width:'100%', padding:'0.625rem 1.75rem 0.625rem 0.625rem',
                      border:`1.5px solid ${errors.phone ? '#E53935' : 'var(--outline-variant)'}`,
                      borderRadius:'0.5rem', fontSize:'0.875rem',
                      background:'var(--surface-container-lowest)',
                      color:'var(--on-surface)', outline:'none', cursor:'pointer',
                      appearance:'none', WebkitAppearance:'none',
                    }}
                  >
                    {COUNTRY_CODES.map(({ flag, name, code }) => (
                      <option key={`${name}-${code}`} value={code}>{flag} +{code} {name}</option>
                    ))}
                  </select>
                  {/* Chevron */}
                  <svg style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} width="10" height="6" viewBox="0 0 10 6">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </div>

                {/* Local number */}
                <input
                  type="tel"
                  value={form.phoneNumber}
                  onChange={e => {
                    // digits, spaces, hyphens only — stripped on submit
                    const v = e.target.value.replace(/[^\d\s\-]/g, '').slice(0, 13);
                    setF('phoneNumber', v);
                  }}
                  onBlur={() => touch('phone')}
                  onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                  placeholder="9876543210"
                  autoComplete="tel-national"
                  inputMode="numeric"
                  style={{ ...inputBase(!!errors.phone), flex:1 }}
                />
              </div>

              {/* Preview combined number */}
              {form.phoneNumber.replace(/\D/g,'').length > 3 && !errors.phone && (
                <p style={{ margin:'0.3rem 0 0', fontSize:'0.725rem', color:'var(--tertiary)' }}>
                  Will be saved as: +{form.phoneCode} {form.phoneNumber.trim()}
                </p>
              )}
            </Field>

            {/* Resume */}
            <Field label="Resume" required error={errors.resume}>
              <div
                onClick={() => fileRef.current?.click()}
                data-haserror={String(!!errors.resume)}
                style={{
                  border:`2px dashed ${errors.resume ? '#E53935' : resume ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                  borderRadius:'0.625rem', padding:'1.5rem', textAlign:'center', cursor:'pointer',
                  background: resume ? 'rgba(0,98,67,0.04)' : 'var(--surface-container-low)',
                  transition:'border-color 0.15s',
                }}
              >
                {resume ? (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.75rem' }}>
                    <Icon name="description" size="1.5rem" color="var(--tertiary)" />
                    <div style={{ textAlign:'left' }}>
                      <p style={{ margin:0, fontWeight:600, fontSize:'0.9375rem', color:'var(--on-surface)' }}>{resume.name}</p>
                      <p style={{ margin:'0.125rem 0 0', fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>
                        {resume.size > 1024*1024 ? `${(resume.size/1024/1024).toFixed(1)} MB` : `${(resume.size/1024).toFixed(0)} KB`} · Click to change
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Icon name="upload_file" size="2.25rem" color="var(--on-surface-variant)" />
                    <p style={{ margin:'0.5rem 0 0.25rem', fontWeight:600, fontSize:'0.9375rem', color:'var(--on-surface)' }}>Click to upload your resume</p>
                    <p style={{ margin:0, fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>PDF, DOC or DOCX · Max 10 MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display:'none' }}
                onChange={e => {
                  const f = e.target.files[0];
                  if (f) { setResume(f); touch('resume'); }
                  e.target.value = '';
                }}
              />
            </Field>

            {/* Optional fields */}
            <details style={{ marginBottom:'1.5rem' }}>
              <summary style={{ cursor:'pointer', fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface-variant)', userSelect:'none', marginBottom:'1rem', listStyle:'none', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                <Icon name="add_circle" size="1rem" color="var(--on-surface-variant)" />
                Add more details (optional)
              </summary>

              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'1rem' }}>
                <Field label="Current company" error={errors.current_company}>
                  <input {...bind('current_company', { maxLen:100, noTags:true })} placeholder="Infosys" autoComplete="organization" />
                </Field>
                <Field label="Current role / title" error={errors.candidate_role}>
                  <input {...bind('candidate_role', { maxLen:100, noTags:true })} placeholder="Senior Engineer" autoComplete="organization-title" />
                </Field>
              </div>

              <Field label="Years of experience" error={errors.experience_years}>
                <input
                  type="number" min="0" max="50" step="1"
                  value={form.experience_years}
                  onChange={e => setF('experience_years', e.target.value.replace(/[^0-9]/g,'').slice(0,2))}
                  onBlur={() => touch('experience_years')}
                  onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                  onKeyDown={e => { if (['.', ',', '+', '-', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
                  placeholder="5"
                  style={{ ...inputBase(!!errors.experience_years), width:'100%' }}
                />
              </Field>

              <Field label="LinkedIn profile URL" error={errors.linkedin_url} hint="e.g. https://linkedin.com/in/yourname">
                <input
                  type="url"
                  {...bind('linkedin_url', { maxLen:300 })}
                  placeholder="https://linkedin.com/in/yourname"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>

              <Field label="Portfolio / GitHub URL" error={errors.portfolio_url} hint="e.g. https://github.com/yourhandle or your personal website">
                <input
                  type="url"
                  {...bind('portfolio_url', { maxLen:500 })}
                  placeholder="https://github.com/yourhandle"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </details>

            {/* Submit */}
            <button
              onClick={submit}
              disabled={pageState === STATES.SUBMITTING}
              style={{
                width:'100%', padding:'0.9rem', borderRadius:'0.625rem', border:'none',
                cursor: pageState === STATES.SUBMITTING ? 'not-allowed' : 'pointer',
                background: pageState === STATES.SUBMITTING ? 'var(--outline-variant)' : 'linear-gradient(135deg, var(--tertiary), #009966)',
                color:'#fff', fontWeight:700, fontSize:'1rem',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
                opacity: pageState === STATES.SUBMITTING ? 0.75 : 1, transition:'opacity 0.15s',
              }}
            >
              {pageState === STATES.SUBMITTING ? (
                <>
                  <div style={{ width:18, height:18, border:'2.5px solid rgba(255,255,255,0.35)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                  Submitting…
                </>
              ) : (
                <>
                  <Icon name="send" size="1.125rem" color="#fff" />
                  Submit Application
                </>
              )}
            </button>

            <p style={{ textAlign:'center', marginTop:'0.875rem', fontSize:'0.8125rem', color:'var(--on-surface-variant)', lineHeight:1.5 }}>
              By submitting, you agree to let JMData Talent process your application data.
            </p>
          </>)}
        </div>
      </div>
    </div>
  );
}
