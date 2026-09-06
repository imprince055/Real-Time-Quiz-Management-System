import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentDashboardPage() {
  const [profile, setProfile]     = useState(null);
  const [history, setHistory]     = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const navigate = useNavigate();
  const token = localStorage.getItem('studentToken');

  useEffect(() => {
    if (!token) { navigate('/student/login'); return; }
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error || data.role !== 'student') { navigate('/student/login'); return; }
        setProfile(data);
        sessionStorage.setItem('displayName', data.displayName);
        sessionStorage.setItem('rollNumber', data.rollNumber || '');
        sessionStorage.setItem('section',    data.section    || '');
        sessionStorage.setItem('course',     data.course     || '');
      });
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    setHistoryLoading(true);
    fetch(`${API_URL}/api/students/me/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [token]);

  function logout() {
    localStorage.removeItem('studentToken');
    navigate('/student/login');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  if (!profile) return (
    <div style={S.page}>
      <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>Loading...</div>
    </div>
  );

  return (
    <div style={S.page}>
      {/* ── Navbar ── */}
      <div style={S.navbar}>
        <span style={S.navBrand}>👨‍🎓 Student Portal</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/')} style={S.back}>Home</button>
          <button onClick={logout} style={S.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={S.body}>
        {/* ── Profile card ── */}
        <div style={S.profileCard}>
          <div style={S.avatar}>{profile.displayName[0].toUpperCase()}</div>
          <div>
            <div style={S.profileName}>{profile.displayName}</div>
            <div style={S.profileMeta}>
              {profile.rollNumber && <span style={S.tag}>🎫 {profile.rollNumber}</span>}
              {profile.section    && <span style={S.tag}>📚 Section {profile.section}</span>}
              {profile.course     && <span style={S.tag}>🎓 {profile.course}</span>}
              <span style={S.tag}>✉️ {profile.email}</span>
            </div>
          </div>
        </div>

        {/* ── Join a quiz ── */}
        <div style={S.joinCard}>
          <div style={S.joinIcon}>🔗</div>
          <div>
            <div style={S.joinTitle}>Join a Quiz</div>
            <div style={S.joinSub}>Ask your teacher for the quiz link or room code</div>
          </div>
          <JoinByCode navigate={navigate} />
        </div>

        {/* ── Quiz History ── */}
        <div style={S.historySection}>
          <div style={S.historyHeader}>
            <span style={S.historyTitle}>📋 Quiz History</span>
            <span style={S.historyCount}>{history.length} attempt{history.length !== 1 ? 's' : ''}</span>
          </div>

          {historyLoading ? (
            <div style={S.emptyState}>Loading history...</div>
          ) : history.length === 0 ? (
            <div style={S.emptyState}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
              <div style={S.emptyTitle}>No quizzes attempted yet</div>
              <div style={S.emptySub}>Join a quiz and your results will appear here.</div>
            </div>
          ) : (
            <div style={S.historyTableWrap}>
              {/* Desktop table */}
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>Quiz</th>
                    <th style={S.th}>Date</th>
                    <th style={S.th}>Score</th>
                    <th style={S.th}>Correct</th>
                    <th style={S.th}>%</th>
                    <th style={S.th}>Time</th>
                    <th style={S.th}>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, i) => {
                    const pct = item.percentage ?? 0;
                    const pctColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#92400e' : '#dc2626';
                    const pctBg   = pct >= 70 ? '#dcfce7' : pct >= 40 ? '#fef9c3' : '#fee2e2';
                    return (
                      <tr key={item.attemptId || i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.quizTitle}
                        </td>
                        <td style={S.td}>{formatDate(item.submittedAt)}</td>
                        <td style={S.td}>{item.score}/{item.totalQuestions}</td>
                        <td style={S.td}>{item.correctAnswers}</td>
                        <td style={S.td}>
                          <span style={{ ...S.pctPill, color: pctColor, background: pctBg }}>
                            {pct}%
                          </span>
                        </td>
                        <td style={S.td}>{item.timeTaken != null ? `${item.timeTaken}s` : '—'}</td>
                        <td style={S.td}>
                          {item.rank != null
                            ? <span style={S.rankBadge}>#{item.rank}</span>
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JoinByCode({ navigate }) {
  const [code, setCode] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: 130, outline: 'none' }}
        placeholder="Room code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button
        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
        onClick={() => code.trim() && navigate(`/join/${code.trim()}`)}
      >
        Join
      </button>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#f0f9ff' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  navBrand: { fontWeight: 800, fontSize: 18, color: '#3b82f6' },
  back: { background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  logoutBtn: { background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  body: { maxWidth: 960, margin: '0 auto', padding: '36px 24px', display: 'flex', flexDirection: 'column', gap: 20 },

  profileCard: { background: '#fff', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  avatar: { width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, flexShrink: 0 },
  profileName: { fontWeight: 800, fontSize: 20, color: '#1e293b', marginBottom: 8 },
  profileMeta: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tag: { background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },

  joinCard: { background: '#fff', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', flexWrap: 'wrap' },
  joinIcon: { fontSize: 36 },
  joinTitle: { fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 4 },
  joinSub: { fontSize: 13, color: '#94a3b8' },

  // History section
  historySection: { background: '#fff', borderRadius: 16, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  historyHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  historyTitle: { fontWeight: 800, fontSize: 18, color: '#1e293b' },
  historyCount: { background: '#e0f2fe', color: '#0369a1', fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20 },

  emptyState: { textAlign: 'center', padding: '48px 0', color: '#94a3b8' },
  emptyTitle: { fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 6 },
  emptySub: { fontSize: 13 },

  historyTableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 580 },
  th: { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, borderBottom: '2px solid #e2e8f0', background: '#f8fafc', textTransform: 'uppercase' },
  td: { padding: '12px 14px', fontSize: 14, color: '#475569', borderBottom: '1px solid #f1f5f9' },
  pctPill: { padding: '3px 9px', borderRadius: 6, fontWeight: 700, fontSize: 12 },
  rankBadge: { display: 'inline-block', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 800, fontSize: 12, padding: '3px 10px', borderRadius: 20, letterSpacing: 0.5 },
};
