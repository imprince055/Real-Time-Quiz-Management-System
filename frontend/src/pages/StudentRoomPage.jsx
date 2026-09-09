import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────────────────────
// Countdown helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function timerStyle(ms) {
  if (ms <= 10_000) return { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' };
  if (ms <= 30_000) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' };
  return { color: '#a5b4fc', bg: 'rgba(99,102,241,0.1)',  border: '1px solid rgba(99,102,241,0.2)' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function StudentRoomPage() {
  const { roomCode } = useParams();
  const navigate     = useNavigate();
  const socketRef    = useRef(null);
  const tabRef       = useRef(0);
  const displayName  = sessionStorage.getItem('displayName');

  // Quiz state
  const [phase,        setPhase]        = useState('waiting');
  const [question,     setQuestion]     = useState(null);    // { questionId, text, options, index, total, endsAt }
  const [selected,     setSelected]     = useState(null);    // current selection (changeable)
  const [result,       setResult]       = useState(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [tabCount,     setTabCount]     = useState(0);
  const [penalty,      setPenalty]      = useState(0);
  const [locked,       setLocked]       = useState(false);
  const [timeUp,       setTimeUp]       = useState(false);
  const [lbLoading,    setLbLoading]    = useState(false);
  const [leaderboard,  setLeaderboard]  = useState([]);

  // Server-authoritative countdown
  const [endsAt,      setEndsAt]        = useState(null);    // Date object
  const [remainingMs, setRemainingMs]   = useState(null);
  const tickRef  = useRef(null);
  const penRef   = useRef(null);

  // ── Countdown engine ────────────────────────────────────────────────────────
  const startCountdown = useCallback((endsAtDate) => {
    clearInterval(tickRef.current);
    setEndsAt(endsAtDate);
    tickRef.current = setInterval(() => {
      const ms = endsAtDate.getTime() - Date.now();
      const safe = Math.max(0, ms);
      setRemainingMs(safe);
      if (ms <= 0) {
        clearInterval(tickRef.current);
        setTimeUp(true);
      }
    }, 250); // 250ms for smooth display
  }, []);

  // Disable copy/paste/right-click
  useEffect(() => {
    const b = e => e.preventDefault();
    ['copy','paste','cut','contextmenu'].forEach(ev => document.addEventListener(ev, b));
    return () => ['copy','paste','cut','contextmenu'].forEach(ev => document.removeEventListener(ev, b));
  }, []);

  // Tab visibility reporting
  useEffect(() => {
    function onVis() {
      if (document.hidden && phase === 'question') {
        const n = tabRef.current + 1; tabRef.current = n; setTabCount(n);
        socketRef.current?.emit('tab_switch', { roomCode, switchCount: n });
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase, roomCode]);

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!displayName) { navigate(`/join/${roomCode}`); return; }

    const socket = io(API_URL);
    socketRef.current = socket;

    socket.emit('join_room', {
      roomCode, displayName,
      rollNumber:   sessionStorage.getItem('rollNumber') || '',
      section:      sessionStorage.getItem('section')    || '',
      course:       sessionStorage.getItem('course')     || '',
      studentToken: localStorage.getItem('studentToken') || undefined,
    });

    socket.on('waiting', () => setPhase('waiting'));

    socket.on('question_display', ({ questionId, text, options, index, total, endsAt: ea }) => {
      setQuestion({ questionId, text, options, index, total });
      // Don't clear selected here — answer_restored will set it if needed
      setSelected(null);
      setPhase('question');
      // Start/sync server-authoritative countdown
      if (ea) startCountdown(new Date(ea));
    });

    // Server restores any previously saved answer for this question (on reconnect / next_question)
    socket.on('answer_restored', ({ selectedOption }) => {
      setSelected(selectedOption);
    });

    socket.on('quiz_results', data => {
      setResult(data); setPhase('results');
      clearInterval(tickRef.current); clearInterval(penRef.current);
      if (data.sessionId) {
        const t = localStorage.getItem('studentToken');
        if (t) {
          setLbLoading(true);
          fetch(`${API_URL}/api/students/session/${data.sessionId}/leaderboard`, { headers: { Authorization: `Bearer ${t}` } })
            .then(r => r.json()).then(lb => { if (Array.isArray(lb)) setLeaderboard(lb); })
            .catch(() => {}).finally(() => setLbLoading(false));
        }
      }
    });

    socket.on('quiz_done_early', () => {
      setPhase('done_early');
    });

    socket.on('error', ({ message, code }) => {
      if (code === 'QUIZ_EXPIRED') {
        setTimeUp(true);
        clearInterval(tickRef.current);
      } else {
        setErrorMsg(message); setPhase('error');
      }
    });

    socket.on('penalty_applied', ({ seconds }) => {
      clearInterval(penRef.current);
      let s = seconds; setPenalty(s);
      penRef.current = setInterval(() => { s--; setPenalty(s); if (s <= 0) { clearInterval(penRef.current); setPenalty(0); } }, 1000);
    });

    return () => {
      socket.disconnect();
      clearInterval(tickRef.current);
      clearInterval(penRef.current);
    };
  }, [roomCode, displayName, navigate, startCountdown]);

  // ── Answer selection (changeable, server-authoritative) ─────────────────────
  function selectAnswer(opt) {
    // Allow changing answer: no `if (selected) return` — always allow re-select
    if (locked || penalty > 0 || timeUp) return;
    if (!question) return;

    setSelected(opt);
    socketRef.current.emit('submit_answer', {
      roomCode,
      questionId:    question.questionId,
      selectedOption: opt,
      questionIndex:  question.index,  // backend validates this matches student progress
    });
  }

  function goNext() {
    if (timeUp) return;
    setSelected(null);
    socketRef.current.emit('student_next_question', { roomCode });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  const msLeft   = remainingMs ?? 0;
  const ts       = timerStyle(msLeft);
  const isBlocked = locked || penalty > 0;

  // ── ERROR ──
  if (phase === 'error') return (
    <div style={S.page}>
      <div style={S.topbar}><span style={S.tbBrand}>STUDENT VIEW</span></div>
      <div style={S.center}>
        <div style={S.glassCard}>
          <p style={{ color: '#f87171', fontSize: 16, marginBottom: 18 }}>{errorMsg}</p>
          <button onClick={() => navigate(`/join/${roomCode}`)} style={S.primaryBtn}>Go Back</button>
        </div>
      </div>
    </div>
  );

  // ── DONE EARLY ──
  if (phase === 'done_early') return (
    <div style={S.page}>
      <div style={S.topbar}><span style={S.tbBrand}>🎓 {displayName}</span></div>
      <div style={S.center}>
        <div style={S.glassCard}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, color: '#a5b4fc', fontSize: 18, marginBottom: 8 }}>All Questions Done!</div>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            Waiting for the quiz to end. Your answers have been saved.
          </p>
          {remainingMs !== null && (
            <div style={{ ...S.timerBadge, ...ts, marginTop: 20 }}>
              <span style={{ fontSize: 11, letterSpacing: 1, color: ts.color }}>TIME LEFT</span>
              <span style={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fmtMs(msLeft)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── RESULTS ──
  if (phase === 'results' && result) {
    const correct   = result.correctAnswers   ?? result.score ?? 0;
    const incorrect = result.incorrectAnswers ?? ((result.total ?? 0) - correct);
    const total     = result.totalQuestions   ?? result.total ?? 0;
    const pct       = result.percentage       ?? (total > 0 ? Math.round((correct / total) * 100) : 0);
    const timeTaken = result.timeTaken        ?? 0;
    const rank      = result.rank             ?? null;
    const totalPart = result.totalParticipants ?? null;
    const quizTitle = result.quizTitle        ?? '';
    const scoreColor = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

    return (
      <div style={{ ...S.page, background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)' }}>
        <div style={S.topbar}>
          <span style={S.tbBrand}>🎓 STUDENT VIEW</span>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>👤 {displayName}</span>
        </div>
        <div style={S.resultsBody}>
          <div style={S.resultCard}>
            <div style={{ fontSize: 48, marginBottom: 6, textAlign: 'center' }}>🎉</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#a5b4fc', letterSpacing: 3, textAlign: 'center', marginBottom: 6 }}>QUIZ COMPLETE!</div>
            {quizTitle && <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 14, fontStyle: 'italic' }}>{quizTitle}</div>}
            <div style={{ fontSize: 'clamp(52px,14vw,72px)', fontWeight: 900, textAlign: 'center', color: scoreColor, lineHeight: 1, marginBottom: 6 }}>
              {correct}<span style={{ fontSize: 'clamp(20px,5vw,28px)', color: '#475569', fontWeight: 600 }}>/{total}</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <span style={{ background: scoreColor, color: '#fff', fontWeight: 800, fontSize: 16, padding: '4px 16px', borderRadius: 30 }}>{pct}%</span>
            </div>
            <div className="stat-grid" style={{ marginBottom: 14 }}>
              {[
                { val: correct,   label: 'Correct',  color: '#10b981' },
                { val: incorrect, label: 'Incorrect', color: '#ef4444' },
                { val: `${timeTaken}s`, label: 'Time', color: '#818cf8' },
                ...(rank !== null ? [{ val: `#${rank}${totalPart ? ` of ${totalPart}` : ''}`, label: 'Rank', color: '#fbbf24' }] : []),
              ].map(s => (
                <div key={s.label} style={S.statBox}>
                  <div style={{ fontSize: 'clamp(18px,5vw,22px)', fontWeight: 800, color: s.color, marginBottom: 3 }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {tabCount > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}>
                ⚠ Tab switches: {tabCount}
              </div>
            )}
          </div>
          <div style={S.lbCard}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9', letterSpacing: 2, marginBottom: 14, textAlign: 'center' }}>🏆 LEADERBOARD</div>
            {lbLoading ? (
              <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Loading…</div>
            ) : leaderboard.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>No leaderboard data.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="lb-table" style={{ background: 'transparent', minWidth: 280 }}>
                  <thead>
                    <tr>
                      {['Rank','Student','Correct','Time'].map(h => (
                        <th key={h} style={{ color: '#64748b', background: 'transparent', borderBottomColor: '#334155' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => {
                      const isMe = entry.displayName === displayName;
                      return (
                        <tr key={entry._id || i} style={{ background: isMe ? 'rgba(99,102,241,0.18)' : 'transparent' }}>
                          <td style={{ color: '#e2e8f0' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</td>
                          <td style={{ color: isMe ? '#a5b4fc' : '#e2e8f0', fontWeight: isMe ? 800 : 500 }}>
                            {entry.displayName}{isMe ? ' (You)' : ''}
                          </td>
                          <td style={{ color: '#94a3b8' }}>{entry.correctAnswers}/{entry.totalQuestions}</td>
                          <td style={{ color: '#94a3b8' }}>{entry.timeTaken}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => navigate('/student/dashboard')} style={{ ...S.primaryBtn, marginTop: 18, width: '100%' }}>
              🏠 Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── WAITING ──
  if (phase === 'waiting') return (
    <div style={S.page}>
      <div style={S.topbar}>
        <span style={S.tbBrand}>🎓 STUDENT VIEW</span>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>👤 {displayName}</span>
      </div>
      <div style={S.center}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(48px,14vw,80px)', marginBottom: 20 }}>⏳</div>
          <h2 style={{ color: '#f1f5f9', fontSize: 'clamp(18px,5vw,24px)', marginBottom: 8 }}>Hi, {displayName}!</h2>
          <p style={{ color: '#94a3b8', fontSize: 15 }}>Waiting for the teacher to start…</p>
        </div>
      </div>
    </div>
  );

  // ── QUESTION ──
  if (!question) return null;

  const cols = question.options?.length <= 2 ? 1 : 2;

  return (
    <div style={{ ...S.page, userSelect: 'none' }}>
      {/* Topbar with name + countdown */}
      <div style={S.topbar}>
        <span style={{ ...S.tbBrand, fontSize: 'clamp(12px,3.5vw,14px)' }}>🎓 {displayName}</span>
        {/* Server-authoritative countdown badge */}
        {remainingMs !== null && (
          <div style={{ ...S.timerBadge, ...ts }}>
            <span style={{ fontSize: 10, letterSpacing: 1, color: ts.color, display: 'block', lineHeight: 1 }}>TIME LEFT</span>
            <span style={{
              fontSize: 'clamp(18px,4vw,24px)',
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              animation: msLeft <= 10_000 ? 'pulse 0.6s ease-in-out infinite' : 'none',
            }}>
              {timeUp ? '⏰' : fmtMs(msLeft)}
            </span>
          </div>
        )}
      </div>

      {/* Penalty / locked / tab banners */}
      {penalty > 0 && (
        <div style={{ background: 'linear-gradient(90deg,#f59e0b,#d97706)', color: '#fff', padding: '10px var(--page-px)', fontWeight: 700, fontSize: 13 }}>
          ⏳ Penalty — locked for <strong>{fmt(penalty)}</strong>
        </div>
      )}
      {locked && <div style={{ background: 'linear-gradient(90deg,#dc2626,#b91c1c)', color: '#fff', padding: '10px var(--page-px)', fontWeight: 700, fontSize: 13 }}>🚫 Locked by teacher</div>}
      {timeUp && (
        <div style={{ background: 'linear-gradient(90deg,#dc2626,#b91c1c)', color: '#fff', padding: '10px var(--page-px)', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>
          ⏰ TIME UP — Quiz has ended
        </div>
      )}
      {tabCount > 0 && !penalty && !locked && !timeUp && (
        <div style={{ background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', padding: '8px var(--page-px)', fontSize: 12, fontWeight: 600 }}>
          ⚠ Tab switch ({tabCount}×) — teacher notified
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 'clamp(14px,4vw,24px) var(--page-px)', overflowY: 'auto' }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 3, width: `${((question.index + 1) / question.total) * 100}%`, transition: 'width 0.5s' }} />
          </div>
          <span style={{ color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>Q{question.index + 1}/{question.total}</span>
        </div>

        {/* Question card */}
        <div style={S.qCard}>
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 11, fontWeight: 800, letterSpacing: 2, padding: '3px 11px', borderRadius: 20, marginBottom: 12, border: '1px solid rgba(99,102,241,0.3)' }}>
            QUESTION {question.index + 1} OF {question.total}
          </div>
          <div style={{ fontSize: 'clamp(17px,5vw,24px)', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.4, marginBottom: 'clamp(16px,4vw,24px)' }}>
            {question.text}
          </div>

          {/* Answer options — re-selectable (no disabled={!!selected}) */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${window.innerWidth < 520 ? 1 : cols}, 1fr)`, gap: 12, opacity: isBlocked || timeUp ? 0.45 : 1 }}>
            {question.options.map((opt, i) => {
              const isSel = selected === opt;
              return (
                <button
                  key={opt}
                  className={`opt-btn${isSel ? ' selected' : ''}`}
                  onClick={() => selectAnswer(opt)}
                  disabled={isBlocked || timeUp}  // NOT disabled just because selected
                  aria-pressed={isSel}
                >
                  <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0, background: isSel ? 'rgba(255,255,255,0.3)' : 'rgba(99,102,241,0.15)', color: isSel ? '#fff' : '#818cf8' }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{opt}</span>
                  {isSel && <span style={{ fontSize: 18 }}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* Status hint */}
          <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 18 }}>
            {timeUp           ? '⏰ Time is up — quiz ended'
             : locked         ? '🚫 Locked by teacher'
             : penalty > 0    ? `⏳ ${fmt(penalty)} remaining`
             : selected       ? `✅ "${selected}" selected — tap another option to change`
             : 'Select your answer'}
          </p>
        </div>

        {/* NEXT QUESTION button — student-controlled */}
        {!timeUp && (
          <button
            onClick={goNext}
            disabled={isBlocked}
            style={{
              ...S.nextBtn,
              marginTop: 16,
              opacity: isBlocked ? 0.5 : 1,
              cursor: isBlocked ? 'not-allowed' : 'pointer',
            }}
          >
            {question.index === question.total - 1 ? '✅ Finish Quiz' : 'NEXT QUESTION →'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  page:    { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)', fontFamily: "'Inter',system-ui,sans-serif" },
  topbar:  { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 var(--page-px)', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 },
  tbBrand: { fontWeight: 800, fontSize: 'clamp(12px,3.5vw,15px)', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  center:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },

  // Timer badge in topbar
  timerBadge: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 10, padding: '4px 12px', gap: 1, transition: 'background 0.3s, border 0.3s' },

  glassCard:  { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(24px,6vw,40px)', textAlign: 'center', width: '100%', maxWidth: 360 },
  primaryBtn: { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px,3vw,14px) clamp(20px,5vw,28px)', fontWeight: 700, fontSize: 'clamp(14px,3.5vw,16px)', cursor: 'pointer' },

  // Question card
  qCard:   { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 'clamp(18px,5vw,32px) clamp(16px,5vw,36px)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' },
  nextBtn: { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(14px,3.5vw,18px)', fontWeight: 800, fontSize: 'clamp(14px,3.5vw,16px)', width: '100%', letterSpacing: 0.5, boxShadow: '0 4px 16px rgba(99,102,241,0.4)' },

  // Results
  resultsBody: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: 20, padding: 'clamp(16px,4vw,32px) var(--page-px)', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto' },
  resultCard:  { background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 22, padding: 'clamp(24px,5vw,36px) clamp(20px,5vw,40px)', flex: '1 1 260px', maxWidth: 400, boxShadow: '0 24px 48px rgba(0,0,0,0.3)' },
  statBox:     { background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 'clamp(10px,2.5vw,14px)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' },
  lbCard:      { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 22, padding: 'clamp(20px,5vw,32px) clamp(18px,4vw,28px)', flex: '1 1 260px', maxWidth: 480, boxShadow: '0 16px 40px rgba(0,0,0,0.25)' },
};
