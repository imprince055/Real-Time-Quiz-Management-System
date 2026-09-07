import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const PALETTES = [
  { bg: '#ede9fe', icon: '🧠' }, { bg: '#dbeafe', icon: '🚀' },
  { bg: '#d1fae5', icon: '⚡' }, { bg: '#fef3c7', icon: '🎯' },
  { bg: '#fce7f3', icon: '🌟' }, { bg: '#cffafe', icon: '💡' },
];

export default function DashboardPage() {
  const [quizzes, setQuizzes]       = useState([]);
  const [profile, setProfile]       = useState(null);
  const [error, setError]           = useState('');
  const [toast, setToast]           = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem('teacherToken');

  useEffect(() => {
    fetch(`${API_URL}/api/quizzes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setQuizzes).catch(() => setError('Failed to load quizzes'));
    fetch(`${API_URL}/api/auth/me`,  { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setProfile).catch(() => {});
  }, [token]);

  async function startSession(quizId) {
    const res  = await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quizId }),
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error, true);
    navigate(`/room/${data.session.roomCode}`);
  }

  async function viewResults(quizId) {
    const res  = await fetch(`${API_URL}/api/sessions/quiz/${quizId}/all`, { headers: { Authorization: `Bearer ${token}` } });
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
  const initials = (profile?.displayName || profile?.email || '?')[0].toUpperCase();

  return (
    <div style={S.page}>
      {toast && (
        <div style={{ ...S.toast, background: toast.isError ? '#ef4444' : '#10b981' }}>
          {toast.isError ? '⚠️' : '✅'} {toast.msg}
        </div>
      )}

      {/* ── Navbar ── */}
      <nav style={S.navbar}>
        <div style={S.navBrand}>
          <span style={{ fontSize: 26 }}>🎓</span>
          <span style={S.brandName}>Quiz<b style={{ color: '#6366f1' }}>Portal</b></span>
        </div>
        <div style={S.navRight}>
          <button onClick={() => navigate('/')} style={S.ghostBtn}>Home</button>
          <button style={S.createBtn} onClick={() => navigate('/quiz/create')}>＋ New Quiz</button>
          <div style={{ position: 'relative' }}>
            <div style={S.avatarBtn} onClick={() => setShowProfile(p => !p)}>
              {profile?.photoUrl
                ? <img src={profile.photoUrl} referrerPolicy="no-referrer" alt="profile"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : initials}
            </div>
            {showProfile && (
              <div style={S.dropdown}>
                <div style={S.dropHeader}>
                  {profile?.photoUrl && (
                    <img src={profile.photoUrl} referrerPolicy="no-referrer" alt="profile"
                      style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', marginBottom: 8, border: '3px solid #e0e7ff' }} />
                  )}
                  <div style={S.dropName}>{profile?.displayName || profile?.email?.split('@')[0] || 'Teacher'}</div>
                  <div style={S.dropEmail}>{profile?.email}</div>
                  <div style={S.dropRole}>👨‍🏫 Teacher</div>
                </div>
                <div style={{ height: 1, background: '#f1f5f9' }} />
                <button onClick={logout} style={S.dropItem}>🚪 Logout</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero banner ── */}
      <div style={S.hero}>
        <div className="hero-inner" style={{ padding: '0 var(--page-px)' }}>
          <div>
            <h1 style={S.heroTitle}>Welcome back{profile?.displayName ? `, ${profile.displayName.split(' ')[0]}` : ''}! 👋</h1>
            <p style={S.heroSub}>Manage your quizzes and launch live sessions</p>
          </div>
          <div className="stat-grid" style={{ minWidth: 0, flexShrink: 0 }}>
            {[
              { num: quizzes.length, label: 'Quizzes' },
              { num: totalQuestions, label: 'Questions' },
            ].map(s => (
              <div key={s.label} style={S.statCard}>
                <span style={S.statNum}>{s.num}</span>
                <span style={S.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={S.body}>
        <div style={S.sectionHeader}>
          <h2 style={S.sectionTitle}>My Quizzes</h2>
          <span style={S.quizCount}>{quizzes.length} total</span>
        </div>

        {error && <div style={S.errorBox}>⚠️ {error}</div>}

        {quizzes.length === 0 && (
          <div style={{ textAlign: 'center', padding: 'clamp(40px,10vw,80px) 0' }}>
            <div style={{ fontSize: 64, marginBottom: 14 }}>📝</div>
            <p style={{ fontWeight: 700, fontSize: 18, color: '#1e1b4b', marginBottom: 6 }}>No quizzes yet</p>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>Create your first quiz and start engaging students!</p>
            <button onClick={() => navigate('/quiz/create')} style={{ ...S.createBtn, marginTop: 20, padding: '13px 32px', fontSize: 15 }}>
              ＋ Create Quiz
            </button>
          </div>
        )}

        <div style={S.grid}>
          {quizzes.map((q, i) => (
            <div key={q._id} className="quiz-card">
              <div style={{ ...S.quizIconBox, background: PALETTES[i % PALETTES.length].bg, flexShrink: 0 }}>
                <span style={{ fontSize: 24 }}>{PALETTES[i % PALETTES.length].icon}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.quizTitle}>{q.title}</div>
                <span style={S.metaBadge}>❓ {q.questions?.length || 0} questions</span>
              </div>
              <div className="btn-group" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => viewResults(q._id)} style={S.resultsBtn}>📊 Results</button>
                <button onClick={() => startSession(q._id)} style={S.startBtn}>▶ Start</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const S = {
  page:    { minHeight: '100vh', background: '#f8f7ff', fontFamily: "'Inter','Segoe UI',sans-serif" },
  toast:   { position: 'fixed', top: 20, right: 20, color: '#fff', padding: '12px 18px', borderRadius: 12, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxWidth: 'calc(100vw - 40px)' },
  navbar:  { background: '#fff', borderBottom: '1px solid #ede9fe', padding: '0 var(--page-px)', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 12px rgba(99,102,241,0.07)', gap: 10 },
  navBrand: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  brandName: { fontSize: 'clamp(16px,4vw,22px)', fontWeight: 700, color: '#1e1b4b' },
  navRight:  { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  ghostBtn:  { background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  createBtn: { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px clamp(12px,3vw,20px)', fontWeight: 700, fontSize: 'clamp(12px,3vw,14px)', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', whiteSpace: 'nowrap' },
  avatarBtn: { width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#a78bfa)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, cursor: 'pointer', border: '2px solid #e0e7ff', overflow: 'hidden', flexShrink: 0 },
  dropdown:  { position: 'absolute', right: 0, top: 46, background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(99,102,241,0.15)', border: '1px solid #ede9fe', minWidth: 210, zIndex: 100 },
  dropHeader: { padding: '16px 18px' },
  dropName:   { fontWeight: 700, fontSize: 14, color: '#1e1b4b', marginBottom: 2 },
  dropEmail:  { fontSize: 11, color: '#94a3b8', marginBottom: 6, wordBreak: 'break-all' },
  dropRole:   { fontSize: 11, background: '#ede9fe', color: '#6366f1', padding: '2px 8px', borderRadius: 6, display: 'inline-block', fontWeight: 600 },
  dropItem:   { display: 'block', width: '100%', padding: '12px 18px', background: 'none', border: 'none', textAlign: 'left', fontSize: 14, color: '#ef4444', cursor: 'pointer', fontWeight: 600 },
  hero:      { background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a78bfa 100%)', padding: 'clamp(24px,5vw,40px) 0' },
  heroTitle: { fontSize: 'clamp(20px,5vw,30px)', fontWeight: 800, color: '#fff', marginBottom: 4 },
  heroSub:   { fontSize: 'clamp(12px,3vw,15px)', color: 'rgba(255,255,255,0.8)' },
  statCard:  { background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: 'clamp(10px,2.5vw,14px) clamp(16px,4vw,24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid rgba(255,255,255,0.25)' },
  statNum:   { fontSize: 'clamp(20px,5vw,26px)', fontWeight: 800, color: '#fff', lineHeight: 1 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  body:      { maxWidth: 960, margin: '0 auto', padding: 'clamp(20px,4vw,36px) var(--page-px)' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
  sectionTitle:  { fontSize: 'clamp(16px,4vw,22px)', fontWeight: 800, color: '#1e1b4b', margin: 0 },
  quizCount:     { background: '#ede9fe', color: '#6366f1', fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 20 },
  errorBox:      { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 10, padding: '11px 14px', fontSize: 14, marginBottom: 16 },
  grid:      { display: 'flex', flexDirection: 'column', gap: 12 },
  quizIconBox: { width: 48, height: 48, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  quizTitle: { fontWeight: 700, fontSize: 'clamp(14px,3.5vw,16px)', color: '#1e1b4b', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  metaBadge: { fontSize: 12, color: '#6366f1', background: '#ede9fe', padding: '2px 9px', borderRadius: 6, fontWeight: 600 },
  resultsBtn: { background: '#f0f4ff', color: '#6366f1', border: '1.5px solid #c7d2fe', borderRadius: 8, padding: 'clamp(7px,2vw,9px) clamp(10px,2.5vw,16px)', fontWeight: 600, fontSize: 'clamp(12px,3vw,14px)', cursor: 'pointer', whiteSpace: 'nowrap' },
  startBtn:   { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: 'clamp(7px,2vw,9px) clamp(14px,3vw,22px)', fontWeight: 700, fontSize: 'clamp(12px,3vw,14px)', cursor: 'pointer', boxShadow: '0 3px 10px rgba(99,102,241,0.3)', whiteSpace: 'nowrap' },
};
