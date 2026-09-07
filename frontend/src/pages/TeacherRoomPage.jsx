import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function TeacherRoomPage() {
  const { roomCode } = useParams();
  const navigate     = useNavigate();
  const socketRef    = useRef(null);
  const timerRef     = useRef(null);
  const sessionIdRef = useRef(null);   // stored once we know the session _id
  const token        = localStorage.getItem('teacherToken');
  const joinUrl      = `${window.location.origin}/join/${roomCode}`;

  const [state,          setState]          = useState('waiting');
  const [participants,   setParticipants]   = useState([]);
  const [question,       setQuestion]       = useState(null);
  const [showSubmit,     setShowSubmit]     = useState(false);
  const [results,        setResults]        = useState(null);
  const [error,          setError]          = useState('');
  const [elapsed,        setElapsed]        = useState(0);
  const [toast,          setToast]          = useState('');
  const [activityLog,    setActivityLog]    = useState([]);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [showCancelDlg,  setShowCancelDlg]  = useState(false); // cancel confirmation
  const [cancelling,     setCancelling]     = useState(false);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  function copyLink() { navigator.clipboard.writeText(joinUrl); showToast('✅ Link copied!'); }
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit('join_room', { roomCode, token });
    socket.on('session_state', (d) => {
      setState(d.state);
      setParticipants(d.participants || []);
      // Capture session _id for cancel calls
      if (d.sessionId) sessionIdRef.current = d.sessionId;
    });
    socket.on('student_joined', ({ displayName }) => {
      setParticipants(prev => prev.find(p => p.displayName === displayName) ? prev : [...prev, { displayName }]);
    });
    socket.on('question_display', (q) => { setQuestion(q); setState('active'); setShowSubmit(q.index === q.total - 1); });
    socket.on('show_submit', () => setShowSubmit(true));
    socket.on('all_results', ({ results }) => { setResults(results); setState('completed'); clearInterval(timerRef.current); });
    socket.on('error', ({ message }) => setError(message));
    socket.on('student_tab_switch', ({ displayName, switchCount, time }) => {
      const ordinal = switchCount === 1 ? '1st' : switchCount === 2 ? '2nd' : switchCount === 3 ? '3rd' : `${switchCount}th`;
      const color = switchCount === 1 ? '#f59e0b' : '#dc2626';
      setActivityLog(prev => [{ displayName, switchCount, label: `⚠️ ${ordinal} tab switch`, color, time }, ...prev].slice(0, 50));
    });
    return () => { socket.disconnect(); clearInterval(timerRef.current); };
  }, [roomCode, token]);

  // Also resolve session _id from the REST API in case session_state doesn't fire
  useEffect(() => {
    if (sessionIdRef.current) return;
    fetch(`${API_URL}/api/sessions/${roomCode}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d._id) sessionIdRef.current = d._id; })
      .catch(() => {});
  }, [roomCode, token]);

  useEffect(() => {
    if (state === 'active') timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [state]);

  const startQuiz    = () => { setElapsed(0); socketRef.current.emit('start_quiz',    { roomCode }); };
  const nextQuestion = () => socketRef.current.emit('next_question', { roomCode });
  const submitQuiz   = () => socketRef.current.emit('submit_quiz',   { roomCode });

  // ── Cancel / Leave waiting room ────────────────────────────────────────────
  async function confirmCancel() {
    setCancelling(true);
    try {
      if (sessionIdRef.current) {
        await fetch(`${API_URL}/api/sessions/${sessionIdRef.current}/cancel`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        // Errors here are non-fatal — the session may already be cancelled/gone
      }
      // Disconnect socket cleanly before navigating
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      navigate('/dashboard');
    } catch {
      navigate('/dashboard');
    } finally {
      setCancelling(false);
      setShowCancelDlg(false);
    }
  }

  /* ── RESULTS ── */
  if (state === 'completed' && results) {
    const sorted = [...results].sort((a, b) => {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      return (a.timeTaken ?? 0) - (b.timeTaken ?? 0);
    });

    function exportCSV() {
      const rows = [['Rank','Name','Correct','Incorrect','Total','%','Time(s)']];
      sorted.forEach((r, i) => {
        const rank    = r.rank ?? i + 1;
        const correct = r.correctAnswers ?? r.score ?? 0;
        const tot     = r.total ?? r.totalQuestions ?? 0;
        const pct     = r.percentage ?? Math.round((correct / (tot || 1)) * 100);
        rows.push([rank, r.displayName, correct, (r.incorrectAnswers ?? tot - correct), tot, pct + '%', r.timeTaken ?? '—']);
      });
      const csv  = rows.map(r => r.join(',')).join('\n');
      const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a    = document.createElement('a'); a.href = url; a.download = `quiz-${roomCode}.csv`; a.click();
      URL.revokeObjectURL(url);
    }

    return (
      <div style={S.page}>
        <div style={S.topbar}>
          <span style={S.tbTitle}>🏆 Final Results <span style={S.tbSub}>— {roomCode}</span></span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px,4vw,32px)' }}>
          <div style={S.resultsCard}>
            <div style={S.resultsH}>🎉 FINAL LEADERBOARD</div>
            {/* Table scrolls horizontally on narrow screens */}
            <div className="overflow-x-auto">
              <table className="lb-table" style={{ background: '#fff', borderRadius: 10 }}>
                <thead>
                  <tr>
                    {['Rank','Student','Correct','Wrong','Time','%'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const rank    = r.rank ?? i + 1;
                    const correct = r.correctAnswers ?? r.score ?? 0;
                    const tot     = r.total ?? r.totalQuestions ?? 0;
                    const wrong   = r.incorrectAnswers ?? (tot - correct);
                    const pct     = r.percentage ?? (tot > 0 ? Math.round((correct / tot) * 100) : 0);
                    return (
                      <tr key={r.displayName} style={{ background: i === 0 ? '#fef9c3' : i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ fontWeight: 700 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</td>
                        <td style={{ fontWeight: 600 }}>{r.displayName}</td>
                        <td style={{ color: '#16a34a', fontWeight: 700 }}>{correct}/{tot}</td>
                        <td style={{ color: '#dc2626' }}>{wrong}</td>
                        <td>{r.timeTaken != null ? `${r.timeTaken}s` : '—'}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12,
                            background: pct >= 70 ? '#dcfce7' : pct >= 40 ? '#fef9c3' : '#fee2e2',
                            color:      pct >= 70 ? '#16a34a' : pct >= 40 ? '#92400e' : '#dc2626' }}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={exportCSV} style={S.exportBtn}>📥 Export CSV</button>
              <button onClick={() => navigate('/dashboard')} style={S.homeBtn}>🏠 Dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── WAITING ── */
  if (state === 'waiting') {
    return (
      <div style={S.page}>
        {toast && <div style={S.toast}>{toast}</div>}

        {/* ── Cancel confirmation dialog ── */}
        {showCancelDlg && (
          <div style={S.dialogOverlay} role="dialog" aria-modal="true">
            <div style={S.dialogBox}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
              <div style={S.dialogTitle}>Leave this session?</div>
              <p style={S.dialogSub}>
                {participants.length > 0
                  ? `${participants.length} student${participants.length !== 1 ? 's have' : ' has'} already joined. If you leave, the session will be cancelled and they will be disconnected.`
                  : 'The quiz has not started yet. Leaving will cancel this session.'
                }
              </p>
              <div style={S.dialogBtns}>
                <button style={S.dialogStay} onClick={() => setShowCancelDlg(false)} disabled={cancelling}>
                  Stay
                </button>
                <button style={S.dialogLeave} onClick={confirmCancel} disabled={cancelling}>
                  {cancelling ? 'Leaving…' : 'Leave & Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={S.topbar}>
          {/* Cancel/Back button — only visible in waiting state */}
          <button
            onClick={() => setShowCancelDlg(true)}
            style={S.cancelWaitBtn}
            aria-label="Cancel and go back to dashboard"
          >
            ← Back
          </button>
          <span style={S.tbTitle}>📋 Waiting for Students</span>
          <span style={S.tbRight}>👥 {participants.length} joined</span>
        </div>
        <div style={S.waitBody}>
          {/* Main card */}
          <div style={S.waitCard}>
            <h2 style={{ color: '#f1f5f9', fontSize: 'clamp(16px,4vw,20px)', marginBottom: 10 }}>Share this link</h2>
            <div style={S.linkBox}>
              <span style={S.linkText}>{joinUrl}</span>
              <button style={S.copyBtn} onClick={copyLink}>Copy</button>
            </div>
            <div style={S.codeBadge}>Room Code: <b>{roomCode}</b></div>
            {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
            <button onClick={startQuiz} disabled={participants.length === 0}
              style={{ ...S.actionBtn, opacity: participants.length === 0 ? 0.5 : 1 }}>
              🚀 Start Quiz
            </button>
            <button onClick={() => setShowCancelDlg(true)} style={S.cancelBtn}>
              ✕ Cancel Session
            </button>
          </div>

          {/* Students list */}
          <div style={S.waitSidebar}>
            <div style={S.sbHeader}>👥 Students ({participants.length})</div>
            <div style={S.sbList}>
              {participants.length === 0 && <p style={{ color: '#94a3b8', textAlign: 'center', padding: '16px 0', fontSize: 13 }}>Waiting…</p>}
              {participants.map(p => (
                <div key={p.displayName} style={S.sbRow}>
                  <div style={S.av}>{p.displayName[0].toUpperCase()}</div>
                  <span style={S.pName}>{p.displayName}</span>
                  <span style={S.joinedBadge}>JOINED</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── ACTIVE ── */
  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <span style={S.tbTitle}>🎯 Live Session</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={S.tbRight}>⏱ {fmt(elapsed)}</span>
          {/* Mobile sidebar toggle */}
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ ...S.mobileToggle, display: 'none' }}
            className="mobile-sidebar-toggle">
            👥 {participants.length}
          </button>
          <span style={{ color: '#94a3b8', fontSize: 14 }} className="desktop-count">👥 {participants.length}</span>
        </div>
      </div>

      <div style={S.activeBody}>
        {/* Sidebar — hidden on mobile unless toggled */}
        <div style={{ ...S.sidebar, ...(sidebarOpen ? { display: 'flex' } : {}) }} className="teacher-sidebar">
          <div style={S.classStatus}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1.5 }}>CLASS STATUS</div>
            <div style={{ fontSize: 'clamp(24px,6vw,32px)', fontWeight: 800, color: '#f1f5f9', margin: '4px 0' }}>👥 {participants.length}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1 }}>STUDENTS ACTIVE</div>
          </div>
          <div style={S.sbList}>
            {participants.map(p => (
              <div key={p.displayName} style={S.sbRow}>
                <div style={S.av}>{p.displayName[0].toUpperCase()}</div>
                <span style={S.pName}>{p.displayName}</span>
                <span style={S.activeBadge}>ACTIVE</span>
              </div>
            ))}
          </div>
          {activityLog.length > 0 && (
            <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#f87171', letterSpacing: 1, padding: '4px 8px', marginBottom: 4 }}>🚨 ALERTS ({activityLog.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {activityLog.map((a, i) => (
                  <div key={i} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 10px', marginLeft: 4, borderLeft: `3px solid ${a.color}` }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#f1f5f9' }}>{a.displayName}</div>
                    <div style={{ fontSize: 11, color: a.color, fontWeight: 600 }}>{a.label}</div>
                    <PenaltyControl displayName={a.displayName} roomCode={roomCode} socket={socketRef.current} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main question area */}
        <div style={S.main}>
          {question && (
            <>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, letterSpacing: 1.5, marginBottom: 10 }}>
                QUESTION {question.index + 1} OF {question.total}
              </div>
              <div style={{ width: '100%', background: '#334155', borderRadius: 6, height: 5, marginBottom: 20, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#3b82f6', width: `${((question.index + 1) / question.total) * 100}%`, transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 'clamp(18px,4vw,30px)', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.4, marginBottom: 'clamp(18px,4vw,28px)' }}>
                {question.text}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {question.options.map((opt, i) => (
                  <div key={opt} style={S.optItem}>
                    <span style={S.optLetter}>{String.fromCharCode(65 + i)}.</span>
                    <span style={{ color: '#e2e8f0', fontSize: 'clamp(14px,3.5vw,17px)' }}>{opt}</span>
                  </div>
                ))}
              </div>
              {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</p>}
              <div style={{ marginTop: 'auto', paddingTop: 'clamp(20px,4vw,32px)' }}>
                {!showSubmit ? (
                  <button onClick={nextQuestion} style={S.nextBtn}>NEXT QUESTION →</button>
                ) : (
                  <button onClick={submitQuiz} style={S.submitBtn}>✅ SUBMIT QUIZ FOR ALL STUDENTS</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 700px) {
          .teacher-sidebar { display: none !important; position: fixed; inset: 0; z-index: 200; width: 100% !important; }
          .teacher-sidebar.open, .teacher-sidebar[style*="flex"] { display: flex !important; }
          .mobile-sidebar-toggle { display: flex !important; }
          .desktop-count { display: none !important; }
        }
        @media (min-width: 701px) {
          .teacher-sidebar { display: flex !important; }
          .mobile-sidebar-toggle { display: none !important; }
        }
      `}</style>
    </div>
  );
}

const S = {
  page:      { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', fontFamily: 'Inter,sans-serif', overflow: 'hidden' },
  toast:     { position: 'fixed', top: 16, right: 16, background: '#16a34a', color: '#fff', padding: '11px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxWidth: 'calc(100vw - 32px)' },
  topbar:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '0 clamp(12px,3vw,28px)', height: 56, borderBottom: '1px solid #334155', flexShrink: 0, gap: 8 },
  tbTitle:   { color: '#f1f5f9', fontWeight: 700, fontSize: 'clamp(13px,3.5vw,16px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tbSub:     { color: '#94a3b8', fontWeight: 400 },
  tbRight:   { color: '#94a3b8', fontSize: 'clamp(12px,3vw,14px)', whiteSpace: 'nowrap' },
  mobileToggle: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },

  /* Waiting */
  waitBody:  { flex: 1, display: 'flex', gap: 'clamp(12px,3vw,24px)', padding: 'clamp(14px,3vw,28px)', overflow: 'auto', flexWrap: 'wrap' },
  waitCard:  { flex: '1 1 280px', background: '#1e293b', borderRadius: 14, padding: 'clamp(20px,4vw,32px)', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  linkBox:   { display: 'flex', gap: 8, background: '#0f172a', borderRadius: 10, padding: 'clamp(10px,2.5vw,14px)', alignItems: 'center' },
  linkText:  { flex: 1, color: '#7dd3fc', fontSize: 'clamp(11px,2.5vw,14px)', wordBreak: 'break-all' },
  copyBtn:   { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, flexShrink: 0, fontSize: 13 },
  codeBadge: { background: '#0f172a', color: '#94a3b8', borderRadius: 8, padding: '9px 14px', fontSize: 13 },
  actionBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(13px,3vw,16px) clamp(20px,5vw,32px)', fontWeight: 700, fontSize: 'clamp(14px,3.5vw,16px)', cursor: 'pointer', marginTop: 4, width: '100%' },
  cancelBtn: { background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer', width: '100%', marginTop: 0 },
  cancelWaitBtn: { background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  // Cancel dialog
  dialogOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 16 },
  dialogBox:     { background: '#1e293b', borderRadius: 16, padding: 'clamp(24px,5vw,36px)', width: '100%', maxWidth: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', textAlign: 'center', border: '1px solid #334155' },
  dialogTitle:   { fontWeight: 800, fontSize: 18, color: '#f1f5f9', marginBottom: 10 },
  dialogSub:     { color: '#94a3b8', fontSize: 13, marginBottom: 24, lineHeight: 1.5 },
  dialogBtns:    { display: 'flex', gap: 10 },
  dialogStay:    { flex: 1, padding: '12px 0', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  dialogLeave:   { flex: 1, padding: '12px 0', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  waitSidebar: { width: 'clamp(220px,28vw,280px)', minWidth: 0, background: '#1e293b', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 },

  /* Active */
  activeBody:  { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar:     { width: 'clamp(200px,22vw,260px)', background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  classStatus: { padding: 'clamp(14px,3vw,20px) clamp(14px,3vw,20px) 10px', borderBottom: '1px solid #334155' },
  sbHeader:    { padding: 'clamp(12px,2.5vw,16px) clamp(14px,3vw,20px)', fontWeight: 700, color: '#f1f5f9', fontSize: 14, borderBottom: '1px solid #334155' },
  sbList:      { flex: 1, overflowY: 'auto', padding: '6px 10px' },
  sbRow:       { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px', borderRadius: 7, marginBottom: 3 },
  av:          { width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  pName:       { flex: 1, color: '#e2e8f0', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  activeBadge: { fontSize: 9, background: '#166534', color: '#86efac', padding: '2px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 },
  joinedBadge: { fontSize: 9, background: '#1e3a5f', color: '#7dd3fc', padding: '2px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 },

  /* Main quiz area */
  main:      { flex: 1, padding: 'clamp(20px,4vw,40px) clamp(16px,5vw,48px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  optItem:   { display: 'flex', alignItems: 'center', gap: 12, background: '#1e293b', border: '1px solid #334155', borderRadius: 11, padding: 'clamp(12px,3vw,16px) clamp(14px,3.5vw,20px)' },
  optLetter: { fontWeight: 800, color: '#3b82f6', fontSize: 16, width: 22, flexShrink: 0 },
  nextBtn:   { width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(14px,3.5vw,18px)', fontWeight: 800, fontSize: 'clamp(14px,3.5vw,16px)', cursor: 'pointer', letterSpacing: 0.5 },
  submitBtn: { width: '100%', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(14px,3.5vw,18px)', fontWeight: 800, fontSize: 'clamp(13px,3.5vw,16px)', cursor: 'pointer' },

  /* Results */
  resultsCard: { background: '#1e293b', borderRadius: 18, padding: 'clamp(20px,4vw,36px)', maxWidth: 700, margin: '0 auto' },
  resultsH:    { fontSize: 'clamp(18px,4vw,22px)', fontWeight: 800, color: '#f1f5f9', marginBottom: 20, textAlign: 'center' },
  exportBtn:   { flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: 'clamp(11px,3vw,14px)', fontWeight: 700, fontSize: 14, cursor: 'pointer', minWidth: 120 },
  homeBtn:     { flex: 1, background: '#475569', color: '#fff', border: 'none', borderRadius: 10, padding: 'clamp(11px,3vw,14px)', fontWeight: 700, fontSize: 14, cursor: 'pointer', minWidth: 120 },
};

function PenaltyControl({ displayName, roomCode, socket }) {
  const [secs, setSecs]       = useState(30);
  const [applied, setApplied] = useState(false);
  function apply() {
    if (!socket) return;
    socket.emit('apply_penalty', { roomCode, targetDisplayName: displayName, seconds: secs });
    setApplied(true); setTimeout(() => setApplied(false), 3000);
  }
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 5, alignItems: 'center' }}>
      <select value={secs} onChange={e => setSecs(Number(e.target.value))}
        style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, padding: '3px 5px', fontSize: 11, cursor: 'pointer' }}>
        {[30,60,120,180,300].map(s => <option key={s} value={s}>{s < 60 ? `${s}s` : `${s/60}m`}</option>)}
      </select>
      <button onClick={apply}
        style={{ background: applied ? '#16a34a' : '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
        {applied ? '✓ Applied' : '⏳ Penalize'}
      </button>
    </div>
  );
}
