/**
 * Apply.js — Public job application form
 *
 * URL: /apply?key=<apply_key>
 * No authentication required.
 *
 * Security:
 *   • The apply_key in the URL is validated server-side against the jobs table.
 *   • If tampered → backend returns 404 → form shows "Job not found".
 *   • job_title is NEVER taken from user input — fetched from DB via the key.
 *   • No CRM credentials touch the browser at any point.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || '';

// ── Helpers ────────────────────────────────────────────────────
const Icon = ({ name, size = '1.25rem', color }) => (
  <span
    className="material-symbols-outlined"
    style={{ fontSize: size, verticalAlign: 'middle', color, lineHeight: 1 }}
  >
    {name}
  </span>
);

const Field = ({ label, required, error, children }) => (
  <div style={{ marginBottom: '1.25rem' }}>
    <label style={{
      display: 'block', fontSize: '0.8125rem', fontWeight: 600,
      color: 'var(--on-surface-variant)', marginBottom: '0.375rem',
    }}>
      {label}{required && <span style={{ color: '#E53935', marginLeft: 3 }}>*</span>}
    </label>
    {children}
    {error && (
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#E53935' }}>{error}</p>
    )}
  </div>
);

const inputStyle = (hasError) => ({
  width: '100%', padding: '0.625rem 0.875rem',
  border: `1.5px solid ${hasError ? '#E53935' : 'var(--outline-variant)'}`,
  borderRadius: '0.5rem', fontSize: '0.9375rem',
  background: 'var(--surface-container-lowest)',
  color: 'var(--on-surface)', outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
});


// ── States ─────────────────────────────────────────────────────
const STATES = { VALIDATING: 'validating', NOT_FOUND: 'not_found', FORM: 'form', SUBMITTING: 'submitting', SUCCESS: 'success', ERROR: 'error' };


// ── Main Component ─────────────────────────────────────────────
export default function Apply() {
  const [searchParams]  = useSearchParams();
  const applyKey        = searchParams.get('key') || '';

  const [state, setState]   = useState(STATES.VALIDATING);
  const [job,   setJob]     = useState(null);   // { title, department, location, employment_type }
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    current_company: '', candidate_role: '', experience_years: '',
    linkedin_url: '', portfolio_url: '',
  });
  const [resume, setResume] = useState(null);
  const fileRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Step 1: validate apply_key on mount ──────────────────────
  useEffect(() => {
    if (!applyKey) { setState(STATES.NOT_FOUND); return; }

    fetch(`${API_BASE}/api/public/jobs/by-key/${encodeURIComponent(applyKey)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setJob(data);
          setState(STATES.FORM);
        } else {
          setState(STATES.NOT_FOUND);
        }
      })
      .catch(() => setState(STATES.NOT_FOUND));
  }, [applyKey]);

  // ── Step 2: client-side validation ──────────────────────────
  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'First name is required.';
    if (!form.last_name.trim())  e.last_name  = 'Last name is required.';
    if (!form.email.trim())      e.email      = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (!form.phone.trim())      e.phone      = 'Phone number is required.';
    if (!resume)                 e.resume     = 'Please upload your resume (PDF, DOC, or DOCX).';
    else {
      const allowed = ['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowed.includes(resume.type)) e.resume = 'Resume must be a PDF, DOC, or DOCX file.';
      if (resume.size > 10 * 1024 * 1024) e.resume = 'Resume must be under 10 MB.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Step 3: submit ──────────────────────────────────────────
  const submit = async () => {
    if (!validate()) return;
    setState(STATES.SUBMITTING);
    setServerError('');

    const fd = new FormData();
    fd.append('first_name',       form.first_name.trim());
    fd.append('last_name',        form.last_name.trim());
    fd.append('email',            form.email.trim().toLowerCase());
    fd.append('phone',            form.phone.trim());
    fd.append('apply_key',        applyKey);
    fd.append('resume',           resume);
    if (form.current_company.trim())  fd.append('current_company',  form.current_company.trim());
    if (form.candidate_role.trim())   fd.append('candidate_role',   form.candidate_role.trim());
    if (form.experience_years.trim()) fd.append('experience_years', form.experience_years.trim());
    if (form.linkedin_url.trim())     fd.append('linkedin_url',     form.linkedin_url.trim());
    if (form.portfolio_url.trim())    fd.append('portfolio_url',    form.portfolio_url.trim());

    try {
      const res  = await fetch(`${API_BASE}/api/public/apply`, { method: 'POST', body: fd });
      const data = await res.json();

      if (res.ok && data.success) {
        setState(STATES.SUCCESS);
      } else if (res.status === 409) {
        setServerError('You have already applied for this position. Our team will be in touch.');
        setState(STATES.FORM);
      } else if (res.status === 429) {
        setServerError('Too many submissions. Please wait a minute and try again.');
        setState(STATES.FORM);
      } else {
        setServerError(data?.detail?.message || data?.message || 'Submission failed. Please try again.');
        setState(STATES.FORM);
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.');
      setState(STATES.FORM);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'var(--surface)',
      fontFamily: 'var(--font-ui, system-ui, sans-serif)',
    }}>

      {/* ── Left branding panel ── */}
      <div style={{
        width: 400, flexShrink: 0,
        background: 'linear-gradient(160deg, #0C162A 0%, #141B34 60%, #1e2d52 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '3rem 2.5rem', position: 'relative', overflow: 'hidden',
      }} className="hidden lg:flex">
        {/* Decorative rings */}
        <div style={{ position:'absolute', top:-80, right:-80, width:320, height:320, borderRadius:'50%', border:'1px solid rgba(68,104,176,0.15)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', border:'1px solid rgba(68,104,176,0.2)', pointerEvents:'none' }} />

        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.875rem', marginBottom:'2.5rem' }}>
            <img src="/jm-logo.png" alt="JMData Talent" style={{ width:44, height:44, borderRadius:'0.625rem', objectFit:'cover' }} />
            <div>
              <p style={{ margin:0, fontSize:'0.625rem', fontWeight:500, letterSpacing:'0.25em', textTransform:'uppercase', color:'#92A0BA' }}>JMData Talent</p>
              <p style={{ margin:0, fontSize:'0.9375rem', fontWeight:700, color:'#FAF7FB' }}>CRM Platform</p>
            </div>
          </div>

          {state === STATES.FORM && job && (
            <div style={{ marginBottom:'2rem' }}>
              <p style={{ margin:'0 0 0.5rem', fontSize:'0.75rem', fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase', color:'#92A0BA' }}>
                You're applying for
              </p>
              <h2 style={{ margin:0, fontSize:'1.75rem', fontWeight:700, color:'#FAF7FB', lineHeight:1.2 }}>
                {job.title}
              </h2>
              {(job.department || job.location) && (
                <p style={{ margin:'0.5rem 0 0', fontSize:'0.9375rem', color:'#92A0BA' }}>
                  {[job.department, job.location].filter(Boolean).join(' · ')}
                </p>
              )}
              {job.employment_type && (
                <span style={{
                  display:'inline-block', marginTop:'0.75rem',
                  padding:'0.25rem 0.75rem', borderRadius:9999,
                  background:'rgba(68,104,176,0.2)', border:'1px solid rgba(68,104,176,0.3)',
                  fontSize:'0.8125rem', fontWeight:600, color:'#B8C8E8',
                }}>
                  {job.employment_type}
                </span>
              )}
              {job.is_urgent && (
                <span style={{
                  display:'inline-block', marginLeft:'0.5rem', marginTop:'0.75rem',
                  padding:'0.25rem 0.75rem', borderRadius:9999,
                  background:'rgba(229,57,53,0.2)', border:'1px solid rgba(229,57,53,0.3)',
                  fontSize:'0.8125rem', fontWeight:600, color:'#EF9A9A',
                }}>
                  Urgent Hire
                </span>
              )}
            </div>
          )}

          <h1 style={{ fontSize:'2.25rem', fontWeight:700, lineHeight:1.15, letterSpacing:'-0.02em', color:'#FAF7FB', margin:0 }}>
            Your next opportunity<br />
            <span style={{ color:'#4468B0' }}>starts here.</span>
          </h1>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
          {[
            { icon:'lock', text:'Your data is secure and never shared.' },
            { icon:'bolt', text:'Applications are reviewed within 3–5 business days.' },
            { icon:'check_circle', text:'You will receive a confirmation email once submitted.' },
          ].map(({ icon, text }) => (
            <div key={icon} style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize:'1rem', color:'#4468B0' }}>{icon}</span>
              <p style={{ margin:0, fontSize:'0.875rem', color:'#92A0BA' }}>{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={{
        flex:1, display:'flex', alignItems:'flex-start', justifyContent:'center',
        padding:'3rem 2rem', overflowY:'auto',
      }}>
        <div style={{ width:'100%', maxWidth:560 }}>

          {/* ── Validating ── */}
          {state === STATES.VALIDATING && (
            <div style={{ textAlign:'center', paddingTop:'5rem' }}>
              <div style={{ width:48, height:48, border:'3px solid var(--outline-variant)', borderTopColor:'var(--tertiary)', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 1.5rem' }} />
              <p style={{ color:'var(--on-surface-variant)' }}>Verifying application link…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── Not found ── */}
          {state === STATES.NOT_FOUND && (
            <div style={{ textAlign:'center', paddingTop:'4rem' }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--error-container)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.5rem' }}>
                <Icon name="error_outline" size="2rem" color="var(--on-error-container)" />
              </div>
              <h2 style={{ fontSize:'1.375rem', fontWeight:700, color:'var(--on-surface)', marginBottom:'0.75rem' }}>
                Job not found
              </h2>
              <p style={{ color:'var(--on-surface-variant)', lineHeight:1.6, maxWidth:380, margin:'0 auto 2rem' }}>
                This job posting is no longer available or the link may have changed.
                Please contact us directly if you believe this is an error.
              </p>
              <a
                href="https://jmdatatalent.com/jobs"
                style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1.5rem', borderRadius:'0.5rem', background:'var(--tertiary)', color:'#fff', fontWeight:600, fontSize:'0.9375rem', textDecoration:'none' }}
              >
                <Icon name="arrow_back" size="1rem" color="#fff" /> View all openings
              </a>
            </div>
          )}

          {/* ── Success ── */}
          {state === STATES.SUCCESS && (
            <div style={{ textAlign:'center', paddingTop:'4rem' }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(0,98,67,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.5rem' }}>
                <Icon name="check_circle" size="2.5rem" color="var(--tertiary)" />
              </div>
              <h2 style={{ fontSize:'1.5rem', fontWeight:700, color:'var(--on-surface)', marginBottom:'0.75rem' }}>
                Application submitted!
              </h2>
              <p style={{ color:'var(--on-surface-variant)', lineHeight:1.7, maxWidth:400, margin:'0 auto 0.5rem' }}>
                Thank you for applying for <strong style={{ color:'var(--on-surface)' }}>{job?.title}</strong>.
              </p>
              <p style={{ color:'var(--on-surface-variant)', lineHeight:1.7, maxWidth:400, margin:'0 auto 2rem' }}>
                Our team will review your application and get back to you within 3–5 business days.
              </p>
              <a
                href="https://jmdatatalent.com/jobs"
                style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1.5rem', borderRadius:'0.5rem', background:'var(--tertiary)', color:'#fff', fontWeight:600, fontSize:'0.9375rem', textDecoration:'none' }}
              >
                View other openings <Icon name="arrow_forward" size="1rem" color="#fff" />
              </a>
            </div>
          )}

          {/* ── Application Form ── */}
          {(state === STATES.FORM || state === STATES.SUBMITTING) && (
            <>
              <div style={{ marginBottom:'2rem' }}>
                <h1 style={{ fontSize:'1.625rem', fontWeight:700, color:'var(--on-surface)', margin:'0 0 0.375rem' }}>
                  Apply for this role
                </h1>
                <p style={{ margin:0, color:'var(--on-surface-variant)', fontSize:'0.9375rem' }}>
                  Fill in your details below. Fields marked <span style={{ color:'#E53935' }}>*</span> are required.
                </p>
              </div>

              {/* Job title reminder (mobile — branding panel hidden) */}
              {job && (
                <div style={{ padding:'0.875rem 1rem', borderRadius:'0.625rem', background:'rgba(0,98,67,0.06)', border:'1px solid rgba(0,98,67,0.15)', marginBottom:'1.75rem', display:'flex', alignItems:'center', gap:'0.75rem' }} className="lg:hidden">
                  <Icon name="work" size="1.125rem" color="var(--tertiary)" />
                  <div>
                    <p style={{ margin:0, fontWeight:600, fontSize:'0.9375rem', color:'var(--on-surface)' }}>{job.title}</p>
                    {(job.department || job.location) && (
                      <p style={{ margin:0, fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>{[job.department, job.location].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </div>
              )}

              {serverError && (
                <div style={{ padding:'0.875rem 1rem', borderRadius:'0.625rem', background:'var(--error-container)', border:'1px solid rgba(183,28,28,0.2)', marginBottom:'1.5rem', display:'flex', gap:'0.625rem', alignItems:'flex-start' }}>
                  <Icon name="error_outline" size="1.125rem" color="var(--on-error-container)" />
                  <p style={{ margin:0, fontSize:'0.875rem', color:'var(--on-error-container)', lineHeight:1.5 }}>{serverError}</p>
                </div>
              )}

              {/* Name row */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                <Field label="First name" required error={errors.first_name}>
                  <input
                    style={inputStyle(errors.first_name)}
                    placeholder="Ravi"
                    value={form.first_name}
                    onChange={e => set('first_name', e.target.value)}
                    onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                    onBlur={e => e.target.style.borderColor = errors.first_name ? '#E53935' : 'var(--outline-variant)'}
                  />
                </Field>
                <Field label="Last name" required error={errors.last_name}>
                  <input
                    style={inputStyle(errors.last_name)}
                    placeholder="Teja"
                    value={form.last_name}
                    onChange={e => set('last_name', e.target.value)}
                    onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                    onBlur={e => e.target.style.borderColor = errors.last_name ? '#E53935' : 'var(--outline-variant)'}
                  />
                </Field>
              </div>

              <Field label="Email address" required error={errors.email}>
                <input
                  type="email"
                  style={inputStyle(errors.email)}
                  placeholder="ravi@example.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                  onBlur={e => e.target.style.borderColor = errors.email ? '#E53935' : 'var(--outline-variant)'}
                />
              </Field>

              <Field label="Phone number" required error={errors.phone}>
                <input
                  type="tel"
                  style={inputStyle(errors.phone)}
                  placeholder="+91-9876543210"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                  onBlur={e => e.target.style.borderColor = errors.phone ? '#E53935' : 'var(--outline-variant)'}
                />
              </Field>

              {/* Resume upload */}
              <Field label="Resume" required error={errors.resume}>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${errors.resume ? '#E53935' : resume ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                    borderRadius: '0.625rem',
                    padding: '1.25rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: resume ? 'rgba(0,98,67,0.04)' : 'var(--surface-container-low)',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {resume ? (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.625rem' }}>
                      <Icon name="description" size="1.375rem" color="var(--tertiary)" />
                      <div style={{ textAlign:'left' }}>
                        <p style={{ margin:0, fontWeight:600, fontSize:'0.875rem', color:'var(--on-surface)' }}>{resume.name}</p>
                        <p style={{ margin:0, fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{(resume.size / 1024).toFixed(0)} KB · Click to change</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Icon name="upload_file" size="2rem" color="var(--on-surface-variant)" />
                      <p style={{ margin:'0.5rem 0 0.25rem', fontWeight:600, fontSize:'0.9375rem', color:'var(--on-surface)' }}>Click to upload your resume</p>
                      <p style={{ margin:0, fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>PDF, DOC or DOCX · Max 10 MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display:'none' }}
                  onChange={e => { if (e.target.files[0]) setResume(e.target.files[0]); }}
                />
              </Field>

              {/* Optional fields — collapsible section */}
              <details style={{ marginBottom:'1.5rem' }}>
                <summary style={{ cursor:'pointer', fontSize:'0.875rem', fontWeight:600, color:'var(--on-surface-variant)', userSelect:'none', marginBottom:'1rem', listStyle:'none', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                  <Icon name="add_circle" size="1rem" color="var(--on-surface-variant)" />
                  Add more details (optional)
                </summary>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                  <Field label="Current company">
                    <input
                      style={inputStyle(false)}
                      placeholder="Infosys"
                      value={form.current_company}
                      onChange={e => set('current_company', e.target.value)}
                      onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                      onBlur={e => e.target.style.borderColor = 'var(--outline-variant)'}
                    />
                  </Field>
                  <Field label="Current role">
                    <input
                      style={inputStyle(false)}
                      placeholder="Senior Engineer"
                      value={form.candidate_role}
                      onChange={e => set('candidate_role', e.target.value)}
                      onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                      onBlur={e => e.target.style.borderColor = 'var(--outline-variant)'}
                    />
                  </Field>
                </div>

                <Field label="Years of experience">
                  <input
                    type="number"
                    min="0" max="60"
                    style={inputStyle(false)}
                    placeholder="5"
                    value={form.experience_years}
                    onChange={e => set('experience_years', e.target.value)}
                    onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--outline-variant)'}
                  />
                </Field>

                <Field label="LinkedIn profile URL">
                  <input
                    type="url"
                    style={inputStyle(false)}
                    placeholder="https://linkedin.com/in/yourprofile"
                    value={form.linkedin_url}
                    onChange={e => set('linkedin_url', e.target.value)}
                    onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--outline-variant)'}
                  />
                </Field>

                <Field label="Portfolio / GitHub URL">
                  <input
                    type="url"
                    style={inputStyle(false)}
                    placeholder="https://github.com/yourhandle"
                    value={form.portfolio_url}
                    onChange={e => set('portfolio_url', e.target.value)}
                    onFocus={e => e.target.style.borderColor = 'var(--tertiary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--outline-variant)'}
                  />
                </Field>
              </details>

              {/* Submit */}
              <button
                onClick={submit}
                disabled={state === STATES.SUBMITTING}
                style={{
                  width: '100%', padding: '0.875rem',
                  borderRadius: '0.625rem', border: 'none', cursor: state === STATES.SUBMITTING ? 'not-allowed' : 'pointer',
                  background: state === STATES.SUBMITTING ? 'var(--outline-variant)' : 'linear-gradient(135deg, var(--tertiary), #009966)',
                  color: '#fff', fontWeight: 700, fontSize: '1rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  transition: 'opacity 0.15s',
                  opacity: state === STATES.SUBMITTING ? 0.7 : 1,
                }}
              >
                {state === STATES.SUBMITTING ? (
                  <>
                    <div style={{ width:18, height:18, border:'2.5px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Icon name="send" size="1.125rem" color="#fff" />
                    Submit Application
                  </>
                )}
              </button>

              <p style={{ textAlign:'center', marginTop:'1rem', fontSize:'0.8125rem', color:'var(--on-surface-variant)', lineHeight:1.5 }}>
                By submitting, you agree to let JMData Talent process your application data.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
