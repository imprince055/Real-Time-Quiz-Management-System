import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyDraft() {
  return { text: '', options: ['', '', '', ''], correctAnswer: '' };
}

function isDraftEmpty(d) {
  return !d.text.trim() && d.options.every(o => !o.trim()) && !d.correctAnswer;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateQuizPage() {
  const [title,        setTitle]        = useState('');
  const [questions,    setQuestions]    = useState([]);   // saved questions
  const [editorOpen,   setEditorOpen]   = useState(false);
  const [editingIndex, setEditingIndex] = useState(null); // null = new question
  const [draft,        setDraft]        = useState(emptyDraft());
  const [draftError,   setDraftError]   = useState('');
  const [submitError,  setSubmitError]  = useState('');
  const [loading,      setLoading]      = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(null); // callback to run after confirm
  const navigate = useNavigate();
  const token = localStorage.getItem('teacherToken');

  // ── Draft helpers ──────────────────────────────────────────────────────────

  const updateDraftText  = e => setDraft(d => ({ ...d, text: e.target.value }));
  const updateDraftOption = (oi, val) =>
    setDraft(d => {
      const opts = [...d.options]; opts[oi] = val;
      // If the correct answer was this option, clear it
      const correctAnswer = d.correctAnswer === d.options[oi] ? '' : d.correctAnswer;
      return { ...d, options: opts, correctAnswer };
    });
  const addDraftOption  = () => setDraft(d => ({ ...d, options: [...d.options, ''] }));
  const removeDraftOption = oi =>
    setDraft(d => {
      const opts = d.options.filter((_, i) => i !== oi);
      return { ...d, options: opts, correctAnswer: d.correctAnswer === d.options[oi] ? '' : d.correctAnswer };
    });

  // ── Open editor (with unsaved-changes guard) ───────────────────────────────

  function openNewEditor() {
    if (editorOpen && !isDraftEmpty(draft)) {
      setConfirmDiscard(() => () => {
        setDraft(emptyDraft());
        setEditingIndex(null);
        setDraftError('');
        setEditorOpen(true);
        setConfirmDiscard(null);
      });
    } else {
      setDraft(emptyDraft());
      setEditingIndex(null);
      setDraftError('');
      setEditorOpen(true);
    }
  }

  function openEditEditor(idx) {
    if (editorOpen && editingIndex !== idx && !isDraftEmpty(draft)) {
      setConfirmDiscard(() => () => {
        setDraft({ ...questions[idx] });
        setEditingIndex(idx);
        setDraftError('');
        setEditorOpen(true);
        setConfirmDiscard(null);
      });
    } else {
      setDraft({ ...questions[idx] });
      setEditingIndex(idx);
      setDraftError('');
      setEditorOpen(true);
    }
  }

  function cancelEditor() {
    if (!isDraftEmpty(draft) && editingIndex === null) {
      setConfirmDiscard(() => () => {
        setEditorOpen(false);
        setDraft(emptyDraft());
        setEditingIndex(null);
        setDraftError('');
        setConfirmDiscard(null);
      });
    } else {
      setEditorOpen(false);
      setDraft(emptyDraft());
      setEditingIndex(null);
      setDraftError('');
    }
  }

  // ── Save draft to questions list ───────────────────────────────────────────

  function saveDraft() {
    setDraftError('');

    if (!draft.text.trim()) {
      setDraftError('Question text is required.');
      return;
    }
    const filledOpts = draft.options.filter(o => o.trim());
    if (filledOpts.length < 2) {
      setDraftError('At least 2 answer options are required.');
      return;
    }
    if (!draft.correctAnswer) {
      setDraftError('Please select the correct answer.');
      return;
    }
    if (!filledOpts.includes(draft.correctAnswer)) {
      setDraftError('Correct answer must match one of the options.');
      return;
    }

    // Build clean question (remove blank options)
    const cleanQ = {
      text:          draft.text.trim(),
      options:       filledOpts,
      correctAnswer: draft.correctAnswer,
    };

    if (editingIndex === null) {
      setQuestions(qs => [...qs, cleanQ]);
    } else {
      setQuestions(qs => qs.map((q, i) => i === editingIndex ? cleanQ : q));
    }

    setEditorOpen(false);
    setDraft(emptyDraft());
    setEditingIndex(null);
    setDraftError('');
  }

  // ── Delete question ────────────────────────────────────────────────────────

  function deleteQuestion(idx) {
    // If currently editing this question, close the editor
    if (editorOpen && editingIndex === idx) {
      setEditorOpen(false);
      setDraft(emptyDraft());
      setEditingIndex(null);
    } else if (editorOpen && editingIndex !== null && editingIndex > idx) {
      // Adjust editing index if a question before it was deleted
      setEditingIndex(i => i - 1);
    }
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  }

  // ── Final quiz submission (unchanged from original) ────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');

    if (questions.length === 0) {
      setSubmitError('Add at least one question before saving the quiz.');
      return;
    }
    if (editorOpen) {
      setSubmitError('Please save or cancel the current question editor first.');
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, questions }),
      });
      const data = await res.json();
      if (!res.ok) return setSubmitError(data.error || 'Failed to create quiz');
      navigate('/dashboard');
    } catch (err) {
      setSubmitError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const editorLabel = editingIndex === null
    ? `Question ${questions.length + 1}`
    : `Edit Question ${editingIndex + 1}`;

  return (
    <div style={S.page}>

      {/* ── Navbar ── */}
      <div style={S.navbar}>
        <button onClick={() => navigate('/dashboard')} style={S.backBtn} aria-label="Back to dashboard">
          ← Back
        </button>
        <span style={S.navTitle}>Create New Quiz</span>
        <div />
      </div>

      {/* ── Discard-changes dialog ── */}
      {confirmDiscard && (
        <div style={S.dialogOverlay} role="dialog" aria-modal="true" aria-label="Discard changes">
          <div style={S.dialogBox}>
            <div style={S.dialogIcon}>⚠️</div>
            <div style={S.dialogTitle}>Discard unsaved changes?</div>
            <p style={S.dialogSub}>Your current question has unsaved changes that will be lost.</p>
            <div style={S.dialogBtns}>
              <button style={S.dialogCancel} onClick={() => setConfirmDiscard(null)}>Keep Editing</button>
              <button style={S.dialogDiscard} onClick={confirmDiscard}>Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div style={S.body}>
        <form onSubmit={handleSubmit} noValidate>

          {/* ── Quiz title card ── */}
          <div style={S.card}>
            <label className="form-label" htmlFor="quiz-title" style={S.sectionLabel}>
              Quiz Title
            </label>
            <input
              id="quiz-title"
              className="form-input"
              placeholder="e.g. History 101 — Chapter 3"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              style={{ fontSize: 'clamp(14px,3.5vw,16px)', fontWeight: 600 }}
            />
          </div>

          {/* ── Questions section ── */}
          <div style={S.section}>
            <div style={S.sectionHeaderRow}>
              <h2 style={S.sectionTitle}>Questions</h2>
              {questions.length > 0 && (
                <span style={S.questionCount}>{questions.length}</span>
              )}
            </div>

            {/* Empty state */}
            {questions.length === 0 && !editorOpen && (
              <div style={S.emptyState}>
                <div style={S.emptyIcon}>📝</div>
                <div style={S.emptyTitle}>No questions added yet</div>
                <div style={S.emptySub}>Create your first question to get started.</div>
              </div>
            )}

            {/* Saved question cards */}
            {questions.map((q, qi) => (
              <div
                key={qi}
                style={{
                  ...S.questionCard,
                  ...(editorOpen && editingIndex === qi ? S.questionCardEditing : {}),
                }}
              >
                {/* Row 1: number + text + actions */}
                <div style={S.qcTop}>
                  <div style={S.qcNum}>{qi + 1}</div>
                  <div style={S.qcText}>{q.text}</div>
                  <div style={S.qcActions}>
                    <button
                      type="button"
                      onClick={() => openEditEditor(qi)}
                      style={S.editBtn}
                      aria-label={`Edit question ${qi + 1}`}
                      title="Edit question"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteQuestion(qi)}
                      style={S.deleteBtn}
                      aria-label={`Delete question ${qi + 1}`}
                      title="Delete question"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Row 2: options */}
                <div style={S.qcOptions}>
                  {q.options.map((opt, oi) => (
                    <span key={oi} style={S.optPill}>
                      <span style={S.optPillLetter}>{String.fromCharCode(65 + oi)}</span>
                      {opt}
                    </span>
                  ))}
                </div>

                {/* Row 3: correct answer */}
                <div style={S.qcCorrect}>
                  <span style={S.correctDot}>✓</span>
                  <span style={S.correctText}>Correct: <strong>{q.correctAnswer}</strong></span>
                </div>
              </div>
            ))}

            {/* ── Question editor ── */}
            {editorOpen && (
              <div style={S.editorCard}>
                <div style={S.editorHeader}>
                  <span style={S.editorTitle}>{editorLabel}</span>
                  <button
                    type="button"
                    onClick={cancelEditor}
                    style={S.editorCloseBtn}
                    aria-label="Close question editor"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                {draftError && <div className="error-box" style={{ marginBottom: 14 }}>{draftError}</div>}

                {/* Question text */}
                <label className="form-label" htmlFor="draft-text">Question</label>
                <input
                  id="draft-text"
                  className="form-input"
                  placeholder="Enter your question here…"
                  value={draft.text}
                  onChange={updateDraftText}
                  style={{ marginBottom: 18 }}
                  autoFocus
                />

                {/* Options */}
                <div style={S.optLabel}>Answer Options</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 12 }}>
                  {draft.options.map((opt, oi) => (
                    <div key={oi} style={S.optRow}>
                      <span style={S.optBullet}>{String.fromCharCode(65 + oi)}</span>
                      <input
                        className="form-input"
                        placeholder={`Option ${oi + 1}`}
                        value={opt}
                        onChange={e => updateDraftOption(oi, e.target.value)}
                        style={{ margin: 0, flex: 1 }}
                        aria-label={`Option ${String.fromCharCode(65 + oi)}`}
                      />
                      {draft.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeDraftOption(oi)}
                          style={S.removeOptBtn}
                          aria-label={`Remove option ${String.fromCharCode(65 + oi)}`}
                          title="Remove option"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button type="button" onClick={addDraftOption} style={S.addOptBtn}>
                  + Add Option
                </button>

                {/* Correct answer */}
                <div style={{ marginTop: 16 }}>
                  <label className="form-label" htmlFor="draft-correct">✅ Correct Answer</label>
                  <select
                    id="draft-correct"
                    className="form-input"
                    value={draft.correctAnswer}
                    onChange={e => setDraft(d => ({ ...d, correctAnswer: e.target.value }))}
                    style={{ marginTop: 4 }}
                  >
                    <option value="">— select correct answer —</option>
                    {draft.options.filter(Boolean).map((opt, oi) => (
                      <option key={oi} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* Editor action buttons */}
                <div style={S.editorFooter}>
                  <button type="button" onClick={cancelEditor} style={S.cancelBtn}>
                    Cancel
                  </button>
                  <button type="button" onClick={saveDraft} style={S.saveDraftBtn}>
                    {editingIndex === null ? 'Save Question' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {/* Add Question button */}
            {!editorOpen && (
              <button type="button" onClick={openNewEditor} style={S.addQBtn}>
                + Add Question
              </button>
            )}
          </div>

          {/* ── Submit errors ── */}
          {submitError && <div className="error-box">{submitError}</div>}

          {/* ── Create Quiz button ── */}
          <button
            type="submit"
            style={{
              ...S.saveBtn,
              opacity: loading ? 0.7 : 1,
              cursor:  loading ? 'not-allowed' : 'pointer',
            }}
            disabled={loading}
          >
            {loading ? 'Creating Quiz…' : '💾 Create Quiz'}
          </button>

        </form>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  // Page shell
  page: {
    minHeight: '100vh',
    background: '#f0f4ff',
    fontFamily: "'Inter','Segoe UI',sans-serif",
  },

  // Navbar
  navbar: {
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding: '0 var(--page-px)',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    gap: 10,
    position: 'sticky',
    top: 0,
    zIndex: 40,
  },
  backBtn: {
    background: 'none', border: 'none', color: '#4f46e5',
    fontWeight: 600, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  navTitle: {
    fontWeight: 800, fontSize: 'clamp(14px,4vw,18px)', color: '#1e293b',
  },

  // Content area
  body: {
    maxWidth: 680,
    margin: '0 auto',
    padding: 'clamp(20px,4vw,36px) var(--page-px)',
  },

  // Title card
  card: {
    background: '#fff', borderRadius: 14,
    padding: 'clamp(16px,4vw,24px)',
    marginBottom: 20,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
  },
  sectionLabel: {
    fontSize: 13, fontWeight: 700, color: '#4f46e5',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: 8,
  },

  // Questions section
  section: {
    background: '#fff', borderRadius: 14,
    padding: 'clamp(16px,4vw,24px)',
    marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
  },
  sectionHeaderRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 'clamp(15px,4vw,17px)', fontWeight: 800, color: '#1e293b',
    margin: 0,
  },
  questionCount: {
    background: '#4f46e5', color: '#fff',
    fontSize: 12, fontWeight: 800,
    padding: '2px 9px', borderRadius: 20,
    lineHeight: 1.6,
  },

  // Empty state
  emptyState: {
    textAlign: 'center', padding: 'clamp(24px,6vw,40px) 0',
    color: '#94a3b8',
  },
  emptyIcon:  { fontSize: 'clamp(36px,8vw,48px)', marginBottom: 10 },
  emptyTitle: { fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 5 },
  emptySub:   { fontSize: 13 },

  // Saved question cards
  questionCard: {
    background: '#fafbff',
    borderRadius: 11,
    padding: 'clamp(12px,3vw,16px)',
    marginBottom: 10,
    border: '1.5px solid #e0e7ff',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  questionCardEditing: {
    borderColor: '#a5b4fc',
    boxShadow: '0 0 0 3px rgba(99,102,241,0.12)',
  },
  qcTop: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    marginBottom: 8,
  },
  qcNum: {
    width: 26, height: 26, borderRadius: '50%',
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    color: '#fff', fontWeight: 800, fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  qcText: {
    flex: 1, fontWeight: 600, fontSize: 'clamp(13px,3.5vw,15px)',
    color: '#1e293b', lineHeight: 1.4, wordBreak: 'break-word',
  },
  qcActions: {
    display: 'flex', gap: 4, flexShrink: 0,
  },
  editBtn: {
    background: '#f0f4ff', border: '1px solid #c7d2fe',
    borderRadius: 7, padding: '5px 9px',
    fontSize: 14, cursor: 'pointer',
    transition: 'background 0.15s',
    lineHeight: 1,
  },
  deleteBtn: {
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 7, padding: '5px 9px',
    fontSize: 14, cursor: 'pointer',
    transition: 'background 0.15s',
    lineHeight: 1,
  },
  qcOptions: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
    marginBottom: 8, paddingLeft: 36,
  },
  optPill: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#f1f5f9', borderRadius: 6,
    padding: '3px 10px', fontSize: 12, color: '#475569',
    fontWeight: 500, maxWidth: '100%', wordBreak: 'break-word',
  },
  optPillLetter: {
    fontWeight: 800, color: '#6366f1', fontSize: 11,
  },
  qcCorrect: {
    display: 'flex', alignItems: 'center', gap: 6,
    paddingLeft: 36,
  },
  correctDot: {
    width: 18, height: 18, borderRadius: '50%',
    background: '#dcfce7', color: '#16a34a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 900, flexShrink: 0,
  },
  correctText: {
    fontSize: 12, color: '#16a34a',
  },

  // Question editor
  editorCard: {
    background: '#fafaff',
    borderRadius: 14,
    padding: 'clamp(16px,4vw,24px)',
    marginBottom: 12,
    border: '2px solid #6366f1',
    boxShadow: '0 0 0 4px rgba(99,102,241,0.10)',
  },
  editorHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 18,
  },
  editorTitle: {
    fontWeight: 800, fontSize: 'clamp(14px,4vw,16px)', color: '#4f46e5',
  },
  editorCloseBtn: {
    background: '#f1f5f9', border: '1px solid #e2e8f0',
    borderRadius: 7, width: 30, height: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: '#64748b', cursor: 'pointer',
    fontWeight: 700, flexShrink: 0,
  },

  // Option rows inside editor
  optLabel: {
    fontSize: 13, fontWeight: 700, color: '#475569',
    marginBottom: 8,
  },
  optRow: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  optBullet: {
    width: 28, height: 28, borderRadius: '50%',
    background: '#e0e7ff', color: '#4f46e5',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 13, flexShrink: 0,
  },
  removeOptBtn: {
    background: 'none', border: 'none',
    color: '#94a3b8', cursor: 'pointer',
    fontSize: 14, padding: '4px 7px', flexShrink: 0,
    borderRadius: 5,
  },
  addOptBtn: {
    background: '#f0f4ff', color: '#4f46e5',
    border: '1.5px dashed #c7d2fe', borderRadius: 8,
    padding: '8px 14px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },

  // Editor footer
  editorFooter: {
    display: 'flex', justifyContent: 'flex-end',
    gap: 10, marginTop: 22,
    flexWrap: 'wrap',
  },
  cancelBtn: {
    background: '#f1f5f9', color: '#475569',
    border: '1.5px solid #e2e8f0', borderRadius: 10,
    padding: 'clamp(10px,2.5vw,12px) clamp(18px,4vw,24px)',
    fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
  saveDraftBtn: {
    background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
    color: '#fff', border: 'none', borderRadius: 10,
    padding: 'clamp(10px,2.5vw,12px) clamp(20px,5vw,30px)',
    fontWeight: 700, fontSize: 14, cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(79,70,229,0.35)',
  },

  // Add Question button (dashed)
  addQBtn: {
    display: 'block', width: '100%',
    padding: 'clamp(12px,3vw,14px)',
    background: 'transparent', color: '#4f46e5',
    border: '2px dashed #c7d2fe', borderRadius: 12,
    fontSize: 'clamp(13px,3.5vw,15px)', fontWeight: 700,
    cursor: 'pointer', marginTop: 4,
    transition: 'background 0.15s, border-color 0.15s',
  },

  // Final save button
  saveBtn: {
    display: 'block', width: '100%',
    padding: 'clamp(13px,3vw,15px)',
    background: 'linear-gradient(135deg,#667eea,#764ba2)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 'clamp(14px,3.5vw,16px)', fontWeight: 700,
  },

  // Discard-changes dialog
  dialogOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(15,23,42,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  },
  dialogBox: {
    background: '#fff', borderRadius: 16,
    padding: 'clamp(24px,5vw,36px)',
    width: '100%', maxWidth: 380,
    boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
    textAlign: 'center',
  },
  dialogIcon:    { fontSize: 36, marginBottom: 10 },
  dialogTitle:   { fontWeight: 800, fontSize: 17, color: '#1e293b', marginBottom: 8 },
  dialogSub:     { color: '#64748b', fontSize: 13, marginBottom: 22 },
  dialogBtns:    { display: 'flex', gap: 10, justifyContent: 'center' },
  dialogCancel:  {
    flex: 1, padding: '11px 0', background: '#f1f5f9',
    color: '#475569', border: '1.5px solid #e2e8f0',
    borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
  dialogDiscard: {
    flex: 1, padding: '11px 0',
    background: 'linear-gradient(135deg,#ef4444,#dc2626)',
    color: '#fff', border: 'none',
    borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
};
