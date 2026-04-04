import React, { useState, useRef, useEffect, useCallback } from 'react';
import { candidatesAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

const COLUMNS = [
  { key:'sourced',             label:'Sourced',             color:'var(--outline)',          bg:'rgba(115,118,134,0.08)' },
  { key:'screened',            label:'Screened',            color:'var(--secondary)',        bg:'rgba(81,95,116,0.08)' },
  { key:'shortlisted',         label:'Shortlisted',         color:'#d97706',                 bg:'rgba(217,119,6,0.08)' },
  { key:'interview_scheduled', label:'Interview Scheduled', color:'var(--primary)',          bg:'rgba(0,74,198,0.08)' },
  { key:'interviewed',         label:'Interviewed',         color:'var(--primary)',          bg:'rgba(0,74,198,0.1)' },
  { key:'selected',            label:'Selected',            color:'var(--tertiary)',         bg:'rgba(0,98,67,0.08)' },
];

// Pipeline data loaded from API

const SOURCE_COLOR = { LinkedIn:'var(--primary)', Referral:'var(--tertiary)', AngelList:'#7c3aed', Resume:'var(--amber)', Campus:'#d97706', Portfolio:'var(--secondary)' };

export default function Pipeline() {
  const navigate = useNavigate();
  const [cards, setCards]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [search, setSearch]   = useState('');
  const [jobFilter, setJobFilter] = useState('all');

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const res = await candidatesAPI.getAll({ limit: 500 });
      const data = Array.isArray(res.data) ? res.data
        : Array.isArray(res.data?.candidates) ? res.data.candidates
        : Array.isArray(res.data?.data) ? res.data.data : [];
      setCards(data.map(c => ({
        id:     c.id,
        name:   c.full_name,
        candidate_role: c.candidate_role || '',
        job:    c.job?.title || 'Unassigned',
        stage:  c.status,
        exp:    c.experience_years || 0,
        avatar: c.full_name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
        source: c.source || '',
      })));
    } catch { /* show empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const jobs = ['all', ...new Set(cards.map(c => c.job))];

  const filtered = cards.filter(c => {
    const q = search.toLowerCase();
    const mQ = !q || c.name.toLowerCase().includes(q) || c.candidate_role.toLowerCase().includes(q) || c.job.toLowerCase().includes(q);
    const mJ = jobFilter==='all' || c.job===jobFilter;
    return mQ && mJ;
  });

  const byStage = (key) => filtered.filter(c => c.stage === key);

  /* ── Drag handlers ── */
  const onDragStart = (e, card) => {
    setDragging(card);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.45';
  };

  const onDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDragging(null);
    setDragOver(null);
  };

  const onDragOver = (e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(colKey);
  };

  const onDrop = (e, colKey) => {
    e.preventDefault();
    if (!dragging || dragging.stage === colKey) return;
    setCards(cs => cs.map(c => c.id === dragging.id ? { ...c, stage: colKey } : c));
    setDragging(null);
    setDragOver(null);
  };

  const moveCard = (cardId, direction) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const idx = COLUMNS.findIndex(c => c.key === card.stage);
    const newIdx = direction === 'forward' ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= COLUMNS.length) return;
    setCards(cs => cs.map(c => c.id === cardId ? { ...c, stage: COLUMNS[newIdx].key } : c));
  };

  const rejectCard = (cardId) => {
    setCards(cs => cs.filter(c => c.id !== cardId));
  };

  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 120px)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:'1.25rem', flexShrink:0 }}>
        <div>
          <p className="label-sm" style={{ marginBottom:'0.25rem', color:'var(--tertiary)' }}>Recruitment ATS</p>
          <h1 className="headline-sm">Hiring Pipeline</h1>
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center' }}>
          <div className="search-bar" style={{ maxWidth:220 }}>
            <Icon name="search" style={{ position:'absolute', left:'0.625rem', top:'50%', transform:'translateY(-50%)', color:'var(--on-surface-variant)', fontSize:'1.1rem' }} />
            <input placeholder="Search candidates…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft:'2.25rem', width:'100%' }} />
          </div>
          <select className="select" style={{ width:'auto', minWidth:180 }} value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
            <option value="all">All Positions</option>
            {jobs.filter(j=>j!=='all').map(j => <option key={j}>{j}</option>)}
          </select>
          <a href="/recruitment/candidates" className="btn-secondary" style={{ fontSize:'0.8125rem' }}>
            <Icon name="view_list" style={{ fontSize:'1rem' }} /> List View
          </a>
        </div>
      </div>

      {/* Stage totals strip */}
      <div style={{ display:'flex', gap:'0.625rem', marginBottom:'1rem', flexShrink:0 }}>
        {COLUMNS.map(col => (
          <div key={col.key} style={{ flex:1, padding:'0.5rem 0.75rem', borderRadius:'0.5rem', background:col.bg, border:`1px solid ${col.color}22`, textAlign:'center' }}>
            <p style={{ fontSize:'1.125rem', fontWeight:800, color:'var(--on-surface)', lineHeight:1 }}>{byStage(col.key).length}</p>
            <p style={{ fontSize:'0.6875rem', fontWeight:700, color:col.color, textTransform:'uppercase', letterSpacing:'0.06em', marginTop:'0.125rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{col.label}</p>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div style={{ display:'flex', gap:'1rem', overflowX:'auto', flex:1, paddingBottom:'1rem' }}>
        {COLUMNS.map(col => {
          const colCards = byStage(col.key);
          const isOver   = dragOver === col.key;
          return (
            <div
              key={col.key}
              onDragOver={e => onDragOver(e, col.key)}
              onDrop={e => onDrop(e, col.key)}
              onDragLeave={() => setDragOver(null)}
              style={{
                minWidth:240, width:240, flexShrink:0, display:'flex', flexDirection:'column',
                background: isOver ? `${col.color}10` : 'var(--surface-container-low)',
                borderRadius:'0.875rem', padding:'0.875rem 0.75rem',
                border:`2px solid ${isOver ? col.color : 'transparent'}`,
                transition:'border 0.15s, background 0.15s',
              }}
            >
              {/* Column header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem', paddingBottom:'0.625rem', borderBottom:'1px solid var(--ghost-border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:col.color, flexShrink:0 }} />
                  <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--on-surface)' }}>{col.label}</span>
                </div>
                <span style={{ fontSize:'0.75rem', fontWeight:700, padding:'0.125rem 0.5rem', borderRadius:9999, background:`${col.color}14`, color:col.color }}>{colCards.length}</span>
              </div>

              {/* Cards */}
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                {colCards.length === 0 && (
                  <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'1.5rem 0', opacity:0.35 }}>
                    <Icon name="person_add" style={{ fontSize:'1.75rem', color:'var(--on-surface-variant)', display:'block', marginBottom:'0.375rem' }} />
                    <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', textAlign:'center' }}>Drop candidate here</p>
                  </div>
                )}

                {colCards.map(card => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={e => onDragStart(e, card)}
                    onDragEnd={onDragEnd}
                    style={{
                      background:'var(--surface-container-lowest)',
                      borderRadius:'0.625rem', padding:'0.875rem',
                      boxShadow:'var(--ambient-shadow)',
                      border:`1px solid ${col.color}18`,
                      cursor:'grab', transition:'transform 0.15s, box-shadow 0.15s',
                      userSelect:'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(19,27,46,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='var(--ambient-shadow)'; }}
                  >
                    {/* Candidate header */}
                    <div style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.625rem' }}>
                      <div className="avatar" style={{ width:32, height:32, fontSize:'0.6875rem', fontWeight:700, background:`${col.color}14`, color:col.color, flexShrink:0 }}>{card.avatar}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--on-surface)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{card.name}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{card.candidate_role}</p>
                      </div>
                    </div>

                    {/* Job */}
                    <p style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)', marginBottom:'0.5rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      <Icon name="work" style={{ fontSize:'0.875rem', verticalAlign:'middle', marginRight:'0.25rem' }} />
                      {card.job}
                    </p>

                    {/* Meta row */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:'0.6875rem', fontWeight:600, padding:'0.15rem 0.5rem', borderRadius:4, background:`${SOURCE_COLOR[card.source] || 'var(--outline)'}12`, color:SOURCE_COLOR[card.source] || 'var(--outline)' }}>{card.source}</span>
                      <span style={{ fontSize:'0.75rem', color:'var(--on-surface-variant)' }}>{card.exp}y exp</span>
                    </div>

                    {/* Card actions */}
                    <div style={{ display:'flex', gap:'0.25rem', marginTop:'0.625rem', paddingTop:'0.5rem', borderTop:'1px solid var(--ghost-border)', justifyContent:'space-between' }}>
                      <button className="btn-icon" style={{ width:28, height:28 }} title="View profile" onClick={() => navigate(`/recruitment/candidates/${card.id}`)}>
                        <Icon name="open_in_new" style={{ fontSize:'0.875rem' }} />
                      </button>
                      <button className="btn-icon" style={{ width:28, height:28 }} title="Move back" onClick={() => moveCard(card.id, 'back')} disabled={COLUMNS[0].key === col.key}>
                        <Icon name="chevron_left" style={{ fontSize:'0.875rem', opacity: COLUMNS[0].key === col.key ? 0.25 : 1 }} />
                      </button>
                      <button className="btn-icon" style={{ width:28, height:28, color:'var(--tertiary)' }} title="Move forward" onClick={() => moveCard(card.id, 'forward')} disabled={COLUMNS[COLUMNS.length-1].key === col.key}>
                        <Icon name="chevron_right" style={{ fontSize:'0.875rem', color:'inherit', opacity: COLUMNS[COLUMNS.length-1].key === col.key ? 0.25 : 1 }} />
                      </button>
                      <button className="btn-icon" style={{ width:28, height:28, color:'var(--error)' }} title="Reject" onClick={() => rejectCard(card.id)}>
                        <Icon name="close" style={{ fontSize:'0.875rem', color:'inherit' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
