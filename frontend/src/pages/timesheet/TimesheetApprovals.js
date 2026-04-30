import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { timesheetAPI, usersAPI, formatApiError } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import NexusTutorial from '../../components/NexusTutorial';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const DAY_NAMES   = ['Fri','Sat','Sun','Mon','Tue','Wed','Thu'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BAR_COLORS = [
  '#004ac6','#ea580c','#16a34a','#9333ea','#0891b2',
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
function getUser(ts) {
  return ts['users!timesheets_user_id_fkey'] || ts.users || {};
}

const StatusBadge = ({ status }) => {
  const cfg = {
    draft:     { label:'Draft',     bg:'#f1f5f9', color:'#64748b' },
    submitted: { label:'Submitted', bg:'#eff6ff', color:'#2563eb' },
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
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const label = selected.size === 0 ? 'All Employees'
    : selected.size === options.length ? 'All Employees'
    : `${selected.size} employee${selected.size > 1 ? 's' : ''} selected`;

  const toggle = (id) => {
    let next;
    if (selected.size === 0) {
      // Currently "all shown" — clicking one deselects it, keeps everyone else
      next = new Set(options.map(o => o.id).filter(oid => oid !== id));
    } else {
      next = new Set(selected);
      if (next.has(id)) next.delete(id); else next.add(id);
    }
    // If empty or full → reset to "all" state (empty set)
    if (next.size === 0 || next.size === options.length) onChange(new Set());
    else onChange(next);
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:'1px solid var(--surface-container-high)', background:'var(--surface)', color:'var(--on-surface)', fontSize:'0.875rem', cursor:'pointer', minWidth:220, justifyContent:'space-between' }}>
        <span style={{ fontWeight: selected.size > 0 && selected.size < options.length ? 600 : 400 }}>{label}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} style={{ fontSize:'1.1rem', color:'var(--on-surface-variant)' }} />
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:200, background:'var(--surface)', borderRadius:12, border:'1px solid var(--outline-variant)', boxShadow:'0 8px 30px rgba(0,0,0,0.12)', minWidth:260, maxHeight:340, overflowY:'auto', padding:'6px 0' }}>
          <div style={{ display:'flex', gap:8, padding:'6px 12px', borderBottom:'1px solid var(--surface-container-high)' }}>
            <button onClick={() => onChange(new Set())} style={{ flex:1, padding:4, borderRadius:6, border:'none', background: selected.size === 0 ? '#eaedff' : 'transparent', color:'#004ac6', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>All</button>
            <button onClick={() => onChange(new Set(options.map(o => o.id)))} style={{ flex:1, padding:4, borderRadius:6, border:'none', background:'transparent', color:'var(--on-surface-variant)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>Clear</button>
          </div>
          {options.map((opt, i) => {
            const isChecked = selected.size === 0 || selected.has(opt.id);
            return (
              <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', background: isChecked ? 'rgba(0,74,198,0.04)' : 'transparent' }}>
                <input type="checkbox" checked={isChecked} onChange={() => toggle(opt.id)} style={{ accentColor:'#004ac6', width:15, height:15 }} />
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, background:BAR_COLORS[i % BAR_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'0.6875rem' }}>
                    {(opt.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                  <span style={{ fontSize:'0.875rem', color:'var(--on-surface)', fontWeight: isChecked ? 600 : 400 }}>{opt.name}</span>
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

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s,p) => s + (p.value || 0), 0);
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--outline-variant)', borderRadius:12, padding:'10px 14px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', minWidth:160 }}>
      <p style={{ margin:'0 0 8px', fontWeight:700, fontSize:'0.875rem', color:'var(--on-surface)' }}>{MONTH_NAMES[parseInt(label)-1]}</p>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:3 }}>
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.8125rem', color:'var(--on-surface-variant)' }}>
            <span style={{ width:10, height:10, borderRadius:3, background:p.color, display:'inline-block' }} />{p.dataKey}
          </span>
          <span style={{ fontWeight:700, color:p.color, fontSize:'0.8125rem' }}>{p.value.toFixed(1)}h</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ borderTop:'1px solid var(--surface-container-high)', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--on-surface)' }}>Total</span>
          <span style={{ fontSize:'0.8125rem', fontWeight:800, color:'var(--on-surface)' }}>{total.toFixed(1)}h</span>
        </div>
      )}
    </div>
  );
};

// ── Detail modal ─────────────────────────────────────────────
const DetailModal = ({ ts, onClose, onReviewed, monthDate }) => {
  const [note, setNote]     = useState('');
  const [acting, setActing] = useState(false);
  const [err, setErr]       = useState(null);
  if (!ts) return null;
  const emp = getUser(ts);
  const weekDaysAll = Array.from({length:7},(_,i)=>toISODate(addDays(new Date(ts.week_start+'T00:00:00'),i)));
  const weekDays = monthDate ? weekDaysAll.filter(d=>isInMonth(d,monthDate)) : weekDaysAll;
  const entriesMap = {};
  (ts.entries||[]).forEach(e=>{entriesMap[e.entry_date]=e;});
  const totalH = monthDate ? weekDays.reduce((s,d)=>s+parseFloat(entriesMap[d]?.hours||0),0) : parseFloat(ts.total_hours||0);
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
          <p style={{margin:'0 0 10px',fontWeight:700,fontSize:'0.875rem',color:'var(--on-surface)'}}>Daily Breakdown{monthDate?` (${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()})`:''}</p>
          {weekDays.map(date=>{
            const e=entriesMap[date]; const hrs=parseFloat(e?.hours||0);
            return(
              <div key={date} style={{display:'grid',gridTemplateColumns:'80px 55px 1fr',padding:'9px 0',borderBottom:'1px solid var(--surface-container-high)',alignItems:'start',gap:10}}>
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
  const isCEO      = user?.role === 'admin' || user?.role === 'viewer';

  const [view, setView]             = useState('all');
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterUser, setFilterUser]         = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [monthDate, setMonthDate]   = useState(new Date());
  const [weekStart, setWeekStart]   = useState(toISODate(getFridayOf(new Date())));
  const [yearlySummary, setYearlySummary] = useState([]);
  const [chartYear, setChartYear]         = useState(new Date().getFullYear());
  const [selectedEmps, setSelectedEmps]   = useState(new Set());
  const [listEmpFilter, setListEmpFilter] = useState(''); // monthly list employee filter (independent of chart)

  const YEAR_OPTIONS = useMemo(()=>Array.from(new Set(timesheets.map(ts=>new Date(ts.week_start+'T00:00:00').getFullYear()))).sort((a,b)=>b-a),[timesheets]);
  const EMP_OPTIONS  = useMemo(()=>Array.from(new Map(timesheets.map(ts=>{const u=getUser(ts);return[u.id||u.email||u.name,u];})).values()).filter(u=>u&&(u.id||u.email||u.name)),[timesheets]);

  const currentWeekStart = toISODate(getFridayOf(new Date()));
  const isCurrentWeek    = weekStart === currentWeekStart;
  const goWeek = dir => setWeekStart(toISODate(addDays(new Date(weekStart+'T00:00:00'),dir*7)));

  const load = useCallback(async () => {
    setLoading(true);
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
  }, [view, weekStart]);

  useEffect(()=>{load();},[load]);

  useEffect(()=>{
    if (view!=='monthly'||!isCEO) return;
    timesheetAPI.yearlySummary(chartYear)
      .then(res=>setYearlySummary(res.data?.data||[]))
      .catch(()=>setYearlySummary([]));
  },[view,isCEO,chartYear]);

  // Chart employees: top 10 by total approved hours for the year
  const chartEmployees = useMemo(()=>{
    const map = new Map();
    yearlySummary.forEach(r=>{
      if(!map.has(r.user_id)) map.set(r.user_id,{id:r.user_id,name:r.name,totalHours:0});
      map.get(r.user_id).totalHours+=parseFloat(r.total_hours||0);
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

  const filtered = useMemo(()=>timesheets.filter(ts=>{
    const emp=getUser(ts);
    if(filterUser&&!emp.name?.toLowerCase().includes(filterUser.toLowerCase())&&!emp.email?.toLowerCase().includes(filterUser.toLowerCase())) return false;
    if(filterEmployee){const key=emp.id||emp.email||emp.name;if(key!==filterEmployee)return false;}
    // monthly view: use its own list employee filter
    if(view==='monthly'&&listEmpFilter){const key=emp.id||emp.email||emp.name;if(key!==listEmpFilter)return false;}
    if(filterStatus&&ts.status!==filterStatus) return false;
    if(view==='monthly'&&!['submitted','approved'].includes(ts.status)) return false;
    if(view==='monthly') return (ts.entries||[]).some(e=>isInMonth(e.entry_date,monthDate));
    return true;
  }),[timesheets,filterUser,filterEmployee,listEmpFilter,filterStatus,view,monthDate]);

  const stats = useMemo(()=>{
    // KPI cards reflect the list — filtered by listEmpFilter in monthly view
    const base = view==='monthly'&&listEmpFilter
      ? timesheets.filter(ts=>{const key=getUser(ts).id||getUser(ts).email||getUser(ts).name; return key===listEmpFilter;})
      : timesheets;
    return {
      submitted:  base.filter(t=>t.status==='submitted').length,
      approved:   base.filter(t=>t.status==='approved').length,
      rejected:   base.filter(t=>t.status==='rejected').length,
      totalHours: base.filter(t=>t.status==='approved').reduce((s,t)=>s+parseFloat(t.total_hours||0),0),
    };
  },[timesheets,view,listEmpFilter]);

  const pendingCount = timesheets.filter(ts=>ts.status==='submitted').length;
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
            style={{padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.8125rem',fontWeight:view===tab.key?700:500,background:view===tab.key?'var(--surface)':'transparent',color:view===tab.key?'#ea580c':'var(--on-surface-variant)',boxShadow:view===tab.key?'var(--ambient-shadow)':'none',transition:'all 0.15s'}}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI cards — below tabs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:18}}>
        {[
          {label:'Pending',   value:stats.submitted,                  color:'#2563eb',bg:'#eff6ff',               icon:'hourglass_empty'},
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

      {/* Monthly view — list controls only (employee dropdown + month nav) */}
      {view==='monthly'&&(
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
          <select
            value={listEmpFilter}
            onChange={e=>setListEmpFilter(e.target.value)}
            style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--surface-container-high)',fontSize:'0.875rem',background:'var(--surface)',color:'var(--on-surface)',outline:'none',minWidth:200}}
          >
            <option value="">All Employees</option>
            {EMP_OPTIONS.map(u=>{const k=u.id||u.email||u.name;return<option key={k} value={k}>{u.name||u.email}</option>;})}
          </select>
          <button onClick={()=>setMonthDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1))} style={navBtn}><Icon name="chevron_left"/></button>
          <span style={{fontWeight:700,fontSize:'0.9rem',color:'var(--on-surface)',minWidth:130,textAlign:'center'}}>{MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}</span>
          <button onClick={()=>setMonthDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1))} style={navBtn}><Icon name="chevron_right"/></button>
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
            const monthEntries=view==='monthly'?(ts.entries||[]).filter(e=>isInMonth(e.entry_date,monthDate)):(ts.entries||[]);
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
                {isPending&&<div style={{padding:'6px 14px',borderRadius:8,fontSize:'0.8rem',fontWeight:700,background:'linear-gradient(135deg,#2563eb,#3b82f6)',color:'#fff',flexShrink:0}}>Review →</div>}
              </div>
            );
          })}
        </div>
      )}

      {selected&&<DetailModal ts={selected} monthDate={view==='monthly'?monthDate:null} onClose={()=>setSelected(null)} onReviewed={()=>load()}/>}

      {/* ── Annual hours chart — CEO/viewer, monthly tab only ── */}
      {view==='monthly'&&isCEO&&(
        <div style={{marginTop:28,background:'var(--surface-container-lowest)',border:'1px solid var(--surface-container-high)',borderRadius:16,padding:'20px 20px 12px'}}>
          {/* Chart header + its own independent controls */}
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:16,flexWrap:'wrap'}}>
            <div>
              <h3 style={{margin:0,fontWeight:800,fontSize:'1rem',color:'var(--on-surface)'}}>Annual Hours Overview</h3>
              <p style={{margin:'3px 0 0',fontSize:'0.8rem',color:'var(--on-surface-variant)'}}>
                Approved hours only · {activeMonths.length} month{activeMonths.length!==1?'s':''} with data
                {selectedEmps.size>0?` · ${visibleEmps.length} of ${chartEmployees.length} employees`:'· all employees'}
              </p>
            </div>
            {/* Chart's own filters */}
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <MultiSelect options={chartEmployees} selected={selectedEmps} onChange={setSelectedEmps}/>
              <select
                value={chartYear}
                onChange={e=>setChartYear(parseInt(e.target.value,10))}
                style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--surface-container-high)',fontSize:'0.875rem',background:'var(--surface)',color:'var(--on-surface)',outline:'none'}}
              >
                {(YEAR_OPTIONS.length>0?YEAR_OPTIONS:[new Date().getFullYear()]).map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {chartData.length===0?(
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--on-surface-variant)'}}>
              <Icon name="bar_chart" style={{fontSize:'2.5rem',marginBottom:8}}/>
              <p style={{margin:0,fontWeight:600}}>No approved hours found for {chartYear}</p>
            </div>
          ):(
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{top:4,right:16,left:-8,bottom:4}} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" vertical={false}/>
                <XAxis dataKey="month" tickFormatter={m=>MONTH_SHORT[parseInt(m)-1]} tick={{fontSize:12,fill:'var(--on-surface-variant)',fontFamily:'Inter,sans-serif'}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>`${v}h`} tick={{fontSize:12,fill:'var(--on-surface-variant)',fontFamily:'Inter,sans-serif'}} axisLine={false} tickLine={false}/>
                <Tooltip content={<ChartTooltip/>} cursor={{fill:'rgba(0,74,198,0.05)'}}/>
                <Legend wrapperStyle={{fontSize:'0.8125rem',fontFamily:'Inter,sans-serif',paddingTop:12}} iconType="square" iconSize={10}/>
                {visibleEmps.map((emp,i)=>(
                  <Bar key={emp.id} dataKey={emp.name} fill={BAR_COLORS[i%BAR_COLORS.length]} radius={[4,4,0,0]} maxBarSize={40}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <NexusTutorial page="approvals"/>
    </div>
  );
};

export default TimesheetApprovals;