import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentRoomPage() {
  const { roomCode } = useParams();
  const navigate     = useNavigate();
  const socketRef    = useRef(null);
  const timerRef     = useRef(null);
  const tabRef       = useRef(0);
  const displayName  = sessionStorage.getItem('displayName');

  const [phase,         setPhase]         = useState('waiting');
  const [question,      setQuestion]       = useState(null);
  const [selected,      setSelected]       = useState(null);
  const [result,        setResult]         = useState(null);
  const [errorMsg,      setErrorMsg]       = useState('');
  const [elapsed,       setElapsed]        = useState(0);
  const [penalty,       setPenalty]        = useState(0);
  const [locked,        setLocked]         = useState(false);
  const [tabCount,      setTabCount]       = useState(0);
  const [leaderboard,   setLeaderboard]    = useState([]);
  const [lbLoading,     setLbLoading]      = useState(false);
  const penRef = useRef(null);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  /* Disable copy/paste/right-click */
  useEffect(() => {
    const b = e => e.preventDefault();
    ['copy','paste','cut','contextmenu'].forEach(ev => document.addEventListener(ev, b));
    return () => ['copy','paste','cut','contextmenu'].forEach(ev => document.removeEventListener(ev, b));
  }, []);

  /* Tab visibility */
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

  /* Socket */
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
    socket.on('question_display', q => {
      setQuestion(q); setSelected(null); setPhase('question');
      if (!timerRef.current) timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    });
    socket.on('quiz_results', data => {
      setResult(data); setPhase('results');
      clearInterval(timerRef.current); clearInterval(penRef.current);
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
    socket.on('error', ({ message }) => { setErrorMsg(message); setPhase('error'); });
    socket.on('penalty_applied', ({ seconds }) => {
      clearInterval(penRef.current);
      let s = seconds; setPenalty(s);
      penRef.current = setInterval(() => { s--; setPenalty(s); if (s <= 0) { clearInterval(penRef.current); setPenalty(0); } }, 1000);
    });
    return () => { socket.disconnect(); clearInterval(timerRef.current); clearInterval(penRef.current); };
  }, [roomCode, displayName, navigate]);

  function selectAnswer(opt) {
    if (selected || locked || penalty > 0) return;
    setSelected(opt);
    socketRef.current.emit('submit_answer', { roomCode, questionId: question.questionId, selectedOption: opt });
  }

  /* ── ERROR ── */
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

  /* ── RESULTS ── */
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
          {/* Result summary */}
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

          {/* Leaderboard */}
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
                      <th style={{ color: '#64748b', background: 'transparent', borderBottomColor: '#334155' }}>Rank</th>
                      <th style={{ color: '#64748b', background: 'transparent', borderBottomColor: '#334155' }}>Student</th>
                      <th style={{ color: '#64748b', background: 'transparent', borderBottomColor: '#334155' }}>Correct</th>
                      <th style={{ color: '#64748b', background: 'transparent', borderBottomColor: '#334155' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => {
                      const isMe = entry.displayName === displayName;
                      return (
                        <tr key={entry._id || i} style={{
                          background: isMe ? 'rgba(99,102,241,0.18)' : i === 0 ? 'rgba(251,191,36,0.08)' : 'transparent',
                        }}>
                          <td style={{ color: '#e2e8f0' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
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

  /* ── WAITING ── */
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

  /* ── QUESTION ── */
  const isBlocked = locked || penalty > 0;
  const cols      = question?.options?.length <= 2 ? 1 : 2;

  return (
    <div style={{ ...S.page, userSelect: 'none' }}>
      <div style={S.topbar}>
        <span style={{ ...S.tbBrand, fontSize: 'clamp(12px,3.5vw,15px)' }}>
          🎓 {displayName}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 'clamp(12px,3.5vw,14px)', fontWeight: 700 }}>⏱ {fmt(elapsed)}</span>
      </div>

      {penalty > 0 && (
        <div style={{ background: 'linear-gradient(90deg,#f59e0b,#d97706)', color: '#fff', padding: '10px var(--page-px)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          ⏳ Penalty — locked for <strong>{fmt(penalty)}</strong>
        </div>
      )}
      {locked && <div style={{ background: 'linear-gradient(90deg,#dc2626,#b91c1c)', color: '#fff', padding: '10px var(--page-px)', fontWeight: 700, fontSize: 13 }}>🚫 Locked by teacher</div>}
      {tabCount > 0 && !penalty && !locked && (
        <div style={{ background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', padding: '8px var(--page-px)', fontSize: 12, fontWeight: 600 }}>
          ⚠ Tab switch detected ({tabCount}×) — teacher notified
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 'clamp(16px,4vw,28px) var(--page-px)', overflowY: 'auto' }}>
        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 3, width: `${((question.index + 1) / question.total) * 100}%`, transition: 'width 0.5s' }} />
          </div>
          <span style={{ color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>Q{question.index + 1}/{question.total}</span>
        </div>

        {/* Question card */}
        <div style={S.qCard}>
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 11, fontWeight: 800, letterSpacing: 2, padding: '3px 11px', borderRadius: 20, marginBottom: 12, border: '1px solid rgba(99,102,241,0.3)' }}>
            QUESTION {question.index + 1}
          </div>
          <div style={{ fontSize: 'clamp(18px,5vw,26px)', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.4, marginBottom: 'clamp(18px,4vw,28px)' }}>
            {question.text}
          </div>

          {/* Options grid — 1 col on mobile, 2 cols on larger */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${window.innerWidth < 520 ? 1 : cols}, 1fr)`, gap: 12, opacity: isBlocked ? 0.45 : 1 }}>
            {question.options.map((opt, i) => {
              const isSel = selected === opt;
              return (
                <button key={opt} className={`opt-btn${isSel ? ' selected' : ''}`}
                  onClick={() => selectAnswer(opt)} disabled={!!selected || isBlocked}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0, background: isSel ? 'rgba(255,255,255,0.3)' : 'rgba(99,102,241,0.15)', color: isSel ? '#fff' : '#818cf8' }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{opt}</span>
                  {isSel && <span style={{ fontSize: 18 }}>✓</span>}
                </button>
              );
            })}
          </div>

          <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 18 }}>
            {locked ? '🚫 Locked' : penalty > 0 ? `⏳ ${fmt(penalty)} remaining` : selected ? '✅ Answer recorded — waiting…' : 'Select your answer'}
          </p>
        </div>

        <div style={{ color: '#475569', fontSize: 12, textAlign: 'right', paddingTop: 12 }}>
          Total time: <strong style={{ color: '#818cf8' }}>{fmt(elapsed)}</strong>
        </div>
      </div>
    </div>
  );
}

const S = {
  page:       { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)', fontFamily: "'Inter',system-ui,sans-serif", overflow: 'hidden' },
  topbar:     { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 var(--page-px)', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 },
  tbBrand:    { fontWeight: 800, fontSize: 'clamp(12px,3.5vw,15px)', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  center:     { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  glassCard:  { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(24px,6vw,40px)', textAlign: 'center', width: '100%', maxWidth: 360 },
  primaryBtn: { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px,3vw,14px) clamp(20px,5vw,28px)', fontWeight: 700, fontSize: 'clamp(14px,3.5vw,16px)', cursor: 'pointer' },

  /* Results layout */
  resultsBody: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: 20, padding: 'clamp(16px,4vw,32px) var(--page-px)', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto' },
  resultCard:  { background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 22, padding: 'clamp(24px,5vw,36px) clamp(20px,5vw,40px)', flex: '1 1 260px', maxWidth: 400, boxShadow: '0 24px 48px rgba(0,0,0,0.3)' },
  statBox:     { background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 'clamp(10px,2.5vw,14px)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' },
  lbCard:      { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 22, padding: 'clamp(20px,5vw,32px) clamp(18px,4vw,28px)', flex: '1 1 260px', maxWidth: 480, boxShadow: '0 16px 40px rgba(0,0,0,0.25)' },

  /* Question card */
  qCard: { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 'clamp(20px,5vw,36px) clamp(18px,5vw,40px)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', marginBottom: 8 },
};
