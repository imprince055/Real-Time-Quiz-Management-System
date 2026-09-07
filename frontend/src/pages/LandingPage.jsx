import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  const [showHow, setShowHow] = useState(false);

  return (
    <div style={S.page}>

      {/* ── Top bar ── */}
      <div style={S.topBar}>
        <div style={S.logo}>
          <span style={S.logoIcon}>🎓</span>
          <span style={S.logoText}>QuizPortal</span>
        </div>
        <button onClick={() => navigate('/login')} style={S.getStartedBtn}>Get Started</button>
      </div>

      {/* ── Main content ── */}
      <div style={S.content}>
        <div style={S.capEmoji}>🎓</div>
        <h1 style={S.title}>Real-Time<br />Quiz Portal</h1>

        {/* Login cards — stack on mobile, side-by-side on tablet+ */}
        <div style={S.cards}>
          <div style={S.teacherCard}>
            <div style={S.cardIcon}>⊞</div>
            <div style={S.cardLabel}>Teachers</div>
            <button onClick={() => navigate('/login')} style={S.darkBtn}>Login</button>
          </div>
          <div style={S.studentCard}>
            <div style={{ ...S.cardIcon, color: '#a78bfa' }}>👤</div>
            <div style={{ ...S.cardLabel, color: '#fff' }}>Students</div>
            <button onClick={() => navigate('/student/login')} style={S.lightBtn}>Login</button>
          </div>
        </div>

        {/* How it works */}
        <div style={{ marginTop: 18 }}>
          <span onClick={() => setShowHow(s => !s)} style={S.howLink}>
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

      {/* ── Feature bar ── */}
      <div style={S.featureBar}>
        {['⚡ Live Results', '✨ Easy Creation', '📊 Analytics', '📱 Mobile Friendly', '🔒 Anti-Cheat'].map(f => (
          <span key={f} style={S.featureItem}>{f}</span>
        ))}
      </div>

      {/* ── Responsive styles injected via <style> tag ── */}
      <style>{`
        @media (max-width: 640px) {
          .landing-content  { width: 100% !important; align-items: center !important; padding: 0 16px 60px !important; }
          .landing-title    { font-size: clamp(44px,12vw,72px) !important; text-align: center !important; }
          .landing-cap      { text-align: center !important; }
          .landing-cards    { justify-content: center !important; }
          .landing-card     { max-width: 100% !important; flex: 1 1 140px !important; }
        }
        @media (min-width: 641px) and (max-width: 900px) {
          .landing-content  { width: 70% !important; }
        }
      `}</style>
    </div>
  );
}

const S = {
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
    overflow: 'hidden',
  },

  /* Top bar */
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'clamp(12px,3vw,20px) clamp(16px,4vw,36px)',
    position: 'relative',
    zIndex: 10,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoIcon: { fontSize: 26 },
  logoText: { fontWeight: 900, fontSize: 'clamp(16px,4vw,20px)', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  getStartedBtn: {
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(10px)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 25,
    padding: 'clamp(8px,2vw,10px) clamp(14px,3vw,22px)',
    fontWeight: 700,
    fontSize: 'clamp(12px,3vw,14px)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  /* Content overlay — right side on desktop, centered on mobile */
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: 'clamp(16px,4vw,40px) clamp(16px,4vw,36px) 60px',
    position: 'relative',
    zIndex: 10,
    width: 'clamp(260px, 50%, 520px)',
    marginLeft: 'auto',
  },

  capEmoji: {
    fontSize: 'clamp(48px,8vw,72px)',
    marginBottom: 4,
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
    textAlign: 'right',
    width: '100%',
  },

  title: {
    fontSize: 'clamp(40px,8vw,100px)',
    fontWeight: 900,
    color: '#fff',
    lineHeight: 1.0,
    marginBottom: 'clamp(20px,4vw,32px)',
    textAlign: 'right',
    textShadow: '0 4px 24px rgba(0,0,0,0.6)',
    letterSpacing: -2,
    width: '100%',
  },

  /* Cards */
  cards: {
    display: 'flex',
    gap: 'clamp(10px,2.5vw,20px)',
    width: '100%',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },

  teacherCard: {
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(16px)',
    borderRadius: 24,
    padding: 'clamp(20px,4vw,36px) clamp(18px,4vw,40px)',
    flex: '1 1 140px',
    maxWidth: 240,
    minWidth: 130,
    textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
  },
  studentCard: {
    background: 'rgba(80,60,140,0.55)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 24,
    padding: 'clamp(20px,4vw,36px) clamp(18px,4vw,40px)',
    flex: '1 1 140px',
    maxWidth: 240,
    minWidth: 130,
    textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
  },

  cardIcon: { fontSize: 'clamp(30px,6vw,44px)', marginBottom: 10, color: '#1e293b' },
  cardLabel: { fontSize: 'clamp(18px,4vw,28px)', fontWeight: 900, color: '#1e293b', marginBottom: 'clamp(12px,3vw,20px)' },

  darkBtn: {
    width: '100%',
    background: '#1e1e2e',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: 'clamp(10px,2.5vw,14px)',
    fontWeight: 700,
    fontSize: 'clamp(14px,3.5vw,17px)',
    cursor: 'pointer',
  },
  lightBtn: {
    width: '100%',
    background: '#fff',
    color: '#1e1e2e',
    border: 'none',
    borderRadius: 12,
    padding: 'clamp(10px,2.5vw,14px)',
    fontWeight: 700,
    fontSize: 'clamp(14px,3.5vw,17px)',
    cursor: 'pointer',
  },

  howLink: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 'clamp(12px,3vw,14px)',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  howBox: {
    display: 'flex',
    gap: 10,
    marginTop: 12,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(12px)',
    borderRadius: 16,
    padding: 'clamp(10px,3vw,16px) clamp(12px,3vw,20px)',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  howStep: { textAlign: 'center', width: 72, minWidth: 60 },
  howNum: {
    width: 26, height: 26, borderRadius: '50%',
    background: 'linear-gradient(135deg,#10b981,#06b6d4)',
    color: '#fff', fontWeight: 900, fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 5px',
  },
  howTitle: { fontSize: 10, color: '#fff', fontWeight: 700 },

  /* Feature bar */
  featureBar: {
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(10px)',
    padding: 'clamp(10px,2vw,14px) clamp(14px,3vw,48px)',
    display: 'flex',
    justifyContent: 'center',
    gap: 'clamp(10px,3vw,40px)',
    flexWrap: 'wrap',
    position: 'relative',
    zIndex: 10,
  },
  featureItem: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 600,
    fontSize: 'clamp(11px,2.5vw,13px)',
    whiteSpace: 'nowrap',
  },
};
