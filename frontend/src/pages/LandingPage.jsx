import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  const [showHow, setShowHow] = useState(false);

  return (
    <div style={S.page}>

      {/* Top bar */}
      <div style={S.topBar}>
        <div style={S.logo}>
          <span style={S.logoIcon}>🎓</span>
          <span style={S.logoText}>QuizPortal</span>
        </div>
        <button onClick={() => navigate('/login')} style={S.getStartedBtn}>Get Started</button>
      </div>

      {/* Main content — right side overlay */}
      <div style={S.content}>
        {/* Graduation cap */}
        <div style={S.capEmoji}>🎓</div>

        {/* Title */}
        <h1 style={S.title}>Real-Time<br />Quiz Portal</h1>

        {/* Cards row */}
        <div style={S.cards}>
          {/* Teacher card */}
          <div style={S.teacherCard}>
            <div style={S.cardIcon}>⊞</div>
            <div style={S.cardLabel}>Teachers</div>
            <button onClick={() => navigate('/login')} style={S.darkBtn}>Login</button>
          </div>

          {/* Student card */}
          <div style={S.studentCard}>
            <div style={{ ...S.cardIcon, color: '#a78bfa' }}>👤</div>
            <div style={{ ...S.cardLabel, color: '#fff' }}>Students</div>
            <button onClick={() => navigate('/student/login')} style={S.lightBtn}>Login</button>
          </div>
        </div>

        {/* How it works toggle */}
        <div style={{ marginTop: 20 }}>
          <span
            onClick={() => setShowHow(s => !s)}
            style={S.howLink}
          >
            How it Works {showHow ? '▲' : '▼'}
          </span>
        </div>

        {showHow && (
          <div style={S.howBox}>
            {[
              { n: '1', icon: '📝', title: 'Create Quiz' },
              { n: '2', icon: '🔗', title: 'Share Link' },
              { n: '3', icon: '🚀', title: 'Live Session' },
              { n: '4', icon: '🏆', title: 'Results' },
            ].map(s => (
              <div key={s.n} style={S.howStep}>
                <div style={S.howNum}>{s.n}</div>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div style={S.howTitle}>{s.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feature bar at bottom */}
      <div style={S.featureBar}>
        {['⚡ Live Results', '✨ Easy Creation', '📊 Analytics', '📱 Mobile Friendly', '🔒 Anti-Cheat'].map(f => (
          <span key={f} style={S.featureItem}>{f}</span>
        ))}
      </div>
    </div>
  );
}

const S = {
  // Full page = hero.jpg as background
  page: {
    minHeight: '100vh',
    backgroundImage: 'url(/hero.jpg)',
    backgroundSize: 'cover',
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
    fontFamily: "'Inter', system-ui, sans-serif",
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },

  // Top bar
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 36px',
    position: 'relative',
    zIndex: 10,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoIcon: { fontSize: 26 },
  logoText: { fontWeight: 900, fontSize: 20, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  getStartedBtn: {
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(10px)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 25,
    padding: '10px 22px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },

  // Content overlay — right side
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: '0 4vw 60px 0',
    position: 'relative',
    zIndex: 10,
    width: '48%',
    marginLeft: 'auto',
  },

  capEmoji: { fontSize: 72, marginBottom: 4, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))', textAlign: 'right' },

  title: {
    fontSize: 'clamp(60px, 6.5vw, 100px)',
    fontWeight: 900,
    color: '#fff',
    lineHeight: 1.0,
    marginBottom: 32,
    textAlign: 'right',
    textShadow: '0 4px 24px rgba(0,0,0,0.6)',
    letterSpacing: -2,
  },

  // Cards
  cards: { display: 'flex', gap: 20, width: '100%', justifyContent: 'flex-end' },

  teacherCard: {
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(16px)',
    borderRadius: 24,
    padding: '36px 40px',
    flex: 1,
    maxWidth: 240,
    textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
  },
  studentCard: {
    background: 'rgba(80,60,140,0.55)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 24,
    padding: '36px 40px',
    flex: 1,
    maxWidth: 240,
    textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
  },

  cardIcon: { fontSize: 44, marginBottom: 12, color: '#1e293b' },
  cardLabel: { fontSize: 28, fontWeight: 900, color: '#1e293b', marginBottom: 20 },

  darkBtn: {
    width: '100%',
    background: '#1e1e2e',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px',
    fontWeight: 700,
    fontSize: 17,
    cursor: 'pointer',
  },
  lightBtn: {
    width: '100%',
    background: '#fff',
    color: '#1e1e2e',
    border: 'none',
    borderRadius: 12,
    padding: '14px',
    fontWeight: 700,
    fontSize: 17,
    cursor: 'pointer',
  },

  howLink: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  howBox: {
    display: 'flex',
    gap: 12,
    marginTop: 14,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(12px)',
    borderRadius: 16,
    padding: '16px 20px',
  },
  howStep: { textAlign: 'center', width: 80 },
  howNum: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'linear-gradient(135deg,#10b981,#06b6d4)',
    color: '#fff', fontWeight: 900, fontSize: 13,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 6px',
  },
  howTitle: { fontSize: 11, color: '#fff', fontWeight: 700 },

  // Feature bar
  featureBar: {
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(10px)',
    padding: '14px 48px',
    display: 'flex',
    justifyContent: 'center',
    gap: 40,
    flexWrap: 'wrap',
    position: 'relative',
    zIndex: 10,
  },
  featureItem: { color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 13 },
};
