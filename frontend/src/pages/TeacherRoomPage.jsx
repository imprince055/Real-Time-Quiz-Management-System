import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function TeacherRoomPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [state, setState] = useState('waiting');
  const [participants, setParticipants] = useState([]);
  const [question, setQuestion] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const [toast, setToast] = useState('');
  const [activityLog, setActivityLog] = useState([]); // tab switch alerts
  const token = localStorage.getItem('teacherToken');
  const joinUrl = `${window.location.origin}/join/${roomCode}`;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  function copyLink() { navigator.clipboard.writeText(joinUrl); showToast('✅ Link copied!'); }

  useEffect(() => {
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit('join_room', { roomCode, token });
    socket.on('session_state', (data) => { setState(data.state); setParticipants(data.participants || []); });
    socket.on('student_joined', ({ displayName }) => {
      setParticipants((prev) => prev.find((p) => p.displayName === displayName) ? prev : [...prev, { displayName }]);
    });
    socket.on('question_display', (q) => {
  setQuestion(q);
  setState('active');
  setShowSubmit(q.index === q.total - 1);
});
    socket.on('show_submit', () => setShowSubmit(true));
    socket.on('all_results', ({ results }) => { setResults(results); setState('completed'); clearInterval(timerRef.current); });
    socket.on('error', ({ message }) => setError(message));
    socket.on('student_tab_switch', ({ displayName, switchCount, time }) => {
      const ordinal = switchCount === 1 ? '1st' : switchCount === 2 ? '2nd' : switchCount === 3 ? '3rd' : `${switchCount}th`;
      const label = `⚠️ ${ordinal} tab switch`;
      const color = switchCount === 1 ? '#f59e0b' : '#dc2626';
      setActivityLog(prev => [{ displayName, switchCount, label, color, time }, ...prev].slice(0, 50));
    });
    return () => { socket.disconnect(); clearInterval(timerRef.current); };
  }, [roomCode, token]);

  useEffect(() => {
    if (state === 'active') {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [state]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const startQuiz = () => { setElapsed(0); socketRef.current.emit('start_quiz', { roomCode }); };
  const nextQuestion = () => socketRef.current.emit('next_question', { roomCode });
  const submitQuiz = () => socketRef.current.emit('submit_quiz', { roomCode });

  // RESULTS
  if (state === 'completed' && results) {
    const sorted = [...results].sort((a, b) => {
      // Use backend rank if present, otherwise fall back to correctAnswers DESC / timeTaken ASC
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      return (a.timeTaken ?? 0) - (b.timeTaken ?? 0);
    });

    function exportCSV() {
      const rows = [['Rank', 'Name', 'Correct', 'Incorrect', 'Score', 'Total', 'Percentage', 'Time (s)']];
      sorted.forEach((r, i) => {
        const rank = r.rank ?? i + 1;
        const correct   = r.correctAnswers ?? r.score ?? 0;
        const incorrect = r.incorrectAnswers ?? (r.total - correct);
        const pct = r.percentage ?? Math.round((correct / (r.total || r.totalQuestions || 1)) * 100);
        rows.push([rank, r.displayName, correct, incorrect, correct, r.total || r.totalQuestions, pct + '%', r.timeTaken ?? '—']);
      });
      const csv = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-results-${roomCode}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    return (
      <div style={S.page}>
        <div style={S.topbar}>
          <span style={S.topbarTitle}>🏆 QUIZ CONTROL PANEL <span style={S.topbarSub}>— Final Results</span></span>
          <span style={S.topbarRight}>Room: <b>{roomCode}</b></span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
          <div style={S.resultsCard}>
            <div style={S.resultsTitle}>🎉 FINAL LEADERBOARD</div>
            {/* Column headers */}
            <div style={{ ...S.resultRow, background: 'transparent', borderBottom: '1px solid #334155', marginBottom: 4, paddingBottom: 8 }}>
              <span style={{ ...S.rank, color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>RANK</span>
              <span style={{ ...S.rName, color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>STUDENT</span>
              <span style={{ ...S.rScore, color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: 1, minWidth: 70, textAlign: 'right' }}>CORRECT</span>
              <span style={{ ...S.rScore, color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: 1, minWidth: 70, textAlign: 'right' }}>WRONG</span>
              <span style={{ ...S.rScore, color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: 1, minWidth: 60, textAlign: 'right' }}>TIME</span>
              <span style={{ ...S.rPct, background: 'transparent', color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>%</span>
            </div>
            <div style={S.resultsTable}>
              {sorted.map((r, i) => {
                const rank      = r.rank ?? i + 1;
                const correct   = r.correctAnswers   ?? r.score ?? 0;
                const incorrect = r.incorrectAnswers ?? ((r.total ?? r.totalQuestions ?? 0) - correct);
                const total     = r.total ?? r.totalQuestions ?? 0;
                const pct       = r.percentage ?? (total > 0 ? Math.round((correct / total) * 100) : 0);
                const timeTaken = r.timeTaken;
                return (
                  <div key={r.displayName} style={{ ...S.resultRow, background: i === 0 ? '#fef9c3' : i === 1 ? '#f1f5f9' : '#fff' }}>
                    <span style={S.rank}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`}</span>
                    <span style={S.rName}>{r.displayName}</span>
                    <span style={{ ...S.rScore, minWidth: 70, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{correct}/{total}</span>
                    <span style={{ ...S.rScore, minWidth: 70, textAlign: 'right', color: '#dc2626' }}>{incorrect}</span>
                    <span style={{ ...S.rScore, minWidth: 60, textAlign: 'right', color: '#475569' }}>
                      {timeTaken != null ? `${timeTaken}s` : '—'}
                    </span>
                    <span style={{ ...S.rPct, background: pct >= 70 ? '#dcfce7' : pct >= 40 ? '#fef9c3' : '#fee2e2', color: pct >= 70 ? '#16a34a' : pct >= 40 ? '#92400e' : '#dc2626' }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={exportCSV} style={S.exportBtn}>📥 Export CSV</button>
              <button onClick={() => navigate('/dashboard')} style={S.homeBtn}>🏠 Dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // WAITING
  if (state === 'waiting') {
    return (
      <div style={S.page}>
        {toast && <div style={S.toast}>{toast}</div>}
        <div style={S.topbar}>
          <span style={S.topbarTitle}>📋 QUIZ CONTROL PANEL <span style={S.topbarSub}>— Waiting for Students</span></span>
          <span style={S.topbarRight}>👥 {participants.length} joined</span>
        </div>
        <div style={S.waitBody}>
          <div style={S.waitCard}>
            <h2 style={{ marginBottom: 8, color: '#1e293b' }}>Share this link with students</h2>
            <div style={S.linkBox}>
              <span style={S.linkText}>{joinUrl}</span>
              <button style={S.copyBtn} onClick={copyLink}>Copy</button>
            </div>
            <div style={S.roomCodeBadge}>Room Code: <b>{roomCode}</b></div>
            {error && <p style={S.error}>{error}</p>}
            <button onClick={startQuiz} disabled={participants.length === 0} style={{ ...S.actionBtn, opacity: participants.length === 0 ? 0.5 : 1 }}>
              🚀 Start Quiz
            </button>
          </div>
          <div style={S.waitSidebar}>
            <div style={S.sidebarHeader}>👥 Students Joined ({participants.length})</div>
            <div style={S.sidebarList}>
              {participants.length === 0 && <p style={{ color: '#94a3b8', padding: '12px 0', textAlign: 'center' }}>Waiting...</p>}
              {participants.map((p) => (
                <div key={p.displayName} style={S.sidebarRow}>
                  <div style={S.avatar}>{p.displayName[0].toUpperCase()}</div>
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

  // ACTIVE
  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <span style={S.topbarTitle}>🎯 QUIZ CONTROL PANEL <span style={S.topbarSub}>— Live Session</span></span>
        <span style={S.topbarRight}>⏱ {fmt(elapsed)} &nbsp;&nbsp; 👥 {participants.length}</span>
      </div>
      <div style={S.activeBody}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          <div style={S.classStatus}>
            <div style={S.statusLabel}>CLASS STATUS</div>
            <div style={S.statusNum}>👥 {participants.length}</div>
            <div style={S.statusSub}>STUDENTS ACTIVE</div>
          </div>
          <div style={S.sidebarList}>
            {participants.map((p) => (
              <div key={p.displayName} style={S.sidebarRow}>
                <div style={S.avatar}>{p.displayName[0].toUpperCase()}</div>
                <span style={S.pName}>{p.displayName}</span>
                <span style={S.activeBadge}>ACTIVE</span>
              </div>
            ))}
          </div>
          {activityLog.length > 0 && (
            <div style={S.activitySection}>
              <div style={S.activityTitle}>🚨 ALERTS ({activityLog.length})</div>
              <div style={S.activityList}>
                {activityLog.map((a, i) => (
                  <div key={i} style={{ ...S.activityItem, borderLeft: `3px solid ${a.color}` }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#f1f5f9' }}>{a.displayName}</div>
                    <div style={{ fontSize: 11, color: a.color, fontWeight: 600 }}>{a.label}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(a.time).toLocaleTimeString()}</div>
                    <PenaltyControl
                      displayName={a.displayName}
                      roomCode={roomCode}
                      socket={socketRef.current}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main */}
        <div style={S.main}>
          {question && (
            <>
              <div style={S.qMeta}>QUESTION {question.index + 1} OF {question.total}</div>
              <div style={S.qText}>{question.text}</div>
              <div style={S.optionsList}>
                {question.options.map((opt, i) => (
                  <div key={opt} style={S.optionItem}>
                    <span style={S.optLetter}>{letters[i]}.</span>
                    <span style={S.optText}>{opt}</span>
                  </div>
                ))}
              </div>
              {error && <p style={S.error}>{error}</p>}
              <div style={S.btnRow}>
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
    </div>
  );
}

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', fontFamily: 'Inter, sans-serif' },
  toast: { position: 'fixed', top: 20, right: 20, background: '#16a34a', color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '0 28px', height: 60, borderBottom: '1px solid #334155', flexShrink: 0 },
  topbarTitle: { color: '#f1f5f9', fontWeight: 700, fontSize: 16 },
  topbarSub: { color: '#94a3b8', fontWeight: 400 },
  topbarRight: { color: '#94a3b8', fontSize: 14 },

  // waiting
  waitBody: { flex: 1, display: 'flex', gap: 24, padding: 32, overflow: 'hidden' },
  waitCard: { flex: 1, background: '#1e293b', borderRadius: 16, padding: 36, display: 'flex', flexDirection: 'column', gap: 16 },
  linkBox: { display: 'flex', gap: 10, background: '#0f172a', borderRadius: 10, padding: '12px 16px', alignItems: 'center' },
  linkText: { flex: 1, color: '#7dd3fc', fontSize: 14, wordBreak: 'break-all' },
  copyBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 },
  roomCodeBadge: { background: '#0f172a', color: '#94a3b8', borderRadius: 8, padding: '10px 16px', fontSize: 14 },
  actionBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, padding: '16px 32px', fontWeight: 700, fontSize: 16, cursor: 'pointer', marginTop: 8 },
  waitSidebar: { width: 280, background: '#1e293b', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  // active
  activeBody: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 260, background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  classStatus: { padding: '20px 20px 12px', borderBottom: '1px solid #334155' },
  statusLabel: { fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1.5 },
  statusNum: { fontSize: 32, fontWeight: 800, color: '#f1f5f9', margin: '4px 0' },
  statusSub: { fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1 },
  sidebarHeader: { padding: '16px 20px', fontWeight: 700, color: '#f1f5f9', fontSize: 14, borderBottom: '1px solid #334155' },
  sidebarList: { flex: 1, overflowY: 'auto', padding: '8px 12px' },
  sidebarRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8, marginBottom: 4 },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 },
  pName: { flex: 1, color: '#e2e8f0', fontSize: 14, fontWeight: 500 },
  activeBadge: { fontSize: 9, background: '#166534', color: '#86efac', padding: '3px 7px', borderRadius: 4, fontWeight: 700, letterSpacing: 0.5 },
  activitySection: { borderTop: '1px solid #334155', marginTop: 8, paddingTop: 8 },
  activityTitle: { fontSize: 10, fontWeight: 800, color: '#f87171', letterSpacing: 1, padding: '4px 8px', marginBottom: 4 },
  activityList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' },
  activityItem: { background: '#0f172a', borderRadius: 6, padding: '6px 10px', marginLeft: 4 },
  joinedBadge: { fontSize: 9, background: '#1e3a5f', color: '#7dd3fc', padding: '3px 7px', borderRadius: 4, fontWeight: 700, letterSpacing: 0.5 },

  // main question area
  main: { flex: 1, padding: '40px 48px', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  qMeta: { fontSize: 13, color: '#64748b', fontWeight: 700, letterSpacing: 1.5, marginBottom: 12 },
  qText: { fontSize: 32, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.3, marginBottom: 32 },
  optionsList: { display: 'flex', flexDirection: 'column', gap: 12 },
  optionItem: { display: 'flex', alignItems: 'center', gap: 16, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '16px 20px' },
  optLetter: { fontWeight: 800, color: '#3b82f6', fontSize: 16, width: 24 },
  optText: { color: '#e2e8f0', fontSize: 17 },
  btnRow: { marginTop: 'auto', paddingTop: 32 },
  nextBtn: { width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, padding: '18px', fontWeight: 800, fontSize: 16, cursor: 'pointer', letterSpacing: 1 },
  submitBtn: { width: '100%', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, padding: '18px', fontWeight: 800, fontSize: 16, cursor: 'pointer', letterSpacing: 1 },

  // results
  resultsCard: { background: '#1e293b', borderRadius: 20, padding: 40, width: '100%', maxWidth: 640 },
  resultsTitle: { fontSize: 24, fontWeight: 800, color: '#f1f5f9', marginBottom: 24, textAlign: 'center' },
  resultsTable: { display: 'flex', flexDirection: 'column', gap: 8 },
  resultRow: { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderRadius: 10 },
  rank: { fontSize: 20, width: 32 },
  rName: { flex: 1, fontWeight: 700, color: '#1e293b', fontSize: 16 },
  rScore: { color: '#475569', fontWeight: 600 },
  rPct: { background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: 8, fontWeight: 700, fontSize: 13 },
  exportBtn: { flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  homeBtn: { flex: 1, background: '#475569', color: '#fff', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },

  error: { color: '#f87171', fontSize: 13, marginTop: 8 },
};

// Penalty control component shown in each alert
function PenaltyControl({ displayName, roomCode, socket }) {
  const [secs, setSecs] = useState(30);
  const [applied, setApplied] = useState(false);

  function applyPenalty() {
    if (!socket) return;
    socket.emit('apply_penalty', { roomCode, targetDisplayName: displayName, seconds: secs });
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  }

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
      <select
        value={secs}
        onChange={e => setSecs(Number(e.target.value))}
        style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, padding: '3px 6px', fontSize: 11, cursor: 'pointer' }}
      >
        <option value={30}>30 sec</option>
        <option value={60}>1 min</option>
        <option value={120}>2 min</option>
        <option value={180}>3 min</option>
        <option value={300}>5 min</option>
      </select>
      <button
        onClick={applyPenalty}
        style={{ background: applied ? '#16a34a' : '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
      >
        {applied ? '✓ Applied' : '⏳ Penalize'}
      </button>
    </div>
  );
}
