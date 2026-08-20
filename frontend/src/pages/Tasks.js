import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';

import SalesTasks       from './sales/SalesTasks';
import RecruitmentTasks from './recruitment/RecruitmentTasks';
import SalesReminders   from './sales/SalesReminders';

/**
 * Unified Tasks page — replaces three separate sidebar entries.
 *
 * ── FIX vs first draft ──────────────────────────────────────
 * The first version lived at a single /tasks route. That broke the sidebar:
 * Sidebar.js line 70 decides which nav to show with
 *     isRecruit = pathname.startsWith('/recruitment')
 * so /tasks always fell through to the SALES nav. A recruiter clicking Tasks
 * was dumped into the sales sidebar with no way back.
 *
 * This version is mounted at BOTH /sales/tasks and /recruitment/tasks. Same
 * component, two routes — the sidebar keeps its section, and the default tab
 * is inferred from the path. No Sidebar.js logic change needed.
 *
 * Deep links still work: /sales/tasks?tab=reminders
 */

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const TABS = [
  { key: 'sales',       label: 'Sales',       icon: 'trending_up',   module: 'sales' },
  { key: 'recruitment', label: 'Recruitment', icon: 'person_search', module: 'recruitment' },
  { key: 'reminders',   label: 'Reminders',   icon: 'notifications', module: 'sales' },
];

export default function Tasks() {
  const { hasModule } = useAuth();
  const { isMobile }  = useBreakpoint();
  const location      = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Only offer tabs the user's role can reach. hasModule may be absent on
  // older AuthContext builds — default to showing everything.
  const visible  = TABS.filter(t => (typeof hasModule === 'function' ? hasModule(t.module) : true));
  const onRecruit = location.pathname.startsWith('/recruitment');
  const pathDefault = onRecruit ? 'recruitment' : 'sales';
  const fallback = visible.some(t => t.key === pathDefault) ? pathDefault : (visible[0]?.key || 'sales');

  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useState(visible.some(t => t.key === urlTab) ? urlTab : fallback);

  // Keep the URL in sync so tabs are linkable and back/forward behaves
  useEffect(() => {
    if (searchParams.get('tab') !== tab) {
      setSearchParams({ tab }, { replace: true });
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (visible.length === 0) return null;

  return (
    <div>
      <div style={{
        display: 'flex', gap: '0.25rem', padding: isMobile ? '1rem 1rem 0' : '1.25rem 2rem 0',
        borderBottom: '1px solid var(--outline-variant)', overflowX: 'auto',
      }}>
        {visible.map(t => {
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

      {/* embedded=true tells each child to skip its own <h1> — the tab bar above
          is already the heading. Without it you get "Sales" tab + "Sales CRM /
          Tasks" heading stacked, which looks unfinished. */}
      {tab === 'sales'       && <SalesTasks embedded />}
      {tab === 'recruitment' && <RecruitmentTasks embedded />}
      {tab === 'reminders'   && <SalesReminders embedded />}
    </div>
  );
}
