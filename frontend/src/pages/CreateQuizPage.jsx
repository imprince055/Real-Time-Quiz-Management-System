import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function emptyQuestion() {
  return { text: '', options: ['', ''], correctAnswer: '' };
}

export default function CreateQuizPage() {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  function updateQuestion(i, field, value) {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  }
  function updateOption(qi, oi, value) {
    setQuestions(qs => qs.map((q, idx) => {
      if (idx !== qi) return q;
      const options = [...q.options]; options[oi] = value;
      return { ...q, options };
    }));
  }
  function addOption(qi) {
    setQuestions(qs => qs.map((q, idx) => idx === qi ? { ...q, options: [...q.options, ''] } : q));
  }
  function removeOption(qi, oi) {
    setQuestions(qs => qs.map((q, idx) => {
      if (idx !== qi) return q;
      const options = q.options.filter((_, i) => i !== oi);
      return { ...q, options, correctAnswer: q.correctAnswer === q.options[oi] ? '' : q.correctAnswer };
    }));
  }
  function removeQuestion(i) {
    setQuestions(qs => qs.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, questions }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Failed to create quiz');
      navigate('/dashboard');
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  return (
    <div style={S.page}>
      <div style={S.navbar}>
        <button onClick={() => navigate('/dashboard')} style={S.backBtn}>← Back</button>
        <span style={S.navTitle}>Create New Quiz</span>
        <div />
      </div>
      <div style={S.body}>
        <form onSubmit={handleSubmit}>
          {error && <div style={S.errorBox}>{error}</div>}
          <div style={S.titleCard}>
            <label style={S.label}>Quiz Title</label>
            <input style={S.titleInput} placeholder="e.g. History 101 — Chapter 3" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>

          {questions.map((q, qi) => (
            <div key={qi} style={S.qCard}>
              <div style={S.qCardHeader}>
                <span style={S.qNum}>Question {qi + 1}</span>
                {questions.length > 1 && (
                  <button type="button" onClick={() => removeQuestion(qi)} style={S.removeBtn}>✕ Remove</button>
                )}
              </div>
              <input
                style={S.input}
                placeholder="Enter your question here..."
                value={q.text}
                onChange={e => updateQuestion(qi, 'text', e.target.value)}
                required
              />
              <div style={S.optionsLabel}>Answer Options</div>
              <div style={S.optionsGrid}>
                {q.options.map((opt, oi) => (
                  <div key={oi} style={S.optRow}>
                    <span style={S.optBullet}>{String.fromCharCode(65 + oi)}</span>
                    <input
                      style={S.optInput}
                      placeholder={`Option ${oi + 1}`}
                      value={opt}
                      onChange={e => updateOption(qi, oi, e.target.value)}
                      required
                    />
                    {q.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(qi, oi)} style={S.removeOptBtn}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addOption(qi)} style={S.addOptBtn}>+ Add Option</button>

              <div style={S.correctRow}>
                <label style={S.label}>✅ Correct Answer</label>
                <select
                  style={S.select}
                  value={q.correctAnswer}
                  onChange={e => updateQuestion(qi, 'correctAnswer', e.target.value)}
                  required
                >
                  <option value="">-- select correct answer --</option>
                  {q.options.filter(Boolean).map((opt, oi) => (
                    <option key={oi} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setQuestions(qs => [...qs, emptyQuestion()])} style={S.addQBtn}>
            + Add Question
          </button>

          <button type="submit" style={S.saveBtn} disabled={loading}>
            {loading ? 'Saving...' : '💾 Save Quiz'}
          </button>
        </form>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#f0f4ff' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  backBtn: { background: 'none', border: 'none', color: '#4f46e5', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  navTitle: { fontWeight: 800, fontSize: 18, color: '#1e293b' },
  body: { maxWidth: 720, margin: '0 auto', padding: '36px 24px' },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 20 },
  titleCard: { background: '#fff', borderRadius: 14, padding: '24px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 },
  titleInput: { width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 16, fontWeight: 600, color: '#1e293b', background: '#f8fafc', outline: 'none' },
  qCard: { background: '#fff', borderRadius: 14, padding: '24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  qCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  qNum: { fontWeight: 800, fontSize: 15, color: '#4f46e5' },
  removeBtn: { background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  input: { width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 15, color: '#1e293b', background: '#f8fafc', outline: 'none', marginBottom: 16 },
  optionsLabel: { fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 },
  optionsGrid: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 },
  optRow: { display: 'flex', alignItems: 'center', gap: 10 },
  optBullet: { width: 28, height: 28, borderRadius: '50%', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  optInput: { flex: 1, padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', background: '#f8fafc', outline: 'none' },
  removeOptBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: '4px 8px' },
  addOptBtn: { background: '#f0f4ff', color: '#4f46e5', border: '1.5px dashed #c7d2fe', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 16 },
  correctRow: { marginTop: 4 },
  select: { width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#1e293b', background: '#f8fafc', outline: 'none', marginTop: 4 },
  addQBtn: { display: 'block', width: '100%', padding: '14px', background: '#f0f4ff', color: '#4f46e5', border: '2px dashed #c7d2fe', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16 },
  saveBtn: { display: 'block', width: '100%', padding: '15px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
};
