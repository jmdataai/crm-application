import React, { useState, useRef, useCallback } from 'react';
import { candidatesAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const ScoreBadge = ({ score }) => {
  const cfg =
    score >= 90 ? { bg: 'rgba(0,98,67,0.15)',    color: '#006633', label: 'Excellent' } :
    score >= 75 ? { bg: 'rgba(0,98,67,0.1)',     color: '#009955', label: 'Strong'    } :
    score >= 60 ? { bg: 'rgba(68,104,176,0.1)',  color: 'var(--primary)', label: 'Good' } :
    score >= 40 ? { bg: 'rgba(217,119,6,0.12)',  color: '#92400e', label: 'Partial'   } :
                  { bg: 'var(--error-container)', color: 'var(--error)', label: 'Weak' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 64 }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: cfg.bg, border: `2px solid ${cfg.color}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.125rem', fontWeight: 800, color: cfg.color,
      }}>{score}</div>
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
    </div>
  );
};

const SkillChip = ({ label, variant = 'match' }) => {
  const styles = {
    match:   { bg: 'rgba(0,98,67,0.1)',      color: '#006633' },
    missing: { bg: 'var(--error-container)', color: 'var(--error)' },
    neutral: { bg: 'rgba(68,104,176,0.08)', color: 'var(--primary)' },
  };
  const s = styles[variant] || styles.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '0.15rem 0.5rem', borderRadius: 9999,
      fontSize: '0.6875rem', fontWeight: 600,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {variant === 'match'   && <Icon name="check_circle" style={{ fontSize: '0.75rem', color: s.color }} />}
      {variant === 'missing' && <Icon name="cancel"       style={{ fontSize: '0.75rem', color: s.color }} />}
      {label}
    </span>
  );
};

const RankBadge = ({ rank }) => (
  <div style={{
    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
    background: rank === 1 ? 'linear-gradient(135deg,#f59e0b,#d97706)'
              : rank === 2 ? 'linear-gradient(135deg,#94a3b8,#64748b)'
              : rank === 3 ? 'linear-gradient(135deg,#c97b4b,#a05c35)'
              : 'var(--surface-container)',
    color: rank <= 3 ? '#fff' : 'var(--on-surface-variant)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.8125rem', fontWeight: 800,
    boxShadow: rank <= 3 ? '0 2px 6px rgba(0,0,0,0.18)' : 'none',
  }}>{rank}</div>
);

// Status of each file during sequential processing
const FILE_STATUS = { PENDING: 'pending', PROCESSING: 'processing', DONE: 'done', ERROR: 'error' };

const SLEEP_MS = 2000; // 2s between Groq calls — stays within free tier limits

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_FILES = 10;

export default function ATSScoreUpload() {
  const [jdText, setJdText]         = useState('');
  const [files, setFiles]           = useState([]);           // File objects
  const [fileStates, setFileStates] = useState([]);          // { name, status, result, error }
  const [jdMeta, setJdMeta]         = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults]       = useState([]);          // final sorted results
  const [globalError, setGlobalError] = useState('');
  const [expandedIdx, setExpanded]  = useState(null);
  const [isDragOver, setDragOver]   = useState(false);
  const [phase, setPhase]           = useState('idle');       // idle | jd | resumes | done
  const fileInputRef = useRef();
  const abortRef     = useRef(false);

  // ── File handling ──────────────────────────────────────────
  const addFiles = useCallback((incoming) => {
    const allowed = ['application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const valid = Array.from(incoming).filter(f => allowed.includes(f.type));
    const invalid = Array.from(incoming).length - valid.length;
    setFiles(prev => {
      const combined = [...prev, ...valid].slice(0, MAX_FILES);
      setFileStates(combined.map(f => ({ name: f.name, status: FILE_STATUS.PENDING, result: null, error: '' })));
      return combined;
    });
    if (invalid > 0) setGlobalError(`${invalid} file(s) skipped — only PDF and DOCX allowed.`);
    else setGlobalError('');
  }, []);

  const removeFile = (idx) => {
    setFiles(prev => { const n = [...prev]; n.splice(idx, 1); return n; });
    setFileStates(prev => { const n = [...prev]; n.splice(idx, 1); return n; });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  // ── Scoring run ────────────────────────────────────────────
  const run = async () => {
    if (!jdText.trim() || jdText.trim().length < 30) {
      setGlobalError('Please provide a job description (minimum 30 characters).');
      return;
    }
    if (files.length === 0) {
      setGlobalError('Please upload at least one resume.');
      return;
    }
    setGlobalError('');
    setProcessing(true);
    setResults([]);
    setExpanded(null);
    abortRef.current = false;

    // Reset file states
    setFileStates(files.map(f => ({ name: f.name, status: FILE_STATUS.PENDING, result: null, error: '' })));

    // Step 1: Parse JD (1 LLM call)
    setPhase('jd');
    let parsedJD;
    try {
      const res = await candidatesAPI.parseJDForScoring(jdText);
      parsedJD = res.data;
      setJdMeta(parsedJD);
    } catch (err) {
      setGlobalError(err?.response?.data?.detail || 'Failed to parse job description. Please try again.');
      setProcessing(false);
      setPhase('idle');
      return;
    }

    // Step 2: Score each resume sequentially with sleep between calls
    setPhase('resumes');
    const scored = [];

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break;

      // Mark current file as processing
      setFileStates(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: FILE_STATUS.PROCESSING } : s
      ));

      try {
        const res = await candidatesAPI.scoreResumeUpload(files[i], parsedJD);
        const result = res.data;
        setFileStates(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: FILE_STATUS.DONE, result } : s
        ));
        scored.push(result);
      } catch (err) {
        const errMsg = err?.response?.data?.detail || 'Processing failed';
        setFileStates(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: FILE_STATUS.ERROR, error: errMsg } : s
        ));
        // Still continue with next resume
      }

      // Sleep between calls (skip after last file)
      if (i < files.length - 1 && !abortRef.current) {
        await sleep(SLEEP_MS);
      }
    }

    // Sort by ATS score desc
    const sorted = [...scored].sort((a, b) => b.ats_score - a.ats_score);
    setResults(sorted);
    setPhase('done');
    setProcessing(false);
  };

  const reset = () => {
    abortRef.current = true;
    setFiles([]);
    setFileStates([]);
    setJdMeta(null);
    setResults([]);
    setGlobalError('');
    setPhase('idle');
    setProcessing(false);
    setExpanded(null);
  };

  // ── Progress stats ─────────────────────────────────────────
  const doneCount    = fileStates.filter(s => s.status === FILE_STATUS.DONE).length;
  const errorCount   = fileStates.filter(s => s.status === FILE_STATUS.ERROR).length;
  const totalFiles   = files.length;
  const progressPct  = totalFiles > 0 ? Math.round(((doneCount + errorCount) / totalFiles) * 100) : 0;

  const estimatedSec = processing && phase === 'resumes'
    ? Math.ceil(((totalFiles - doneCount - errorCount) * (SLEEP_MS / 1000 + 3)))
    : null;

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem', color: 'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Resume Score</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
            Upload up to {MAX_FILES} resumes · paste a JD · get ATS scores &amp; top candidates instantly
          </p>
        </div>
        {(results.length > 0 || files.length > 0) && (
          <button onClick={reset} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
            background: 'transparent', color: 'var(--on-surface-variant)',
            fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)',
          }}>
            <Icon name="restart_alt" style={{ fontSize: '1.125rem' }} /> Start Over
          </button>
        )}
      </div>

      {/* Rate limit notice */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
        padding: '0.625rem 1rem', borderRadius: '0.5rem', marginBottom: '1.25rem',
        background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
      }}>
        <Icon name="info" style={{ fontSize: '1rem', color: '#92400e', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.5 }}>
          <strong>Free tier mode</strong> — resumes are processed one at a time with a 2s pause between
          each to stay within Groq's rate limits. For {MAX_FILES} resumes, expect ~{Math.ceil(MAX_FILES * 5)}s total.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: results.length > 0 ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: '1.25rem' }}>

        {/* ── LEFT: Inputs (hidden once results shown) ── */}
        {results.length === 0 && (
          <>
            {/* JD Input */}
            <div>
              <div className="card" style={{ padding: '1.25rem', height: '100%', boxSizing: 'border-box' }}>
                <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 700 }}>
                  Job Description
                </label>
                <textarea
                  value={jdText}
                  onChange={e => setJdText(e.target.value)}
                  placeholder="Paste the full job description — include role title, required skills, responsibilities, experience level, and tech stack. More detail = better scoring accuracy."
                  rows={14}
                  className="textarea"
                  disabled={processing}
                  style={{ width: '100%', resize: 'vertical', fontSize: '0.875rem', lineHeight: 1.6, boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginTop: '0.5rem' }}>
                  {jdText.trim().length > 0 ? `${jdText.trim().length} characters` : 'Minimum 30 characters required'}
                </p>
              </div>
            </div>

            {/* File Upload */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <label className="label" style={{ fontWeight: 700 }}>
                    Upload Resumes
                  </label>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                    {files.length}/{MAX_FILES} files
                  </span>
                </div>

                {/* Drop Zone */}
                <div
                  onDrop={onDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => !processing && fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragOver ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                    borderRadius: '0.75rem',
                    padding: '1.5rem',
                    textAlign: 'center',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    background: isDragOver ? 'rgba(0,98,67,0.05)' : 'var(--surface-container-low)',
                    transition: 'all 0.15s',
                    opacity: files.length >= MAX_FILES ? 0.5 : 1,
                  }}
                >
                  <Icon name="upload_file" style={{ fontSize: '2rem', color: isDragOver ? 'var(--tertiary)' : 'var(--on-surface-variant)', display: 'block', margin: '0 auto 0.5rem' }} />
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: '0.25rem' }}>
                    {files.length >= MAX_FILES ? `Maximum ${MAX_FILES} resumes reached` : 'Drag & drop or click to upload'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>PDF or DOCX · max 10 MB each</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    multiple
                    onChange={e => addFiles(e.target.files)}
                    style={{ display: 'none' }}
                    disabled={processing || files.length >= MAX_FILES}
                  />
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {files.map((f, idx) => {
                      const fs = fileStates[idx];
                      return (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'center', gap: '0.625rem',
                          padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                          background: fs?.status === FILE_STATUS.DONE    ? 'rgba(0,98,67,0.06)'
                                    : fs?.status === FILE_STATUS.ERROR   ? 'var(--error-container)'
                                    : fs?.status === FILE_STATUS.PROCESSING ? 'rgba(68,104,176,0.08)'
                                    : 'var(--surface-container)',
                        }}>
                          <Icon
                            name={
                              fs?.status === FILE_STATUS.DONE       ? 'check_circle'
                            : fs?.status === FILE_STATUS.ERROR      ? 'error'
                            : fs?.status === FILE_STATUS.PROCESSING ? 'progress_activity'
                            : 'description'
                            }
                            style={{
                              fontSize: '1rem', flexShrink: 0,
                              color: fs?.status === FILE_STATUS.DONE   ? '#006633'
                                   : fs?.status === FILE_STATUS.ERROR  ? 'var(--error)'
                                   : fs?.status === FILE_STATUS.PROCESSING ? 'var(--primary)'
                                   : 'var(--on-surface-variant)',
                              ...(fs?.status === FILE_STATUS.PROCESSING ? { animation: 'spin 1s linear infinite' } : {}),
                            }}
                          />
                          <span style={{ flex: 1, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                            {(f.size / 1024).toFixed(0)} KB
                          </span>
                          {!processing && (
                            <button onClick={() => removeFile(idx)} style={{
                              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                              display: 'flex', alignItems: 'center',
                            }}>
                              <Icon name="close" style={{ fontSize: '1rem', color: 'var(--on-surface-variant)' }} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Run Button */}
              <button
                onClick={run}
                disabled={processing || jdText.trim().length < 30 || files.length === 0}
                style={{
                  width: '100%', display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.5rem',
                  padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none',
                  cursor: (processing || jdText.trim().length < 30 || files.length === 0) ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700,
                  color: '#fff', background: 'linear-gradient(135deg,var(--tertiary),#009966)',
                  opacity: (processing || jdText.trim().length < 30 || files.length === 0) ? 0.65 : 1,
                  boxShadow: '0 2px 8px rgba(0,98,67,0.25)',
                }}
              >
                {processing ? (
                  <><Icon name="progress_activity" style={{ fontSize: '1.125rem', color: '#fff', animation: 'spin 1s linear infinite' }} /> Processing…</>
                ) : (
                  <><Icon name="analytics" style={{ fontSize: '1.125rem', color: '#fff' }} /> Score {files.length > 0 ? `${files.length} Resume${files.length > 1 ? 's' : ''}` : 'Resumes'}</>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Processing state (full-width) ── */}
        {processing && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="card" style={{ padding: '1.5rem' }}>
              {/* Phase header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <Icon name="progress_activity" style={{ fontSize: '1.25rem', color: 'var(--tertiary)', animation: 'spin 1s linear infinite' }} />
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                    {phase === 'jd' ? 'Parsing job description…' : `Scoring resumes (${doneCount + errorCount}/${totalFiles} done)`}
                  </p>
                  {estimatedSec !== null && estimatedSec > 0 && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                      ~{estimatedSec}s remaining · 2s pause between calls (Groq free tier)
                    </p>
                  )}
                </div>
                <div style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--tertiary)' }}>{progressPct}%</div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-container-high)', marginBottom: '1.25rem', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: 'linear-gradient(90deg,var(--tertiary),#009966)',
                  width: `${phase === 'jd' ? 5 : progressPct}%`,
                  transition: 'width 0.4s ease',
                }} />
              </div>

              {/* Per-file status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {fileStates.map((fs, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                    background: fs.status === FILE_STATUS.DONE       ? 'rgba(0,98,67,0.06)'
                              : fs.status === FILE_STATUS.ERROR      ? 'rgba(239,68,68,0.06)'
                              : fs.status === FILE_STATUS.PROCESSING ? 'rgba(68,104,176,0.08)'
                              : 'var(--surface-container-low)',
                  }}>
                    <Icon
                      name={
                        fs.status === FILE_STATUS.DONE       ? 'check_circle'
                      : fs.status === FILE_STATUS.ERROR      ? 'error'
                      : fs.status === FILE_STATUS.PROCESSING ? 'progress_activity'
                      : 'hourglass_empty'
                      }
                      style={{
                        fontSize: '1rem', flexShrink: 0,
                        color: fs.status === FILE_STATUS.DONE   ? '#006633'
                             : fs.status === FILE_STATUS.ERROR  ? 'var(--error)'
                             : fs.status === FILE_STATUS.PROCESSING ? 'var(--primary)'
                             : 'var(--on-surface-variant)',
                        ...(fs.status === FILE_STATUS.PROCESSING ? { animation: 'spin 1s linear infinite' } : {}),
                      }}
                    />
                    <span style={{ flex: 1, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fs.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                      {fs.status === FILE_STATUS.DONE       ? (fs.result ? `Score: ${fs.result.ats_score}` : 'Done')
                     : fs.status === FILE_STATUS.ERROR      ? fs.error
                     : fs.status === FILE_STATUS.PROCESSING ? 'Scoring…'
                     : 'Waiting'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {globalError && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--error-container)', borderRadius: '0.5rem', marginTop: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--error)' }}>{globalError}</p>
        </div>
      )}

      {/* ── Results ── */}
      {results.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>

          {/* JD meta strip */}
          {jdMeta && (
            <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', background: 'rgba(0,98,67,0.03)', border: '1px solid rgba(0,98,67,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Icon name="auto_awesome" style={{ color: 'var(--tertiary)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>JD Analysis</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                  {results.length} scored · {errorCount > 0 && `${errorCount} failed`}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                {jdMeta.role_type && (
                  <span style={{ padding: '0.25rem 0.75rem', borderRadius: 9999, background: 'rgba(68,104,176,0.1)', color: 'var(--primary)', fontSize: '0.8125rem', fontWeight: 600 }}>
                    {jdMeta.role_type}
                  </span>
                )}
                {jdMeta.experience_years_min != null && (
                  <span style={{ padding: '0.25rem 0.75rem', borderRadius: 9999, background: 'rgba(217,119,6,0.1)', color: '#92400e', fontSize: '0.8125rem', fontWeight: 600 }}>
                    {jdMeta.experience_years_min}+ yrs required
                  </span>
                )}
                {(jdMeta.required_skills || []).slice(0, 8).map(s => (
                  <SkillChip key={s} label={s} variant="neutral" />
                ))}
                {(jdMeta.required_skills || []).length > 8 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                    +{jdMeta.required_skills.length - 8} more required
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Top 3 podium */}
          {results.length >= 2 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                <Icon name="emoji_events" style={{ color: '#f59e0b' }} />
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Top Candidates</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(results.length, 3)}, 1fr)`, gap: '0.875rem' }}>
                {results.slice(0, 3).map((r, idx) => {
                  const borderColor = idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : '#c97b4b';
                  return (
                    <div key={idx} className="card" style={{
                      padding: '1.125rem', textAlign: 'center',
                      border: `2px solid ${borderColor}40`,
                      background: idx === 0 ? 'rgba(245,158,11,0.04)' : 'var(--surface)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                        <RankBadge rank={idx + 1} />
                      </div>
                      <p style={{
                        fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.375rem',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        title: r.filename,
                      }} title={r.filename}>
                        {r.filename.replace(/\.[^.]+$/, '')}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.375rem' }}>
                        <ScoreBadge score={r.ats_score} />
                      </div>
                      {r.experience_years != null && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                          {r.experience_years} yrs exp
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full ranked table */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <Icon name="table_rows" style={{ color: 'var(--tertiary)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>All Scores — Ranked</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {results.map((r, idx) => {
              const isExpanded = expandedIdx === idx;
              const isTop3 = idx < 3;
              return (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: '1rem 1.25rem',
                    border: isTop3 ? `1.5px solid ${idx === 0 ? '#f59e0b40' : idx === 1 ? '#94a3b840' : '#c97b4b40'}` : '1px solid var(--outline-variant)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                    <RankBadge rank={idx + 1} />
                    <ScoreBadge score={r.ats_score} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9375rem' }} title={r.filename}>
                          {r.filename.replace(/\.[^.]+$/, '')}
                        </span>
                        {r.error && (
                          <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.6875rem', fontWeight: 700, background: 'var(--error-container)', color: 'var(--error)' }}>
                            {r.error}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                        {r.experience_years != null && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                            <Icon name="schedule" style={{ fontSize: '0.875rem' }} /> {r.experience_years} yrs
                          </span>
                        )}
                        {r.tech_stack?.length > 0 && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                            <Icon name="code" style={{ fontSize: '0.875rem' }} /> {r.tech_stack.length} skills
                          </span>
                        )}
                        {r.matched_skills?.length > 0 && (
                          <span style={{ fontSize: '0.8125rem', color: '#006633' }}>
                            <Icon name="check_circle" style={{ fontSize: '0.875rem', color: '#006633' }} /> {r.matched_skills.length} matched
                          </span>
                        )}
                        {r.missing_skills?.length > 0 && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--error)' }}>
                            <Icon name="cancel" style={{ fontSize: '0.875rem', color: 'var(--error)' }} /> {r.missing_skills.length} missing
                          </span>
                        )}
                      </div>

                      {r.fit_summary && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                          {r.fit_summary}
                        </p>
                      )}

                      {r.matched_skills?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
                          {r.matched_skills.slice(0, 6).map(s => <SkillChip key={s} label={s} variant="match" />)}
                          {r.matched_skills.length > 6 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', alignSelf: 'center' }}>
                              +{r.matched_skills.length - 6} matched
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setExpanded(isExpanded ? null : idx)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                        padding: '0.375rem 0.75rem', borderRadius: '0.5rem',
                        border: '1px solid var(--outline-variant)', cursor: 'pointer',
                        fontSize: '0.8125rem', fontWeight: 600, background: 'transparent',
                        color: 'var(--on-surface-variant)', fontFamily: 'var(--font-display)', flexShrink: 0,
                      }}
                    >
                      <Icon name={isExpanded ? 'expand_less' : 'expand_more'} style={{ fontSize: '1rem' }} />
                      {isExpanded ? 'Less' : 'Details'}
                    </button>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--outline-variant)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {r.missing_skills?.length > 0 && (
                          <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--error)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Skill Gaps
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                              {r.missing_skills.map(s => <SkillChip key={s} label={s} variant="missing" />)}
                            </div>
                          </div>
                        )}
                        {r.tech_stack?.length > 0 && (
                          <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--on-surface-variant)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Full Tech Stack
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                              {r.tech_stack.map(s => <SkillChip key={s} label={s} variant="neutral" />)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
