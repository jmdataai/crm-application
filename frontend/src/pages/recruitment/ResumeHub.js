import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

import ImportCandidates from './ImportCandidates';
import BulkResumeUpload from './BulkResumeUpload';
import ATSScoreUpload   from './ATSScoreUpload';
import ATSMatch         from './ATSMatch';

/**
 * Resume hub — merges four sidebar entries into one page with four tabs.
 *
 * Same approach as Tasks.js: a thin shell mounting the EXISTING components
 * unchanged. No candidate-ingest logic is rewritten, so nothing that currently
 * works can break. Four nav slots become one.
 *
 * Deep links preserved: /recruitment/resume-hub?tab=bulk|score|match
 */

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const TABS = [
  { key: 'import', label: 'Import CSV',  icon: 'upload_file' },
  { key: 'bulk',   label: 'Bulk ZIP',    icon: 'folder_zip' },
  { key: 'score',  label: 'Resume score', icon: 'grading' },
  { key: 'match',  label: 'ATS match',   icon: 'manage_search' },
];

export default function ResumeHub() {
  const { isMobile } = useBreakpoint();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    TABS.some(t => t.key === urlTab) ? urlTab : 'import'
  );

  useEffect(() => {
    if (searchParams.get('tab') !== tab) {
      setSearchParams({ tab }, { replace: true });
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{
        display: 'flex', gap: '0.25rem', padding: isMobile ? '1rem 1rem 0' : '1.25rem 2rem 0',
        borderBottom: '1px solid var(--outline-variant)', overflowX: 'auto',
      }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.625rem 1rem', border: 'none', background: 'none',
                borderBottom: '2px solid',
                borderColor: active ? 'var(--primary)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--on-surface-variant)',
                fontWeight: active ? 700 : 600, fontSize: '0.875rem',
                cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -1,
              }}
            >
              <Icon name={t.icon} style={{ fontSize: '1rem' }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'import' && <ImportCandidates />}
      {tab === 'bulk'   && <BulkResumeUpload />}
      {tab === 'score'  && <ATSScoreUpload />}
      {tab === 'match'  && <ATSMatch />}
    </div>
  );
}
