import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentDashboardPage() {
  const [profile,        setProfile]        = useState(null);
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [joinCode,       setJoinCode]       = useState('');
  const navigate = useNavigate();
  const token = localStorage.getItem('studentToken');

  useEffect(() => {
    if (!token) { navigate('/student/login'); return; }
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.error || data.role !== 'student') { navigate('/student/login'); return; }
        setProfile(data);
        sessionStorage.setItem('displayName', data.displayName);
        sessionStorage.setItem('rollNumber',  data.rollNumber || '');
        sessionStorage.setItem('section',     data.section    || '');
        sessionStorage.setItem('course',      data.course     || '');
      });
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    setHistoryLoading(true);
    fetch(`${API_URL}/api/students/me/history`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setHistory(d); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [token]);

  function logout() { localStorage.removeItem('studentToken'); navigate('/student/login'); }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  if (!profile) return (
    <div style={S.page}><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></div>
  );

  return (
    <div style={S.page}>
      {/* ── Navbar ── */}
      <div style={S.navbar}>
        <span style={S.brand}>👨‍🎓 Student Portal</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/')} style={S.ghostBtn}>Home</button>
          <button onClick={logout} style={S.ghostBtn}>Logout</button>
        </div>
      </div>

      <div style={S.body}>
        {/* Profile card */}
        <div style={S.profileCard}>
          <div style={S.avatar}>
            {profile.photoUrl
              ? <img src={profile.photoUrl} referrerPolicy="no-referrer" alt="profile"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : profile.displayName[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.profileName}>{profile.displayName}</div>
            <div style={S.tagRow}>
              {profile.rollNumber && <span style={S.tag}>🎫 {profile.rollNumber}</span>}
              {profile.section    && <span style={S.tag}>📚 {profile.section}</span>}
              {profile.course     && <span style={S.tag}>🎓 {profile.course}</span>}
              <span style={S.tag}>✉️ {profile.email}</span>
            </div>
          </div>
        </div>

        {/* Join a quiz */}
        <div style={S.joinCard}>
          <div style={{ fontSize: 32, flexShrink: 0 }}>🔗</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 3 }}>Join a Quiz</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Enter a room code or ask your teacher for the link</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <input style={S.codeInput} placeholder="Room code" value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && joinCode.trim() && navigate(`/join/${joinCode.trim()}`)} />
            <button style={S.joinBtn}
              onClick={() => joinCode.trim() && navigate(`/join/${joinCode.trim()}`)}>
              Join
            </button>
          </div>
        </div>

        {/* Quiz History */}
        <div style={S.historySection}>
          <div style={S.histHeader}>
            <span style={S.histTitle}>📋 Quiz History</span>
            <span style={S.histCount}>{history.length} attempt{history.length !== 1 ? 's' : ''}</span>
          </div>

          {historyLoading ? (
            <div style={S.empty}>Loading history…</div>
          ) : history.length === 0 ? (
            <div style={S.empty}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📝</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 4 }}>No quizzes attempted yet</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Join a quiz and your results will appear here.</div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="overflow-x-auto" style={{ display: 'block' }}>
                <table className="lb-table responsive-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Quiz</th><th>Date</th>
                      <th>Score</th><th>Correct</th><th>%</th>
                      <th>Time</th><th>Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item, i) => {
                      const pct = item.percentage ?? 0;
                      const pColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#92400e' : '#dc2626';
                      const pBg   = pct >= 70 ? '#dcfce7'  : pct >= 40 ? '#fef9c3'  : '#fee2e2';
                      return (
                        <tr key={item.attemptId || i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.quizTitle}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(item.submittedAt)}</td>
                          <td>{item.score}/{item.totalQuestions}</td>
                          <td>{item.correctAnswers}</td>
                          <td><span style={{ padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12, background: pBg, color: pColor }}>{pct}%</span></td>
                          <td>{item.timeTaken != null ? `${item.timeTaken}s` : '—'}</td>
                          <td>{item.rank != null ? <span style={S.rankBadge}>#{item.rank}</span> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mobile-cards">
                {history.map((item, i) => {
                  const pct = item.percentage ?? 0;
                  const pColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#92400e' : '#dc2626';
                  const pBg   = pct >= 70 ? '#dcfce7' : pct >= 40 ? '#fef9c3' : '#fee2e2';
                  return (
                    <div key={item.attemptId || i} style={S.mobileCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1, marginRight: 8 }}>{item.quizTitle}</div>
                        {item.rank != null && <span style={S.rankBadge}>#{item.rank}</span>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#64748b' }}>
                        <span>📅 {fmtDate(item.submittedAt)}</span>
                        <span>✅ {item.correctAnswers}/{item.totalQuestions}</span>
                        <span>⏱ {item.timeTaken != null ? `${item.timeTaken}s` : '—'}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: pBg, color: pColor }}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  page:    { minHeight: '100vh', background: '#f0f9ff' },
  navbar:  { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 var(--page-px)', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', gap: 10 },
  brand:   { fontWeight: 800, fontSize: 'clamp(14px,4vw,18px)', color: '#3b82f6', whiteSpace: 'nowrap' },
  ghostBtn: { background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  body:    { maxWidth: 960, margin: '0 auto', padding: 'clamp(20px,4vw,36px) var(--page-px)', display: 'flex', flexDirection: 'column', gap: 16 },

  profileCard: { background: '#fff', borderRadius: 14, padding: 'clamp(16px,4vw,24px)', display: 'flex', alignItems: 'center', gap: 'clamp(12px,3vw,20px)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', flexWrap: 'wrap' },
  avatar:   { width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg,#06b6d4,#3b82f6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, flexShrink: 0, overflow: 'hidden' },
  profileName: { fontWeight: 800, fontSize: 'clamp(15px,4vw,19px)', color: '#1e293b', marginBottom: 6 },
  tagRow:  { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag:     { background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' },

  joinCard: { background: '#fff', borderRadius: 14, padding: 'clamp(14px,3vw,22px)', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', flexWrap: 'wrap' },
  codeInput: { padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: 'clamp(100px,30vw,140px)', outline: 'none' },
  joinBtn:  { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' },

  historySection: { background: '#fff', borderRadius: 14, padding: 'clamp(16px,4vw,24px)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  histHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  histTitle:  { fontWeight: 800, fontSize: 'clamp(15px,4vw,18px)', color: '#1e293b' },
  histCount:  { background: '#e0f2fe', color: '#0369a1', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20 },
  empty:      { textAlign: 'center', padding: 'clamp(32px,8vw,48px) 0', color: '#94a3b8' },
  rankBadge:  { display: 'inline-block', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 800, fontSize: 11, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' },
  mobileCard: { background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' },
};
