import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function timerColor(ms) {
  if (ms <= 10_000) return '#ef4444';
  if (ms <= 30_000) return '#f59e0b';
  return '#f1f5f9';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function TeacherRoomPage() {
  const { roomCode } = useParams();
  const navigate     = useNavigate();
  const socketRef    = useRef(null);
  const token        = localStorage.getItem('teacherToken');
  const joinUrl      = `${window.location.origin}/join/${roomCode}`;

  // Session / phase state
  const [phase,          setPhase]          = useState('waiting'); // waiting | active | completed
  const [participants,   setParticipants]   = useState([]);
  const [studentProgress, setStudentProgress] = useState([]);
  const [submittedSet,   setSubmittedSet]   = useState(new Set()); // displayNames who submitted
  const [endsAt,         setEndsAt]         = useState(null);  // Date obj, set on start
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [quizTitle,      setQuizTitle]      = useState('');
  const [durationMinutes, setDurationMinutes] = useState(null);

  // Duration picker (for quizzes created without one) — REMOVED.
  // Duration is always set at quiz-creation time and is read-only in the live room.

  // Live ranking from server
  const [liveRanking, setLiveRanking] = useState([]);

  // Final results
  const [finalResults, setFinalResults] = useState(null);

  // UI helpers
  const [toast,         setToast]         = useState('');
  const [error,         setError]         = useState('');
  const [showEndDlg,    setShowEndDlg]    = useState(false);
  const [ending,        setEnding]        = useState(false);
  const [toast_msg,     setToastMsg]      = useState('');
  const sessionIdRef    = useRef(null);

  // Countdown ticker
  const [remainingMs, setRemainingMs] = useState(null);
  const tickRef = useRef(null);

  function showToast(msg) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500); }
  function copyLink() { navigator.clipboard.writeText(joinUrl); showToast('✅ Link copied!'); }

  // ── Start / recalculate countdown ─────────────────────────────────────────
  const startCountdown = useCallback((endsAtDate) => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const ms = endsAtDate.getTime() - Date.now();
      setRemainingMs(Math.max(0, ms));
      if (ms <= 0) clearInterval(tickRef.current);
    }, 500);
  }, []);

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    socket.emit('join_room', { roomCode, token });

    socket.on('session_state', (d) => {
      setParticipants(d.participants || []);
      setStudentProgress(d.studentProgress || []);
      // Restore submitted set from studentProgress.doneAt on reconnect
      const done = (d.studentProgress || [])
        .filter(sp => sp.doneAt)
        .map(sp => sp.displayName);
      setSubmittedSet(new Set(done));
      setTotalQuestions(d.totalQuestions || 0);
      setQuizTitle(d.quizTitle || '');
      setDurationMinutes(d.durationMinutes || null);
      if (d.sessionId) sessionIdRef.current = d.sessionId;

      if (d.state === 'active' && d.endsAt) {
        const ea = new Date(d.endsAt);
        setEndsAt(ea);
        setPhase('active');
        startCountdown(ea);
      } else if (d.state === 'completed') {
        setPhase('completed');
      } else {
        setPhase('waiting');
      }
    });

    // Teacher receives this once when they click Start
    socket.on('quiz_started', (d) => {
      const ea = new Date(d.endsAt);
      setEndsAt(ea);
      setTotalQuestions(d.totalQuestions);
      setDurationMinutes(d.durationMinutes);
      setPhase('active');
      startCountdown(ea);
      setRemainingMs(d.durationMinutes * 60_000);
    });

    socket.on('student_submitted', ({ displayName: dn, submittedAt }) => {
      setSubmittedSet(prev => new Set([...prev, dn]));
    });

    socket.on('student_joined', ({ displayName, participantCount }) => {
      setParticipants(prev =>
        prev.find(p => p.displayName === displayName)
          ? prev
          : [...prev, { displayName }]
      );
    });

    socket.on('live_ranking', ({ ranking, endsAt: ea }) => {
      setLiveRanking(ranking || []);
      if (ea) {
        const d = new Date(ea);
        setEndsAt(d);
        // Resync countdown in case of drift
        setRemainingMs(Math.max(0, d.getTime() - Date.now()));
      }
    });

    // Final results (from server finalization)
    socket.on('all_results', ({ results }) => {
      setFinalResults(results);
      setPhase('completed');
      clearInterval(tickRef.current);
    });

    socket.on('quiz_already_completed', () => {
      setPhase('completed');
      clearInterval(tickRef.current);
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setEnding(false);
    });

    socket.on('student_tab_switch', ({ displayName, switchCount, time }) => {
      // Silently log; tab-switch alerts visible in future expansion
      console.log(`[tab_switch] ${displayName} × ${switchCount} at ${time}`);
    });

    return () => {
      socket.disconnect();
      clearInterval(tickRef.current);
    };
  }, [roomCode, token, startCountdown]);

  // Resolve session ID from REST if socket hasn't sent it yet
  useEffect(() => {
    if (sessionIdRef.current) return;
    fetch(`${API_URL}/api/sessions/${roomCode}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d._id) sessionIdRef.current = d._id; }).catch(() => {});
  }, [roomCode, token]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function startQuiz() {
    setError('');
    // Duration is always taken from Quiz.durationMinutes on the server.
    // Never send a client-provided override — the server is authoritative.
    socketRef.current.emit('start_quiz', { roomCode });
  }

  function confirmEndQuiz() {
    setEnding(true);
    setShowEndDlg(false);
    socketRef.current.emit('end_quiz', { roomCode });
  }

  // ── RESULTS phase ──────────────────────────────────────────────────────────
  if (phase === 'completed') {
    const results = finalResults || [];
    const sorted  = [...results].sort((a, b) => {
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
        rows.push([rank, r.displayName, correct, r.incorrectAnswers ?? tot - correct, tot, pct + '%', r.timeTaken ?? '—']);
      });
      const url = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = `quiz-${roomCode}.csv`; a.click();
      URL.revokeObjectURL(url);
    }

    return (
      <div style={S.page}>
        <div style={S.topbar}>
          <span style={S.tbTitle}>🏆 Final Results — {quizTitle || roomCode}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px,4vw,32px)' }}>
          <div style={S.resultsCard}>
            <div style={S.resultsH}>🎉 FINAL LEADERBOARD</div>
            <div className="overflow-x-auto">
              <table className="lb-table" style={{ background: '#fff', borderRadius: 10 }}>
                <thead>
                  <tr>{['Rank','Student','Correct','Wrong','Time','%'].map(h => <th key={h}>{h}</th>)}</tr>
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
            {results.length === 0 && (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>No results yet — refresh to check.</p>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={exportCSV} style={S.exportBtn}>📥 Export CSV</button>
              <button onClick={() => navigate('/dashboard')} style={S.homeBtn}>🏠 Dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── WAITING phase ──────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div style={S.page}>
        {toast_msg && <div style={S.toast}>{toast_msg}</div>}
        {showEndDlg && (
          <div style={S.dlgOverlay}>
            <div style={S.dlgBox}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>⚠️</div>
              <div style={S.dlgTitle}>Cancel this session?</div>
              <p style={S.dlgSub}>
                {participants.length > 0
                  ? `${participants.length} student(s) have joined. Leaving will cancel this session.`
                  : 'The quiz has not started. Leaving will cancel this session.'}
              </p>
              <div style={S.dlgBtns}>
                <button style={S.dlgStay} onClick={() => setShowEndDlg(false)}>Stay</button>
                <button style={S.dlgLeave} onClick={() => { setShowEndDlg(false); navigate('/dashboard'); }}>Leave</button>
              </div>
            </div>
          </div>
        )}
        <div style={S.topbar}>
          <button onClick={() => setShowEndDlg(true)} style={S.backBtn}>← Back</button>
          <span style={S.tbTitle}>📋 Waiting for Students</span>
          <span style={S.tbRight}>👥 {participants.length} joined</span>
        </div>
        <div style={S.waitBody}>
          <div style={S.waitCard}>
            <h2 style={{ color: '#f1f5f9', fontSize: 'clamp(15px,4vw,19px)', marginBottom: 10 }}>Share this link</h2>
            <div style={S.linkBox}>
              <span style={S.linkText}>{joinUrl}</span>
              <button style={S.copyBtn} onClick={copyLink}>Copy</button>
            </div>
            <div style={S.codeBadge}>Room Code: <b>{roomCode}</b></div>

            {/* Read-only duration display — set at quiz creation, cannot be changed here */}
            <div style={S.durationBadge}>
              <span style={{ fontSize: 16 }}>⏱</span>
              <span>
                <strong>Quiz Duration:</strong>{' '}
                {durationMinutes
                  ? `${durationMinutes} ${durationMinutes === 1 ? 'minute' : 'minutes'}`
                  : 'Not configured — please edit the quiz first'}
              </span>
            </div>

            {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
            <button onClick={startQuiz}
              disabled={participants.length === 0 || !durationMinutes}
              style={{ ...S.actionBtn, opacity: (participants.length === 0 || !durationMinutes) ? 0.5 : 1 }}
              title={!durationMinutes ? 'Quiz duration not set — edit the quiz to add a duration' : ''}
            >
              🚀 Start Quiz
            </button>
            {!durationMinutes && (
              <p style={{ color: '#f87171', fontSize: 12, marginTop: -8 }}>
                ⚠ No duration set. Edit this quiz to add a time limit before starting.
              </p>
            )}
          </div>

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

  // ── ACTIVE phase ───────────────────────────────────────────────────────────
  const msLeft    = remainingMs ?? (endsAt ? Math.max(0, endsAt.getTime() - Date.now()) : 0);
  const tColor    = timerColor(msLeft);
  const isUrgent  = msLeft <= 30_000;

  return (
    <div style={S.page}>
      {toast_msg && <div style={S.toast}>{toast_msg}</div>}

      {/* ── End Quiz confirmation dialog ── */}
      {showEndDlg && (
        <div style={S.dlgOverlay} role="dialog" aria-modal="true">
          <div style={S.dlgBox}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>⏹</div>
            <div style={S.dlgTitle}>End Quiz?</div>
            <p style={S.dlgSub}>
              All students will be stopped and current results will be finalized.
              This cannot be undone.
            </p>
            <div style={S.dlgBtns}>
              <button style={S.dlgStay} onClick={() => setShowEndDlg(false)}>Cancel</button>
              <button style={S.dlgLeave} onClick={confirmEndQuiz}>⏹ End Quiz</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Topbar ── */}
      <div style={S.topbar}>
        <span style={S.tbTitle}>🔴 LIVE — {quizTitle || roomCode}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ ...S.countdown, color: tColor, animation: isUrgent ? 'pulse 0.7s ease-in-out infinite' : 'none' }}>
            {fmtMs(msLeft)}
          </span>
          <span style={S.tbRight}>👥 {participants.length}</span>
        </div>
      </div>

      {/* Urgency banner */}
      {isUrgent && msLeft > 0 && (
        <div style={{ background: msLeft <= 10_000 ? '#dc2626' : '#f59e0b', color: '#fff', padding: '8px var(--page-px)', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>
          {msLeft <= 10_000 ? '🚨 LESS THAN 10 SECONDS!' : '⚠️ 30 seconds remaining!'}
        </div>
      )}

      <div style={S.activeBody}>
        {/* ── Sidebar: participants + progress ── */}
        <div style={S.sidebar} className="teacher-sidebar">
          <div style={S.classStatus}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1.5 }}>STUDENTS</div>
            <div style={{ fontSize: 'clamp(24px,6vw,32px)', fontWeight: 800, color: '#f1f5f9', margin: '4px 0' }}>👥 {participants.length}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1 }}>ACTIVE</div>
          </div>
          <div style={S.sbList}>
            {participants.map(p => {
              const prog = studentProgress.find(sp => sp.displayName === p.displayName);
              const qDone = prog?.currentQuestionIndex ?? 0;
              const isSubmitted = submittedSet.has(p.displayName);
              return (
                <div key={p.displayName} style={S.sbRow}>
                  <div style={S.av}>{p.displayName[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...S.pName, marginBottom: 1 }}>{p.displayName}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      Q{qDone + 1}/{totalQuestions}
                    </div>
                  </div>
                  {isSubmitted
                    ? <span style={S.submittedBadge}>✓ DONE</span>
                    : <span style={S.activeBadge}>ACTIVE</span>
                  }
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Main: large countdown + live ranking ── */}
        <div style={S.main}>
          {/* Big countdown */}
          <div style={S.bigTimerCard}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>TIME REMAINING</div>
            <div style={{ fontSize: 'clamp(48px,10vw,80px)', fontWeight: 900, color: tColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>
              {fmtMs(msLeft)}
            </div>
            {msLeft === 0 && (
              <div style={{ color: '#ef4444', fontWeight: 800, fontSize: 16, marginTop: 8 }}>⏰ TIME UP — Finalizing…</div>
            )}
          </div>

          {/* Live ranking table */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9', marginBottom: 12, letterSpacing: 1 }}>
              🏆 LIVE RANKING
            </div>
            {liveRanking.length === 0 ? (
              <p style={{ color: '#475569', fontSize: 13 }}>Waiting for answers…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="lb-table" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <thead>
                    <tr>
                      {['Rank','Student','Correct','Q Progress'].map(h => (
                        <th key={h} style={{ color: '#64748b', background: 'transparent', borderBottomColor: '#334155' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {liveRanking.map((r, i) => (
                      <tr key={r.displayName} style={{ background: i === 0 ? 'rgba(251,191,36,0.08)' : 'transparent' }}>
                        <td style={{ color: '#f1f5f9', fontWeight: 700 }}>
                          {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
                        </td>
                        <td style={{ color: '#e2e8f0', fontWeight: 600 }}>{r.displayName}</td>
                        <td style={{ color: '#10b981', fontWeight: 700 }}>{r.correct}</td>
                        <td style={{ color: '#94a3b8' }}>
                          Q{r.questionsDone + 1}/{r.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* END QUIZ button */}
          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button
            onClick={() => setShowEndDlg(true)}
            disabled={ending}
            style={{ ...S.endQuizBtn, opacity: ending ? 0.6 : 1 }}
          >
            {ending ? 'Ending Quiz…' : '⏹ END QUIZ'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @media (max-width:700px) {
          .teacher-sidebar { display:none !important; }
        }
        @media (min-width:701px) {
          .teacher-sidebar { display:flex !important; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  page:     { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', fontFamily: 'Inter,sans-serif', overflow: 'hidden' },
  toast:    { position: 'fixed', top: 16, right: 16, background: '#16a34a', color: '#fff', padding: '11px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 9999, maxWidth: 'calc(100vw - 32px)' },
  topbar:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '0 clamp(12px,3vw,28px)', height: 56, borderBottom: '1px solid #334155', flexShrink: 0, gap: 8 },
  tbTitle:  { color: '#f1f5f9', fontWeight: 700, fontSize: 'clamp(13px,3.5vw,16px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tbRight:  { color: '#94a3b8', fontSize: 'clamp(12px,3vw,14px)', whiteSpace: 'nowrap' },
  countdown: { fontWeight: 900, fontSize: 'clamp(20px,5vw,28px)', fontVariantNumeric: 'tabular-nums', letterSpacing: 2, transition: 'color 0.3s' },
  backBtn:  { background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },

  // Waiting
  waitBody:    { flex: 1, display: 'flex', gap: 'clamp(12px,3vw,24px)', padding: 'clamp(14px,3vw,28px)', overflow: 'auto', flexWrap: 'wrap' },
  waitCard:    { flex: '1 1 280px', background: '#1e293b', borderRadius: 14, padding: 'clamp(20px,4vw,32px)', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  linkBox:     { display: 'flex', gap: 8, background: '#0f172a', borderRadius: 10, padding: 'clamp(10px,2.5vw,14px)', alignItems: 'center' },
  linkText:    { flex: 1, color: '#7dd3fc', fontSize: 'clamp(11px,2.5vw,14px)', wordBreak: 'break-all' },
  copyBtn:     { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, flexShrink: 0, fontSize: 13 },
  codeBadge:   { background: '#0f172a', color: '#94a3b8', borderRadius: 8, padding: '9px 14px', fontSize: 13 },
  durationBadge: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#0f172a', borderRadius: 8, padding: '10px 14px',
    color: '#7dd3fc', fontSize: 13, fontWeight: 600, border: '1px solid #1e3a5f',
  },
  actionBtn:   { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(13px,3vw,16px)', fontWeight: 700, fontSize: 'clamp(14px,3.5vw,16px)', cursor: 'pointer', width: '100%' },
  waitSidebar: { width: 'clamp(220px,28vw,280px)', minWidth: 0, background: '#1e293b', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 },

  // Active
  activeBody:  { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar:     { width: 'clamp(200px,22vw,260px)', background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
  classStatus: { padding: 'clamp(14px,3vw,20px) clamp(14px,3vw,20px) 10px', borderBottom: '1px solid #334155' },
  sbHeader:    { padding: 'clamp(12px,2.5vw,16px) clamp(14px,3vw,20px)', fontWeight: 700, color: '#f1f5f9', fontSize: 14, borderBottom: '1px solid #334155' },
  sbList:      { flex: 1, overflowY: 'auto', padding: '6px 10px' },
  sbRow:       { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px', borderRadius: 7, marginBottom: 3 },
  av:          { width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  pName:       { flex: 1, color: '#e2e8f0', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  activeBadge: { fontSize: 9, background: '#166534', color: '#86efac', padding: '2px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 },
  submittedBadge: { fontSize: 9, background: '#1e3a5f', color: '#7dd3fc', padding: '2px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 },
  joinedBadge: { fontSize: 9, background: '#1e3a5f', color: '#7dd3fc', padding: '2px 6px', borderRadius: 4, fontWeight: 700, flexShrink: 0 },

  main:         { flex: 1, padding: 'clamp(20px,4vw,36px) clamp(16px,5vw,40px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  bigTimerCard: { background: '#1e293b', borderRadius: 16, padding: 'clamp(20px,4vw,32px)', textAlign: 'center', marginBottom: 24, border: '1px solid #334155' },
  endQuizBtn:   { background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(14px,3.5vw,18px)', fontWeight: 800, fontSize: 'clamp(14px,3.5vw,16px)', cursor: 'pointer', width: '100%', marginTop: 'auto', letterSpacing: 0.5, boxShadow: '0 4px 16px rgba(220,38,38,0.4)' },

  // Results
  resultsCard: { background: '#1e293b', borderRadius: 18, padding: 'clamp(20px,4vw,36px)', maxWidth: 700, margin: '0 auto' },
  resultsH:    { fontSize: 'clamp(18px,4vw,22px)', fontWeight: 800, color: '#f1f5f9', marginBottom: 20, textAlign: 'center' },
  exportBtn:   { flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: 'clamp(11px,3vw,14px)', fontWeight: 700, fontSize: 14, cursor: 'pointer', minWidth: 120 },
  homeBtn:     { flex: 1, background: '#475569', color: '#fff', border: 'none', borderRadius: 10, padding: 'clamp(11px,3vw,14px)', fontWeight: 700, fontSize: 14, cursor: 'pointer', minWidth: 120 },

  // Dialog
  dlgOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 16 },
  dlgBox:     { background: '#1e293b', borderRadius: 16, padding: 'clamp(24px,5vw,36px)', width: '100%', maxWidth: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', textAlign: 'center', border: '1px solid #334155' },
  dlgTitle:   { fontWeight: 800, fontSize: 18, color: '#f1f5f9', marginBottom: 10 },
  dlgSub:     { color: '#94a3b8', fontSize: 13, marginBottom: 24, lineHeight: 1.5 },
  dlgBtns:    { display: 'flex', gap: 10 },
  dlgStay:    { flex: 1, padding: '12px 0', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  dlgLeave:   { flex: 1, padding: '12px 0', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
};
