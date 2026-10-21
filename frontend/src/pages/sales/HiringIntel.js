import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { hiringIntelAPI, formatApiError } from '../../services/api';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * Hiring Intel — who in Ireland is hiring Data & AI people right now, and who
 * to call there.
 *
 * One click runs a scan on the backend (LinkedIn jobs, Apollo, company careers
 * pages, optional Jooble) for Permanent / Contract Data & AI roles at Irish
 * companies under 100 staff, then pulls CEO / CTO / Founder / Data-head
 * contacts from Apollo. The result is the sheet the desk asked for:
 *   Name · Email · Phone · Company · Hiring for · Job link · Personal LinkedIn
 *
 * Storage is bounded on purpose: the backend keeps the newest 5 scans only.
 */

const Icon = ({ name, style = {}, filled = false, className = '' }) => (
  <span className={`material-symbols-outlined ${className}`.trim()}
        style={{ fontSize: '1.125rem', verticalAlign: 'middle',
                 fontVariationSettings: filled ? "'FILL' 1" : undefined, ...style }}>{name}</span>
);

const STAGES = [
  { key: 'discover', label: 'Job boards',      icon: 'travel_explore', hint: 'LinkedIn · Indeed · CareerJet · JobsIreland' },
  { key: 'qualify',  label: 'Qualify',         icon: 'filter_alt',     hint: '<100 staff · Irish · free checks' },
  { key: 'websites', label: 'Company sites',   icon: 'language',       hint: 'Careers & team pages' },
  { key: 'contacts', label: 'Decision-makers', icon: 'badge',          hint: 'Found free · reveal on click' },
  { key: 'save',     label: 'Save',            icon: 'inventory_2',    hint: 'De-duplicate & store' },
];

const STATUS_STYLE = {
  queued:    { label: 'Queued',    color: '#B45309', bg: 'rgba(217,119,6,0.12)',  icon: 'hourglass_top' },
  running:   { label: 'Running',   color: 'var(--primary)', bg: 'rgba(68,104,176,0.12)', icon: 'autorenew' },
  completed: { label: 'Completed', color: '#006633', bg: 'rgba(0,102,51,0.1)',    icon: 'check_circle' },
  failed:    { label: 'Failed',    color: 'var(--error)', bg: 'rgba(186,26,26,0.1)', icon: 'error' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bg: 'rgba(107,114,128,0.12)', icon: 'block' },
};

const ROLE_RANK = { 'Data Head': 1, CTO: 2, CEO: 3, 'Co-Founder': 4, Founder: 4 };
const ROLE_TONE = { 'Data Head': '#7C3AED', CTO: '#4468B0', CEO: '#006243', 'Co-Founder': '#B45309', Founder: '#B45309' };
const SOURCE_TONE = { Apollo: '#4468B0', 'Company website': '#006243', 'LinkedIn search': '#0A66C2' };
const TYPE_TONE = { Permanent: '#006243', Contract: '#B45309', Unspecified: '#6B7280' };
const CATEGORY_TONE = {
  'Data Engineering': '#4468B0', 'Data Science': '#7C3AED', 'AI / ML': '#DB2777',
  'Analytics / BI': '#0891B2', 'Data Leadership': '#0C162A', 'Data Governance': '#65A30D',
};
const DAYS_OPTIONS = [{ v: 1, l: '24 hours' }, { v: 7, l: '7 days' }, { v: 14, l: '14 days' }, { v: 30, l: '30 days' }];
const SOURCE_META = {
  linkedin:         { label: 'LinkedIn', icon: 'work' },
  indeed:           { label: 'Indeed', icon: 'search' },
  careerjet:        { label: 'CareerJet', icon: 'hub' },
  jobsireland:      { label: 'JobsIreland', icon: 'flag' },
  jooble:           { label: 'Jooble', icon: 'travel_explore' },
  websites:         { label: 'Careers & team pages', icon: 'language' },
  apollo_discovery: { label: 'Apollo discovery', icon: 'toll' },
};
const SOURCE_STATUS = {
  ok:             { label: 'OK', tone: '#15803D' },
  partial:        { label: 'Partial', tone: '#B45309' },
  blocked:        { label: 'Blocked', tone: '#B91C1C' },
  error:          { label: 'Error', tone: '#B91C1C' },
  not_configured: { label: 'Not set up', tone: '#6B7280' },
  running:        { label: 'Running', tone: '#4468B0' },
};
const PARAMS_STORAGE_KEY = 'hiringIntel.params.v2';   // v2: new boards + free-first contacts
const ACTIVE = ['queued', 'running'];

// ── formatting helpers ────────────────────────────────────────
const fmtWhen = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fmtAgo = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const fmtDuration = (secs) => {
  const s = Math.round(Number(secs) || 0);
  if (!s) return '';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '—');
const runDuration = (run) => {
  if (!run) return '';
  if (run.stats?.elapsed_seconds) return fmtDuration(run.stats.elapsed_seconds);
  if (run.started_at && run.finished_at) {
    return fmtDuration((new Date(run.finished_at) - new Date(run.started_at)) / 1000);
  }
  return '';
};
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

const readStoredParams = () => {
  try { return JSON.parse(localStorage.getItem(PARAMS_STORAGE_KEY) || 'null'); } catch { return null; }
};
const storeParams = (p) => {
  try { localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(p)); } catch { /* private mode */ }
};

// ── small building blocks ─────────────────────────────────────
const StatusChip = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.cancelled;
  return (
    <span className="hi-chip" style={{ color: s.color, background: s.bg }}>
      <Icon name={s.icon} style={{ fontSize: '0.875rem' }} className={status === 'running' ? 'hi-spin' : ''} />
      {s.label}
    </span>
  );
};

const Tag = ({ children, tone = '#4468B0', title }) => (
  <span className="hi-tag" title={title} style={{ color: tone, background: `${tone}14`, borderColor: `${tone}33` }}>{children}</span>
);

const Toggle = ({ checked, onChange, label, sub, disabled }) => (
  <label className={`hi-toggle${disabled ? ' is-disabled' : ''}`}>
    <span className={`hi-switch${checked ? ' on' : ''}`} aria-hidden="true"><span /></span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="hi-toggle-label">{label}</span>
      {sub && <span className="hi-toggle-sub">{sub}</span>}
    </span>
  </label>
);

const Kpi = ({ icon, label, value, sub, tone }) => (
  <div className="hi-kpi" style={{ '--tone': tone || 'var(--primary)' }}>
    <div className="hi-kpi-icon"><Icon name={icon} /></div>
    <div>
      <div className="hi-kpi-value">{value}</div>
      <div className="hi-kpi-label">{label}</div>
      {sub ? <div className="hi-kpi-sub">{sub}</div> : null}
    </div>
  </div>
);

const Skeleton = ({ h = 14, w = '100%', r = 6 }) => (
  <div className="hi-skeleton" style={{ height: h, width: w, borderRadius: r }} />
);

// ── XLSX export (SheetJS, loaded only when someone downloads) ──
async function exportSheet({ run, leads, jobs }) {
  const XLSX = await import('xlsx');
  const contactRows = leads.map((l) => ({
    'Name': l.person_name || '',
    'Job title': l.person_title || '',
    'ICP role': l.icp_role || '',
    'Email': l.email || '',
    'Email status': l.email_status || '',
    'Phone': l.phone || '',
    'Contact found via': l.contact_source || '',
    'Revealed': l.enriched_at ? 'Yes' : 'No',
    'Company': l.company_name,
    'Headcount': l.size_label || (l.company_size ?? ''),
    'Headcount verified': l.size_status === 'verified' ? 'Yes' : 'No',
    'City': l.company_city || '',
    'Hiring for': (l.hiring_for || []).join('; '),
    'Job link(s)': (l.job_links || []).filter(Boolean).join('\n'),
    'Employment type': (l.employment_types || []).join(', '),
    'Category': (l.categories || []).join(', '),
    'Personal LinkedIn': l.linkedin_url || '',
    'Company website': l.company_website || '',
    'Company LinkedIn': l.company_linkedin || '',
    'Company phone': l.company_phone || '',
    'New company': l.is_new_company ? 'Yes' : 'No',
    'In CRM': l.crm_lead_id ? 'Yes' : 'No',
  }));
  const jobRows = jobs.map((j) => ({
    'Company': j.company_name,
    'Role': j.title,
    'Category': j.category || '',
    'Employment type': j.employment_type || '',
    'Location': j.location || '',
    'Posted': j.posted_at || '',
    'First seen': j.first_seen_at ? j.first_seen_at.slice(0, 10) : '',
    'New': j.is_new ? 'Yes' : 'No',
    'Job link': j.job_url || '',
    'Other links': (j.other_urls || []).join('\n'),
    'Sources': (j.sources || []).join(', '),
  }));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(contactRows.length ? contactRows : [{ Name: 'No contacts in this view' }]);
  ws1['!cols'] = [22, 26, 11, 28, 12, 16, 16, 9, 26, 22, 10, 12, 50, 50, 18, 24, 36, 28, 36, 16, 11, 8].map((wch) => ({ wch }));
  const ws2 = XLSX.utils.json_to_sheet(jobRows.length ? jobRows : [{ Company: 'No roles in this view' }]);
  ws2['!cols'] = [26, 40, 18, 15, 28, 11, 11, 6, 50, 50, 30].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Contacts');
  XLSX.utils.book_append_sheet(wb, ws2, 'Open roles');
  const stamp = (run?.finished_at || run?.created_at || new Date().toISOString()).slice(0, 10);
  XLSX.writeFile(wb, `hiring-intel-ireland-data-ai-${stamp}.xlsx`);
}

// ═════════════════════════════════════════════════════════════
export default function HiringIntel() {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const [config, setConfig] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [params, setParams] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState('');

  // results view state
  const [tab, setTab] = useState('contacts');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [newOnly, setNewOnly] = useState(false);
  const [emailOnly, setEmailOnly] = useState(false);
  const [showUnverified, setShowUnverified] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const toastTimer = useRef(null);
  const openSeq = useRef(0);   // ignores out-of-order responses when scans are clicked quickly
  const notify = useCallback((msg, tone = 'info') => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── data loading ──
  const openRun = useCallback(async (id) => {
    const seq = ++openSeq.current;
    setSelectedId(id);
    setSelected(new Set());
    if (!id) { setDetail(null); return; }
    setDetailLoading(true);
    try {
      const { data } = await hiringIntelAPI.getRun(id);
      if (seq === openSeq.current) {
        setDetail(data);
        // If nothing could be size-verified (e.g. Apollo unavailable), don't hide every company.
        const s = data?.run?.stats?.summary;
        if (s && s.verified_companies === 0 && (data.leads || []).length) setShowUnverified(true);
      }
    } catch (e) {
      if (seq !== openSeq.current) return;
      setDetail(null);
      if (e?.response?.status !== 404) notify(formatApiError(e), 'error');
    } finally {
      if (seq === openSeq.current) setDetailLoading(false);
    }
  }, [notify]);

  const loadRuns = useCallback(async () => {
    try {
      const { data } = await hiringIntelAPI.listRuns();
      const list = data?.runs || [];
      setRuns(list);
      setActiveId(data?.active_run_id || null);
      setLoadError('');
      return list;
    } catch (e) {
      setLoadError(formatApiError(e));
      return null;
    } finally {
      setRunsLoading(false);
    }
  }, []);

  // first load: config + runs, open the newest finished scan
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await hiringIntelAPI.getConfig();
        if (!alive) return;
        setConfig(data);
        const stored = readStoredParams();
        const merged = { ...data.defaults, ...(stored || {}) };
        // never carry a source that is no longer configured
        merged.sources = (merged.sources || []).filter((s) => data.sources?.[s]?.configured);
        if (!merged.sources.length) merged.sources = data.defaults.sources;
        setParams(merged);
      } catch (e) {
        if (alive) setLoadError(formatApiError(e));
      }
      const list = await loadRuns();
      if (!alive || !list) return;
      const firstDone = list.find((r) => !ACTIVE.includes(r.status));
      if (firstDone) openRun(firstDone.id);
    })();
    return () => { alive = false; };
  }, [loadRuns, openRun]);

  // live polling of the active scan
  useEffect(() => {
    if (!activeId) { setActiveRun(null); return undefined; }
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const { data } = await hiringIntelAPI.getRun(activeId, { include_results: false });
        if (stop) return;
        setActiveRun(data.run);
        if (!ACTIVE.includes(data.run.status)) {
          // Clearing activeId re-runs this effect's cleanup (stop = true), so everything
          // below must not be gated on `stop` — it is the hand-off to the results view.
          setActiveId(null);
          await loadRuns();
          openRun(data.run.id);
          const st = data.run.status;
          if (st === 'completed') {
            const s = data.run.stats?.summary || {};
            notify(`Scan finished — ${s.companies_count ?? data.run.companies_count} companies, ${s.contacts_count ?? data.run.contacts_count} contacts.`, 'success');
          } else if (st === 'failed') {
            notify(data.run.error || 'The scan failed.', 'error');
          } else {
            notify('Scan cancelled.', 'info');
          }
          return;
        }
      } catch (e) {
        if (stop) return;
        if (e?.response?.status === 404) { setActiveId(null); loadRuns(); return; }
      }
      timer = setTimeout(tick, 2500);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [activeId, loadRuns, openRun, notify]);

  // ── actions ──
  const updateParams = (patch) => {
    setParams((p) => {
      const next = { ...p, ...patch };
      storeParams(next);
      return next;
    });
  };

  const startScan = async () => {
    if (!params || starting || activeId) return;
    setStarting(true);
    try {
      const { data } = await hiringIntelAPI.startRun(params);
      setShowSettings(false);
      setActiveRun(data);
      setActiveId(data.id);
      await loadRuns();
      notify('Scan started — this usually takes 5 to 12 minutes. You can leave this page.', 'info');
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (e?.response?.status === 409 && d?.active_run_id) {
        setActiveId(d.active_run_id);
        notify('A scan is already running — showing its progress.', 'info');
      } else {
        notify(formatApiError(e), 'error');
      }
    } finally {
      setStarting(false);
    }
  };

  const cancelScan = async () => {
    if (!activeId) return;
    setBusy('cancel');
    try {
      await hiringIntelAPI.cancelRun(activeId);
      notify('Stopping the scan…', 'info');
    } catch (e) {
      notify(formatApiError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const deleteScan = async (run) => {
    setBusy(`delete:${run.id}`);
    try {
      await hiringIntelAPI.deleteRun(run.id);
      setConfirmDelete(null);
      if (run.id === activeId) setActiveId(null);
      const list = await loadRuns();
      if (run.id === selectedId) {
        const next = (list || []).find((r) => !ACTIVE.includes(r.status));
        openRun(next ? next.id : null);
      }
      notify('Scan deleted.', 'info');
    } catch (e) {
      notify(formatApiError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const reveal = async (leadIds) => {
    if (!selectedId || !leadIds.length) return;
    setBusy('reveal');
    try {
      // the backend accepts 60 contacts per request
      const data = { revealed: 0, reused_free: 0, with_email: 0, credits_used: 0, errors: [] };
      for (let i = 0; i < leadIds.length; i += 60) {
        const { data: part } = await hiringIntelAPI.revealContacts(selectedId, leadIds.slice(i, i + 60));
        data.revealed += part.revealed || 0;
        data.reused_free += part.reused_free || 0;
        data.with_email += part.with_email || 0;
        data.credits_used += Number(part.credits_used || 0);
        data.errors = data.errors.concat(part.errors || []);
      }
      const parts = [];
      if (data.revealed) parts.push(`${data.revealed} revealed`);
      if (data.reused_free) parts.push(`${data.reused_free} already paid for earlier (free)`);
      if (data.with_email != null) parts.push(`${data.with_email} with email`);
      parts.push(`${Number(data.credits_used || 0)} Apollo credit${Number(data.credits_used) === 1 ? '' : 's'} used`);
      notify(parts.join(' · '), data.errors?.length ? 'error' : 'success');
      openRun(selectedId);
    } catch (e) {
      notify(formatApiError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const pushToCrm = async () => {
    if (!selectedId || !selected.size) return;
    setBusy('crm');
    try {
      const { data } = await hiringIntelAPI.pushToCrm(selectedId, Array.from(selected));
      const parts = [`${data.created.length} added to Leads`];
      if (data.skipped.length) parts.push(`${data.skipped.length} already there`);
      if (data.failed.length) parts.push(`${data.failed.length} failed`);
      notify(parts.join(' · '), data.failed.length ? 'error' : 'success');
      openRun(selectedId);
    } catch (e) {
      notify(formatApiError(e), 'error');
    } finally {
      setBusy('');
    }
  };

  // ── derived data for the results view ──
  const detailRun = detail?.run;
  const jobs = useMemo(() => detail?.jobs || [], [detail]);
  const leads = useMemo(() => detail?.leads || [], [detail]);

  const categories = useMemo(() => {
    const set = new Set();
    jobs.forEach((j) => { if (j.category) set.add(j.category); });
    return Array.from(set).sort();
  }, [jobs]);

  const q = search.trim().toLowerCase();
  const filteredLeads = useMemo(() => {
    const rows = leads.filter((l) => {
      if (typeFilter !== 'all' && !(l.employment_types || []).includes(typeFilter)) return false;
      if (categoryFilter !== 'all' && !(l.categories || []).includes(categoryFilter)) return false;
      if (newOnly && !l.is_new_company) return false;
      if (emailOnly && !l.email) return false;
      if (!showUnverified && l.size_status === 'unverified') return false;
      if (!q) return true;
      const hay = [l.person_name, l.person_title, l.company_name, l.email, l.company_city, ...(l.hiring_for || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    // keep the backend's company order (most active hirers first); best contact first within a company
    const order = new Map();
    leads.forEach((l) => { if (!order.has(l.company_key)) order.set(l.company_key, order.size); });
    return rows.sort((a, b) => (order.get(a.company_key) - order.get(b.company_key))
      || ((ROLE_RANK[a.icp_role] || 9) - (ROLE_RANK[b.icp_role] || 9)));
  }, [leads, typeFilter, categoryFilter, newOnly, emailOnly, showUnverified, q]);

  const unverifiedCompanies = useMemo(() => {
    const set = new Set();
    leads.forEach((l) => { if (l.size_status === 'unverified') set.add(l.company_key); });
    return set;
  }, [leads]);

  const filteredJobs = useMemo(() => jobs.filter((j) => {
    if (!showUnverified && unverifiedCompanies.has(j.company_key)) return false;
    if (typeFilter !== 'all' && j.employment_type !== typeFilter) return false;
    if (categoryFilter !== 'all' && j.category !== categoryFilter) return false;
    if (newOnly && !j.is_new) return false;
    if (!q) return true;
    return [j.title, j.company_name, j.location].filter(Boolean).join(' ').toLowerCase().includes(q);
  }).sort((a, b) => String(b.posted_at || '').localeCompare(String(a.posted_at || ''))),
  [jobs, typeFilter, categoryFilter, newOnly, q, showUnverified, unverifiedCompanies]);

  const visibleCompanyKeys = useMemo(() => {
    const keys = [];
    filteredLeads.forEach((l) => { if (!l.crm_lead_id && !keys.includes(l.company_key)) keys.push(l.company_key); });
    return keys;
  }, [filteredLeads]);

  const summary = detailRun?.stats?.summary || {};
  // contacts of the selected companies that haven't been revealed yet (what Reveal will buy)
  // Only what is VISIBLE: hidden (filtered-out) contacts are never bought.
  const revealable = useMemo(() => filteredLeads
    .filter((l) => l.person_key && !l.enriched_at && selected.has(l.company_key))
    .map((l) => l.id), [filteredLeads, selected]);

  // A filter change must not leave invisible companies selected (Reveal / Add to CRM act on the selection).
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(visibleCompanyKeys);
      const next = new Set([...prev].filter((k) => visible.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleCompanyKeys]);
  const filtersActive = typeFilter !== 'all' || categoryFilter !== 'all' || newOnly || emailOnly || !!q;
  const allVisibleSelected = visibleCompanyKeys.length > 0 && visibleCompanyKeys.every((k) => selected.has(k));

  const toggleCompany = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleCompanyKeys.forEach((k) => next.delete(k));
        return next;
      }
      return new Set([...prev, ...visibleCompanyKeys]);
    });
  };

  const copyEmails = async () => {
    const emails = Array.from(new Set(filteredLeads.map((l) => l.email).filter(Boolean)));
    if (!emails.length) { notify('No emails in this view.', 'info'); return; }
    try {
      await navigator.clipboard.writeText(emails.join('; '));
      notify(`${emails.length} email(s) copied.`, 'success');
    } catch {
      notify('Your browser blocked clipboard access.', 'error');
    }
  };

  const download = async () => {
    setBusy('xlsx');
    try {
      const companyKeys = new Set(filteredLeads.map((l) => l.company_key));
      await exportSheet({
        run: detailRun,
        leads: filteredLeads,
        jobs: tab === 'roles' ? filteredJobs : jobs.filter((j) => companyKeys.has(j.company_key)),
      });
    } catch {
      notify('Could not build the spreadsheet.', 'error');
    } finally {
      setBusy('');
    }
  };

  const resetFilters = () => {
    setSearch(''); setTypeFilter('all'); setCategoryFilter('all'); setNewOnly(false); setEmailOnly(false);
    setShowUnverified(false);
  };

  // credit estimate shown before a scan
  const creditHint = useMemo(() => {
    if (!params) return '';
    const paid = (params.apollo_company_lookups || 0) + (params.sources.includes('apollo_discovery') ? 2 : 0);
    return paid
      ? `This scan may use up to ${paid} Apollo credit${paid === 1 ? '' : 's'} on company lookups. Names & emails are only bought when you click Reveal (≈1 credit each).`
      : 'This scan uses 0 Apollo credits. Names & emails are only bought when you click Reveal (≈1 credit each); anything revealed in the last 5 scans is reused free.';
  }, [params]);

  const apolloReady = !!config?.integrations?.apollo;
  const isActive = !!activeId;
  const activeStageIdx = activeRun ? STAGES.findIndex((s) => s.key === activeRun.stage) : -1;

  // ═════════════════════════════ render ═════════════════════════════
  return (
    <div className="hi-page">
      <style>{HI_CSS}</style>

      {/* ── Header ── */}
      <div className="page-header" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="hi-eyebrow"><Icon name="radar" style={{ fontSize: '0.9rem' }} /> Sales · Prospecting</div>
          <h1 className="headline-sm" style={{ margin: 0 }}>Hiring Intel</h1>
          <p className="hi-subtitle">
            Irish companies under 100 people hiring Data &amp; AI talent right now, with the CEO, CTO, founder or data
            lead to call.
          </p>
        </div>
        <div className="hi-header-actions">
          <button className="btn-secondary" onClick={() => setShowSettings((v) => !v)} disabled={!params}
                  aria-expanded={showSettings}>
            <Icon name="tune" /> {isMobile ? '' : 'Scan settings'}
          </button>
          <button className="btn-primary hi-run-btn" onClick={startScan} disabled={!params || starting || isActive}>
            {isActive ? <><Icon name="autorenew" style={{ animation: 'hi-spin 1s linear infinite' }} /> Scan running</>
              : starting ? <><Icon name="hourglass_top" /> Starting…</>
                : <><Icon name="play_arrow" filled /> Run scan</>}
          </button>
        </div>
      </div>

      {/* ── Source readiness ── */}
      {config && (
        <div className="hi-sources">
          {Object.entries(SOURCE_META).filter(([key]) => key !== 'apollo_discovery').map(([key, meta]) => {
            const cfg = config.sources?.[key];
            const on = cfg?.configured;
            const used = params?.sources?.includes(key);
            return (
              <div key={key} className={`hi-source${on ? '' : ' is-off'}`}
                   title={on ? (used ? 'Included in the next scan' : 'Turned off in scan settings')
                     : `Optional: set ${cfg?.setup || 'its key'} on the backend Space`}>
                <span className="hi-dot" style={{ background: on ? (used ? '#16A34A' : '#9CA3AF') : '#D1D5DB' }} />
                <Icon name={meta.icon} style={{ fontSize: '1rem' }} />
                <span>{meta.label}</span>
                {!on && <span className="hi-source-note">not set up</span>}
              </div>
            );
          })}
          <div className={`hi-source${apolloReady ? '' : ' is-off'}`}
               title="Apollo people search is free; credits are spent only when you click Reveal">
            <span className="hi-dot" style={{ background: apolloReady ? '#16A34A' : '#D1D5DB' }} />
            <Icon name="person_search" style={{ fontSize: '1rem' }} />
            <span>Apollo · free search, paid reveal</span>
          </div>
          {config.integrations?.serper && (
            <div className="hi-source" title="Google search finds company websites and founders' LinkedIn profiles">
              <span className="hi-dot" style={{ background: '#16A34A' }} />
              <Icon name="travel_explore" style={{ fontSize: '1rem' }} /><span>Google search</span>
            </div>
          )}
          {(config.blocked_boards || []).length > 0 && (
            <div className="hi-source is-off" title={config.blocked_boards.map((b) => `${b.name}: ${b.reason} — covered via ${b.covered_by}`).join('\n')}>
              <Icon name="block" style={{ fontSize: '1rem' }} />
              <span>{config.blocked_boards.map((b) => b.name).join(', ')}</span>
              <span className="hi-source-note">block bots · covered via CareerJet & Indeed</span>
            </div>
          )}
        </div>
      )}

      {config && !apolloReady && (
        <div className="hi-banner hi-banner-warn">
          <Icon name="key_off" />
          <div>
            <strong>Apollo isn't connected.</strong> Scans still find roles and website contacts, but headcount checks and
            Reveal need <code>APOLLO_API_KEY</code> in the backend Space secrets.
          </div>
        </div>
      )}

      {loadError && (
        <div className="hi-banner hi-banner-error">
          <Icon name="error" />
          <div>{loadError}</div>
        </div>
      )}

      {/* ── Settings ── */}
      {showSettings && params && (
        <div className="hi-card hi-settings hi-fade">
          <div className="hi-settings-grid">
            <section>
              <h3 className="hi-h3">Roles</h3>
              <div className="hi-field-label">Posted within</div>
              <div className="hi-segment" role="radiogroup" aria-label="Posted within">
                {DAYS_OPTIONS.map((o) => (
                  <button key={o.v} role="radio" aria-checked={params.days_back === o.v}
                          className={params.days_back === o.v ? 'on' : ''}
                          onClick={() => updateParams({ days_back: o.v })}>{o.l}</button>
                ))}
              </div>
              <div className="hi-field-label" style={{ marginTop: '0.875rem' }}>Employment type</div>
              <div className="hi-chip-row">
                {['Permanent', 'Contract'].map((t) => {
                  const on = params.employment_types.includes(t);
                  return (
                    <button key={t} className={`hi-pick${on ? ' on' : ''}`}
                            onClick={() => {
                              const next = on ? params.employment_types.filter((x) => x !== t) : [...params.employment_types, t];
                              if (next.length) updateParams({ employment_types: next });
                            }}>
                      <Icon name={on ? 'check_box' : 'check_box_outline_blank'} style={{ fontSize: '1rem' }} /> {t}
                    </button>
                  );
                })}
              </div>
              <Toggle checked={params.include_unspecified_type} onChange={(v) => updateParams({ include_unspecified_type: v })}
                      label="Include roles with no stated type" sub="Many careers pages don't say permanent or contract" />
              <div className="hi-field-label" style={{ marginTop: '0.875rem' }}>Extra search keywords</div>
              <input className="input" placeholder="e.g. dbt, Databricks, data platform"
                     key={(params.extra_keywords || []).join('|')}
                     defaultValue={(params.extra_keywords || []).join(', ')}
                     onBlur={(e) => updateParams({ extra_keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8) })} />
            </section>

            <section>
              <h3 className="hi-h3">Companies</h3>
              <Toggle checked={params.hq_ireland_only} onChange={(v) => updateParams({ hq_ireland_only: v })}
                      label="Irish-headquartered only" sub="Off = also foreign start-ups hiring in Ireland" />
              <div className="hi-field-label" style={{ marginTop: '0.875rem' }}>Sources</div>
              <div className="hi-chip-row">
                {Object.entries(SOURCE_META).map(([key, meta]) => {
                  const configured = config?.sources?.[key]?.configured;
                  const on = params.sources.includes(key);
                  return (
                    <button key={key} className={`hi-pick${on ? ' on' : ''}`} disabled={!configured}
                            title={configured ? '' : 'Not configured on the backend'}
                            onClick={() => {
                              const next = on ? params.sources.filter((x) => x !== key) : [...params.sources, key];
                              if (next.length) updateParams({ sources: next });
                            }}>
                      <Icon name={meta.icon} style={{ fontSize: '1rem' }} /> {meta.label}
                    </button>
                  );
                })}
              </div>
              <p className="hi-note"><Icon name="shield" style={{ fontSize: '0.9rem' }} /> Recruitment agencies and JM Data
                Talent itself are always excluded.</p>
            </section>

            <section>
              <h3 className="hi-h3">Contacts &amp; credits</h3>
              <div className="hi-number-row">
                <label>
                  <span className="hi-field-label">Max companies</span>
                  <input className="input" type="number" min={5} max={150} value={params.max_companies}
                         onChange={(e) => updateParams({ max_companies: Math.max(5, Math.min(150, Number(e.target.value) || 5)) })} />
                </label>
                <label>
                  <span className="hi-field-label">Contacts / company</span>
                  <input className="input" type="number" min={1} max={5} value={params.contacts_per_company}
                         onChange={(e) => updateParams({ contacts_per_company: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: '0.75rem' }}>
                <span className="hi-field-label">Paid Apollo company lookups</span>
                <input className="input" type="number" min={0} max={100} value={params.apollo_company_lookups || 0}
                       onChange={(e) => updateParams({ apollo_company_lookups: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                <span className="hi-toggle-sub">0 = free checks only. Above 0, companies with no website found are looked up by name (1 credit each).</span>
              </label>
              <p className="hi-note"><Icon name="toll" style={{ fontSize: '0.9rem' }} /> {creditHint}</p>
            </section>
          </div>
          <div className="hi-settings-foot">
            <span className="hi-muted">Settings are remembered on this device.</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-ghost" onClick={() => {
                updateParams({ ...config.defaults });
              }}>Reset to defaults</button>
              <button className="btn-primary" onClick={startScan} disabled={starting || isActive}>
                <Icon name="play_arrow" filled /> Run scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live scan ── */}
      {isActive && activeRun && (
        <div className="hi-card hi-live hi-fade">
          <div className="hi-live-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
              <span className="hi-pulse" />
              <div style={{ minWidth: 0 }}>
                <div className="hi-live-title">Scan in progress</div>
                <div className="hi-muted">Started {fmtAgo(activeRun.started_at || activeRun.created_at)} by {activeRun.triggered_by_name || 'someone'}
                  {activeRun.stats?.elapsed_seconds ? ` · ${fmtDuration(activeRun.stats.elapsed_seconds)} elapsed` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="hi-live-pct">{activeRun.progress || 0}%</span>
              <button className="btn-secondary" onClick={cancelScan} disabled={busy === 'cancel' || activeRun.cancel_requested}>
                <Icon name="stop_circle" /> {activeRun.cancel_requested ? 'Stopping…' : 'Cancel'}
              </button>
            </div>
          </div>
          <div className="hi-progress"><div style={{ width: `${Math.max(3, activeRun.progress || 0)}%` }} /></div>
          <ol className="hi-stepper">
            {STAGES.map((s, i) => {
              const state = activeStageIdx > i ? 'done' : activeStageIdx === i ? 'now' : 'todo';
              return (
                <li key={s.key} className={`is-${state}`}>
                  <span className="hi-step-icon"><Icon name={state === 'done' ? 'check' : s.icon} style={{ fontSize: '1rem' }} /></span>
                  <span className="hi-step-text">
                    <span className="hi-step-label">{s.label}</span>
                    {!isMobile && <span className="hi-step-hint">{s.hint}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="hi-feed" aria-live="polite">
            {(activeRun.events || []).slice(-6).reverse().map((e, i) => (
              <div key={`${e.t}-${i}`} className={`hi-feed-row lvl-${e.level}`}>
                <span className="hi-feed-time">{new Date(e.t).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span>{e.msg}</span>
              </div>
            ))}
            {!(activeRun.events || []).length && <div className="hi-feed-row"><span>Waiting for the server…</span></div>}
          </div>
        </div>
      )}

      {/* ── Main: scan history + results ── */}
      <div className="hi-main">
        <aside className="hi-history">
          <div className="hi-history-head">
            <h3 className="hi-h3" style={{ margin: 0 }}>Recent scans</h3>
            <span className="hi-muted" title="Older scans are deleted automatically to save space">Last {config?.max_runs_kept || 5} kept</span>
          </div>
          {runsLoading && [0, 1, 2].map((i) => <div key={i} className="hi-run"><Skeleton h={12} w="60%" /><Skeleton h={10} w="80%" /></div>)}
          {!runsLoading && runs.length === 0 && (
            <div className="hi-empty-small">
              <Icon name="history" style={{ fontSize: '1.5rem', opacity: 0.4 }} />
              <span>No scans yet</span>
            </div>
          )}
          <div className="hi-history-list">
            {runs.map((r) => {
              const isSel = r.id === selectedId;
              const running = ACTIVE.includes(r.status);
              return (
                <div key={r.id} role="button" tabIndex={0}
                     className={`hi-run${isSel ? ' is-selected' : ''}${running ? ' is-running' : ''}`}
                     onClick={() => (running ? null : openRun(r.id))}
                     onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !running) openRun(r.id); }}>
                  <div className="hi-run-top">
                    <span className="hi-run-date">{fmtWhen(r.created_at)}</span>
                    <StatusChip status={r.status} />
                  </div>
                  {running ? (
                    <div className="hi-run-progress"><div style={{ width: `${Math.max(3, r.progress || 0)}%` }} /></div>
                  ) : r.status === 'completed' ? (
                    <div className="hi-run-stats">
                      <span><strong>{r.companies_count}</strong> companies</span>
                      <span><strong>{r.jobs_count}</strong> roles</span>
                      <span><strong>{r.contacts_count}</strong> contacts</span>
                    </div>
                  ) : (
                    <div className="hi-run-error" title={r.error || ''}>{r.error || 'Stopped before saving results.'}</div>
                  )}
                  <div className="hi-run-foot">
                    <span>{r.triggered_by_name || '—'}{runDuration(r) ? ` · ${runDuration(r)}` : ''}</span>
                    {!running && (
                      <button className="hi-icon-btn" title="Delete scan" aria-label="Delete scan"
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete(r); }}>
                        <Icon name="delete" style={{ fontSize: '1rem' }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="hi-results">
          {!selectedId && !runsLoading && (
            <div className="hi-card hi-empty">
              <div className="hi-empty-art"><Icon name="radar" style={{ fontSize: '2.25rem' }} /></div>
              <h3>{runs.length ? 'Pick a scan on the left' : 'Run your first scan'}</h3>
              <p>
                We'll look across LinkedIn, Indeed, CareerJet, JobsIreland and company websites for Data &amp; AI roles
                in Ireland at companies under 100 people, then find who to call — without spending Apollo credits
                until you choose to reveal a contact.
              </p>
              {!runs.length && (
                <button className="btn-primary" onClick={startScan} disabled={!params || starting || isActive}>
                  <Icon name="play_arrow" filled /> Run scan
                </button>
              )}
            </div>
          )}

          {selectedId && detailLoading && !detail && (
            <div className="hi-card"><Skeleton h={18} w="40%" /><div style={{ height: 12 }} /><Skeleton h={60} /><div style={{ height: 12 }} /><Skeleton h={220} /></div>
          )}

          {detailRun && (
            <div className={detailLoading ? 'hi-dim' : ''}>
              <div className="hi-results-head">
                <div>
                  <div className="hi-h3" style={{ margin: 0 }}>Scan of {fmtWhen(detailRun.created_at)}</div>
                  <div className="hi-muted">
                    Last {detailRun.params?.days_back} day(s) · {(detailRun.params?.employment_types || []).join(' & ')}
                    {detailRun.params?.hq_ireland_only ? ' · Irish HQ' : ''} · &lt;{(detailRun.params?.max_headcount || 99) + 1} staff
                    {runDuration(detailRun) ? ` · took ${runDuration(detailRun)}` : ''}
                  </div>
                </div>
                <StatusChip status={detailRun.status} />
              </div>

              {detailRun.status === 'failed' && (
                <div className="hi-banner hi-banner-error"><Icon name="error" /><div>{detailRun.error || 'This scan failed.'}</div></div>
              )}
              {(detailRun.stats?.warnings || []).length > 0 && (
                <div className="hi-banner hi-banner-warn">
                  <Icon name="warning" />
                  <div>{detailRun.stats.warnings.map((w) => <div key={w}>{w}</div>)}</div>
                </div>
              )}

              {detailRun.status === 'completed' && (
                <>
                  <div className="hi-kpis">
                    <Kpi icon="apartment" label="Companies hiring" value={detailRun.companies_count}
                         sub={summary.new_companies != null ? `${summary.new_companies} new since last scan` : null} />
                    <Kpi icon="work" label="Open Data & AI roles" value={detailRun.jobs_count} tone="#7C3AED"
                         sub={summary.new_jobs != null ? `${summary.new_jobs} new` : null} />
                    <Kpi icon="verified" label="Confirmed under 100 staff" value={summary.verified_companies ?? '—'} tone="#15803D"
                         sub={summary.verified_companies != null ? `${detailRun.companies_count - summary.verified_companies} unverified` : null} />
                    <Kpi icon="badge" label="Decision-makers" value={detailRun.contacts_count} tone="#006243"
                         sub={summary.with_linkedin != null ? `${summary.with_linkedin} with LinkedIn` : null} />
                    <Kpi icon="mail" label="Revealed · with email" value={`${summary.revealed ?? 0} · ${summary.with_email ?? 0}`} tone="#0891B2"
                         sub={summary.to_reveal ? `${summary.to_reveal} still to reveal` : null} />
                  </div>

                  <FunnelNote stats={detailRun.stats} />

                  <div className="hi-toolbar">
                    <div className="hi-tabs" role="tablist">
                      <button role="tab" aria-selected={tab === 'contacts'} className={tab === 'contacts' ? 'on' : ''}
                              onClick={() => setTab('contacts')}>
                        <Icon name="contacts" style={{ fontSize: '1rem' }} /> Contacts sheet <span className="hi-count">{filteredLeads.length}</span>
                      </button>
                      <button role="tab" aria-selected={tab === 'roles'} className={tab === 'roles' ? 'on' : ''}
                              onClick={() => setTab('roles')}>
                        <Icon name="work" style={{ fontSize: '1rem' }} /> Open roles <span className="hi-count">{filteredJobs.length}</span>
                      </button>
                    </div>
                    <div className="hi-toolbar-actions">
                      {tab === 'contacts' && apolloReady && (
                        <button className="btn-secondary" onClick={() => reveal(revealable)} disabled={!revealable.length || busy === 'reveal'}
                                title="Buys full name + work email from Apollo for the contacts of the selected companies (≈1 credit each; free if already revealed in a kept scan)">
                          <Icon name="lock_open" /> {busy === 'reveal' ? 'Revealing…'
                            : revealable.length ? `Reveal ${revealable.length} · ≈${revealable.length} credit${revealable.length === 1 ? '' : 's'}`
                              : 'Reveal (tick companies)'}
                        </button>
                      )}
                      {tab === 'contacts' && (
                        <button className="btn-ghost" onClick={copyEmails} title="Copy the emails in this view">
                          <Icon name="content_copy" /> {isMobile ? '' : 'Copy emails'}
                        </button>
                      )}
                      <button className="btn-secondary" onClick={download} disabled={busy === 'xlsx'}>
                        <Icon name="download" /> {busy === 'xlsx' ? 'Building…' : 'Download sheet'}
                      </button>
                      {tab === 'contacts' && (
                        <button className="btn-primary" onClick={pushToCrm} disabled={!selected.size || busy === 'crm'}
                                title="Create one lead per selected company, with up to 3 contacts">
                          <Icon name="person_add" /> Add {selected.size || ''} to CRM
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="hi-filters">
                    <div className="hi-search">
                      <Icon name="search" style={{ fontSize: '1rem', color: 'var(--on-surface-variant)' }} />
                      <input placeholder={tab === 'contacts' ? 'Search name, company, role, email…' : 'Search role, company, location…'}
                             value={search} onChange={(e) => setSearch(e.target.value)} />
                      {search && <button className="hi-icon-btn" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" style={{ fontSize: '1rem' }} /></button>}
                    </div>
                    <div className="hi-segment small">
                      {['all', 'Permanent', 'Contract'].map((t) => (
                        <button key={t} className={typeFilter === t ? 'on' : ''} onClick={() => setTypeFilter(t)}>
                          {t === 'all' ? 'All types' : t}
                        </button>
                      ))}
                    </div>
                    <select className="select hi-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                      <option value="all">All categories</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className={`hi-pick${newOnly ? ' on' : ''}`} onClick={() => setNewOnly((v) => !v)}>
                      <Icon name="fiber_new" style={{ fontSize: '1rem' }} /> New only
                    </button>
                    {tab === 'contacts' && (
                      <button className={`hi-pick${emailOnly ? ' on' : ''}`} onClick={() => setEmailOnly((v) => !v)}>
                        <Icon name="alternate_email" style={{ fontSize: '1rem' }} /> Has email
                      </button>
                    )}
                    <button className={`hi-pick${showUnverified ? ' on' : ''}`} onClick={() => setShowUnverified((v) => !v)}
                            title="Companies whose headcount no free source could confirm">
                      <Icon name="help" style={{ fontSize: '1rem' }} /> Include unverified size
                    </button>
                    {filtersActive && <button className="btn-ghost" onClick={resetFilters}>Clear</button>}
                  </div>

                  {tab === 'contacts' ? (
                    <ContactsTable rows={filteredLeads} selected={selected} onToggle={toggleCompany}
                                   allSelected={allVisibleSelected} onToggleAll={toggleAllVisible}
                                   selectable={visibleCompanyKeys.length > 0}
                                   onOpenLead={(id) => navigate(`/sales/leads/${id}`)}
                                   onReveal={reveal} canReveal={apolloReady} revealing={busy === 'reveal'} />
                  ) : (
                    <RolesTable rows={filteredJobs} />
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ── Delete confirmation ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal hi-confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="hi-confirm-icon"><Icon name="delete" /></div>
            <h3>Delete this scan?</h3>
            <p>
              {confirmDelete.status !== 'completed'
                ? `This ${confirmDelete.status} scan from ${fmtWhen(confirmDelete.created_at)} will be removed.`
                : `The ${confirmDelete.companies_count} companies, ${confirmDelete.jobs_count} roles and ${confirmDelete.contacts_count} contacts from ${fmtWhen(confirmDelete.created_at)} will be removed. Leads you already added to the CRM stay.`}
            </p>
            <div className="hi-confirm-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Keep it</button>
              <button className="btn-primary hi-danger" disabled={busy === `delete:${confirmDelete.id}`}
                      onClick={() => deleteScan(confirmDelete)}>
                <Icon name="delete" /> Delete scan
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`hi-toast tone-${toast.tone}`} role="status">
          <Icon name={toast.tone === 'success' ? 'check_circle' : toast.tone === 'error' ? 'error' : 'info'} />
          <span>{toast.msg}</span>
          <button className="hi-icon-btn" onClick={() => setToast(null)} aria-label="Dismiss"><Icon name="close" style={{ fontSize: '1rem' }} /></button>
        </div>
      )}
    </div>
  );
}

// ── "How this scan filtered" — makes every number traceable ──
function FunnelNote({ stats }) {
  const [open, setOpen] = useState(false);
  if (!stats) return null;
  const f = stats.filtered || {};
  const a = stats.apollo || {};
  const sources = stats.sources || {};
  const rows = [
    ['Not a Data / AI title', f.not_data_ai],
    ['Outside the Republic of Ireland', f.not_ireland],
    ['Northern Ireland', f.northern_ireland],
    ['Part-time / internship / type not wanted', f.employment_type],
    ['Recruitment agency', f.agency],
    ['100+ employees', f.headcount_too_big],
    ['Kept, but headcount unverified', f.headcount_unverified],
    ['HQ outside Ireland', f.hq_outside_ireland],
    ['HQ location unknown', f.hq_unknown],
    ['Posted before the time window', f.older_than_window],
    ['No matching open role after checking', f.no_qualifying_jobs],
    ['Over the company cap', f.over_company_cap],
  ].filter(([, v]) => v);
  return (
    <div className="hi-funnel">
      <button className="hi-funnel-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name={open ? 'expand_less' : 'expand_more'} /> How this scan found and filtered results
      </button>
      {open && (
        <div className="hi-funnel-body hi-fade">
          <div>
            <div className="hi-field-label">Sources</div>
            {Object.entries(sources).map(([name, s]) => {
              const st = SOURCE_STATUS[s.status] || SOURCE_STATUS.ok;
              return (
                <div key={name} className="hi-funnel-row" title={s.note || ''}>
                  <span>{name}</span>
                  <span>
                    <span className="hi-muted">
                      {s.status === 'not_configured' ? (s.note || 'not set up')
                        : `${s.jobs || 0} roles${s.companies ? ` · ${s.companies} cos` : ''}`}
                    </span>{' '}
                    {s.status !== 'not_configured' && <strong style={{ color: st.tone }}>{st.label}</strong>}
                  </span>
                </div>
              );
            })}
          </div>
          <div>
            <div className="hi-field-label">Filtered out</div>
            {rows.length ? rows.map(([label, v]) => (
              <div key={label} className="hi-funnel-row"><span>{label}</span><strong>{v}</strong></div>
            )) : <div className="hi-muted">Nothing was filtered out.</div>}
          </div>
          <div>
            <div className="hi-field-label">Apollo usage</div>
            <div className="hi-funnel-row"><span>People searches (free)</span><strong>{a.people_search_calls || 0}</strong></div>
            <div className="hi-funnel-row"><span>Paid company lookups / discovery</span><strong>{(a.search_calls || 0) + (a.lookup_calls || 0)}</strong></div>
            <div className="hi-funnel-row"><span>Contacts already revealed earlier (free)</span><strong>{a.contacts_reused || 0}</strong></div>
            <div className="hi-funnel-row"><span>Credits spent on Reveal</span><strong>{Number(a.reveal_credits || 0).toLocaleString('en-IE')}</strong></div>
            {stats.serper_queries ? <div className="hi-funnel-row"><span>Google searches (Serper)</span><strong>{stats.serper_queries}</strong></div> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsTable({ rows, selected, onToggle, allSelected, onToggleAll, selectable, onOpenLead, onReveal, canReveal, revealing }) {
  if (!rows.length) {
    return <div className="hi-card hi-empty-small" style={{ padding: '2rem' }}><Icon name="filter_alt_off" /> Nothing matches these filters.</div>;
  }
  let prevCompany = null;
  return (
    <div className="hi-table-wrap">
      <table className="hi-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input type="checkbox" checked={allSelected} disabled={!selectable} onChange={onToggleAll}
                     aria-label="Select all companies in view" />
            </th>
            <th>Name</th>
            <th>Email</th>
            <th>Found via</th>
            <th>Company</th>
            <th>Hiring for</th>
            <th>Job link</th>
            <th>LinkedIn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const firstOfCompany = l.company_key !== prevCompany;
            prevCompany = l.company_key;
            const roles = l.hiring_for || [];
            // job_links is index-aligned with hiring_for; pair them before dropping empty links
            const roleLinks = roles.map((role, i) => ({ role, url: (l.job_links || [])[i] })).filter((x) => x.url);
            return (
              <tr key={l.id} className={firstOfCompany ? 'is-group-start' : 'is-group-cont'}>
                <td>
                  {firstOfCompany && (l.crm_lead_id
                    ? <button className="hi-icon-btn" title="Open in CRM" onClick={() => onOpenLead(l.crm_lead_id)}><Icon name="verified" filled style={{ color: '#006633', fontSize: '1.1rem' }} /></button>
                    : <input type="checkbox" checked={selected.has(l.company_key)} onChange={() => onToggle(l.company_key)}
                             aria-label={`Select ${l.company_name}`} />)}
                </td>
                <td>
                  {l.person_name ? (
                    <div className="hi-person">
                      <div className="hi-avatar" style={{ background: `${ROLE_TONE[l.icp_role] || '#4468B0'}18`, color: ROLE_TONE[l.icp_role] || '#4468B0' }}>
                        {(l.person_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="hi-strong">
                          {l.person_name}
                          {l.name_hidden && <Icon name="lock" style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)' }} />}
                        </div>
                        <div className="hi-sub" title={l.person_title || ''}>{l.person_title}</div>
                        {l.icp_role && <Tag tone={ROLE_TONE[l.icp_role]}>{l.icp_role}</Tag>}
                      </div>
                    </div>
                  ) : (
                    <span className="hi-muted hi-italic">No CEO / CTO / founder / data head found</span>
                  )}
                </td>
                <td>
                  {l.email ? (
                    <a className="hi-link" href={`mailto:${l.email}`} title={l.email_status ? `Apollo: ${l.email_status}` : ''}>
                      {l.email}
                      {l.email_status === 'verified' && <Icon name="verified" filled style={{ fontSize: '0.875rem', color: '#16A34A', marginLeft: 4 }} />}
                    </a>
                  ) : l.person_key && !l.enriched_at && canReveal ? (
                    <button className="hi-reveal" onClick={() => onReveal([l.id])} disabled={revealing}
                            title="Buy full name + work email from Apollo (≈1 credit; free if Apollo has nothing)">
                      <Icon name="lock_open" style={{ fontSize: '0.875rem' }} /> Reveal
                    </button>
                  ) : l.enriched_at ? <span className="hi-muted" title="Apollo has no email for this person">not found</span>
                    : <span className="hi-muted">—</span>}
                </td>
                <td className="hi-nowrap">
                  {l.contact_source ? <Tag tone={SOURCE_TONE[l.contact_source] || '#6B7280'}>{l.contact_source}</Tag>
                    : <span className="hi-muted">—</span>}
                  {l.phone && <div><a className="hi-link" href={`tel:${l.phone}`}>{l.phone}</a></div>}
                </td>
                <td>
                  {firstOfCompany ? (
                    <div>
                      <div className="hi-strong">
                        {l.company_name}
                        {l.is_new_company && <span className="hi-new">NEW</span>}
                      </div>
                      <div className="hi-sub">
                        {[l.size_label || (l.company_size ? `${l.company_size} staff` : null), l.company_city].filter(Boolean).join(' · ')}
                      </div>
                      {l.size_status === 'verified' && <Tag tone="#15803D" title="Headcount confirmed under 100">size verified</Tag>}
                      {l.size_status === 'unverified' && <Tag tone="#B45309" title="No free source could confirm the headcount">size unverified</Tag>}
                      <div className="hi-icons">
                        {l.company_website && <a href={l.company_website} target="_blank" rel="noreferrer" title={hostOf(l.company_website)}><Icon name="language" style={{ fontSize: '1rem' }} /></a>}
                        {l.company_linkedin && <a href={l.company_linkedin} target="_blank" rel="noreferrer" title="Company LinkedIn"><Icon name="corporate_fare" style={{ fontSize: '1rem' }} /></a>}
                      </div>
                    </div>
                  ) : <span className="hi-muted hi-ditto">{l.company_name}</span>}
                </td>
                <td style={{ minWidth: 200 }}>
                  {firstOfCompany ? (
                    <div className="hi-roles">
                      {roles.slice(0, 3).map((r) => <span key={r} className="hi-role">{r}</span>)}
                      {roles.length > 3 && <span className="hi-role more" title={roles.slice(3).join('\n')}>+{roles.length - 3} more</span>}
                      <div className="hi-type-row">
                        {(l.employment_types || []).map((t) => <Tag key={t} tone={TYPE_TONE[t]}>{t}</Tag>)}
                      </div>
                    </div>
                  ) : <span className="hi-muted hi-ditto">same roles</span>}
                </td>
                <td className="hi-nowrap">
                  {firstOfCompany && roleLinks.length > 0 ? (
                    <div className="hi-links">
                      {roleLinks.slice(0, 3).map(({ role, url }, i) => (
                        <a key={`${i}-${url}`} href={url} target="_blank" rel="noreferrer" className="hi-linkchip" title={`${role} — ${hostOf(url)}`}>
                          <Icon name="open_in_new" style={{ fontSize: '0.875rem' }} /> {hostOf(url).replace('linkedin.com', 'LinkedIn').split('.')[0]}
                        </a>
                      ))}
                    </div>
                  ) : firstOfCompany ? <span className="hi-muted">—</span> : null}
                </td>
                <td>
                  {l.linkedin_url
                    ? <a href={l.linkedin_url} target="_blank" rel="noreferrer" className="hi-li" title="Personal LinkedIn">in</a>
                    : <span className="hi-muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RolesTable({ rows }) {
  if (!rows.length) {
    return <div className="hi-card hi-empty-small" style={{ padding: '2rem' }}><Icon name="filter_alt_off" /> Nothing matches these filters.</div>;
  }
  return (
    <div className="hi-table-wrap">
      <table className="hi-table roles">
        <thead>
          <tr>
            <th>Role</th>
            <th>Company</th>
            <th>Type</th>
            <th>Location</th>
            <th>Posted</th>
            <th>Found on</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="is-group-start">
              <td>
                <div className="hi-strong">{j.title}{j.is_new && <span className="hi-new">NEW</span>}</div>
                {j.category && <Tag tone={CATEGORY_TONE[j.category] || '#4468B0'}>{j.category}</Tag>}
              </td>
              <td>{j.company_name}</td>
              <td><Tag tone={TYPE_TONE[j.employment_type] || '#6B7280'}>{j.employment_type || 'Unspecified'}</Tag></td>
              <td className="hi-sub" style={{ maxWidth: 200 }}>{j.location}</td>
              <td className="hi-nowrap" title={j.first_seen_at ? `First seen ${fmtDate(j.first_seen_at)}` : ''}>{fmtDate(j.posted_at)}</td>
              <td className="hi-sub">{(j.sources || []).join(', ')}</td>
              <td className="hi-nowrap">
                {j.job_url
                  ? <a href={j.job_url} target="_blank" rel="noreferrer" className="hi-linkchip"><Icon name="open_in_new" style={{ fontSize: '0.875rem' }} /> Open</a>
                  : <span className="hi-muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Scoped styles — prefixed hi- so nothing leaks into other pages.
const HI_CSS = `
@keyframes hi-spin { to { transform: rotate(360deg); } }
@keyframes hi-pulse { 0% { box-shadow: 0 0 0 0 rgba(68,104,176,.45); } 70% { box-shadow: 0 0 0 10px rgba(68,104,176,0); } 100% { box-shadow: 0 0 0 0 rgba(68,104,176,0); } }
@keyframes hi-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
@keyframes hi-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes hi-stripes { from { background-position: 0 0; } to { background-position: 28px 0; } }
.hi-page { font-family: var(--font-display); color: var(--on-surface); }
.hi-fade { animation: hi-fade .22s ease both; }
.hi-spin { animation: hi-spin 1s linear infinite; }
.hi-eyebrow { display:flex; align-items:center; gap:.35rem; font-family: var(--font-ui); font-size:.6875rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color: var(--primary); margin-bottom:.25rem; }
.hi-subtitle { margin:.35rem 0 0; color: var(--on-surface-variant); font-size:.875rem; max-width: 640px; }
.hi-header-actions { display:flex; gap:.5rem; align-items:center; }
.hi-run-btn { padding:.6rem 1.25rem; font-weight:600; }
.hi-run-btn:disabled, .btn-primary:disabled, .btn-secondary:disabled { opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }
.hi-sources { display:flex; flex-wrap:wrap; gap:.5rem; margin:-.75rem 0 1.25rem; }
.hi-source { display:inline-flex; align-items:center; gap:.4rem; padding:.3rem .7rem; border-radius:999px; background: var(--surface-container-lowest); border:1px solid var(--outline-variant); font-size:.75rem; font-family: var(--font-ui); color: var(--on-surface); }
.hi-source.is-off { color: var(--on-surface-variant); background: transparent; }
.hi-source-note { font-size:.6875rem; color: var(--on-surface-variant); }
.hi-dot { width:7px; height:7px; border-radius:50%; display:inline-block; }
.hi-banner { display:flex; gap:.625rem; align-items:flex-start; padding:.75rem 1rem; border-radius:.75rem; margin-bottom:1rem; font-size:.8125rem; line-height:1.45; }
.hi-banner code { background: rgba(0,0,0,.06); padding: 0 .3rem; border-radius: 4px; font-size: .75rem; }
.hi-banner-warn { background: #FFF7E6; color: #7A4A00; border:1px solid #F8DDA5; }
.hi-banner-error { background: var(--error-container); color: var(--on-error-container); border:1px solid #f5b5ae; }
.hi-card { background: var(--surface-container-lowest); border-radius: .875rem; padding: 1.25rem; box-shadow: var(--ambient-shadow); border:1px solid var(--outline-variant); margin-bottom: 1.25rem; }
.hi-h3 { font-size:.9375rem; font-weight:700; margin:0 0 .75rem; letter-spacing:-.01em; }
.hi-muted { color: var(--on-surface-variant); font-size:.75rem; }
.hi-italic { font-style: italic; }
.hi-note { display:flex; gap:.35rem; align-items:flex-start; font-size:.75rem; color: var(--on-surface-variant); margin:.75rem 0 0; line-height:1.45; }
.hi-settings-grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 1.5rem; }
.hi-settings-grid section { min-width:0; }
.hi-settings-foot { display:flex; justify-content:space-between; align-items:center; gap:.75rem; border-top:1px solid var(--outline-variant); margin-top:1.25rem; padding-top:1rem; flex-wrap:wrap; }
.hi-field-label { font-family: var(--font-ui); font-size:.6875rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color: var(--on-surface-variant); margin-bottom:.4rem; display:block; }
.hi-segment { display:inline-flex; background: var(--surface-container); border-radius:.625rem; padding:3px; gap:2px; flex-wrap:wrap; }
.hi-segment button { border:none; background:transparent; padding:.4rem .7rem; border-radius:.5rem; font-size:.8125rem; font-family: var(--font-ui); color: var(--on-surface-variant); cursor:pointer; transition: all .15s; }
.hi-segment button.on { background: var(--surface-container-lowest); color: var(--primary); font-weight:600; box-shadow: 0 1px 3px rgba(12,22,42,.12); }
.hi-segment.small button { padding:.3rem .6rem; font-size:.75rem; }
.hi-chip-row { display:flex; flex-wrap:wrap; gap:.4rem; }
.hi-pick { display:inline-flex; align-items:center; gap:.3rem; border:1px solid var(--outline-variant); background: var(--surface-container-lowest); color: var(--on-surface); border-radius:999px; padding:.3rem .7rem; font-size:.75rem; font-family: var(--font-ui); cursor:pointer; transition: all .15s; white-space:nowrap; }
.hi-pick:hover:not(:disabled) { border-color: var(--outline); }
.hi-pick.on { background: rgba(68,104,176,.1); border-color: rgba(68,104,176,.45); color: var(--primary); font-weight:600; }
.hi-pick:disabled { opacity:.45; cursor:not-allowed; }
.hi-toggle { display:flex; gap:.625rem; align-items:flex-start; margin-top:.75rem; cursor:pointer; position:relative; }
.hi-toggle input { position:absolute; opacity:0; width:1px; height:1px; }
.hi-toggle.is-disabled { opacity:.5; cursor:not-allowed; }
.hi-toggle-label { display:block; font-size:.8125rem; font-weight:600; }
.hi-toggle-sub { display:block; font-size:.72rem; color: var(--on-surface-variant); line-height:1.35; }
.hi-switch { flex-shrink:0; width:34px; height:20px; border-radius:999px; background: #CBD5E1; position:relative; transition: background .2s; margin-top:1px; }
.hi-switch span { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25); transition: transform .2s; }
.hi-switch.on { background: var(--primary); }
.hi-switch.on span { transform: translateX(14px); }
.hi-toggle input:focus-visible + span .hi-toggle-label, .hi-toggle:focus-within .hi-switch { outline: 2px solid rgba(68,104,176,.35); outline-offset: 2px; }
.hi-number-row { display:grid; grid-template-columns: 1fr 1fr; gap:.75rem; }
.hi-live { border-color: rgba(68,104,176,.35); background: linear-gradient(180deg, rgba(68,104,176,.06), var(--surface-container-lowest) 60%); }
.hi-live-head { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-bottom:.875rem; }
.hi-live-title { font-weight:700; font-size:1rem; }
.hi-live-pct { font-family: var(--font-ui); font-size:1.5rem; font-weight:500; color: var(--primary); font-variant-numeric: tabular-nums; }
.hi-pulse { width:12px; height:12px; border-radius:50%; background: var(--primary); animation: hi-pulse 1.6s infinite; flex-shrink:0; }
.hi-progress, .hi-run-progress { height:8px; border-radius:999px; background: var(--surface-container-high); overflow:hidden; }
.hi-run-progress { height:5px; margin:.5rem 0; }
.hi-progress > div, .hi-run-progress > div { height:100%; border-radius:999px; transition: width .6s ease;
  background: repeating-linear-gradient(45deg, var(--primary) 0 10px, var(--primary-container) 10px 20px); background-size: 28px 100%; animation: hi-stripes 1s linear infinite; }
.hi-stepper { list-style:none; display:grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap:.5rem; padding:0; margin:1rem 0; }
.hi-stepper li { display:flex; gap:.5rem; align-items:flex-start; min-width:0; }
.hi-step-icon { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; background: var(--surface-container); color: var(--on-surface-variant); transition: all .3s; }
.hi-stepper li.is-done .hi-step-icon { background: #DCFCE7; color:#15803D; }
.hi-stepper li.is-now .hi-step-icon { background: var(--primary); color:#fff; box-shadow: 0 0 0 4px rgba(68,104,176,.18); }
.hi-step-text { display:flex; flex-direction:column; min-width:0; }
.hi-step-label { font-size:.8125rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hi-stepper li.is-todo .hi-step-label { color: var(--on-surface-variant); font-weight:500; }
.hi-step-hint { font-size:.6875rem; color: var(--on-surface-variant); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hi-feed { background: #0C162A; color:#CBD5E1; border-radius:.625rem; padding:.625rem .875rem; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.75rem; max-height: 168px; overflow:auto; }
.hi-feed-row { display:flex; gap:.75rem; padding:.15rem 0; line-height:1.45; }
.hi-feed-row.lvl-warn { color:#FCD34D; }
.hi-feed-row.lvl-error { color:#FCA5A5; }
.hi-feed-time { color:#64748B; flex-shrink:0; }
.hi-main { display:grid; grid-template-columns: 250px minmax(0,1fr); gap:1.25rem; align-items:start; }
.hi-history { position: sticky; top: 1rem; }
.hi-results, .hi-history { min-width:0; }
.hi-page { max-width:100%; min-width:0; }
.hi-history-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:.625rem; }
.hi-history-list { display:flex; flex-direction:column; gap:.5rem; }
.hi-run { background: var(--surface-container-lowest); border:1px solid var(--outline-variant); border-radius:.75rem; padding:.75rem .875rem; cursor:pointer; transition: all .15s; display:flex; flex-direction:column; gap:.3rem; outline:none; }
.hi-run:hover { border-color: var(--outline); transform: translateY(-1px); }
.hi-run:focus-visible { box-shadow: 0 0 0 3px rgba(68,104,176,.25); }
.hi-run.is-selected { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(68,104,176,.12); }
.hi-run.is-running { cursor: default; border-style: dashed; border-color: rgba(68,104,176,.5); }
.hi-run-top { display:flex; justify-content:space-between; align-items:center; gap:.5rem; }
.hi-run-date { font-weight:600; font-size:.8125rem; }
.hi-run-stats { display:flex; gap:.6rem; font-size:.72rem; color: var(--on-surface-variant); flex-wrap:wrap; }
.hi-run-stats strong { color: var(--on-surface); font-weight:700; }
.hi-run-error { font-size:.72rem; color: var(--on-surface-variant); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hi-run-foot { display:flex; justify-content:space-between; align-items:center; font-size:.6875rem; color: var(--on-surface-variant); }
.hi-icon-btn { border:none; background:transparent; color: var(--on-surface-variant); width:26px; height:26px; border-radius:.4rem; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
.hi-icon-btn:hover { background: var(--surface-container); color: var(--error); }
.hi-chip { display:inline-flex; align-items:center; gap:.25rem; padding:.15rem .5rem; border-radius:999px; font-size:.6875rem; font-weight:600; white-space:nowrap; font-family: var(--font-ui); }
.hi-tag { display:inline-flex; align-items:center; padding:.05rem .45rem; border-radius:.35rem; font-size:.65rem; font-weight:600; border:1px solid; white-space:nowrap; margin-top:.2rem; margin-right:.25rem; }
.hi-empty { text-align:center; padding: 3rem 1.5rem; }
.hi-empty h3 { margin: .875rem 0 .35rem; font-size:1.125rem; }
.hi-empty p { color: var(--on-surface-variant); max-width: 460px; margin: 0 auto 1.25rem; font-size:.875rem; }
.hi-empty-art { width:72px; height:72px; margin:0 auto; border-radius: 22px; display:flex; align-items:center; justify-content:center; color: var(--primary); background: radial-gradient(circle at 30% 30%, rgba(68,104,176,.22), rgba(68,104,176,.06)); }
.hi-empty-small { display:flex; flex-direction:column; align-items:center; gap:.35rem; padding:1.25rem; color: var(--on-surface-variant); font-size:.8125rem; text-align:center; }
.hi-results-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom: .875rem; }
.hi-kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:.75rem; margin-bottom:.875rem; }
.hi-kpi { display:flex; gap:.7rem; align-items:center; min-width:0; background: var(--surface-container-lowest); border:1px solid var(--outline-variant); border-radius:.875rem; padding:.875rem; }
.hi-kpi-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; color: var(--tone); background: color-mix(in srgb, var(--tone) 12%, transparent); flex-shrink:0; }
.hi-kpi-value { font-size:1.375rem; font-weight:800; line-height:1.1; font-variant-numeric: tabular-nums; }
.hi-kpi-label { font-size:.72rem; color: var(--on-surface-variant); }
.hi-kpi-sub { font-size:.6875rem; color: var(--tone); font-weight:600; margin-top:.1rem; }
.hi-funnel { margin-bottom:.875rem; }
.hi-funnel-toggle { border:none; background:none; color: var(--on-surface-variant); font-size:.75rem; font-family: var(--font-ui); cursor:pointer; display:inline-flex; align-items:center; gap:.2rem; padding:.2rem 0; }
.hi-funnel-toggle:hover { color: var(--primary); }
.hi-funnel-body { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:1.25rem; background: var(--surface-container-low); border-radius:.75rem; padding: .875rem 1rem; margin-top:.4rem; }
.hi-funnel-row { display:flex; justify-content:space-between; gap:.75rem; font-size:.75rem; padding:.18rem 0; border-bottom:1px dashed var(--outline-variant); }
.hi-toolbar { display:flex; justify-content:space-between; align-items:center; gap:.75rem; flex-wrap:wrap; margin-bottom:.625rem; }
.hi-toolbar-actions { display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; }
.hi-tabs { display:inline-flex; gap:.25rem; background: var(--surface-container); padding:3px; border-radius:.7rem; }
.hi-tabs button { border:none; background:transparent; display:inline-flex; align-items:center; gap:.35rem; padding:.45rem .8rem; border-radius:.55rem; font-size:.8125rem; font-family: var(--font-ui); color: var(--on-surface-variant); cursor:pointer; }
.hi-tabs button.on { background: var(--surface-container-lowest); color: var(--on-surface); font-weight:600; box-shadow: 0 1px 3px rgba(12,22,42,.12); }
.hi-count { font-size:.6875rem; background: var(--surface-container-high); color: var(--on-surface); border-radius:999px; padding:0 .4rem; font-weight:600; }
.hi-filters { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-bottom:.75rem; }
.hi-search { display:flex; align-items:center; gap:.35rem; background: var(--surface-container-lowest); border:1px solid var(--outline-variant); border-radius:.6rem; padding:0 .25rem 0 .6rem; flex: 1 1 220px; min-width: 180px; }
.hi-search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(68,104,176,.12); }
.hi-search input { border:none; outline:none; background:transparent; padding:.45rem 0; font-size:.8125rem; flex:1; min-width:0; font-family: var(--font-display); color: var(--on-surface); }
.hi-select { width:auto; padding:.35rem .6rem; font-size:.75rem; }
.hi-table-wrap { overflow-x:auto; border:1px solid var(--outline-variant); border-radius:.875rem; background: var(--surface-container-lowest); }
.hi-table { width:100%; min-width: 1080px; border-collapse:collapse; font-size:.8125rem; }
.hi-table.roles { min-width: 860px; }
.hi-table thead th { position: sticky; top:0; background: var(--surface-container-low); text-align:left; font-family: var(--font-ui); font-size:.6875rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color: var(--on-surface-variant); padding:.6rem .75rem; white-space:nowrap; border-bottom:1px solid var(--outline-variant); }
.hi-table td { padding:.65rem .75rem; vertical-align:top; }
.hi-table tr.is-group-start td { border-top:1px solid var(--outline-variant); }
.hi-table tbody tr:first-child td { border-top:none; }
.hi-table tbody tr:hover td { background: var(--surface-container-low); }
.hi-person { display:flex; gap:.6rem; align-items:flex-start; min-width: 190px; }
.hi-avatar { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.72rem; flex-shrink:0; }
.hi-strong { font-weight:600; display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; }
.hi-sub { font-size:.72rem; color: var(--on-surface-variant); max-width: 240px; overflow:hidden; text-overflow:ellipsis; }
.hi-ditto { font-size:.72rem; opacity:.55; }
.hi-new { font-size:.58rem; font-weight:800; letter-spacing:.06em; color:#fff; background: linear-gradient(135deg, #16A34A, #059669); padding:.05rem .35rem; border-radius:.3rem; }
.hi-link { color: var(--primary); text-decoration:none; white-space:nowrap; display:inline-flex; align-items:center; }
.hi-link:hover { text-decoration:underline; }
.hi-nowrap { white-space:nowrap; }
.hi-icons { display:flex; gap:.35rem; margin-top:.25rem; }
.hi-icons a { color: var(--on-surface-variant); }
.hi-icons a:hover { color: var(--primary); }
.hi-roles { display:flex; flex-wrap:wrap; gap:.25rem; }
.hi-role { font-size:.72rem; background: var(--surface-container); border-radius:.4rem; padding:.12rem .45rem; }
.hi-role.more { background: transparent; color: var(--primary); font-weight:600; cursor:help; }
.hi-type-row { width:100%; }
.hi-links { display:flex; flex-direction:column; gap:.25rem; align-items:flex-start; }
.hi-linkchip { display:inline-flex; align-items:center; gap:.2rem; font-size:.72rem; color: var(--primary); text-decoration:none; border:1px solid rgba(68,104,176,.3); border-radius:.4rem; padding:.08rem .4rem; text-transform: capitalize; }
.hi-linkchip:hover { background: rgba(68,104,176,.08); }
.hi-reveal { display:inline-flex; align-items:center; gap:.2rem; border:1px dashed rgba(68,104,176,.55); background: rgba(68,104,176,.06); color: var(--primary); border-radius:.45rem; padding:.15rem .5rem; font-size:.72rem; font-weight:600; font-family: var(--font-ui); cursor:pointer; white-space:nowrap; }
.hi-reveal:hover:not(:disabled) { background: rgba(68,104,176,.14); }
.hi-reveal:disabled { opacity:.5; cursor:wait; }
.hi-li { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:5px; background:#0A66C2; color:#fff; font-weight:800; font-size:.75rem; text-decoration:none; font-family: Arial, sans-serif; }
.hi-li:hover { filter: brightness(1.1); }
.hi-skeleton { background: linear-gradient(90deg, var(--surface-container) 0, var(--surface-container-high) 40%, var(--surface-container) 80%); background-size: 800px 100%; animation: hi-shimmer 1.4s infinite linear; margin-bottom:.4rem; }
.hi-dim { opacity:.55; pointer-events:none; transition: opacity .2s; }
.hi-confirm { max-width: 420px; text-align:center; }
.hi-confirm h3 { margin:.75rem 0 .4rem; }
.hi-confirm p { color: var(--on-surface-variant); font-size:.875rem; margin:0 0 1.25rem; }
.hi-confirm-icon { width:48px; height:48px; border-radius:50%; margin:0 auto; display:flex; align-items:center; justify-content:center; background: var(--error-container); color: var(--error); }
.hi-confirm-actions { display:flex; gap:.5rem; justify-content:center; }
.hi-danger { background: linear-gradient(135deg, #ba1a1a, #d93636) !important; }
.hi-danger:hover { box-shadow: 0 4px 16px rgba(186,26,26,.35) !important; }
.hi-toast { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 300; display:flex; gap:.6rem; align-items:center; max-width: min(440px, calc(100vw - 2rem)); background:#0C162A; color:#F1F5F9; padding:.7rem .6rem .7rem .9rem; border-radius:.75rem; box-shadow: 0 12px 32px rgba(12,22,42,.35); font-size:.8125rem; animation: hi-fade .2s ease both; }
.hi-toast.tone-success .material-symbols-outlined:first-child { color:#4ADE80; }
.hi-toast.tone-error .material-symbols-outlined:first-child { color:#F87171; }
.hi-toast.tone-info .material-symbols-outlined:first-child { color:#93C5FD; }
.hi-toast .hi-icon-btn { color:#94A3B8; }
@media (max-width: 1180px) {
  .hi-settings-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 900px) {
  .hi-main { grid-template-columns: minmax(0,1fr); }
  .hi-history { position: static; }
  .hi-history-list { flex-direction:row; overflow-x:auto; padding-bottom:.25rem; }
  .hi-history-list .hi-run { min-width: 230px; }
  .hi-settings-grid, .hi-funnel-body { grid-template-columns: 1fr; }
  .hi-stepper { grid-template-columns: repeat(5, auto); overflow-x:auto; }
}
@media (max-width: 560px) {
  .hi-kpis { grid-template-columns: 1fr 1fr; }
  .hi-kpi-icon { display:none; }
  .hi-header-actions { width:100%; }
  .hi-header-actions .hi-run-btn { flex:1; justify-content:center; }
  .hi-stepper .hi-step-label { display:none; }
  .hi-sources { margin-top: 0; }
}
`;
