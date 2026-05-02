import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { expensesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

/* ── Icons ─────────────────────────────────────────────────── */
const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined"
    style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>
    {name}
  </span>
);

/* ── Category palette ───────────────────────────────────────── */
const CAT_META = {
  payroll:        { label: 'Payroll',         icon: 'payments',       color: '#3b82f6', light: 'rgba(59,130,246,0.12)' },
  subscriptions:  { label: 'Subscriptions',   icon: 'subscriptions',  color: '#8b5cf6', light: 'rgba(139,92,246,0.12)' },
  infrastructure: { label: 'Infrastructure',  icon: 'cloud',          color: '#6366f1', light: 'rgba(99,102,241,0.12)' },
  travel:         { label: 'Travel',          icon: 'flight',         color: '#f97316', light: 'rgba(249,115,22,0.12)' },
  accommodation:  { label: 'Accommodation',   icon: 'hotel',          color: '#d97706', light: 'rgba(217,119,6,0.12)'  },
  meals:          { label: 'Meals',           icon: 'restaurant',     color: '#10b981', light: 'rgba(16,185,129,0.12)' },
  office_supplies:{ label: 'Office Supplies', icon: 'inventory_2',    color: '#0d9488', light: 'rgba(13,148,136,0.12)' },
  marketing:      { label: 'Marketing',       icon: 'campaign',       color: '#ec4899', light: 'rgba(236,72,153,0.12)' },
  other:          { label: 'Other',           icon: 'category',       color: '#94a3b8', light: 'rgba(148,163,184,0.12)' },
};
const CATEGORIES = Object.keys(CAT_META);
const CURRENCIES  = ['EUR', 'INR'];

/* ── Currency formatters ────────────────────────────────────── */
const fmtCurrency = (amount, currency) => {
  const n = Number(amount) || 0;
  if (currency === 'EUR')
    return `€${n.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtShort = (amount, currency) => {
  const n = Number(amount) || 0;
  const sym = currency === 'EUR' ? '€' : '₹';
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_00_000 && currency === 'INR') return `${sym}${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)  return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toFixed(currency === 'EUR' ? 2 : 0)}`;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ── KPI Card ───────────────────────────────────────────────── */
const KpiCard = ({ label, valueEur, valueInr, displayCcy, sub, icon, accent, iconBg }) => (
  <div style={{
    background: 'var(--surface-container-lowest)',
    borderRadius: '1rem',
    padding: '1.25rem 1.5rem',
    display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    border: '1px solid var(--outline-variant)',
    position: 'relative', overflow: 'hidden',
    transition: 'box-shadow 0.2s',
  }}
    className="hover-lift"
  >
    <div style={{
      width: 44, height: 44, borderRadius: '0.75rem',
      background: iconBg || 'rgba(68,104,176,0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon name={icon} style={{ fontSize: '1.375rem', color: accent || 'var(--primary)' }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginBottom: '0.25rem', fontWeight: 500 }}>
        {label}
      </p>
      <p style={{ fontSize: '1.625rem', fontWeight: 800, color: 'var(--on-surface)', lineHeight: 1.1 }}>
        {fmtShort(displayCcy === 'EUR' ? valueEur : valueInr, displayCcy)}
      </p>
      {sub && (
        <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>{sub}</p>
      )}
    </div>
    <div style={{
      position: 'absolute', bottom: -10, right: -10,
      opacity: 0.06,
    }}>
      <Icon name={icon} style={{ fontSize: '5rem', color: accent || 'var(--primary)' }} />
    </div>
  </div>
);

/* ── Category Badge ─────────────────────────────────────────── */
const CatBadge = ({ category }) => {
  const m = CAT_META[category] || CAT_META.other;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.2rem 0.625rem', borderRadius: 9999,
      fontSize: '0.6875rem', fontWeight: 700,
      background: m.light, color: m.color, whiteSpace: 'nowrap',
    }}>
      <Icon name={m.icon} style={{ fontSize: '0.875rem', color: m.color }} />
      {m.label}
    </span>
  );
};

/* ── Custom Donut tooltip ───────────────────────────────────── */
const DonutTooltip = ({ active, payload, displayCcy }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{
      background: 'var(--surface-container-lowest)',
      border: '1px solid var(--outline-variant)',
      borderRadius: '0.625rem', padding: '0.625rem 0.875rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      fontSize: '0.8125rem',
    }}>
      <p style={{ fontWeight: 700, marginBottom: 2 }}>{d.name}</p>
      <p style={{ color: d.payload.color }}>
        {fmtCurrency(displayCcy === 'EUR' ? d.payload.eur : d.payload.inr, displayCcy)}
      </p>
      <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.75rem' }}>{d.payload.count} entries</p>
    </div>
  );
};

/* ── Bar tooltip ────────────────────────────────────────────── */
const BarTooltip = ({ active, payload, label, displayCcy }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{
      background: 'var(--surface-container-lowest)',
      border: '1px solid var(--outline-variant)',
      borderRadius: '0.75rem', padding: '0.75rem 1rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      minWidth: 180,
    }}>
      <p style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.8125rem' }}>{label}</p>
      <p style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)', marginBottom: '0.5rem' }}>
        {fmtCurrency(total, displayCcy)}
      </p>
      {payload.filter(p => p.value > 0).map(p => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.75rem', marginBottom: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.fill, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ fontWeight: 600 }}>{fmtShort(p.value, displayCcy)}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Add / Edit Expense Modal ───────────────────────────────── */
const ExpenseModal = ({ expense, onClose, onSave }) => {
  const isEdit = !!expense?.id;
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    title:                expense?.title         || '',
    vendor:               expense?.vendor        || '',
    amount:               expense?.amount        || '',
    currency:             expense?.currency      || 'INR',
    category:             expense?.category      || 'subscriptions',
    expense_date:         expense?.expense_date  || new Date().toISOString().slice(0, 10),
    description:          expense?.description   || '',
    worker_name:          expense?.worker_name   || '',
    skill:                expense?.skill         || '',
    hours_worked:         expense?.hours_worked  || '',
    rate_per_hour:        expense?.rate_per_hour || '',
    total_amount_in_words: expense?.total_amount_in_words || '',
    invoice_period_start: expense?.invoice_period_start || '',
    invoice_period_end:   expense?.invoice_period_end   || '',
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isPayroll = form.category === 'payroll';

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setReceiptFile(null); return; }
    const ok = ['application/pdf','image/jpeg','image/jpg','image/png','image/webp'];
    if (!ok.includes(f.type)) { setError('Receipt must be PDF, JPG, PNG, or WEBP.'); return; }
    if (f.size > 15 * 1024 * 1024) { setError('Receipt too large. Max 15 MB.'); return; }
    setError('');
    setReceiptFile(f);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Amount must be greater than 0.'); return; }
    if (!form.expense_date) { setError('Date is required.'); return; }
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        // JSON update (no file change on edit)
        const patch = {};
        ['title','vendor','amount','currency','category','expense_date','description',
         'worker_name','skill','hours_worked','rate_per_hour','total_amount_in_words',
         'invoice_period_start','invoice_period_end'].forEach(k => {
          if (form[k] !== '' && form[k] != null) patch[k] = form[k];
        });
        patch.amount = Number(patch.amount);
        await expensesAPI.update(expense.id, patch);
      } else {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => { if (v !== '' && v != null) fd.append(k, v); });
        if (receiptFile) fd.append('receipt', receiptFile);
        await expensesAPI.create(fd);
      }
      onSave();
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.message) {
        setError(detail.message);
      } else if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError('Failed to save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem', border: '1px solid var(--outline-variant)',
    background: 'var(--surface-container)',
    color: 'var(--on-surface)', fontSize: '0.875rem',
    fontFamily: 'var(--font-ui)', outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: '0.25rem', display: 'block' };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {isEdit ? 'Edit Expense' : 'Add Expense'}
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>
              {isEdit ? 'Update expense details' : 'Record a new business expense'}
            </p>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.75rem 1rem', borderRadius: '0.625rem',
            background: 'var(--error-container)', color: 'var(--on-error-container)',
            marginBottom: '1rem', fontSize: '0.875rem',
          }}>
            <Icon name="error" style={{ color: 'var(--error)' }} />
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Title */}
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="e.g. GitHub Copilot — March 2025" />
          </div>

          {/* Vendor */}
          <div>
            <label style={labelStyle}>Vendor</label>
            <input style={inputStyle} value={form.vendor} onChange={e => set('vendor', e.target.value)}
              placeholder="e.g. GitHub, AWS, Notion" />
          </div>

          {/* Category */}
          <div>
            <label style={labelStyle}>Category *</label>
            <select style={inputStyle} value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{CAT_META[c].label}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label style={labelStyle}>Amount *</label>
            <input style={inputStyle} type="number" min="0.01" step="0.01"
              value={form.amount} onChange={e => set('amount', e.target.value)}
              placeholder="0.00" />
          </div>

          {/* Currency */}
          <div>
            <label style={labelStyle}>Currency *</label>
            <select style={inputStyle} value={form.currency} onChange={e => set('currency', e.target.value)}>
              <option value="EUR">EUR (€) — Ireland</option>
              <option value="INR">INR (₹) — India</option>
            </select>
          </div>

          {/* Date */}
          <div>
            <label style={labelStyle}>Date *</label>
            <input style={inputStyle} type="date" value={form.expense_date}
              onChange={e => set('expense_date', e.target.value)} />
          </div>

          {/* Description */}
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Optional notes or context" />
          </div>

          {/* Payroll-specific fields */}
          {isPayroll && (
            <>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{
                  padding: '0.625rem 0.875rem', borderRadius: '0.5rem',
                  background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)',
                  marginBottom: '0.25rem',
                }}>
                  <p style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>
                    <Icon name="payments" style={{ fontSize: '0.875rem', color: '#3b82f6', marginRight: 4 }} />
                    Payroll Details
                  </p>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Worker Name</label>
                <input style={inputStyle} value={form.worker_name}
                  onChange={e => set('worker_name', e.target.value)} placeholder="Employee / contractor name" />
              </div>
              <div>
                <label style={labelStyle}>Skill / Role</label>
                <input style={inputStyle} value={form.skill}
                  onChange={e => set('skill', e.target.value)} placeholder="e.g. Plotly Dash, React" />
              </div>
              <div>
                <label style={labelStyle}>Hours Worked</label>
                <input style={inputStyle} type="number" min="0" step="0.5"
                  value={form.hours_worked} onChange={e => set('hours_worked', e.target.value)}
                  placeholder="e.g. 57" />
              </div>
              <div>
                <label style={labelStyle}>Rate per Hour ({form.currency})</label>
                <input style={inputStyle} type="number" min="0" step="0.01"
                  value={form.rate_per_hour} onChange={e => set('rate_per_hour', e.target.value)}
                  placeholder="e.g. 720" />
              </div>
              <div>
                <label style={labelStyle}>Invoice Period — Start</label>
                <input style={inputStyle} value={form.invoice_period_start}
                  onChange={e => set('invoice_period_start', e.target.value)}
                  placeholder="01-01-2025" />
              </div>
              <div>
                <label style={labelStyle}>Invoice Period — End</label>
                <input style={inputStyle} value={form.invoice_period_end}
                  onChange={e => set('invoice_period_end', e.target.value)}
                  placeholder="31-01-2025" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Amount in Words</label>
                <input style={inputStyle} value={form.total_amount_in_words}
                  onChange={e => set('total_amount_in_words', e.target.value)}
                  placeholder="e.g. Forty One Thousand Rupees Only" />
              </div>
            </>
          )}

          {/* Receipt upload (create only) */}
          {!isEdit && (
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Receipt / Invoice File</label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${receiptFile ? 'var(--tertiary)' : 'var(--outline-variant)'}`,
                  borderRadius: '0.625rem',
                  padding: '1rem',
                  cursor: 'pointer',
                  background: receiptFile ? 'rgba(0,98,67,0.04)' : 'var(--surface-container)',
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  transition: 'all 0.2s',
                }}>
                <Icon name={receiptFile ? 'check_circle' : 'upload_file'}
                  style={{ color: receiptFile ? 'var(--tertiary)' : 'var(--on-surface-variant)', fontSize: '1.5rem' }} />
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: receiptFile ? 'var(--tertiary)' : 'var(--on-surface)' }}>
                    {receiptFile ? receiptFile.name : 'Click to upload receipt'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                    PDF, JPG, PNG, WEBP — max 15 MB
                  </p>
                </div>
                {receiptFile && (
                  <button
                    onClick={e => { e.stopPropagation(); setReceiptFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}>
                    <Icon name="close" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }} onChange={handleFile} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            {saving
              ? <><Icon name="progress_activity" style={{ fontSize: '1rem' }} /> Saving…</>
              : <><Icon name={isEdit ? 'save' : 'add_circle'} style={{ fontSize: '1rem' }} />
                  {isEdit ? 'Save Changes' : 'Add Expense'}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Delete Confirm Modal ───────────────────────────────────── */
const DeleteModal = ({ expense, onClose, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await expensesAPI.delete(expense.id);
      onDeleted(expense.id);
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : detail?.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay scale-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--error-container)', margin: '0 auto 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="delete_forever" style={{ fontSize: '1.75rem', color: 'var(--error)' }} />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Delete Expense?</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
            <strong>{expense.title}</strong> will be permanently deleted.
            {expense.receipt_url && ' The receipt file will also be removed from Google Drive.'}
          </p>
          {error && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--error)' }}>{error}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button
            onClick={handleDelete} disabled={deleting}
            style={{
              flex: 1, padding: '0.625rem', borderRadius: '0.625rem',
              background: 'var(--error)', color: '#fff', border: 'none',
              cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
            }}>
            {deleting ? <><Icon name="progress_activity" style={{ fontSize: '1rem' }} /> Deleting…</>
              : <><Icon name="delete" style={{ fontSize: '1rem' }} /> Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function ExpenseTracker() {
  const { can } = useAuth();
  const isAdmin = can('canDelete');

  // ── State ──────────────────────────────────────────────────
  const [summary, setSummary]       = useState(null);
  const [expenses, setExpenses]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError]           = useState('');
  const [displayCcy, setDisplayCcy] = useState('EUR');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Filters
  const [filterMonth, setFilterMonth]   = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterCcy, setFilterCcy]       = useState('');
  const [searchText, setSearchText]     = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  // Modals
  const [showAdd, setShowAdd]       = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [delTarget, setDelTarget]   = useState(null);

  // ── Fetch summary ──────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const r = await expensesAPI.getSummary(selectedYear);
      setSummary(r.data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to load expense summary.');
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedYear]);

  // ── Fetch expense list ─────────────────────────────────────
  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 500 };
      if (filterMonth) params.month = filterMonth;
      else if (selectedYear) params.year = selectedYear;
      if (filterCat)  params.category = filterCat;
      if (filterCcy)  params.currency = filterCcy;
      const r = await expensesAPI.getAll(params);
      const data = Array.isArray(r.data?.expenses) ? r.data.expenses : [];
      setExpenses(data);
      setPage(1);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterCat, filterCcy, selectedYear]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // ── Client-side search filter ──────────────────────────────
  const filtered = useMemo(() => {
    if (!searchText.trim()) return expenses;
    const s = searchText.toLowerCase();
    return expenses.filter(e =>
      (e.title || '').toLowerCase().includes(s) ||
      (e.vendor || '').toLowerCase().includes(s) ||
      (e.worker_name || '').toLowerCase().includes(s) ||
      (e.description || '').toLowerCase().includes(s)
    );
  }, [expenses, searchText]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ── Chart data ─────────────────────────────────────────────
  const barData = useMemo(() => {
    if (!summary?.monthly_data) return [];
    return summary.monthly_data.map(m => {
      const [yr, mo] = m.month.split('-');
      const entry = { month: MONTH_NAMES[parseInt(mo, 10) - 1] };
      Object.keys(CAT_META).forEach(cat => {
        entry[cat] = displayCcy === 'EUR' ? (m[`${cat}_eur`] || 0) : (m[`${cat}_inr`] || 0);
      });
      entry._total = displayCcy === 'EUR' ? m.total_eur : m.total_inr;
      return entry;
    });
  }, [summary, displayCcy]);

  const donutData = useMemo(() => {
    if (!summary?.by_category) return [];
    return summary.by_category
      .filter(c => (displayCcy === 'EUR' ? c.eur : c.inr) > 0)
      .map(c => ({
        name: CAT_META[c.category]?.label || c.category,
        value: displayCcy === 'EUR' ? c.eur : c.inr,
        eur: c.eur, inr: c.inr, count: c.count,
        color: CAT_META[c.category]?.color || '#94a3b8',
      }));
  }, [summary, displayCcy]);

  // ── Helpers ────────────────────────────────────────────────
  const clearFilters = () => {
    setFilterMonth(''); setFilterCat(''); setFilterCcy(''); setSearchText(''); setPage(1);
  };
  const hasFilter = filterMonth || filterCat || filterCcy || searchText;

  const handleSaved = () => { fetchExpenses(); fetchSummary(); };
  const handleDeleted = (id) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    fetchSummary();
  };

  // ── Year options ───────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // ── Month options for filter ───────────────────────────────
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const mo = String(i + 1).padStart(2, '0');
    return { value: `${selectedYear}-${mo}`, label: `${MONTH_NAMES[i]} ${selectedYear}` };
  });

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="fade-in">
      {/* ── Page header ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="label-sm" style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="receipt_long" style={{ fontSize: '1rem' }} />
            Finance
          </p>
          <h1 className="headline-sm">Expense Tracker</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', marginTop: '0.125rem' }}>
            Business expenses across Ireland (EUR) &amp; India (INR)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={e => { setSelectedYear(Number(e.target.value)); setFilterMonth(''); }}
            className="select" style={{ width: 'auto', minWidth: 80 }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Currency toggle */}
          <div style={{
            display: 'flex', gap: 3, padding: 3,
            background: 'var(--surface-container-high)', borderRadius: '0.625rem',
          }}>
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setDisplayCcy(c)} style={{
                padding: '0.375rem 0.875rem', borderRadius: '0.5rem', border: 'none',
                cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700,
                fontFamily: 'var(--font-display)',
                background: displayCcy === c ? 'var(--primary)' : 'transparent',
                color: displayCcy === c ? '#fff' : 'var(--on-surface-variant)',
                transition: 'all 0.2s',
              }}>
                {c === 'EUR' ? '€ EUR' : '₹ INR'}
              </button>
            ))}
          </div>

          {/* FX rate pill */}
          {summary?.fx && (
            <div style={{
              padding: '0.375rem 0.75rem', borderRadius: '2rem',
              background: 'rgba(0,98,67,0.08)', border: '1px solid rgba(0,98,67,0.2)',
              fontSize: '0.75rem', color: 'var(--tertiary)', fontWeight: 600,
            }}>
              <Icon name="currency_exchange" style={{ fontSize: '0.875rem', color: 'var(--tertiary)', marginRight: 4 }} />
              1 EUR = ₹{Number(summary.fx.eur_to_inr).toFixed(2)}
              {summary.fx.date && summary.fx.date !== 'fallback' && (
                <span style={{ opacity: 0.7, fontWeight: 400 }}> · {summary.fx.date}</span>
              )}
            </div>
          )}

          {/* Refresh */}
          <button className="btn-secondary" onClick={() => { fetchSummary(); fetchExpenses(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="refresh" style={{ fontSize: '1rem' }} /> Refresh
          </button>

          {/* Add expense */}
          <button className="btn-primary" onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Icon name="add" style={{ fontSize: '1rem' }} /> Add Expense
          </button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────── */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.875rem 1rem', borderRadius: '0.75rem',
          background: 'var(--error-container)', color: 'var(--on-error-container)',
          marginBottom: '1.25rem', fontSize: '0.875rem',
        }}>
          <Icon name="error" style={{ color: 'var(--error)' }} />
          {error}
          <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}
            onClick={() => setError('')}>
            <Icon name="close" />
          </button>
        </div>
      )}

      {/* ── KPI cards ────────────────────────────────────── */}
      {summaryLoading
        ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ height: 108, borderRadius: '1rem', background: 'var(--surface-container)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        : summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <KpiCard label={`This Month — ${MONTH_NAMES[new Date().getMonth()]} ${selectedYear}`}
              valueEur={summary.this_month?.eur} valueInr={summary.this_month?.inr}
              displayCcy={displayCcy} icon="today" accent="#3b82f6" iconBg="rgba(59,130,246,0.1)"
              sub={`${summary.this_month?.count || 0} entries`} />
            <KpiCard label={`YTD — ${selectedYear}`}
              valueEur={summary.ytd?.eur} valueInr={summary.ytd?.inr}
              displayCcy={displayCcy} icon="calendar_today" accent="var(--primary)" iconBg="rgba(68,104,176,0.1)"
              sub={summary.ytd?.yoy_pct != null && summary.ytd?.yoy_pct !== 0
                ? `${summary.ytd.yoy_pct > 0 ? '▲' : '▼'} ${Math.abs(summary.ytd.yoy_pct)}% vs ${selectedYear - 1}`
                : `${summary.ytd?.count || 0} total entries`} />
            <KpiCard label="Subscriptions This Month"
              valueEur={summary.subscriptions_this_month?.eur}
              valueInr={summary.subscriptions_this_month?.inr}
              displayCcy={displayCcy} icon="subscriptions" accent="#8b5cf6" iconBg="rgba(139,92,246,0.1)"
              sub={`${summary.subscriptions_this_month?.count || 0} active`} />
            <KpiCard label="Total Entries"
              valueEur={summary.ytd?.eur} valueInr={summary.ytd?.inr}
              displayCcy={displayCcy} icon="receipt_long" accent="var(--tertiary)" iconBg="rgba(0,98,67,0.1)"
              sub={`${summary.ytd?.count || 0} records this year`} />
          </div>
        )
      }

      {/* ── Charts row ───────────────────────────────────── */}
      {!summaryLoading && summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem', marginBottom: '1.5rem' }}>

          {/* Monthly bar chart */}
          <div style={{
            background: 'var(--surface-container-lowest)',
            borderRadius: '1rem', padding: '1.5rem',
            border: '1px solid var(--outline-variant)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Monthly Spend</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                  {selectedYear} — stacked by category
                </p>
              </div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.375rem', maxWidth: 380, justifyContent: 'flex-end',
              }}>
                {Object.entries(CAT_META).map(([k, v]) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6875rem', color: 'var(--on-surface-variant)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.color, display: 'inline-block' }} />
                    {v.label}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmtShort(v, displayCcy)} />
                <Tooltip content={<BarTooltip displayCcy={displayCcy} />} />
                {Object.entries(CAT_META).map(([key, meta]) => (
                  <Bar key={key} dataKey={key} name={meta.label} stackId="a" fill={meta.color}
                    radius={key === 'other' ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Category donut */}
          <div style={{
            background: 'var(--surface-container-lowest)',
            borderRadius: '1rem', padding: '1.5rem',
            border: '1px solid var(--outline-variant)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <p style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 4 }}>By Category</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginBottom: '1rem' }}>
              {selectedYear} YTD breakdown
            </p>
            {donutData.length === 0
              ? (
                <div style={{ textAlign: 'center', paddingTop: '3rem', color: 'var(--on-surface-variant)' }}>
                  <Icon name="pie_chart" style={{ fontSize: '2rem', display: 'block', margin: '0 auto 0.5rem' }} />
                  No data for {selectedYear}
                </div>
              )
              : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%"
                      innerRadius={65} outerRadius={95}
                      paddingAngle={2} dataKey="value">
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip displayCcy={displayCcy} />} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{value}</span>
                      )}
                      iconSize={8} iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              )
            }

            {/* Category totals list */}
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--outline-variant)', paddingTop: '0.75rem' }}>
              {summary.by_category?.slice(0, 4).map(c => {
                const m = CAT_META[c.category] || CAT_META.other;
                const val = displayCcy === 'EUR' ? c.eur : c.inr;
                const total = displayCcy === 'EUR' ? (summary.ytd?.eur || 1) : (summary.ytd?.inr || 1);
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return (
                  <div key={c.category} style={{ marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                        {m.label}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {fmtShort(val, displayCcy)} <span style={{ color: 'var(--on-surface-variant)', fontWeight: 400 }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-container-high)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: m.color, borderRadius: 2, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────── */}
      <div style={{
        background: 'var(--surface-container-lowest)',
        borderRadius: '0.875rem', padding: '1rem',
        border: '1px solid var(--outline-variant)',
        marginBottom: '1rem',
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center',
      }}>
        <Icon name="filter_list" style={{ color: 'var(--on-surface-variant)' }} />

        {/* Month filter */}
        <select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
          className="select" style={{ width: 'auto', minWidth: 140 }}>
          <option value="">All Months</option>
          {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Category filter */}
        <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}
          className="select" style={{ width: 'auto', minWidth: 150 }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CAT_META[c].label}</option>)}
        </select>

        {/* Currency filter */}
        <select value={filterCcy} onChange={e => { setFilterCcy(e.target.value); setPage(1); }}
          className="select" style={{ width: 'auto', minWidth: 110 }}>
          <option value="">All Currencies</option>
          <option value="EUR">EUR (€)</option>
          <option value="INR">INR (₹)</option>
        </select>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 200 }}>
          <Icon name="search" style={{ color: 'var(--on-surface-variant)' }} />
          <input value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }}
            placeholder="Search vendor, title, worker…"
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: '0.875rem', color: 'var(--on-surface)', flex: 1,
              fontFamily: 'var(--font-ui)',
            }} />
        </div>

        {/* Clear */}
        {hasFilter && (
          <button className="btn-ghost" onClick={clearFilters}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem' }}>
            <Icon name="filter_alt_off" style={{ fontSize: '0.875rem' }} />
            Clear
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>

      {/* ── Expense Table ─────────────────────────────────── */}
      <div style={{
        background: 'var(--surface-container-lowest)',
        borderRadius: '0.875rem',
        border: '1px solid var(--outline-variant)',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {loading
          ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--on-surface-variant)' }}>
              <Icon name="progress_activity" style={{ fontSize: '2rem', display: 'block', margin: '0 auto 0.75rem' }} />
              Loading expenses…
            </div>
          )
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-container)', borderBottom: '1px solid var(--outline-variant)' }}>
                  {['Date', 'Title / Vendor', 'Category', 'Amount', 'Currency', 'Receipt', isAdmin ? 'Actions' : ''].filter(Boolean).map(h => (
                    <th key={h} style={{
                      padding: '0.75rem 1rem', textAlign: 'left',
                      fontSize: '0.75rem', fontWeight: 700,
                      color: 'var(--on-surface-variant)',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0
                  ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--on-surface-variant)' }}>
                        <Icon name="receipt_long" style={{ fontSize: '2rem', display: 'block', margin: '0 auto 0.5rem' }} />
                        {hasFilter ? 'No expenses match your filters.' : 'No expenses recorded yet. Click "Add Expense" to start.'}
                      </td>
                    </tr>
                  )
                  : paged.map((exp, idx) => {
                    const isEven = idx % 2 === 0;
                    return (
                      <tr key={exp.id} style={{
                        borderBottom: '1px solid var(--outline-variant)',
                        background: isEven ? 'transparent' : 'var(--surface-container-lowest)',
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container)'}
                        onMouseLeave={e => e.currentTarget.style.background = isEven ? 'transparent' : 'var(--surface-container-lowest)'}
                      >
                        {/* Date */}
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>
                          {exp.expense_date || '—'}
                        </td>

                        {/* Title / Vendor */}
                        <td style={{ padding: '0.75rem 1rem', maxWidth: 240 }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {exp.title}
                          </p>
                          {exp.vendor && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>{exp.vendor}</p>
                          )}
                          {exp.worker_name && (
                            <p style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                              <Icon name="person" style={{ fontSize: '0.75rem', color: '#3b82f6' }} /> {exp.worker_name}
                              {exp.skill && ` · ${exp.skill}`}
                            </p>
                          )}
                        </td>

                        {/* Category */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <CatBadge category={exp.category} />
                        </td>

                        {/* Amount */}
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--on-surface)', whiteSpace: 'nowrap' }}>
                          {fmtCurrency(exp.amount, exp.currency)}
                        </td>

                        {/* Currency flag */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            fontSize: '0.75rem', fontWeight: 700,
                            padding: '0.2rem 0.5rem', borderRadius: 4,
                            background: exp.currency === 'EUR' ? 'rgba(99,102,241,0.1)' : 'rgba(0,98,67,0.1)',
                            color: exp.currency === 'EUR' ? '#6366f1' : 'var(--tertiary)',
                          }}>
                            {exp.currency === 'EUR' ? '🇮🇪 EUR' : '🇮🇳 INR'}
                          </span>
                        </td>

                        {/* Receipt */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {exp.receipt_url
                            ? (
                              <a href={exp.receipt_url.replace('/preview', '/view')}
                                target="_blank" rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                  fontSize: '0.75rem', fontWeight: 600,
                                  color: 'var(--primary)', textDecoration: 'none',
                                  padding: '0.25rem 0.5rem', borderRadius: '0.375rem',
                                  background: 'rgba(68,104,176,0.08)',
                                }}>
                                <Icon name="open_in_new" style={{ fontSize: '0.875rem' }} />
                                View
                              </a>
                            )
                            : <span style={{ color: 'var(--outline)', fontSize: '0.8125rem' }}>—</span>
                          }
                        </td>

                        {/* Actions */}
                        {isAdmin && (
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button className="btn-icon" title="Edit"
                                onClick={() => setEditTarget(exp)}
                                style={{ width: 30, height: 30 }}>
                                <Icon name="edit" style={{ fontSize: '1rem' }} />
                              </button>
                              <button className="btn-icon" title="Delete"
                                onClick={() => setDelTarget(exp)}
                                style={{ width: 30, height: 30, color: 'var(--error)' }}>
                                <Icon name="delete" style={{ fontSize: '1rem', color: 'var(--error)' }} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          )
        }

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.875rem 1.25rem', borderTop: '1px solid var(--outline-variant)',
          }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)' }}>
              Showing <b>{Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–{Math.min(page * PER_PAGE, filtered.length)}</b> of <b>{filtered.length}</b>
            </p>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="btn-icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <Icon name="chevron_left" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, i, arr) => (
                  <React.Fragment key={p}>
                    {i > 0 && arr[i - 1] !== p - 1 && (
                      <span style={{ padding: '0 0.25rem', color: 'var(--on-surface-variant)' }}>…</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      style={{
                        width: 32, height: 32, borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
                        background: page === p ? 'var(--primary)' : 'transparent',
                        color: page === p ? '#fff' : 'var(--on-surface)',
                        fontWeight: page === p ? 700 : 400, fontSize: '0.875rem',
                      }}>
                      {p}
                    </button>
                  </React.Fragment>
                ))
              }
              <button className="btn-icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <Icon name="chevron_right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────── */}
      {showAdd    && <ExpenseModal onClose={() => setShowAdd(false)} onSave={handleSaved} />}
      {editTarget && <ExpenseModal expense={editTarget} onClose={() => setEditTarget(null)} onSave={handleSaved} />}
      {delTarget  && <DeleteModal  expense={delTarget}  onClose={() => setDelTarget(null)}  onDeleted={handleDeleted} />}
    </div>
  );
}
