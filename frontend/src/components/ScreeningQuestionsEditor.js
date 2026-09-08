/**
 * ScreeningQuestionsEditor.js
 *
 * Shared question builder mounted inside the Post New Job and Edit Job modals.
 *
 * Contract:
 *   value    — array of question objects (may be undefined on old jobs)
 *   onChange — called with the full next array on every edit
 *
 * Question shape (identical to what the backend stores and validates):
 *   { id, label, type, options: [], required: bool }
 *
 * Notes:
 *   • Every sub-component is defined at module level. Defining them inside the
 *     render function would remount them on each keystroke and steal focus.
 *   • The section collapses to a single line when there are no questions, so
 *     the modal looks unchanged for anyone not using the feature.
 */

import React, { useState } from 'react';

const Icon = ({ name, style = {} }) => (
  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', verticalAlign: 'middle', ...style }}>{name}</span>
);

export const MAX_QUESTIONS   = 15;
export const MAX_OPTIONS     = 12;
export const MAX_LABEL_LEN   = 300;
export const MAX_OPTION_LEN  = 120;

export const CHOICE_TYPES = ['radio', 'dropdown', 'checkbox'];

const QTYPES = [
  { value: 'radio',      label: 'Radio buttons (pick one)' },
  { value: 'dropdown',   label: 'Dropdown (pick one)' },
  { value: 'checkbox',   label: 'Checkboxes (pick many)' },
  { value: 'short_text', label: 'Short text answer' },
  { value: 'long_text',  label: 'Long text answer' },
];

const TYPE_LABEL = QTYPES.reduce((m, t) => ({ ...m, [t.value]: t.label }), {});

const newId = () =>
  `q_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

/** Blank question — defaults to Yes/No radio, which is the common case. */
export const blankQuestion = () => ({
  id: newId(),
  label: '',
  type: 'radio',
  options: ['Yes', 'No'],
  required: true,
});

/**
 * Client-side mirror of the backend validator. Returns an error string, or
 * null when the list is valid. Keep the rules in sync with
 * _sanitize_screening_questions() in recruit/server.py.
 */
export const validateQuestions = (questions) => {
  const list = Array.isArray(questions) ? questions : [];
  if (list.length > MAX_QUESTIONS) return `You can add at most ${MAX_QUESTIONS} screening questions.`;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    const pos = i + 1;
    if (!String(q.label || '').trim()) return `Question ${pos}: enter the question text.`;
    if (CHOICE_TYPES.includes(q.type)) {
      const opts = (q.options || []).map(o => String(o).trim()).filter(Boolean);
      const uniq = [...new Set(opts)];
      // Duplicate check runs first: two identical options collapse to one, and
      // reporting "add at least 2 options" there would be misleading.
      if (uniq.length !== opts.length) return `Question ${pos}: options must be unique.`;
      if (uniq.length < 2) return `Question ${pos}: add at least 2 options.`;
    }
  }
  return null;
};

/** Strip the client-only bits and normalise before sending to the API. */
export const serializeQuestions = (questions) =>
  (Array.isArray(questions) ? questions : []).map(q => ({
    id:       q.id,
    label:    String(q.label || '').trim().slice(0, MAX_LABEL_LEN),
    type:     q.type,
    options:  CHOICE_TYPES.includes(q.type)
      ? [...new Set((q.options || []).map(o => String(o).trim()).filter(Boolean))].slice(0, MAX_OPTIONS)
      : [],
    required: !!q.required,
  }));

/* ── One option row ─────────────────────────────────────── */
const OptionRow = ({ text, index, canRemove, onChange, onRemove }) => (
  <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginBottom: '0.375rem' }}>
    <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', width: 16, flexShrink: 0 }}>{index + 1}.</span>
    <input
      className="input"
      value={text}
      maxLength={MAX_OPTION_LEN}
      placeholder={`Option ${index + 1}`}
      onChange={e => onChange(index, e.target.value)}
      style={{ flex: 1, padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}
    />
    <button
      type="button"
      onClick={() => onRemove(index)}
      disabled={!canRemove}
      title={canRemove ? 'Remove option' : 'A choice question needs at least 2 options'}
      style={{
        border: 'none', background: 'transparent', cursor: canRemove ? 'pointer' : 'not-allowed',
        color: 'var(--on-surface-variant)', opacity: canRemove ? 1 : 0.35, padding: '0.125rem', lineHeight: 0,
      }}
    >
      <Icon name="close" style={{ fontSize: '1rem' }} />
    </button>
  </div>
);

/* ── One question card ──────────────────────────────────── */
const QuestionCard = ({ q, index, total, onPatch, onRemove, onMove }) => {
  const isChoice = CHOICE_TYPES.includes(q.type);
  const options  = q.options || [];

  const setOption = (i, text) => {
    const next = [...options];
    next[i] = text;
    onPatch(index, { options: next });
  };
  const removeOption = (i) => onPatch(index, { options: options.filter((_, j) => j !== i) });
  const addOption    = () => onPatch(index, { options: [...options, ''] });

  const changeType = (type) => {
    const nextChoice = CHOICE_TYPES.includes(type);
    onPatch(index, {
      type,
      // Keep existing options when switching between choice types; seed Yes/No
      // when switching from a text type into a choice type.
      options: nextChoice ? (options.length >= 2 ? options : ['Yes', 'No']) : [],
    });
  };

  return (
    <div style={{
      border: '1px solid var(--outline-variant)', borderRadius: '0.625rem',
      padding: '0.875rem', marginBottom: '0.75rem', background: 'var(--surface-container-lowest)',
    }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
        <span style={{
          fontSize: '0.6875rem', fontWeight: 700, color: 'var(--tertiary)',
          background: 'rgba(0,98,67,0.1)', borderRadius: '0.375rem', padding: '0.125rem 0.5rem',
        }}>Q{index + 1}</span>
        <span style={{ fontSize: '0.725rem', color: 'var(--on-surface-variant)', flex: 1 }}>
          {TYPE_LABEL[q.type] || q.type}
        </span>
        <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} title="Move up"
          style={{ border: 'none', background: 'transparent', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, padding: '0.125rem', lineHeight: 0, color: 'var(--on-surface-variant)' }}>
          <Icon name="keyboard_arrow_up" style={{ fontSize: '1.125rem' }} />
        </button>
        <button type="button" onClick={() => onMove(index, 1)} disabled={index === total - 1} title="Move down"
          style={{ border: 'none', background: 'transparent', cursor: index === total - 1 ? 'not-allowed' : 'pointer', opacity: index === total - 1 ? 0.3 : 1, padding: '0.125rem', lineHeight: 0, color: 'var(--on-surface-variant)' }}>
          <Icon name="keyboard_arrow_down" style={{ fontSize: '1.125rem' }} />
        </button>
        <button type="button" onClick={() => onRemove(index)} title="Delete question"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0.125rem', lineHeight: 0, color: 'var(--error)' }}>
          <Icon name="delete" style={{ fontSize: '1.125rem' }} />
        </button>
      </div>

      {/* question text */}
      <input
        className="input"
        value={q.label}
        maxLength={MAX_LABEL_LEN}
        placeholder="e.g. Are you currently based in Ireland and legally authorised to work here?"
        onChange={e => onPatch(index, { label: e.target.value })}
        style={{ marginBottom: '0.625rem' }}
      />

      {/* type + required */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="select"
          value={q.type}
          onChange={e => changeType(e.target.value)}
          style={{ width: 'auto', minWidth: 190, padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}
        >
          {QTYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!q.required}
            onChange={e => onPatch(index, { required: e.target.checked })}
            style={{ width: 15, height: 15, accentColor: 'var(--tertiary)' }}
          />
          <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Required</span>
        </label>
      </div>

      {/* options */}
      {isChoice && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--outline-variant)' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.725rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
            Answer options
          </p>
          {options.map((opt, i) => (
            <OptionRow
              key={i}
              text={opt}
              index={i}
              canRemove={options.length > 2}
              onChange={setOption}
              onRemove={removeOption}
            />
          ))}
          {options.length < MAX_OPTIONS && (
            <button type="button" onClick={addOption} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.125rem',
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '0.775rem', fontWeight: 600, color: 'var(--tertiary)', padding: 0,
            }}>
              <Icon name="add" style={{ fontSize: '0.875rem' }} /> Add option
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Editor ─────────────────────────────────────────────── */
export default function ScreeningQuestionsEditor({ value, onChange }) {
  const questions = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(questions.length > 0);

  const patch  = (i, delta) => onChange(questions.map((q, j) => (j === i ? { ...q, ...delta } : q)));
  const remove = (i)        => onChange(questions.filter((_, j) => j !== i));
  const add    = ()         => { setOpen(true); onChange([...questions, blankQuestion()]); };
  const move   = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div style={{
      border: '1px solid var(--outline-variant)', borderRadius: '0.625rem',
      padding: '0.875rem', background: 'var(--surface-container-low)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.375rem', border: 'none',
          background: 'transparent', cursor: 'pointer', padding: 0, flex: 1, textAlign: 'left',
          color: 'var(--on-surface)', fontFamily: 'var(--font-display)',
        }}>
          <Icon name={open ? 'expand_more' : 'chevron_right'} style={{ fontSize: '1.125rem', color: 'var(--on-surface-variant)' }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Screening Questions</span>
          <span style={{ fontSize: '0.725rem', color: 'var(--on-surface-variant)', fontWeight: 400 }}>
            {questions.length ? `${questions.length} added` : 'optional'}
          </span>
        </button>
        {questions.length < MAX_QUESTIONS && (
          <button type="button" onClick={add} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            padding: '0.25rem 0.75rem', borderRadius: '0.375rem',
            border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)',
            cursor: 'pointer', fontSize: '0.775rem', fontWeight: 600, color: 'var(--tertiary)',
            fontFamily: 'var(--font-display)',
          }}>
            <Icon name="add" style={{ fontSize: '0.875rem' }} /> Add question
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: '0.875rem' }}>
          {questions.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
              Add questions candidates must answer on the application form for this job.
              Their answers appear on the candidate's profile under <strong>Screening</strong>.
            </p>
          ) : (
            questions.map((q, i) => (
              <QuestionCard
                key={q.id || i}
                q={q}
                index={i}
                total={questions.length}
                onPatch={patch}
                onRemove={remove}
                onMove={move}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
