import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callCadenceAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * Call Cadence — the in-app replacement for Call_-Cadence_Data.xlsx.
 *
 * Three things the spreadsheet could not do, which are the point of this page:
 *
 * 1. STRUCTURED OUTCOMES. The sheet had "Not fit", "Not Fit" and "Not FIT" as
 *    three distinct values, so no report could ever total them. Disposition is
 *    now a fixed set of buttons; the free-text note sits alongside it, not
 *    instead of it.
 *
 * 2. REAL CALLBACKS. The sheet buried them in sentences — "Will Call back in
 *    couple of hours", "Currently on Holidays, back thursday 20th 6:30 IST".
 *    Nobody was ever reminded. Callbacks now carry a timestamp and surface in
 *    a due list.
 *
 * 3. VISIBLE PROGRESS. 17th Aug IT had 44 bespoke pitches written and zero
 *    calls logged. Nobody could see that. Every list now shows completion.
 */

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const BUCKET_TONE = {
  positive:   '#006633',
  negative:   '#B91C1C',
  no_contact: '#D97706',
  bad_data:   '#6B7280',
};

const fmtDT = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** datetime-local needs local time, and toISOString() would shift it by the
 *  UTC offset — the same off-by-one trap as the tracker's date handling. */
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const Skeleton = ({ h = 16, w = '100%', r = 6, style = {} }) => (
  <div style={{ height: h, width: w, borderRadius: r, background: 'var(--outline-variant)',
                opacity: 0.4, animation: 'nx-pulse 1.4s ease-in-out infinite', ...style }} />
);

const Progress = ({ pct, tone }) => (
  <div style={{ height: 5, borderRadius: 3, background: 'var(--outline-variant)', overflow: 'hidden' }}>
    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3,
                  background: tone || 'var(--primary)', transition: 'width .35s ease' }} />
  </div>
);

export default function CallCadence() {
  const { isAdmin, isViewer } = useAuth();
  const { isMobile } = useBreakpoint();
  const isPrivileged = isAdmin || isViewer;

  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get('list') || null;

  const [lists,     setLists]     = useState([]);
  const [detail,    setDetail]    = useState(null);
  const [callbacks, setCallbacks] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [filter,    setFilter]    = useState('all');   // all | pending | called | callback
  const [search,    setSearch]    = useState('');
  const [openPitch, setOpenPitch] = useState(null);
  const [noteDraft, setNoteDraft] = useState({});
  const [showNew,   setShowNew]   = useState(false);
  const [newList,   setNewList]   = useState({ name: '', segment: '', list_date: '' });

  /* ── loaders ── */

  const loadLists = useCallback(async () => {
    try {
      const res = await callCadenceAPI.getLists();
      setLists(res.data?.lists || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load call lists.');
    }
  }, []);

  const loadCallbacks = useCallback(async () => {
    try {
      const res = await callCadenceAPI.getDueCallbacks({ horizon_hours: 24 });
      setCallbacks(res.data?.callbacks || []);
    } catch { /* non-fatal — the banner just stays hidden */ }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    setLoading(true);
    try {
      const res = await callCadenceAPI.getList(id);
      setDetail(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load that list.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadLists(), loadCallbacks()]); setLoading(false); })();
  }, [loadLists, loadCallbacks]);

  useEffect(() => { loadDetail(activeId); }, [activeId, loadDetail]);

  /* ── actions ── */

  const openList  = (id) => setSearchParams(id ? { list: id } : {}, { replace: false });

  const logOutcome = async (contact, disposition) => {
    if (contact.do_not_call) return;
    setBusy(true);
    // Optimistic — the rep is working at pace and should not wait on the network
    setDetail(d => ({ ...d, contacts: d.contacts.map(c =>
      c.id === contact.id ? { ...c, disposition, called_at: new Date().toISOString() } : c) }));
    try {
      const payload = { disposition };
      if (disposition === 'callback' && !contact.callback_at) {
        const t = new Date(Date.now() + 2 * 3600 * 1000);   // default +2h
        payload.callback_at = t.toISOString();
      }
      const res = await callCadenceAPI.logOutcome(contact.id, payload);
      setDetail(d => ({ ...d, contacts: d.contacts.map(c => c.id === contact.id ? { ...c, ...res.data } : c) }));
      loadLists(); loadCallbacks();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not save that outcome.');
      loadDetail(activeId);                                  // rollback from server truth
    } finally {
      setBusy(false);
    }
  };

  const saveField = async (contact, patch) => {
    try {
      const res = await callCadenceAPI.logOutcome(contact.id, patch);
      setDetail(d => ({ ...d, contacts: d.contacts.map(c => c.id === contact.id ? { ...c, ...res.data } : c) }));
      loadCallbacks();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not save.');
    }
  };

  const createList = async () => {
    if (!newList.name.trim()) return;
    setBusy(true);
    try {
      const res = await callCadenceAPI.createList({
        name: newList.name.trim(),
        segment: newList.segment.trim() || null,
        list_date: newList.list_date || undefined,
      });
      setShowNew(false); setNewList({ name: '', segment: '', list_date: '' });
      await loadLists();
      if (res.data?.id) openList(res.data.id);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not create the list.');
    } finally { setBusy(false); }
  };

  /* ── derived ── */

  const dispositions = useMemo(() => detail?.dispositions || [], [detail]);
  const dispMap = useMemo(
    () => Object.fromEntries(dispositions.map(d => [d.key, d])), [dispositions]);

  const visibleContacts = useMemo(() => {
    const rows = detail?.contacts || [];
    const q = search.trim().toLowerCase();
    return rows.filter(c => {
      if (filter === 'pending'  && c.disposition) return false;
      if (filter === 'called'   && !c.disposition) return false;
      if (filter === 'callback' && c.disposition !== 'callback') return false;
      if (!q) return true;
      return [c.full_name, c.company, c.title, c.email, c.phone, c.mobile_phone]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [detail, filter, search]);

  const listStats = useMemo(() => {
    const rows = detail?.contacts || [];
    const called = rows.filter(c => c.disposition).length;
    return { total: rows.length, called, pending: rows.length - called,
             pct: rows.length ? Math.round(called / rows.length * 100) : 0 };
  }, [detail]);

  const card = { background: 'var(--surface)', borderRadius: '0.875rem',
                 border: '1px solid var(--outline-variant)', padding: '1rem 1.25rem', marginBottom: '1rem' };

  /* ── render ── */

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`@keyframes nx-pulse{0%,100%{opacity:.4}50%{opacity:.7}}`}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem' }}>Sales CRM</p>
          <h1 className="headline-sm">Call Cadence</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: '0.25rem 0 0' }}>
            {detail ? detail.list?.name : 'Dated calling lists with structured outcomes'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {detail && (
            <button onClick={() => openList(null)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.875rem',
                       borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'transparent',
                       fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', color: 'var(--on-surface)' }}>
              <Icon name="arrow_back" style={{ fontSize: '1rem' }} /> All lists
            </button>
          )}
          {!detail && (
            <button onClick={() => setShowNew(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.875rem',
                       borderRadius: '0.5rem', background: 'var(--primary)', color: '#fff',
                       border: 'none', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="add" style={{ fontSize: '1rem', color: '#fff' }} /> New list
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: 'var(--error-container)',
                      color: 'var(--error)', fontSize: '0.8125rem', marginBottom: '1rem',
                      display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <Icon name="close" style={{ fontSize: '1rem' }} />
          </button>
        </div>
      )}

      {/* ── Callbacks due — the single biggest gain over the spreadsheet ── */}
      {callbacks.length > 0 && !detail && (
        <div style={{ ...card, borderLeft: '3px solid #D97706' }}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.25rem',
                       display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="alarm" style={{ fontSize: '1rem' }} /> Callbacks due ({callbacks.length})
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', margin: '0 0 0.75rem' }}>
            In the spreadsheet these lived inside the Remarks text and nobody was reminded.
          </p>
          {callbacks.slice(0, 8).map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem',
                                     padding: '0.5rem 0', borderTop: '1px solid var(--outline-variant)', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.8125rem', minWidth: 140 }}>{c.full_name || '—'}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', flex: 1, minWidth: 120 }}>{c.company}</span>
              {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}>{c.phone}</a>}
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.overdue ? '#B91C1C' : '#D97706' }}>
                {c.overdue ? 'Overdue' : 'Due'} · {fmtDT(c.callback_at)}
              </span>
              <button onClick={() => openList(c.list_id)}
                style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--outline-variant)',
                         background: 'transparent', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', color: 'var(--on-surface)' }}>
                Open
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── New list form ── */}
      {showNew && !detail && (
        <div style={card}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem' }}>New call list</h2>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
              Name
              <input value={newList.name} onChange={e => setNewList(v => ({ ...v, name: e.target.value }))}
                placeholder="18th Aug - Retail"
                style={{ width: '100%', marginTop: '0.25rem', padding: '0.5rem 0.625rem', borderRadius: '0.5rem',
                         border: '1px solid var(--outline-variant)', background: 'var(--surface)',
                         color: 'var(--on-surface)', fontSize: '0.8125rem' }} />
            </label>
            <label style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
              Segment
              <input value={newList.segment} onChange={e => setNewList(v => ({ ...v, segment: e.target.value }))}
                placeholder="Retail"
                style={{ width: '100%', marginTop: '0.25rem', padding: '0.5rem 0.625rem', borderRadius: '0.5rem',
                         border: '1px solid var(--outline-variant)', background: 'var(--surface)',
                         color: 'var(--on-surface)', fontSize: '0.8125rem' }} />
            </label>
            <label style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
              Date
              <input type="date" value={newList.list_date} onChange={e => setNewList(v => ({ ...v, list_date: e.target.value }))}
                style={{ width: '100%', marginTop: '0.25rem', padding: '0.5rem 0.625rem', borderRadius: '0.5rem',
                         border: '1px solid var(--outline-variant)', background: 'var(--surface)',
                         color: 'var(--on-surface)', fontSize: '0.8125rem' }} />
            </label>
            <button onClick={createList} disabled={busy || !newList.name.trim()}
              style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'var(--primary)', color: '#fff',
                       border: 'none', fontSize: '0.8125rem', fontWeight: 600,
                       cursor: busy || !newList.name.trim() ? 'not-allowed' : 'pointer',
                       opacity: busy || !newList.name.trim() ? 0.5 : 1 }}>
              Create
            </button>
          </div>
        </div>
      )}

      {/* ── LIST INDEX ── */}
      {!detail && (
        loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 240 : 300}px, 1fr))`, gap: '0.75rem' }}>
            {[0, 1, 2].map(i => <Skeleton key={i} h={120} r={14} />)}
          </div>
        ) : lists.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '2rem 1.25rem' }}>
            <Icon name="call" style={{ fontSize: '2rem', color: 'var(--on-surface-variant)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>No call lists yet</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', margin: 0 }}>
              Create one, then paste contacts in. One list per day and segment, like the tabs in the old sheet.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 240 : 300}px, 1fr))`, gap: '0.75rem' }}>
            {lists.map(l => (
              <button key={l.id} onClick={() => openList(l.id)}
                style={{ textAlign: 'left', background: 'var(--surface)', borderRadius: '0.875rem',
                         border: '1px solid var(--outline-variant)', padding: '1rem', cursor: 'pointer',
                         font: 'inherit', color: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>{l.name}</strong>
                  {l.segment && (
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.125rem 0.5rem',
                                   borderRadius: '999px', background: 'var(--surface-container)',
                                   color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>{l.segment}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>
                  {l.list_date}{l.created_by_name ? ` · ${l.created_by_name}` : ''}
                </div>
                <Progress pct={l.progress || 0} tone={l.progress === 100 ? '#006633' : undefined} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem',
                              color: 'var(--on-surface-variant)', marginTop: '0.375rem' }}>
                  <span>{l.called || 0}/{l.total || 0} called</span>
                  <span style={{ fontWeight: 700, color: l.positive ? '#006633' : 'inherit' }}>
                    {l.positive || 0} positive
                  </span>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* ── LIST DETAIL ── */}
      {detail && (
        <>
          <div style={{ ...card, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: 160, flex: 1 }}>
              <Progress pct={listStats.pct} tone={listStats.pct === 100 ? '#006633' : undefined} />
              <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginTop: '0.375rem' }}>
                {listStats.called} of {listStats.total} called · {listStats.pending} left
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {['all', 'pending', 'called', 'callback'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '0.375rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                           border: '1px solid var(--outline-variant)', textTransform: 'capitalize',
                           background: filter === f ? 'var(--primary)' : 'transparent',
                           color: filter === f ? '#fff' : 'var(--on-surface)',
                           fontSize: '0.75rem', fontWeight: filter === f ? 700 : 500 }}>{f}</button>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, company…"
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
                       background: 'var(--surface)', color: 'var(--on-surface)', fontSize: '0.8125rem', minWidth: 180 }} />
          </div>

          {loading ? (
            <>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={72} r={12} style={{ marginBottom: '0.5rem' }} />)}</>
          ) : visibleContacts.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: '0.8125rem' }}>
              No contacts match.
            </div>
          ) : visibleContacts.map(c => {
            const d = c.disposition ? dispMap[c.disposition] : null;
            const dnc = c.do_not_call;
            return (
              <div key={c.id} style={{ ...card, padding: '0.875rem 1rem', marginBottom: '0.5rem',
                                       opacity: dnc ? 0.55 : 1,
                                       borderLeft: d ? `3px solid ${BUCKET_TONE[d.bucket] || 'var(--outline-variant)'}`
                                                     : '3px solid transparent' }}>
                {/* identity row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.875rem' }}>{c.full_name || '—'}</strong>
                      {c.tier && (
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.125rem 0.5rem',
                                       borderRadius: '999px', background: 'var(--surface-container)' }}>{c.tier}</span>
                      )}
                      {dnc && (
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.125rem 0.5rem',
                                       borderRadius: '999px', background: '#B91C1C', color: '#fff' }}>DO NOT CALL</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                      {[c.title, c.company].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {(c.phone || c.mobile_phone) && !dnc && (
                      <a href={`tel:${c.mobile_phone || c.phone}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.375rem 0.75rem',
                                 borderRadius: '0.5rem', background: 'var(--primary)', color: '#fff',
                                 fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        <Icon name="call" style={{ fontSize: '0.875rem', color: '#fff' }} />
                        {c.mobile_phone || c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} title={c.email}
                        style={{ padding: '0.375rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
                                 color: 'var(--on-surface)', textDecoration: 'none', display: 'flex' }}>
                        <Icon name="mail" style={{ fontSize: '0.9375rem' }} />
                      </a>
                    )}
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                        style={{ padding: '0.375rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
                                 color: 'var(--on-surface)', textDecoration: 'none', display: 'flex' }}>
                        <Icon name="link" style={{ fontSize: '0.9375rem' }} />
                      </a>
                    )}
                    {c.cold_call_pitch && (
                      <button onClick={() => setOpenPitch(openPitch === c.id ? null : c.id)}
                        title="Cold call pitch"
                        style={{ padding: '0.375rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
                                 background: openPitch === c.id ? 'var(--surface-container)' : 'transparent',
                                 cursor: 'pointer', color: 'var(--on-surface)', display: 'flex' }}>
                        <Icon name="record_voice_over" style={{ fontSize: '0.9375rem' }} />
                      </button>
                    )}
                  </div>
                </div>

                {/* the bespoke pitch — was locked in a spreadsheet cell */}
                {openPitch === c.id && c.cold_call_pitch && (
                  <div style={{ background: 'var(--surface-container)', borderRadius: '0.625rem',
                                padding: '0.75rem', fontSize: '0.8125rem', lineHeight: 1.55, marginBottom: '0.5rem' }}>
                    {c.cold_call_pitch}
                  </div>
                )}

                {/* disposition buttons */}
                {!dnc && (
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: c.disposition ? '0.5rem' : 0 }}>
                    {dispositions.map(opt => {
                      const on = c.disposition === opt.key;
                      return (
                        <button key={opt.key} onClick={() => logOutcome(c, on ? '' : opt.key)} disabled={busy}
                          style={{ padding: '0.3125rem 0.625rem', borderRadius: '0.5rem', cursor: busy ? 'wait' : 'pointer',
                                   border: `1px solid ${on ? (BUCKET_TONE[opt.bucket] || 'var(--primary)') : 'var(--outline-variant)'}`,
                                   background: on ? (BUCKET_TONE[opt.bucket] || 'var(--primary)') : 'transparent',
                                   color: on ? '#fff' : 'var(--on-surface-variant)',
                                   fontSize: '0.6875rem', fontWeight: on ? 700 : 500 }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* callback time + note, revealed once an outcome exists */}
                {c.disposition && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.disposition === 'callback' && (
                      <label style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)',
                                      display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Icon name="alarm" style={{ fontSize: '0.875rem' }} />
                        <input type="datetime-local"
                          value={c.callback_at ? toLocalInput(new Date(c.callback_at)) : ''}
                          onChange={e => saveField(c, { callback_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                          style={{ padding: '0.25rem 0.5rem', borderRadius: '0.375rem',
                                   border: '1px solid var(--outline-variant)', background: 'var(--surface)',
                                   color: 'var(--on-surface)', fontSize: '0.6875rem' }} />
                      </label>
                    )}
                    <input
                      value={noteDraft[c.id] ?? c.outcome_note ?? ''}
                      onChange={e => setNoteDraft(n => ({ ...n, [c.id]: e.target.value }))}
                      onBlur={e => {
                        const v = e.target.value;
                        if (v !== (c.outcome_note || '')) saveField(c, { outcome_note: v });
                        setNoteDraft(n => { const { [c.id]: _drop, ...rest } = n; return rest; });
                      }}
                      placeholder="Note (optional)"
                      style={{ flex: 1, minWidth: 160, padding: '0.3125rem 0.625rem', borderRadius: '0.5rem',
                               border: '1px solid var(--outline-variant)', background: 'var(--surface)',
                               color: 'var(--on-surface)', fontSize: '0.75rem' }} />
                    {c.called_by_name && (
                      <span style={{ fontSize: '0.625rem', color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>
                        {c.called_by_name}{c.attempts > 1 ? ` · ${c.attempts} attempts` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
