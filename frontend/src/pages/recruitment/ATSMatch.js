import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidatesAPI } from '../../services/api';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const ScoreBadge = ({ score }) => {
  const cfg =
    score >= 90 ? { bg: 'rgba(0,98,67,0.15)',   color: '#006633', label: 'Excellent' } :
    score >= 75 ? { bg: 'rgba(0,98,67,0.1)',    color: '#009955', label: 'Strong'    } :
    score >= 60 ? { bg: 'rgba(0,74,198,0.1)',   color: 'var(--primary)', label: 'Good' } :
    score >= 40 ? { bg: 'rgba(217,119,6,0.12)', color: '#92400e', label: 'Partial'   } :
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
    match:   { bg: 'rgba(0,98,67,0.1)',    color: '#006633' },
    missing: { bg: 'var(--error-container)', color: 'var(--error)' },
    neutral: { bg: 'rgba(0,74,198,0.08)',  color: 'var(--primary)' },
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
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    background: rank === 1 ? 'linear-gradient(135deg,#f59e0b,#d97706)'
              : rank === 2 ? 'linear-gradient(135deg,#94a3b8,#64748b)'
              : rank === 3 ? 'linear-gradient(135deg,#c97b4b,#a05c35)'
              : 'var(--surface-container)',
    color: rank <= 3 ? '#fff' : 'var(--on-surface-variant)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.75rem', fontWeight: 800, boxShadow: rank <= 3 ? '0 2px 6px rgba(0,0,0,0.18)' : 'none',
  }}>{rank}</div>
);

export default function ATSMatch() {
  const navigate = useNavigate();
  const [jdText, setJdText]           = useState('');
  const [candidateType, setType]      = useState('domestic');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [result, setResult]           = useState(null);   // { matches, jd_meta, total_scanned, pre_filtered }
  const [expandedId, setExpanded]     = useState(null);

  const run = async () => {
    if (!jdText.trim() || jdText.trim().length < 30) {
      setError('Please provide a detailed job description (minimum 30 characters).');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res = await candidatesAPI.atsMatch(jdText, candidateType);
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'ATS matching failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const matches = result?.matches || [];
  const jdMeta  = result?.jd_meta  || {};

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem', color: 'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">ATS Match</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
            Paste a job description — find top-10 matching candidates instantly
          </p>
        </div>
      </div>

      {/* Candidate type tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', background: 'var(--surface-container-high)', padding: 4, borderRadius: '0.875rem', width: 'fit-content' }}>
        {[{ id: 'domestic', label: '🇮🇳 Domestic' }, { id: 'international', label: '🌍 International' }].map(t => (
          <button key={t.id} onClick={() => { setType(t.id); setResult(null); }} style={{
            padding: '0.5rem 1.5rem', borderRadius: '0.625rem', border: 'none', cursor: 'pointer',
            fontFamily: 'Inter,sans-serif', fontSize: '0.875rem',
            fontWeight: candidateType === t.id ? 600 : 500,
            background: candidateType === t.id ? 'var(--surface-container-lowest)' : 'transparent',
            color: candidateType === t.id ? 'var(--tertiary)' : 'var(--on-surface-variant)',
            boxShadow: candidateType === t.id ? 'var(--ambient-shadow)' : 'none',
            transition: 'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* JD input card */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <label className="label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 700 }}>
          Job Description
        </label>
        <textarea
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          placeholder="Paste the full job description here — include role title, required skills, responsibilities, experience level, and any tech stack requirements. The more detail, the better the matching accuracy."
          rows={10}
          className="textarea"
          style={{ width: '100%', resize: 'vertical', fontSize: '0.875rem', lineHeight: 1.6, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.875rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
            {jdText.trim().length > 0 ? `${jdText.trim().length} characters` : 'Minimum 30 characters required'}
          </p>
          <button
            onClick={run}
            disabled={loading || jdText.trim().length < 30}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.625rem 1.5rem', borderRadius: '0.5rem', border: 'none',
              cursor: loading || jdText.trim().length < 30 ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter,sans-serif', fontSize: '0.9375rem', fontWeight: 700,
              color: '#fff', background: 'linear-gradient(135deg,var(--tertiary),#009966)',
              opacity: loading || jdText.trim().length < 30 ? 0.65 : 1,
              boxShadow: '0 2px 8px rgba(0,98,67,0.25)',
            }}
          >
            {loading ? (
              <><Icon name="progress_activity" style={{ fontSize: '1.125rem', color: '#fff' }} /> Scanning candidates…</>
            ) : (
              <><Icon name="manage_search" style={{ fontSize: '1.125rem', color: '#fff' }} /> Find Top Matches</>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--error-container)', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <Icon name="progress_activity" style={{ fontSize: '2.5rem', display: 'block', margin: '0 auto 1rem', color: 'var(--tertiary)', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.375rem' }}>Matching in progress…</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
            Extracting JD requirements → filtering by tech stack → scoring candidates with AI
          </p>
        </div>
      )}

      {/* JD parsed meta */}
      {!loading && result && (
        <>
          <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', background: 'rgba(0,98,67,0.03)', border: '1px solid rgba(0,98,67,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Icon name="auto_awesome" style={{ color: 'var(--tertiary)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>JD Analysis</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                Scanned {result.total_scanned} candidates
                {result.pre_filtered > 0 && ` · ${result.pre_filtered} matched tech stack`}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center' }}>
              {jdMeta.role_type && (
                <span style={{ padding: '0.25rem 0.75rem', borderRadius: 9999, background: 'rgba(0,74,198,0.1)', color: 'var(--primary)', fontSize: '0.8125rem', fontWeight: 600 }}>
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
                  +{jdMeta.required_skills.length - 8} more
                </span>
              )}
            </div>
          </div>

          {/* Results */}
          {matches.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <Icon name="person_search" style={{ fontSize: '2.5rem', display: 'block', margin: '0 auto 0.75rem', color: 'var(--on-surface-variant)' }} />
              <p style={{ fontWeight: 700, marginBottom: '0.375rem' }}>No matches found</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                No {candidateType} candidates have a matching tech stack yet.
                Make sure candidates have resumes uploaded so their skills can be extracted.
              </p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Icon name="emoji_events" style={{ color: 'var(--tertiary)' }} />
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Top {matches.length} Candidates</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {matches.map((m, idx) => {
                  const isExpanded = expandedId === m.id;
                  return (
                    <div
                      key={m.id}
                      className="card"
                      style={{
                        padding: '1.125rem 1.25rem',
                        border: idx === 0 ? '1.5px solid rgba(0,98,67,0.3)' : '1px solid var(--outline-variant)',
                        transition: 'box-shadow 0.15s',
                      }}
                    >
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                        <RankBadge rank={idx + 1} />
                        <ScoreBadge score={m.ats_score} />

                        {/* Candidate info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '1rem' }}>{m.full_name}</span>
                            {m.status && (
                              <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.6875rem', fontWeight: 700, background: 'var(--surface-container)', color: 'var(--on-surface-variant)' }}>
                                {m.status.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                            {m.candidate_role && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                                <Icon name="work" style={{ fontSize: '0.875rem' }} /> {m.candidate_role}
                              </span>
                            )}
                            {(m.experience_years != null || m.total_experience) && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                                <Icon name="schedule" style={{ fontSize: '0.875rem' }} />
                                {m.experience_years != null ? ` ${m.experience_years} yrs` : ` ${m.total_experience}`}
                              </span>
                            )}
                            {m.location && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                                <Icon name="location_on" style={{ fontSize: '0.875rem' }} /> {m.location}
                              </span>
                            )}
                            {m.visa_status && (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
                                <Icon name="badge" style={{ fontSize: '0.875rem' }} /> {m.visa_status}
                              </span>
                            )}
                          </div>

                          {/* Fit summary */}
                          {m.fit_summary && (
                            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginTop: '0.375rem', fontStyle: 'italic' }}>
                              {m.fit_summary}
                            </p>
                          )}

                          {/* Matched skills row */}
                          {m.matched_skills?.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
                              {m.matched_skills.slice(0, 6).map(s => <SkillChip key={s} label={s} variant="match" />)}
                              {m.matched_skills.length > 6 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', alignSelf: 'center' }}>
                                  +{m.matched_skills.length - 6} matched
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flexShrink: 0 }}>
                          <button
                            onClick={() => navigate(`/recruitment/candidates/${m.id}`)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                              padding: '0.375rem 0.875rem', borderRadius: '0.5rem', border: 'none',
                              cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
                              background: 'rgba(0,98,67,0.08)', color: 'var(--tertiary)',
                              fontFamily: 'Inter,sans-serif',
                            }}
                          >
                            <Icon name="open_in_new" style={{ fontSize: '1rem' }} /> View
                          </button>
                          <button
                            onClick={() => setExpanded(isExpanded ? null : m.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                              padding: '0.375rem 0.875rem', borderRadius: '0.5rem',
                              border: '1px solid var(--outline-variant)', cursor: 'pointer',
                              fontSize: '0.8125rem', fontWeight: 600, background: 'transparent',
                              color: 'var(--on-surface-variant)', fontFamily: 'Inter,sans-serif',
                            }}
                          >
                            <Icon name={isExpanded ? 'expand_less' : 'expand_more'} style={{ fontSize: '1rem' }} />
                            {isExpanded ? 'Less' : 'Details'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--outline-variant)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            {/* Missing skills */}
                            {m.missing_skills?.length > 0 && (
                              <div>
                                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--error)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Skill Gaps
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                                  {m.missing_skills.map(s => <SkillChip key={s} label={s} variant="missing" />)}
                                </div>
                              </div>
                            )}
                            {/* Full tech stack */}
                            {m.tech_stack?.length > 0 && (
                              <div>
                                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--on-surface-variant)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Full Tech Stack
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                                  {m.tech_stack.map(s => <SkillChip key={s} label={s} variant="neutral" />)}
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
        </>
      )}
    </div>
  );
}
