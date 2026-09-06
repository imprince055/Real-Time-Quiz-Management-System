import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function DashboardPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [hovered, setHovered] = useState(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('teacherToken');

useEffect(() => {
  fetch(`${API_URL}/api/quizzes`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(setQuizzes)
    .catch(() => setError('Failed to load quizzes'));

  fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(setProfile)
    .catch(() => {});
}, [token]);

  async function startSession(quizId) {
    const res = await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quizId }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error, true);
    navigate(`/room/${data.session.roomCode}`);
  }

  async function viewResults(quizId) {
    const res = await fetch(`${API_URL}/api/sessions/quiz/${quizId}/all`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.length) return showToast('No completed sessions yet');
    navigate(`/results/${data[0].roomCode}`);
  }

  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(''), 3000);
  }

  function logout() { localStorage.removeItem('teacherToken'); navigate('/login'); }

  const totalQuestions = quizzes.reduce((a, q) => a + (q.questions?.length || 0), 0);

  return (
    <div style={S.page}>
      {toast && (
        <div style={{ ...S.toast, background: toast.isError ? '#ef4444' : '#10b981' }}>
          {toast.isError ? '⚠️' : '✅'} {toast.msg}
        </div>
      )}

      {/* Navbar */}
      <nav style={S.navbar}>
        <div style={S.navBrand}>
          <span style={S.brandEmoji}>🎓</span>
          <span style={S.brandName}>Quiz<b style={{ color: '#6366f1' }}>Portal</b></span>
        </div>
        <div style={S.navRight}>
        <button onClick={() => navigate('/')}style={S.back}>Home</button>
          <button
            style={S.createBtn}
            onClick={() => navigate('/quiz/create')}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            ＋ Create Quiz
          </button>
          <div style={{ position: 'relative' }}>
            <div style={S.avatarBtn} onClick={() => setShowProfile(p => !p)}>
              {profile?.photoUrl
                ? <img src={profile.photoUrl} referrerPolicy="no-referrer" alt="profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : (profile?.displayName || profile?.email || '?')[0].toUpperCase()
              }
            </div>
            {showProfile && (
              <div style={S.dropdown}>
                <div style={S.dropHeader}>
                  {profile?.photoUrl && (
                    <img src={profile.photoUrl} referrerPolicy="no-referrer" alt="profile"
                      style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', marginBottom: 10, border: '3px solid #e0e7ff' }} />
                  )}
                  <div style={S.dropName}>{profile?.displayName || profile?.email?.split('@')[0] || 'Teacher'}</div>
                  <div style={S.dropEmail}>{profile?.email}</div>
                  <div style={S.dropRole}>👨‍🏫 Teacher</div>
                </div>
                <div style={S.dropDivider} />
                <button onClick={logout} style={S.dropItem}>🚪 Logout</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero banner */}
      <div style={S.hero}>
        <div style={S.heroInner}>
          <div>
            <h1 style={S.heroTitle}>Welcome back{profile?.displayName ? `, ${profile.displayName.split(' ')[0]}` : ''}! 👋</h1>
            <p style={S.heroSub}>Manage your quizzes and launch live sessions</p>
          </div>
          <div style={S.heroStats}>
            <div style={S.statCard}>
              <span style={S.statNum}>{quizzes.length}</span>
              <span style={S.statLabel}>Quizzes</span>
            </div>
            <div style={{ ...S.statCard, background: 'rgba(255,255,255,0.18)' }}>
              <span style={S.statNum}>{totalQuestions}</span>
              <span style={S.statLabel}>Questions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={S.body}>
        <div style={S.sectionHeader}>
          <h2 style={S.sectionTitle}>My Quizzes</h2>
          <span style={S.quizCount}>{quizzes.length} total</span>
        </div>

        {error && <div style={S.errorBox}>⚠️ {error}</div>}

        {quizzes.length === 0 && (
          <div style={S.empty}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>📝</div>
            <p style={S.emptyTitle}>No quizzes yet</p>
            <p style={S.emptyText}>Create your first quiz and start engaging your students!</p>
            <button onClick={() => navigate('/quiz/create')} style={{ ...S.createBtn, marginTop: 24, padding: '14px 36px', fontSize: 16 }}>
              ＋ Create Quiz
            </button>
          </div>
        )}

        <div style={S.grid}>
          {quizzes.map((q, i) => (
            <div
              key={q._id}
              style={{ ...S.quizCard, ...(hovered === q._id ? S.quizCardHover : {}) }}
              onMouseEnter={() => setHovered(q._id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div style={{ ...S.quizIconBox, background: PALETTES[i % PALETTES.length].bg }}>
                <span style={{ fontSize: 26 }}>{PALETTES[i % PALETTES.length].icon}</span>
              </div>

              <div style={S.quizInfo}>
                <div style={S.quizTitle}>{q.title}</div>
                <div style={S.quizMeta}>
                  <span style={S.metaBadge}>❓ {q.questions?.length || 0} questions</span>
                </div>
              </div>

              <div style={S.btnGroup}>
                <button
                  onClick={() => viewResults(q._id)}
                  style={S.resultsBtn}
                  onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f0f4ff'; }}
                >
                  📊 Results
                </button>
                <button
                  onClick={() => startSession(q._id)}
                  style={S.startBtn}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.3)'; }}
                >
                  ▶ Start
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PALETTES = [
  { bg: '#ede9fe', icon: '🧠' },
  { bg: '#dbeafe', icon: '🚀' },
  { bg: '#d1fae5', icon: '⚡' },
  { bg: '#fef3c7', icon: '🎯' },
  { bg: '#fce7f3', icon: '🌟' },
  { bg: '#cffafe', icon: '💡' },
];

const S = {
  page: {
    minHeight: '100vh',
    background: '#f8f7ff',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  toast: {
    position: 'fixed', top: 20, right: 20,
    color: '#fff', padding: '13px 20px', borderRadius: 12,
    fontWeight: 600, fontSize: 14, zIndex: 9999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
  },
  navbar: {
    background: '#fff',
    borderBottom: '1px solid #ede9fe',
    padding: '0 36px', height: 66,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 50,
    boxShadow: '0 2px 12px rgba(99,102,241,0.07)',
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandEmoji: { fontSize: 28 },
  brandName: { fontSize: 22, fontWeight: 700, color: '#1e1b4b', letterSpacing: '-0.3px' },
  navRight: { display: 'flex', alignItems: 'center', gap: 14 },
  createBtn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', border: 'none', borderRadius: 10,
    padding: '10px 22px', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', letterSpacing: '0.2px',
    boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  avatarBtn: {
    width: 40, height: 40, borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 16, cursor: 'pointer',
    border: '2px solid #e0e7ff', overflow: 'hidden', flexShrink: 0,
  },
  dropdown: {
    position: 'absolute', right: 0, top: 50,
    background: '#fff', borderRadius: 14,
    boxShadow: '0 12px 40px rgba(99,102,241,0.15)',
    border: '1px solid #ede9fe', minWidth: 230, zIndex: 100,
  },
  dropHeader: { padding: '18px 20px' },
  dropName: { fontWeight: 700, fontSize: 15, color: '#1e1b4b', marginBottom: 3 },
  dropEmail: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  dropRole: {
    fontSize: 12, background: '#ede9fe', color: '#6366f1',
    padding: '3px 10px', borderRadius: 6,
    display: 'inline-block', fontWeight: 600,
  },
  dropDivider: { height: 1, background: '#f1f5f9' },
  dropItem: {
    display: 'block', width: '100%', padding: '13px 20px',
    background: 'none', border: 'none', textAlign: 'left',
    fontSize: 14, color: '#ef4444', cursor: 'pointer', fontWeight: 600,
  },
  hero: {
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
    padding: '40px 36px',
  },
  heroInner: {
    maxWidth: 960, margin: '0 auto',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
  },
  heroTitle: {
    fontSize: 30, fontWeight: 800, color: '#fff',
    marginBottom: 6, letterSpacing: '-0.5px',
  },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.8)' },
  heroStats: { display: 'flex', gap: 14 },
  statCard: {
    background: 'rgba(255,255,255,0.22)',
    backdropFilter: 'blur(8px)',
    borderRadius: 14, padding: '14px 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    border: '1px solid rgba(255,255,255,0.25)',
    minWidth: 80,
  },
  statNum: { fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1 },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  body: { maxWidth: 960, margin: '0 auto', padding: '36px 24px' },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22,
  },
  sectionTitle: { fontSize: 22, fontWeight: 800, color: '#1e1b4b', margin: 0 },
  quizCount: {
    background: '#ede9fe', color: '#6366f1',
    fontSize: 13, fontWeight: 700,
    padding: '3px 12px', borderRadius: 20,
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fecaca',
    color: '#dc2626', borderRadius: 10,
    padding: '12px 16px', fontSize: 14, marginBottom: 20,
  },
  empty: { textAlign: 'center', padding: '80px 0' },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1e1b4b', marginBottom: 8 },
  emptyText: { color: '#94a3b8', fontSize: 15 },
  grid: { display: 'flex', flexDirection: 'column', gap: 14 },
  quizCard: {
    background: '#fff',
    borderRadius: 16, padding: '20px 24px',
    display: 'flex', alignItems: 'center', gap: 18,
    border: '1.5px solid #ede9fe',
    boxShadow: '0 2px 12px rgba(99,102,241,0.06)',
    transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
  },
  quizCardHover: {
    borderColor: '#a5b4fc',
    boxShadow: '0 8px 32px rgba(99,102,241,0.14)',
    transform: 'translateY(-2px)',
  },
  quizIconBox: {
    width: 52, height: 52, borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  quizInfo: { flex: 1, minWidth: 0 },
  quizTitle: {
    fontWeight: 700, fontSize: 17, color: '#1e1b4b',
    marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  quizMeta: { display: 'flex', gap: 8 },
  metaBadge: {
    fontSize: 12, color: '#6366f1',
    background: '#ede9fe', padding: '3px 10px',
    borderRadius: 6, fontWeight: 600,
  },
  btnGroup: { display: 'flex', gap: 10, flexShrink: 0 },
  resultsBtn: {
    background: '#f0f4ff', color: '#6366f1',
    border: '1.5px solid #c7d2fe',
    borderRadius: 9, padding: '9px 18px',
    fontWeight: 600, fontSize: 14, cursor: 'pointer',
    transition: 'background 0.15s',
  },
  startBtn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', border: 'none',
    borderRadius: 9, padding: '10px 24px',
    fontWeight: 700, fontSize: 14, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
};
