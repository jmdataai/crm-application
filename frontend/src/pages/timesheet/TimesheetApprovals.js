import { useBreakpoint } from '../../hooks/useBreakpoint';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { timesheetAPI, usersAPI, formatApiError } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import NexusTutorial from '../../components/NexusTutorial';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DAY_NAMES   = ['Fri','Sat','Sun','Mon','Tue','Wed','Thu'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BAR_COLORS = [
  'var(--primary)','#ea580c','#16a34a','#9333ea','#0891b2',
  '#db2777','#ca8a04','#059669','#7c3aed','#dc2626',
  '#0284c7','#65a30d',
];

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function weekLabel(weekStart) {
  if (!weekStart) return '—';
  const d = new Date(weekStart + 'T00:00:00');
  const end = addDays(d, 6);
  return `${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
}
function getFridayOf(date) {
  const d = new Date(date);
  const diff = (d.getDay() - 5 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function isInMonth(dateStr, monthDate) {
  if (!dateStr || !monthDate) return false;
  const d = new Date(dateStr + 'T00:00:00');
  return d.getMonth() === monthDate.getMonth() && d.getFullYear() === monthDate.getFullYear();
}
function getMonthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function isInAnySelectedMonth(dateStr, monthSet) {
  if (!dateStr) return false;
  if (!monthSet || monthSet.size === 0) return true;
  const d = new Date(dateStr + 'T00:00:00');
  return monthSet.has(getMonthKey(d));
}
function isInDateRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10); // YYYY-MM-DD string comparison works for ISO dates
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}
function getUser(ts) {
  return ts['users!timesheets_user_id_fkey'] || ts.users || {};
}

const StatusBadge = ({ status }) => {
  const cfg = {
    draft:     { label:'Draft',     bg:'#f1f5f9', color:'#64748b' },
    submitted: { label:'Submitted', bg:'#eff6ff', color:'var(--primary-container)' },
    approved:  { label:'Approved',  bg:'#f0fdf4', color:'#16a34a' },
    rejected:  { label:'Rejected',  bg:'#fef2f2', color:'#dc2626' },
  };
  const s = cfg[status] || cfg.draft;
  return <span style={{ padding:'3px 10px', borderRadius:99, fontSize:'0.75rem', fontWeight:700, background:s.bg, color:s.color }}>{s.label}</span>;
};

// ── Multi-select employee dropdown ───────────────────────────
function MultiSelect({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const label = selected.size === 0 ? 'All Employees'
    : `${selected.size} employee${selected.size > 1 ? 's' : ''} selected`;

  const toggle = (id) => {
    let next;
    if (selected.size === 0) {
      // Currently "All" — clicking one employee SELECTS only that person
      next = new Set([id]);
    } else {
      next = new Set(selected);
      if (next.has(id)) next.delete(id); else next.add(id);
    }
    // If all employees selected, reset to empty (= show all, no filter active)
    if (next.size === 0 || next.size === options.length) onChange(new Set());
    else onChange(next);
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:'1px solid var(--surface-container-high)', background:'var(--surface)', color:'var(--on-surface)', fontSize:'0.875rem', cursor:'pointer', minWidth:220, justifyContent:'space-between' }}>
        <span style={{ fontWeight: selected.size > 0 ? 600 : 400 }}>{label}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} style={{ fontSize:'1.1rem', color:'var(--on-surface-variant)' }} />
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:200, background:'var(--surface)', borderRadius:12, border:'1px solid var(--outline-variant)', boxShadow:'0 8px 30px rgba(0,0,0,0.12)', minWidth:260, maxHeight:340, overflowY:'auto', padding:'6px 0' }}>
          <div style={{ display:'flex', gap:8, padding:'6px 12px', borderBottom:'1px solid var(--surface-container-high)' }}>
            <button onClick={() => onChange(new Set())} style={{ flex:1, padding:4, borderRadius:6, border:'none', background: selected.size === 0 ? 'var(--surface-container)' : 'transparent', color:'var(--primary)', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>All</button>
            {/* Clear = reset to empty Set (= All Employees, no active filter) — same as All button */}
            <button onClick={() => { onChange(new Set()); setOpen(false); }} style={{ flex:1, padding:4, borderRadius:6, border:'none', background: 'transparent', color:'var(--error)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>Clear</button>
          </div>
          {options.map((opt, i) => {
            const isChecked = selected.size === 0 || selected.has(opt.id);
            return (
              <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', background: selected.size > 0 && selected.has(opt.id) ? 'rgba(68,104,176,0.08)' : 'transparent' }}>
                <input type="checkbox" checked={isChecked} onChange={() => toggle(opt.id)} style={{ accentColor:'var(--primary)', width:15, height:15 }} />
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, background:BAR_COLORS[i % BAR_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.6875rem' }}>
                    {(opt.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                  <span style={{ fontSize:'0.875rem', color:'var(--on-surface)', fontWeight: selected.size > 0 && selected.has(opt.id) ? 600 : 400 }}>{opt.name}</span>
                </div>
                <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', fontWeight:600 }}>
                  {opt.totalHours != null ? `${opt.totalHours.toFixed(0)}h` : ''}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Multi-select month dropdown ───────────────────────────────
function MonthMultiSelect({ availableMonths, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const label = selected.size === 0 ? 'All Months'
    : selected.size === 1
      ? (() => { const k = [...selected][0]; const [y,m] = k.split('-'); return `${MONTH_NAMES[parseInt(m)-1]} ${y}`; })()
      : `${selected.size} months selected`;

  const toggleMonth = (key) => {
    const next = new Set(selected);
    if (next.has(key)) {
      if (next.size === 1) return; // prevent empty state
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:`1px solid ${selected.size > 1 ? 'rgba(68,104,176,0.5)' : 'var(--surface-container-high)'}`, background: selected.size > 1 ? 'rgba(68,104,176,0.06)' : 'var(--surface)', color: selected.size > 1 ? 'var(--primary)' : 'var(--on-surface)', fontSize:'0.875rem', cursor:'pointer', minWidth:170, justifyContent:'space-between' }}>
        <span style={{ fontWeight: selected.size > 1 ? 700 : 400 }}>{label}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} style={{ fontSize:'1.1rem', color:'var(--on-surface-variant)' }} />
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:200, background:'var(--surface)', borderRadius:12, border:'1px solid var(--outline-variant)', boxShadow:'0 8px 30px rgba(0,0,0,0.12)', minWidth:210, maxHeight:340, overflowY:'auto', padding:'6px 0' }}>
          <div style={{ padding:'6px 12px 8px', borderBottom:'1px solid var(--surface-container-high)', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--on-surface-variant)', fontWeight:700 }}>
            Select months (multi-select)
          </div>
          {availableMonths.map(m => (
            <label key={m.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', background: selected.has(m.key) ? 'rgba(68,104,176,0.05)' : 'transparent' }}>
              <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggleMonth(m.key)} style={{ accentColor:'var(--primary)', width:14, height:14 }} />
              <span style={{ fontSize:'0.875rem', color:'var(--on-surface)', fontWeight: selected.has(m.key) ? 700 : 400 }}>{m.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plotly Bar Chart ─────────────────────────────────────────
const PlotlyBarChart = ({ chartData, visibleEmps }) => {
  const containerRef = useRef(null);
  const plotted      = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !chartData.length || !visibleEmps.length) return;

    const ready = () => {
      const traces = visibleEmps.map((emp, i) => ({
        x: chartData.map(d => MONTH_SHORT[parseInt(d.month) - 1]),
        y: chartData.map(d => parseFloat(d[emp.name] || 0)),
        name: emp.name,
        type: 'bar',
        marker: {
          color: BAR_COLORS[i % BAR_COLORS.length],
          opacity: 0.92,
          line: { color: 'rgba(255,255,255,0.25)', width: 0.5 },
        },
        hovertemplate:
          '<b>%{fullData.name}</b><br>' +
          '%{x}: <b>%{y:.1f}h</b><extra></extra>',
      }));

      const layout = {
        barmode: 'group',
        paper_bgcolor: 'transparent',
        plot_bgcolor:  'transparent',
        font: { family: 'Plus Jakarta Sans, sans-serif', color: '#92A0BA', size: 12 },
        xaxis: {
          tickfont:  { color: '#92A0BA', size: 12, family: 'Space Grotesk, sans-serif' },
          gridcolor: 'rgba(226,232,242,0.5)',
          showline:  false,
          ticklen:   0,
          fixedrange: true,
        },
        yaxis: {
          tickfont:   { color: '#92A0BA', size: 12, family: 'Space Grotesk, sans-serif' },
          gridcolor:  'rgba(226,232,242,0.5)',
          ticksuffix: 'h',
          showline:   false,
          ticklen:    0,
          fixedrange: true,
          rangemode: 'tozero',
        },
        legend: {
          orientation: 'h',
          y:           -0.18,
          x:           0.5,
          xanchor:     'center',
          font:        { size: 12, family: 'Space Grotesk, sans-serif', color: '#92A0BA' },
          bgcolor:     'transparent',
        },
        margin:       { t: 16, r: 20, b: 70, l: 52 },
        bargap:       0.28,
        bargroupgap:  0.1,
        hoverlabel: {
          bgcolor:    '#0C162A',
          bordercolor:'#4468B0',
          font:       { color: '#FAF7FB', family: 'Plus Jakarta Sans, sans-serif', size: 13 },
          align:      'left',
        },
        transition: { duration: 400, easing: 'cubic-in-out' },
      };

      const config = {
        responsive:     true,
        displayModeBar: true,
        displaylogo:    false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
        toImageButtonOptions: {
          format:   'png',
          filename: 'jmdata_timesheet_hours',
          scale:    2,
        },
      };

      if (plotted.current) {
        window.Plotly.react(el, traces, layout, config);
      } else {
        window.Plotly.newPlot(el, traces, layout, config);
        plotted.current = true;
      }
    };

    // Plotly loaded via CDN defer — wait if not yet ready
    if (window.Plotly) {
      ready();
    } else {
      const interval = setInterval(() => {
        if (window.Plotly) { clearInterval(interval); ready(); }
      }, 80);
      return () => clearInterval(interval);
    }

    return () => {
      if (plotted.current && el && window.Plotly) {
        try { window.Plotly.purge(el); } catch {}
        plotted.current = false;
      }
    };
  }, [chartData, visibleEmps]);

  if (!chartData.length || !visibleEmps.length) return null;

  return <div ref={containerRef} style={{ width: '100%', height: 360 }} />;
};

// ── Monthly Bar Chart (one bar per employee for selected month) ─────────────
const MonthlyBarChart = ({ data, monthLabel }) => {
  const containerRef = useRef(null);
  const plotted      = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data.length) return;

    const ready = () => {
      const traces = [{
        x: data.map(d => d.name),
        y: data.map(d => parseFloat(d.hours.toFixed(1))),
        type: 'bar',
        marker: {
          color: data.map((_,i) => BAR_COLORS[i % BAR_COLORS.length]),
          opacity: 0.92,
          line: { color: 'rgba(255,255,255,0.25)', width: 0.5 },
        },
        hovertemplate: '<b>%{x}</b><br>Hours: <b>%{y:.1f}h</b><extra></extra>',
      }];

      const layout = {
        barmode: 'group',
        paper_bgcolor: 'transparent',
        plot_bgcolor:  'transparent',
        font: { family: 'Plus Jakarta Sans, sans-serif', color: '#92A0BA', size: 12 },
        xaxis: {
          tickfont:  { color: '#92A0BA', size: 12, family: 'Space Grotesk, sans-serif' },
          gridcolor: 'rgba(226,232,242,0.5)',
          showline:  false, ticklen: 0, fixedrange: true,
        },
        yaxis: {
          tickfont:   { color: '#92A0BA', size: 12, family: 'Space Grotesk, sans-serif' },
          gridcolor:  'rgba(226,232,242,0.5)',
          ticksuffix: 'h',
          showline:   false, ticklen: 0, fixedrange: true,
          rangemode: 'tozero',
        },
        margin:      { t: 16, r: 20, b: 60, l: 52 },
        bargap:      0.35,
        hoverlabel: {
          bgcolor:    '#0C162A',
          bordercolor:'#4468B0',
          font:       { color: '#FAF7FB', family: 'Plus Jakarta Sans, sans-serif', size: 13 },
          align:      'left',
        },
        transition: { duration: 400, easing: 'cubic-in-out' },
      };

      const config = {
        responsive:     true,
        displayModeBar: true,
        displaylogo:    false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
        toImageButtonOptions: {
          format: 'png', filename: `jmdata_hours_${monthLabel.replace(' ','_')}`, scale: 2,
        },
      };

      if (plotted.current) {
        window.Plotly.react(el, traces, layout, config);
      } else {
        window.Plotly.newPlot(el, traces, layout, config);
        plotted.current = true;
      }
    };

    if (window.Plotly) {
      ready();
    } else {
      const interval = setInterval(() => {
        if (window.Plotly) { clearInterval(interval); ready(); }
      }, 80);
      return () => clearInterval(interval);
    }

    return () => {
      if (plotted.current && el && window.Plotly) {
        try { window.Plotly.purge(el); } catch {}
        plotted.current = false;
      }
    };
  }, [data, monthLabel]);

  if (!data.length) return null;
  return <div ref={containerRef} style={{ width: '100%', height: 320 }} />;
};

// ── Detail modal ─────────────────────────────────────────────
const DetailModal = ({ ts, onClose, onReviewed, selectedMonths: modalMonths }) => {
  const { isMobile } = useBreakpoint();
  const [note, setNote]     = useState('');
  const [acting, setActing] = useState(false);
  const [err, setErr]       = useState(null);
  if (!ts) return null;
  const emp = getUser(ts);
  const weekDaysAll = Array.from({length:7},(_,i)=>toISODate(addDays(new Date(ts.week_start+'T00:00:00'),i)));
  const weekDays = (modalMonths && modalMonths.size > 0) ? weekDaysAll.filter(d=>isInAnySelectedMonth(d,modalMonths)) : weekDaysAll;
  const entriesMap = {};
  (ts.entries||[]).forEach(e=>{entriesMap[e.entry_date]=e;});
  const totalH = (modalMonths && modalMonths.size > 0) ? weekDays.reduce((s,d)=>s+parseFloat(entriesMap[d]?.hours||0),0) : parseFloat(ts.total_hours||0);
  const modalMonthsLabel = !modalMonths || modalMonths.size === 0 ? ''
    : modalMonths.size === 1
      ? (() => { const k=[...modalMonths][0]; const [y,m]=k.split('-'); return `${MONTH_NAMES[parseInt(m)-1]} ${y}`; })()
      : `${modalMonths.size} months`;
  const initials = (emp.name||'U').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const doReview = async (action) => {
    setActing(true); setErr(null);
    try { await timesheetAPI.review(ts.id,action,note); if(onReviewed)onReviewed(); onClose(); }
    catch(e){ setErr(formatApiError(e)); } finally { setActing(false); }
  };
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:12}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',borderRadius:20,width:'100%',maxWidth:680,maxHeight:'92vh',overflowY:'auto',boxShadow:'0 25px 60px rgba(0,0,0,0.25)'}}>
        <div style={{padding:'18px 20px',borderBottom:'1px solid var(--surface-container-high)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:42,height:42,borderRadius:'50%',flexShrink:0,background:'linear-gradient(135deg,#ea580c,#f97316)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'0.9375rem'}}>{initials}</div>
            <div>
              <p style={{margin:0,fontWeight:700,fontSize:'0.9375rem',color:'var(--on-surface)'}}>{emp.name}</p>
              <p style={{margin:0,fontSize:'0.8rem',color:'var(--on-surface-variant)'}}>{emp.email} · {weekLabel(ts.week_start)}</p>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <StatusBadge status={ts.status}/>
            <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--on-surface-variant)',padding:4}}><Icon name="close"/></button>
          </div>
        </div>
        <div style={{padding:'12px 20px',background:'rgba(234,88,12,0.04)',borderBottom:'1px solid var(--surface-container-high)',display:'flex',gap:24,flexWrap:'wrap'}}>
          <div>
            <p style={{margin:0,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:'0.06em',color:'#ea580c',fontWeight:700}}>Total Hours</p>
            <p style={{margin:0,fontSize:'1.75rem',fontWeight:800,color:'#ea580c'}}>{totalH.toFixed(1)}h</p>
          </div>
          <div>
            <p style={{margin:0,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--on-surface-variant)',fontWeight:700}}>Days Worked</p>
            <p style={{margin:0,fontSize:'1.75rem',fontWeight:800,color:'var(--on-surface)'}}>{(ts.entries||[]).filter(e=>parseFloat(e.hours)>0).length}</p>
          </div>
          {ts.submitted_at&&<div>
            <p style={{margin:0,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--on-surface-variant)',fontWeight:700}}>Submitted</p>
            <p style={{margin:0,fontSize:'0.875rem',fontWeight:600,color:'var(--on-surface)',marginTop:6}}>{new Date(ts.submitted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
          </div>}
        </div>
        <div style={{padding:'16px 20px'}}>
          <p style={{margin:'0 0 10px',fontWeight:700,fontSize:'0.875rem',color:'var(--on-surface)'}}>Daily Breakdown{modalMonthsLabel ? ` (${modalMonthsLabel})` : ''}</p>
          {weekDays.map(date=>{
            const e=entriesMap[date]; const hrs=parseFloat(e?.hours||0);
            return(
              <div key={date} style={{display:'grid',gridTemplateColumns: isMobile ? '1fr' : '80px 55px 1fr',padding:'9px 0',borderBottom:'1px solid var(--surface-container-high)',alignItems:'start',gap:10}}>
                <div>
                  <p style={{margin:0,fontWeight:600,fontSize:'0.8125rem',color:'var(--on-surface)'}}>{DAY_NAMES[weekDaysAll.indexOf(date)]}</p>
                  <p style={{margin:0,fontSize:'0.7rem',color:'var(--on-surface-variant)'}}>{new Date(date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</p>
                </div>
                <p style={{margin:0,fontWeight:700,fontSize:'0.9375rem',color:hrs>0?'#ea580c':'var(--on-surface-variant)',paddingTop:2}}>{hrs>0?`${hrs}h`:'—'}</p>
                <p style={{margin:0,fontSize:'0.8125rem',color:'var(--on-surface-variant)',paddingTop:2}}>{e?.comments||<em style={{opacity:0.45}}>No notes</em>}</p>
              </div>
            );
          })}
        </div>
        {ts.status==='submitted'&&(
          <div style={{padding:'16px 20px',borderTop:'1px solid var(--surface-container-high)',background:'var(--surface-container)'}}>
            <p style={{margin:'0 0 10px',fontWeight:700,fontSize:'0.875rem',color:'var(--on-surface)'}}>Your Decision</p>
            <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note…" rows={2}
              style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',border:'1px solid var(--surface-container-high)',borderRadius:10,fontSize:'0.875rem',resize:'vertical',background:'var(--surface)',color:'var(--on-surface)',outline:'none'}}/>
            {err&&<p style={{color:'#dc2626',fontSize:'0.8rem',margin:'6px 0 0'}}>{err}</p>}
            <div style={{display:'flex',gap:10,marginTop:12}}>
              <button onClick={()=>doReview('reject')} disabled={acting} style={{flex:1,padding:11,borderRadius:10,fontWeight:700,fontSize:'0.875rem',border:'2px solid #dc2626',background:'#fef2f2',color:'#dc2626',cursor:'pointer'}}>{acting?'…':'❌ Reject'}</button>
              <button onClick={()=>doReview('approve')} disabled={acting} style={{flex:2,padding:11,borderRadius:10,fontWeight:700,fontSize:'0.875rem',border:'none',background:'linear-gradient(135deg,#16a34a,#22c55e)',color:'#fff',cursor:'pointer'}}>{acting?'…':'✅ Approve'}</button>
            </div>
          </div>
        )}
        {ts.status!=='submitted'&&ts.note&&(
          <div style={{padding:'12px 20px',borderTop:'1px solid var(--surface-container-high)',background:ts.status==='approved'?'#f0fdf4':'#fef2f2'}}>
            <p style={{margin:0,fontSize:'0.8125rem',color:ts.status==='approved'?'#16a34a':'#dc2626'}}>{ts.status==='approved'?'✅ Approved':'❌ Rejected'} · Note: {ts.note}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main ─────────────────────────────────────────────────────
const TimesheetApprovals = () => {
  const { user }   = useAuth();
  const { isMobile } = useBreakpoint();
  const isCEO      = user?.role === 'admin' || user?.role === 'viewer';

  const [view, setView]             = useState('all');
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterUser, setFilterUser]         = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [selectedMonths, setSelectedMonths] = useState(() => new Set([getMonthKey(new Date())]));

  // ── Date-range mode state (alternative to month multi-select) ──
  const [monthMode, setMonthMode] = useState('month');   // 'month' | 'range'
  const [rangeFrom, setRangeFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  });
  const [rangeTo, setRangeTo] = useState(() => {
    const now = new Date();
    return toISODate(new Date(now.getFullYear(), now.getMonth()+1, 0));
  });
  const availableMonths = React.useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: getMonthKey(d), label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` });
    }
    return months;
  }, []);
  const [weekStart, setWeekStart]   = useState(toISODate(getFridayOf(new Date())));
  const [pendingCount, setPendingCount] = useState(0); // always accurate, independent of current view
  const [chartYear, setChartYear]       = useState(new Date().getFullYear());
  const [selectedEmps, setSelectedEmps] = useState(new Set());
  const [listEmpSelected, setListEmpSelected] = useState(new Set());

  const YEAR_OPTIONS = useMemo(()=>Array.from(new Set(timesheets.map(ts=>new Date(ts.week_start+'T00:00:00').getFullYear()))).sort((a,b)=>b-a),[timesheets]);
  const EMP_OPTIONS  = useMemo(()=>Array.from(new Map(timesheets.map(ts=>{const u=getUser(ts);return[u.id||u.email||u.name,u];})).values()).filter(u=>u&&(u.id||u.email||u.name)),[timesheets]);

  const monthsLabel = React.useMemo(() => {
    if (selectedMonths.size === 0) return 'All';
    if (selectedMonths.size === 1) {
      const k = [...selectedMonths][0]; const [y,m] = k.split('-');
      return `${MONTH_NAMES[parseInt(m)-1]} ${y}`;
    }
    const sorted = [...selectedMonths].sort();
    if (selectedMonths.size <= 3) return sorted.map(k=>{const [y,m]=k.split('-');return `${MONTH_SHORT[parseInt(m)-1]} ${y}`;}).join(', ');
    const [fy,fm]=sorted[0].split('-'); const [ly,lm]=sorted[sorted.length-1].split('-');
    return `${selectedMonths.size} months (${MONTH_SHORT[parseInt(fm)-1]} ${fy}–${MONTH_SHORT[parseInt(lm)-1]} ${ly})`;
  }, [selectedMonths]);

  const rangeModeLabel = React.useMemo(() => {
    const fmt = (iso) => iso
      ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      : '…';
    if (!rangeFrom && !rangeTo) return 'All dates';
    return `${fmt(rangeFrom)} – ${fmt(rangeTo)}`;
  }, [rangeFrom, rangeTo]);

  const listEmpOptions = React.useMemo(() => EMP_OPTIONS.map(u => {
    const uid = u.id || u.email || u.name;
    const entryFilter = monthMode === 'range'
      ? (e) => isInDateRange(e.entry_date, rangeFrom, rangeTo)
      : (e) => isInAnySelectedMonth(e.entry_date, selectedMonths);
    const totalHours = timesheets
      .filter(ts => ts.status === 'approved' && (getUser(ts).id || getUser(ts).email || getUser(ts).name) === uid)
      .reduce((s, ts) => s + (ts.entries||[]).filter(entryFilter).reduce((sh,e)=>sh+parseFloat(e.hours||0),0), 0);
    return { id: uid, name: u.name || u.email || 'Unknown', totalHours };
  }).filter(o => o.id), [EMP_OPTIONS, timesheets, selectedMonths, monthMode, rangeFrom, rangeTo]);

  const currentWeekStart = toISODate(getFridayOf(new Date()));
  const isCurrentWeek    = weekStart === currentWeekStart;
  const goWeek = dir => setWeekStart(toISODate(addDays(new Date(weekStart+'T00:00:00'),dir*7)));

  // Fetch pending count independently — never tied to current view data
  const loadPendingCount = useCallback(async () => {
    try {
      const res = await timesheetAPI.getAll({ status: 'submitted' });
      setPendingCount((res.data?.timesheets || []).length);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    loadPendingCount(); // always refresh pending badge regardless of view
    try {
      if (view === 'all') {
        const [tsRes, usersRes] = await Promise.all([timesheetAPI.getAll({week_start:weekStart}), usersAPI.getAll()]);
        const allUsers = usersRes.data||[];
        const employees = allUsers.filter(u=>u.role!=='viewer');
        const list = tsRes.data.timesheets||[];
        const byUser = new Map(list.map(ts=>[ts.user_id,ts]));
        setTimesheets(employees.map(u=>byUser.get(u.id)||{id:`synthetic-${u.id}-${weekStart}`,user_id:u.id,week_start:weekStart,status:'draft',total_hours:0,entries:[],users:u}));
      } else {
        const params = {};
        if (view==='pending') params.status='submitted';
        const res = await timesheetAPI.getAll(params);
        setTimesheets(res.data.timesheets||[]);
      }
    } catch {}
    setLoading(false);
  }, [view, weekStart, loadPendingCount]);

  useEffect(()=>{load();},[load]);

  // ── Yearly summary derived client-side from timesheets entries ──
  // Uses actual entry_date so cross-month weeks are split correctly.
  // No separate API call — entries are already in the timesheets payload.
  const yearlySummary = useMemo(()=>{
    if (view !== 'monthly') return [];
    const aggMap = new Map();
    timesheets.filter(ts => ts.status === 'approved').forEach(ts => {
      const u = getUser(ts);
      const uid = u.id || u.email || u.name;
      if (!uid) return;
      (ts.entries || []).forEach(e => {
        const hrs = parseFloat(e.hours || 0);
        if (!hrs || !e.entry_date) return;
        const d = new Date(e.entry_date + 'T00:00:00');
        if (d.getFullYear() !== chartYear) return;
        const key = `${uid}-${d.getMonth()+1}`;
        if (!aggMap.has(key)) aggMap.set(key, { user_id: uid, name: u.name || u.email || 'Unknown', month: d.getMonth()+1, total_hours: 0 });
        aggMap.get(key).total_hours += hrs;
      });
    });
    return [...aggMap.values()];
  }, [timesheets, view, chartYear]);

  // Top 10 employees by total approved hours for the year
  const chartEmployees = useMemo(()=>{
    const map = new Map();
    yearlySummary.forEach(r=>{
      if(!map.has(r.user_id)) map.set(r.user_id,{id:r.user_id,name:r.name,totalHours:0});
      map.get(r.user_id).total_hours = (map.get(r.user_id).total_hours||0) + parseFloat(r.total_hours||0);
      map.get(r.user_id).totalHours  = map.get(r.user_id).total_hours;
    });
    return [...map.values()].sort((a,b)=>b.totalHours-a.totalHours).slice(0,10);
  },[yearlySummary]);

  const visibleEmps = useMemo(()=>
    selectedEmps.size===0 ? chartEmployees : chartEmployees.filter(e=>selectedEmps.has(e.id))
  ,[chartEmployees,selectedEmps]);

  const activeMonths = useMemo(()=>{
    const ids = new Set(visibleEmps.map(e=>e.id));
    const months = new Set(yearlySummary.filter(r=>ids.has(r.user_id)).map(r=>r.month));
    return [...months].sort((a,b)=>a-b);
  },[yearlySummary,visibleEmps]);

  const chartData = useMemo(()=>activeMonths.map(month=>{
    const obj={month};
    visibleEmps.forEach(emp=>{
      const row=yearlySummary.find(r=>r.user_id===emp.id&&r.month===month);
      obj[emp.name]=row?parseFloat(row.total_hours):0;
    });
    return obj;
  }),[activeMonths,visibleEmps,yearlySummary]);

  // ── Per-employee hours for the selected month/range (used by bar chart) ──
  const monthlyChartData = useMemo(()=>{
    if (view !== 'monthly') return [];
    const entryFilter = monthMode === 'range'
      ? (e) => isInDateRange(e.entry_date, rangeFrom, rangeTo)
      : (e) => isInAnySelectedMonth(e.entry_date, selectedMonths);
    const empMap = new Map();
    timesheets
      .filter(ts => ts.status === 'approved')
      .filter(ts => {
        if (listEmpSelected.size === 0) return true;
        const key = getUser(ts).id || getUser(ts).email || getUser(ts).name;
        return listEmpSelected.has(key);
      })
      .forEach(ts => {
        const u = getUser(ts);
        const name = u.name || u.email || 'Unknown';
        const mh = (ts.entries||[]).filter(entryFilter).reduce((s,e) => s + parseFloat(e.hours||0), 0);
        if (!mh) return;
        empMap.set(name, (empMap.get(name)||0) + mh);
      });
    return [...empMap.entries()]
      .map(([name, hours]) => ({ name, hours }))
      .filter(d => d.hours > 0)
      .sort((a,b) => b.hours - a.hours);
  }, [timesheets, view, selectedMonths, listEmpSelected, monthMode, rangeFrom, rangeTo]);

  const filtered = useMemo(()=>{
    const entryFilter = monthMode === 'range'
      ? (e) => isInDateRange(e.entry_date, rangeFrom, rangeTo)
      : (e) => isInAnySelectedMonth(e.entry_date, selectedMonths);
    return timesheets.filter(ts=>{
      const emp=getUser(ts);
      if(filterUser&&!emp.name?.toLowerCase().includes(filterUser.toLowerCase())&&!emp.email?.toLowerCase().includes(filterUser.toLowerCase())) return false;
      if(filterEmployee){const key=emp.id||emp.email||emp.name;if(key!==filterEmployee)return false;}
      if(view==='monthly'&&listEmpSelected.size>0){const key=emp.id||emp.email||emp.name;if(!listEmpSelected.has(key))return false;}
      if(filterStatus&&ts.status!==filterStatus) return false;
      if(view==='monthly'&&!['submitted','approved'].includes(ts.status)) return false;
      if(view==='monthly') return (ts.entries||[]).some(entryFilter);
      return true;
    });
  },[timesheets,filterUser,filterEmployee,listEmpSelected,filterStatus,view,selectedMonths,monthMode,rangeFrom,rangeTo]);

  const stats = useMemo(()=>{
    if (view === 'monthly') {
      const entryFilter = monthMode === 'range'
        ? (e) => isInDateRange(e.entry_date, rangeFrom, rangeTo)
        : (e) => isInAnySelectedMonth(e.entry_date, selectedMonths);
      const monthTs = timesheets.filter(ts => {
        if (!['submitted','approved','rejected'].includes(ts.status)) return false;
        if (listEmpSelected.size > 0) {
          const key = getUser(ts).id || getUser(ts).email || getUser(ts).name;
          if (!listEmpSelected.has(key)) return false;
        }
        return (ts.entries||[]).some(entryFilter);
      });
      return {
        submitted:  monthTs.filter(t=>t.status==='submitted').length,
        approved:   monthTs.filter(t=>t.status==='approved').length,
        rejected:   monthTs.filter(t=>t.status==='rejected').length,
        totalHours: monthTs
          .filter(t=>t.status==='approved')
          .reduce((s,t)=>{
            const mh = (t.entries||[]).filter(entryFilter).reduce((sh,e)=>sh+parseFloat(e.hours||0),0);
            return s + mh;
          }, 0),
      };
    }
    // Pending / Weekly views — no date filtering needed
    const base = filterEmployee
      ? timesheets.filter(ts=>{const key=getUser(ts).id||getUser(ts).email||getUser(ts).name; return key===filterEmployee;})
      : timesheets;
    return {
      submitted:  base.filter(t=>t.status==='submitted').length,
      approved:   base.filter(t=>t.status==='approved').length,
      rejected:   base.filter(t=>t.status==='rejected').length,
      totalHours: base.filter(t=>t.status==='approved').reduce((s,t)=>s+parseFloat(t.total_hours||0),0),
    };
  },[timesheets,view,selectedMonths,listEmpSelected,filterEmployee,monthMode,rangeFrom,rangeTo]);

  // pendingCount is now a separate state fetched independently — see loadPendingCount()
  const navBtn = {display:'flex',alignItems:'center',justifyContent:'center',width:32,height:32,borderRadius:8,border:'1px solid var(--surface-container-high)',background:'var(--surface-container-lowest)',color:'var(--on-surface)',cursor:'pointer'};

  return (
    <div style={{maxWidth:960,margin:'0 auto',padding:'0 1rem 3rem'}}>
      <div style={{marginBottom:18}}>
        <h1 style={{fontWeight:800,fontSize:'1.625rem',color:'var(--on-surface)',margin:0}}>Timesheet Approvals</h1>
        <p style={{margin:'4px 0 0',color:'var(--on-surface-variant)',fontSize:'0.875rem'}}>Review and approve employee timesheets</p>
      </div>

      {/* Tabs — at the top */}
      <div data-tour="approvals-history" style={{display:'flex',gap:4,background:'var(--surface-container-high)',borderRadius:10,padding:4,marginBottom:14,width:'fit-content',flexWrap:'wrap'}}>
        {[{key:'pending',label:`Pending (${pendingCount})`},{key:'all',label:'Weekly'},{key:'monthly',label:'Monthly'}].map(tab=>(
          <button key={tab.key} onClick={()=>{setView(tab.key);setFilterStatus('');setFilterUser('');setFilterEmployee('');}}
            style={{padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'0.8125rem',fontWeight:view===tab.key?700:500,background:view===tab.key?'var(--surface)':'transparent',color:view===tab.key?'#ea580c':'var(--on-surface-variant)',boxShadow:view===tab.key?'var(--ambient-shadow)':'none',transition:'all 0.15s'}}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI cards — below tabs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:18}}>
        {[
          {label:'Pending',   value:stats.submitted,                  color:'var(--primary-container)',bg:'#eff6ff',               icon:'hourglass_empty'},
          {label:'Approved',  value:stats.approved,                   color:'#16a34a',bg:'#f0fdf4',               icon:'check_circle'},
          {label:'Rejected',  value:stats.rejected,                   color:'#dc2626',bg:'#fef2f2',               icon:'cancel'},
          {label:"Hours OK'd",value:`${stats.totalHours.toFixed(0)}h`,color:'#ea580c',bg:'rgba(234,88,12,0.07)', icon:'schedule'},
        ].map(kpi=>(
          <div key={kpi.label} style={{padding:'12px 14px',borderRadius:12,background:kpi.bg,border:`1px solid ${kpi.color}22`,display:'flex',alignItems:'center',gap:10}}>
            <Icon name={kpi.icon} style={{color:kpi.color,fontSize:'1.375rem'}}/>
            <div>
              <p style={{margin:0,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:'0.06em',color:kpi.color,fontWeight:700}}>{kpi.label}</p>
              <p style={{margin:0,fontSize:'1.375rem',fontWeight:800,color:kpi.color}}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* All view filters */}
      {view==='all'&&(
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
          <button onClick={()=>goWeek(-1)} style={navBtn}><Icon name="chevron_left"/></button>
          <span style={{fontSize:'0.9rem',fontWeight:700,color:'var(--on-surface)',minWidth:150,textAlign:'center'}}>{weekLabel(weekStart)}</span>
          <button onClick={()=>goWeek(1)} disabled={isCurrentWeek} style={{...navBtn,opacity:isCurrentWeek?0.35:1,cursor:isCurrentWeek?'not-allowed':'pointer'}}><Icon name="chevron_right"/></button>
          {!isCurrentWeek&&<button onClick={()=>setWeekStart(currentWeekStart)} style={{padding:'6px 12px',borderRadius:8,border:'1.5px solid rgba(234,88,12,0.4)',background:'rgba(234,88,12,0.06)',color:'#ea580c',fontSize:'0.8rem',fontWeight:700,cursor:'pointer'}}>Current Week</button>}
          <input type="text" placeholder="Search by name or email…" value={filterUser} onChange={e=>setFilterUser(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--surface-container-high)',fontSize:'0.875rem',background:'var(--surface)',color:'var(--on-surface)',outline:'none',minWidth:180}}/>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--surface-container-high)',fontSize:'0.875rem',background:'var(--surface)',color:'var(--on-surface)',outline:'none'}}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      )}

      {/* Monthly view — employee selector + mode toggle (Month | Date Range) */}
      {view==='monthly'&&(
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>

          {/* Employee multi-select — always visible */}
          <MultiSelect
            options={listEmpOptions}
            selected={listEmpSelected}
            onChange={setListEmpSelected}
          />

          {/* Mode toggle */}
          <div style={{display:'flex',borderRadius:8,border:'1px solid var(--surface-container-high)',overflow:'hidden',flexShrink:0}}>
            <button
              onClick={() => setMonthMode('month')}
              style={{padding:'7px 14px',border:'none',cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'0.8125rem',fontWeight:600,
                background: monthMode==='month' ? 'var(--surface-container)' : 'var(--surface)',
                color:      monthMode==='month' ? '#ea580c' : 'var(--on-surface-variant)',
                borderRight:'1px solid var(--surface-container-high)',transition:'all 0.15s'}}>
              Month
            </button>
            <button
              onClick={() => setMonthMode('range')}
              style={{padding:'7px 14px',border:'none',cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'0.8125rem',fontWeight:600,
                background: monthMode==='range' ? 'var(--surface-container)' : 'var(--surface)',
                color:      monthMode==='range' ? '#ea580c' : 'var(--on-surface-variant)',
                transition:'all 0.15s'}}>
              Date Range
            </button>
          </div>

          {/* Month mode: existing multi-month picker */}
          {monthMode === 'month' && (
            <MonthMultiSelect
              availableMonths={availableMonths}
              selected={selectedMonths}
              onChange={setSelectedMonths}
            />
          )}

          {/* Date range mode: two date inputs */}
          {monthMode === 'range' && (
            <>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <label style={{fontSize:'0.75rem',fontWeight:600,color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>From</label>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={e => setRangeFrom(e.target.value)}
                  style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--surface-container-high)',fontSize:'0.875rem',background:'var(--surface)',color:'var(--on-surface)',outline:'none'}}
                />
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <label style={{fontSize:'0.75rem',fontWeight:600,color:'var(--on-surface-variant)',whiteSpace:'nowrap'}}>To</label>
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={e => setRangeTo(e.target.value)}
                  style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--surface-container-high)',fontSize:'0.875rem',background:'var(--surface)',color:'var(--on-surface)',outline:'none'}}
                />
              </div>
            </>
          )}

          {/* Reset button */}
          {(listEmpSelected.size > 0 || selectedMonths.size > 1 || monthMode === 'range') && (
            <button
              onClick={() => {
                setListEmpSelected(new Set());
                setSelectedMonths(new Set([getMonthKey(new Date())]));
                setMonthMode('month');
                const now = new Date();
                setRangeFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`);
                setRangeTo(toISODate(new Date(now.getFullYear(), now.getMonth()+1, 0)));
              }}
              style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--outline-variant)',background:'transparent',fontSize:'0.8rem',fontWeight:600,color:'#ea580c',cursor:'pointer'}}
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* List */}
      {loading?(
        <div style={{textAlign:'center',padding:48,color:'var(--on-surface-variant)'}}>
          <Icon name="hourglass_empty" style={{fontSize:'2rem'}}/><p>Loading…</p>
        </div>
      ):filtered.length===0?(
        <div style={{textAlign:'center',padding:48,background:'var(--surface-container-lowest)',borderRadius:16,border:'1px solid var(--surface-container-high)',color:'var(--on-surface-variant)'}}>
          <Icon name={view==='pending'?'task_alt':'inbox'} style={{fontSize:'2.5rem',marginBottom:8}}/>
          <p style={{fontWeight:600}}>{view==='pending'?'🎉 No pending timesheets!':'No timesheets found'}</p>
        </div>
      ):(
        <div data-tour="approvals-pending" style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(ts=>{
            const emp=getUser(ts);
            const initials=(emp.name||'U').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
            const rowEntryFilter = monthMode === 'range'
              ? (e) => isInDateRange(e.entry_date, rangeFrom, rangeTo)
              : (e) => isInAnySelectedMonth(e.entry_date, selectedMonths);
            const monthEntries=view==='monthly'?(ts.entries||[]).filter(rowEntryFilter):(ts.entries||[]);
            const totalH=view==='monthly'?monthEntries.reduce((s,e)=>s+parseFloat(e.hours||0),0):parseFloat(ts.total_hours||0);
            const isPending=ts.status==='submitted';
            return(
              <div key={ts.id} onClick={()=>setSelected(ts)}
                style={{display:'flex',alignItems:'center',gap:12,padding:'13px 14px',borderRadius:12,cursor:'pointer',background:isPending?'rgba(37,99,235,0.03)':'var(--surface-container-lowest)',border:isPending?'1px solid rgba(37,99,235,0.2)':'1px solid var(--surface-container-high)',transition:'background 0.15s',flexWrap:'wrap'}}
                onMouseEnter={e=>e.currentTarget.style.background=isPending?'rgba(37,99,235,0.07)':'var(--surface-container)'}
                onMouseLeave={e=>e.currentTarget.style.background=isPending?'rgba(37,99,235,0.03)':'var(--surface-container-lowest)'}
              >
                <div style={{width:38,height:38,borderRadius:'50%',flexShrink:0,background:'linear-gradient(135deg,#ea580c,#f97316)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'0.875rem'}}>{initials}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:0,fontWeight:700,fontSize:'0.9rem',color:'var(--on-surface)'}}>{emp.name}</p>
                  <p style={{margin:0,fontSize:'0.75rem',color:'var(--on-surface-variant)'}}>{weekLabel(ts.week_start)}</p>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <p style={{margin:0,fontWeight:800,fontSize:'1.1rem',color:'#ea580c'}}>{totalH.toFixed(1)}h</p>
                  <p style={{margin:0,fontSize:'0.7rem',color:'var(--on-surface-variant)'}}>{monthEntries.filter(e=>parseFloat(e.hours)>0).length} days</p>
                </div>
                <StatusBadge status={ts.status}/>
                {isPending&&<div style={{padding:'6px 14px',borderRadius:8,fontSize:'0.8rem',fontWeight:700,background:'linear-gradient(135deg,var(--primary-container),#3b82f6)',color:'#fff',flexShrink:0}}>Review →</div>}
              </div>
            );
          })}
        </div>
      )}

      {selected&&<DetailModal ts={selected} selectedMonths={view==='monthly'?selectedMonths:null} onClose={()=>setSelected(null)} onReviewed={()=>load()}/>}

      {/* ── Monthly hours chart — CEO/viewer, monthly tab only ── */}
      {view==='monthly'&&isCEO&&(
        <div style={{marginTop:28,background:'var(--surface-container-lowest)',border:'1px solid var(--surface-container-high)',borderRadius:16,padding:'20px 20px 12px'}}>
          <div style={{marginBottom:16}}>
            <h3 style={{margin:0,fontWeight:800,fontSize:'1rem',color:'var(--on-surface)'}}>
              Hours Overview — {monthMode === 'range' ? rangeModeLabel : monthsLabel}
            </h3>
            <p style={{margin:'3px 0 0',fontSize:'0.8rem',color:'var(--on-surface-variant)'}}>
              Approved hours only · {listEmpSelected.size > 0 ? `${listEmpSelected.size} employee${listEmpSelected.size>1?'s':''}` : 'all employees'}
              {monthMode === 'range'
                ? ' · use the date inputs above to change the range'
                : ' · use the filters above to change employee or month'}
            </p>
          </div>

          {monthlyChartData.length===0?(
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--on-surface-variant)'}}>
              <Icon name="bar_chart" style={{fontSize:'2.5rem',marginBottom:8}}/>
              <p style={{margin:0,fontWeight:600}}>
                No approved hours for {monthMode === 'range' ? rangeModeLabel : monthsLabel}
              </p>
            </div>
          ):(
            <MonthlyBarChart
              data={monthlyChartData}
              monthLabel={monthMode === 'range' ? rangeModeLabel : monthsLabel}
            />
          )}
        </div>
      )}

      <NexusTutorial page="approvals"/>
    </div>
  );
};

export default TimesheetApprovals;
