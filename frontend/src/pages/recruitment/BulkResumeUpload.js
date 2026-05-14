import React, { useState, useRef, useEffect, useCallback } from 'react';
import { candidatesAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const POLL_MS = 2500;

const StatusIcon = ({ status }) => {
  if (status === 'done')       return <Icon name="check_circle"   style={{ color: '#006633' }} />;
  if (status === 'error')      return <Icon name="error"          style={{ color: 'var(--error)' }} />;
  if (status === 'skipped')    return <Icon name="do_not_disturb" style={{ color: 'var(--on-surface-variant)' }} />;
  if (status === 'processing') return <Icon name="progress_activity" style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />;
  return <Icon name="hourglass_empty" style={{ color: 'var(--on-surface-variant)' }} />;
};

export default function BulkResumeUpload() {
  const { isMobile } = useBreakpoint();
  const navigate = useNavigate();
  const fileRef = useRef();

  const [zipFile, setZipFile]     = useState(null);
  const [isDrag, setIsDrag]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId]         = useState(null);
  const [progress, setProgress]   = useState(null); // polling state
  const [error, setError]         = useState('');
  const pollRef = useRef(null);

  const poll = useCallback(async (id) => {
    try {
      const res = await candidatesAPI.bulkUploadStatus(id);
      const state = res.data;
      setProgress(state);
      if (state.status === 'done' || state.status === 'error') {
        clearInterval(pollRef.current);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!jobId) return;
    poll(jobId);
    pollRef.current = setInterval(() => poll(jobId), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [jobId, poll]);

  const onDrop = (e) => {
    e.preventDefault(); setIsDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.zip')) { setZipFile(f); setError(''); }
    else setError('Please drop a .zip file.');
  };

  const handleUpload = async () => {
    if (!zipFile) return;
    setError(''); setUploading(true); setProgress(null); setJobId(null);
    try {
      const res = await candidatesAPI.bulkUploadZip(zipFile);
      setJobId(res.data.job_id);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    clearInterval(pollRef.current);
    setZipFile(null); setJobId(null); setProgress(null); setError('');
  };

  const isDone    = progress?.status === 'done';
  const isRunning = progress?.status === 'running';
  const pct = progress?.total > 0
    ? Math.round((progress.processed / progress.total) * 100) : 0;
  const estimatedSec = isRunning && progress?.total > 0
    ? Math.ceil((progress.total - progress.processed) * 5) : null;

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p className="label-sm" style={{ color: 'var(--tertiary)', marginBottom: '0.25rem' }}>Recruitment</p>
          <h1 className="headline-sm">Bulk Resume Upload</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
            Upload a ZIP of resumes — each is parsed by AI, uploaded to Google Drive, and added to candidates
          </p>
        </div>
        {(progress || zipFile) && (
          <button onClick={reset} style={{ display:'inline-flex', alignItems:'center', gap:'0.375rem', padding:'0.5rem 1rem', borderRadius:'0.5rem', border:'1px solid var(--outline-variant)', background:'transparent', color:'var(--on-surface-variant)', fontSize:'0.875rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font-display)' }}>
            <Icon name="restart_alt" style={{ fontSize: '1.125rem' }} /> Start Over
          </button>
        )}
      </div>

      {/* Info banner */}
      <div style={{ display:'flex', gap:'0.5rem', padding:'0.75rem 1rem', borderRadius:'0.625rem', background:'rgba(68,104,176,0.08)', border:'1px solid rgba(68,104,176,0.15)', marginBottom:'1.5rem' }}>
        <Icon name="info" style={{ fontSize:'1rem', color:'var(--primary)', flexShrink:0, marginTop:2 }} />
        <div style={{ fontSize:'0.8125rem', color:'var(--on-surface-variant)', lineHeight:1.6 }}>
          <strong style={{ color:'var(--on-surface)' }}>How it works:</strong> Each resume is processed one at a time with a 4-second pause between calls (Groq free tier).
          AI extracts name, email, phone, company, role, skills and years of experience.
          Duplicates (matching email) are updated, not duplicated. PDF and DOCX inside the ZIP are supported.
        </div>
      </div>

      {!jobId ? (
        /* ── Upload zone ── */
        <div className="card" style={{ padding: '2rem', maxWidth: 600 }}>
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
            onDragLeave={() => setIsDrag(false)}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${isDrag ? 'var(--tertiary)' : zipFile ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
              borderRadius: '0.875rem', padding: '2.5rem', textAlign: 'center',
              cursor: 'pointer', background: isDrag ? 'rgba(0,98,67,0.04)' : zipFile ? 'rgba(0,98,67,0.03)' : 'var(--surface-container-low)',
              transition: 'all 0.15s',
            }}
          >
            {zipFile ? (
              <>
                <Icon name="folder_zip" style={{ fontSize: '2.5rem', color: 'var(--tertiary)', display: 'block', margin: '0 auto 0.75rem' }} />
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--on-surface)', marginBottom: '0.25rem' }}>{zipFile.name}</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                  {(zipFile.size / 1024 / 1024).toFixed(1)} MB · Click to change
                </p>
              </>
            ) : (
              <>
                <Icon name="upload_file" style={{ fontSize: '2.5rem', color: 'var(--on-surface-variant)', display: 'block', margin: '0 auto 0.75rem' }} />
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--on-surface)', marginBottom: '0.375rem' }}>
                  Drag & drop a ZIP file here
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                  or click to select · ZIP containing PDF / DOCX resumes
                </p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) { setZipFile(f); setError(''); } e.target.value = ''; }} />
          </div>

          {error && (
            <div style={{ marginTop: '1rem', padding: '0.625rem 0.875rem', background: 'var(--error-container)', borderRadius: '0.5rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>
            </div>
          )}

          <button onClick={handleUpload} disabled={!zipFile || uploading} style={{
            width: '100%', marginTop: '1.25rem', padding: '0.75rem', borderRadius: '0.5rem', border: 'none',
            cursor: (!zipFile || uploading) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)',
            fontWeight: 700, fontSize: '1rem', color: '#fff',
            background: (!zipFile || uploading) ? 'var(--outline-variant)' : 'linear-gradient(135deg,var(--tertiary),#009966)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}>
            {uploading
              ? <><Icon name="progress_activity" style={{ color:'#fff', animation:'spin 1s linear infinite' }} /> Uploading…</>
              : <><Icon name="cloud_upload" style={{ color:'#fff' }} /> Start Processing</>}
          </button>
        </div>
      ) : (
        /* ── Progress & results ── */
        <div>
          {/* Progress card */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              {isDone
                ? <Icon name="check_circle" style={{ fontSize: '1.5rem', color: '#006633' }} />
                : <Icon name="progress_activity" style={{ fontSize: '1.5rem', color: 'var(--tertiary)', animation: 'spin 1s linear infinite' }} />}
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                  {isDone ? 'Processing complete!' : `Processing resumes… (${progress?.processed || 0}/${progress?.total || '?'})`}
                </p>
                {isRunning && estimatedSec && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                    ~{estimatedSec}s remaining · 4s pause between each (Groq rate limit)
                  </p>
                )}
              </div>
              <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '1.25rem', color: 'var(--tertiary)' }}>{pct}%</span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-container-high)', marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,var(--tertiary),#009966)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
            </div>

            {/* Summary pills */}
            {progress && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { label: `${progress.created || 0} created/updated`, color: '#006633', bg: 'rgba(0,98,67,0.1)' },
                  { label: `${progress.errors || 0} errors`, color: 'var(--error)', bg: 'var(--error-container)' },
                  { label: `${progress.total || 0} total`, color: 'var(--on-surface-variant)', bg: 'var(--surface-container)' },
                ].map(({ label, color, bg }) => (
                  <span key={label} style={{ padding: '0.25rem 0.75rem', borderRadius: 9999, fontSize: '0.8125rem', fontWeight: 600, background: bg, color }}>{label}</span>
                ))}
              </div>
            )}
          </div>

          {/* Per-file results */}
          {(progress?.results || []).length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 100px' : '1fr 200px 180px 160px 100px', gap: '0.5rem', padding: '0.625rem 1rem', background: 'var(--surface-container)', borderBottom: '2px solid var(--outline-variant)' }}>
                {['File', ...(isMobile ? [] : ['Name extracted', 'Role', 'Email']), 'Status'].map(h => (
                  <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)' }}>{h}</span>
                ))}
              </div>
              {progress.results.map((r, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '1fr 100px' : '1fr 200px 180px 160px 100px',
                  gap: '0.5rem', padding: '0.625rem 1rem', alignItems: 'center',
                  borderBottom: '1px solid var(--outline-variant)',
                  background: r.status === 'error' ? 'rgba(239,68,68,0.03)' : r.status === 'done' ? 'rgba(0,98,67,0.02)' : 'transparent',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.filename}>{r.filename}</p>
                    {r.error && <p style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{r.error}</p>}
                  </div>
                  {!isMobile && <span style={{ fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name || '—'}</span>}
                  {!isMobile && <span style={{ fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.candidate_role || '—'}</span>}
                  {!isMobile && <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email || '—'}</span>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <StatusIcon status={r.status} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                      {r.status === 'done' ? (r.action || 'saved') : r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* View candidates button */}
          {isDone && (progress?.created || 0) > 0 && (
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => navigate('/recruitment/candidates')} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.625rem 1.5rem', borderRadius: '0.5rem', border: 'none',
                background: 'var(--tertiary)', color: '#fff', fontWeight: 700, fontSize: '0.875rem',
                cursor: 'pointer', fontFamily: 'var(--font-display)',
              }}>
                <Icon name="group" style={{ color: '#fff' }} /> View All Candidates
              </button>
              <button onClick={reset} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'transparent', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
                <Icon name="upload_file" style={{ fontSize: '1rem' }} /> Upload Another ZIP
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
