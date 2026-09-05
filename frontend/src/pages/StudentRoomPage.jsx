import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentRoomPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const displayName = sessionStorage.getItem('displayName');

  const [phase, setPhase] = useState('waiting');
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Penalty state (controlled by teacher)
  const [penalty, setPenalty] = useState(0);
  const [locked, setLocked] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const penaltyRef = useRef(null);
  const tabSwitchRef = useRef(0);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Disable copy/paste/right-click
  useEffect(() => {
    const block = (e) => e.preventDefault();
    document.addEventListener('copy', block);
    document.addEventListener('paste', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('paste', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
    };
  }, []);

  // Tab visibility — just notify teacher, no auto penalty
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && phase === 'question') {
        const newCount = tabSwitchRef.current + 1;
        tabSwitchRef.current = newCount;
        setTabSwitchCount(newCount);
        if (socketRef.current) {
          socketRef.current.emit('tab_switch', { roomCode, switchCount: newCount });
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [phase, roomCode]);

  // Socket setup
  useEffect(() => {
    if (!displayName) { navigate(`/join/${roomCode}`); 
    return; 
  }
    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join_room', {
      roomCode, 
      displayName,
      rollNumber: sessionStorage.getItem('rollNumber') || '',
      section: sessionStorage.getItem('section') || '',
      course: sessionStorage.getItem('course') || '',
    });
    socket.on('waiting', () => setPhase('waiting'));
    socket.on('question_display', (q) => {
      setQuestion(q); setSelected(null); setPhase('question');
      if (!timerRef.current) timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    });
    socket.on('quiz_results', ({ score, total }) => {
      setResult({ score, total }); setPhase('results');
      clearInterval(timerRef.current); clearInterval(penaltyRef.current);
    });
    socket.on('teacher_disconnected', () => {});
    socket.on('error', ({ message }) => { setErrorMsg(message); setPhase('error'); });

    // Teacher-applied penalty
    socket.on('penalty_applied', ({ seconds }) => {
      clearInterval(penaltyRef.current);
      let secs = seconds;
      setPenalty(secs);
      penaltyRef.current = setInterval(() => {
        secs -= 1;
        setPenalty(secs);
        if (secs <= 0) { clearInterval(penaltyRef.current); setPenalty(0); }
      }, 1000);
    });

    return () => { socket.disconnect(); clearInterval(timerRef.current); clearInterval(penaltyRef.current); };
  }, [roomCode, displayName, navigate]);

  function selectAnswer(option) {
    if (selected || locked || penalty > 0) return;
    setSelected(option);
    socketRef.current.emit('submit_answer', { roomCode, questionId: question.questionId, selectedOption: option });
  }

  // ERROR
  if (phase === 'error') return (
    <div style={S.page}>
      <div style={S.topbar}><span style={S.brand}>STUDENT VIEW</span></div>
      <div style={S.center}>
        <div style={S.glassCard}>
          <p style={{ color: '#f87171', fontSize: 18, marginBottom: 20 }}>{errorMsg}</p>
          <button onClick={() => navigate(`/join/${roomCode}`)} style={S.btnPrimary}>Go Back</button>
        </div>
      </div>
    </div>
  );

  // RESULTS
  if (phase === 'results' && result) {
    const pct = Math.round((result.score / result.total) * 100);
    const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
    return (
      <div style={{ ...S.page, background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        <div style={S.topbar}>
          <span style={S.brand}>🎓 STUDENT VIEW</span>
          <span style={S.topbarRight}>👤 {displayName}</span>
        </div>
        <div style={S.center}>
          <div style={S.resultsGlass}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>🎉</div>
            <div style={S.completeTitle}>QUIZ COMPLETE!</div>
            <div style={{ ...S.bigScore, color }}>{result.score}<span style={S.scoreOf}>/{result.total}</span></div>
            <div style={{ ...S.pctBadge, background: color }}>{pct}%</div>
            <div style={S.breakdownRow}>
              <div style={S.correctPill}>✓ {result.score} Correct</div>
              <div style={S.incorrectPill}>✗ {result.total - result.score} Wrong</div>
            </div>
            {tabSwitchCount > 0 && <div style={S.switchNote}>⚠ Tab switches: {tabSwitchCount}</div>}
            <button onClick={() => navigate('/')} style={{ ...S.btnPrimary, marginTop: 24, width: '100%' }}>🏠 Go to Home</button>
          </div>
        </div>
      </div>
    );
  }

  // WAITING
  if (phase === 'waiting') return (
    <div style={S.page}>
      <div style={S.topbar}>
        <span style={S.brand}>🎓 STUDENT VIEW</span>
        <span style={S.topbarRight}>👤 {displayName}</span>
      </div>
      <div style={S.center}>
        <div style={{ textAlign: 'center' }}>
          <div style={S.pulseRing}><div style={S.pulseInner}>⏳</div></div>
          <h2 style={{ color: '#f1f5f9', fontSize: 24, marginBottom: 8 }}>Hi, {displayName}!</h2>
          <p style={{ color: '#94a3b8', fontSize: 16 }}>Waiting for the teacher to start...</p>
        </div>
      </div>
    </div>
  );

  // QUESTION
  const cols = question?.options?.length <= 2 ? 1 : 2;
  const isBlocked = locked || penalty > 0;

  return (
    <div style={{ ...S.page, userSelect: 'none' }} onCopy={e => e.preventDefault()} onPaste={e => e.preventDefault()}>
      <div style={S.topbar}>
        <span style={S.brand}>🎓 STUDENT VIEW <span style={{ fontWeight: 400, color: '#94a3b8' }}>— {displayName}</span></span>
        <span style={S.topbarRight}>⏱ {fmt(elapsed)}</span>
      </div>

      {/* Penalty banner */}
      {penalty > 0 && (
        <div style={S.penaltyBanner}>
          ⏳ Penalty applied by teacher — answers locked for <strong style={{ marginLeft: 6 }}>{fmt(penalty)}</strong>
        </div>
      )}
      {locked && <div style={S.lockedBanner}>🚫 You have been locked out by the teacher.</div>}
      {tabSwitchCount > 0 && !penalty && !locked && (
        <div style={S.warnBanner}>⚠ Tab switch detected ({tabSwitchCount}x) — teacher has been notified</div>
      )}

      <div style={S.questionPage}>
        {/* Progress */}
        <div style={S.progressRow}>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${((question.index + 1) / question.total) * 100}%` }} />
          </div>
          <span style={S.progressLabel}>Q{question.index + 1} / {question.total}</span>
        </div>

        <div style={S.qCard}>
          <div style={S.qChip}>QUESTION {question.index + 1}</div>
          <div style={S.qText}>{question.text}</div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, marginTop: 28, opacity: isBlocked ? 0.45 : 1 }}>
            {question.options.map((opt, i) => {
              const isSelected = selected === opt;
              return (
                <button key={opt} onClick={() => selectAnswer(opt)} disabled={!!selected || isBlocked}
                  style={{ ...S.optBtn, ...(isSelected ? S.optSelected : {}) }}>
                  <span style={{ ...S.optLetter, background: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(99,102,241,0.15)', color: isSelected ? '#fff' : '#818cf8' }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', color: isSelected ? '#fff' : '#e2e8f0' }}>{opt}</span>
                  {isSelected && <span style={{ fontSize: 20 }}>✓</span>}
                </button>
              );
            })}
          </div>

          <p style={S.hint}>
            {locked ? '🚫 Locked by teacher' :
             penalty > 0 ? `⏳ Penalty: ${fmt(penalty)} remaining` :
             selected ? '✅ Answer recorded — waiting for teacher...' :
             'Select your answer. Teacher controls the pace.'}
          </p>
        </div>
        <div style={S.timerRow}>Total Time: <strong style={{ color: '#818cf8' }}>{fmt(elapsed)}</strong></div>
      </div>
    </div>
  );
}

const S = {
  page: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', fontFamily: "'Inter', system-ui, sans-serif" },
  topbar: { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 28px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  brand: { fontWeight: 800, fontSize: 15, color: '#f1f5f9', letterSpacing: 0.5 },
  topbarRight: { color: '#94a3b8', fontSize: 14 },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  penaltyBanner: { background: 'linear-gradient(90deg, #f59e0b, #d97706)', color: '#fff', padding: '12px 28px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center' },
  lockedBanner: { background: 'linear-gradient(90deg, #dc2626, #b91c1c)', color: '#fff', padding: '12px 28px', fontWeight: 700, fontSize: 14 },
  warnBanner: { background: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', padding: '10px 28px', fontSize: 13, fontWeight: 600 },
  questionPage: { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 8vw' },
  progressRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  progressTrack: { flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 3, transition: 'width 0.5s ease' },
  progressLabel: { color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' },
  qCard: { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '36px 40px', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' },
  qChip: { display: 'inline-block', background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 11, fontWeight: 800, letterSpacing: 2, padding: '4px 12px', borderRadius: 20, marginBottom: 14, border: '1px solid rgba(99,102,241,0.3)' },
  qText: { fontSize: 26, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.4, marginBottom: 4 },
  optBtn: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s', minHeight: 62 },
  optSelected: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: '1.5px solid #6366f1', boxShadow: '0 0 20px rgba(99,102,241,0.4)' },
  optLetter: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 },
  hint: { textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 20 },
  timerRow: { color: '#475569', fontSize: 13, textAlign: 'right', paddingTop: 14 },
  glassCard: { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 40, textAlign: 'center' },
  btnPrimary: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  pulseRing: { width: 100, height: 100, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '2px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 40 },
  pulseInner: {},
  resultsGlass: { background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: '48px 52px', textAlign: 'center', minWidth: 340, boxShadow: '0 30px 60px rgba(0,0,0,0.4)' },
  completeTitle: { fontSize: 18, fontWeight: 800, color: '#a5b4fc', letterSpacing: 3, marginBottom: 20 },
  bigScore: { fontSize: 80, fontWeight: 900, lineHeight: 1, marginBottom: 12 },
  scoreOf: { fontSize: 32, color: '#475569', fontWeight: 600 },
  pctBadge: { display: 'inline-block', color: '#fff', fontWeight: 800, fontSize: 20, padding: '6px 20px', borderRadius: 30, marginBottom: 24 },
  breakdownRow: { display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 8 },
  correctPill: { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '8px 18px', fontWeight: 700, fontSize: 14 },
  incorrectPill: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '8px 18px', fontWeight: 700, fontSize: 14 },
  switchNote: { background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, marginTop: 12 },
};
