import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentLoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Login failed');
      if (data.role !== 'student') return setError('This account is not a student account');
      localStorage.setItem('studentToken', data.token);
      navigate('/student/dashboard');
    } catch {
      setError('Network error');
    } finally { setLoading(false); }
  }

  return (
    <div style={S.page}>
      {/* Decorative floaters — scale down with clamp */}
      <div style={{ ...S.fl, top: '8%',    left: '6%',   fontSize: 'clamp(24px,8vw,64px)',  transform: 'rotate(-15deg)', color: '#f97316' }}>?</div>
      <div style={{ ...S.fl, top: '15%',   right: '8%',  fontSize: 'clamp(28px,10vw,80px)', transform: 'rotate(10deg)',  color: '#ec4899' }}>?</div>
      <div style={{ ...S.fl, top: '40%',   left: '3%',   fontSize: 'clamp(20px,7vw,56px)',  transform: 'rotate(5deg)',   color: '#a855f7' }}>?</div>
      <div style={{ ...S.fl, bottom: '20%',left: '10%',  fontSize: 'clamp(24px,8vw,72px)',  transform: 'rotate(-8deg)', color: '#22c55e' }}>✓</div>
      <div style={{ ...S.fl, bottom: '10%',right: '5%',  fontSize: 'clamp(20px,7vw,60px)',  transform: 'rotate(12deg)', color: '#f97316' }}>?</div>
      <div style={{ ...S.fl, top: '55%',   right: '4%',  fontSize: 'clamp(18px,6vw,50px)',  transform: 'rotate(-20deg)',color: '#22c55e' }}>✓</div>

      <div style={S.wrapper}>
        <div style={S.avatarWrap}><span style={S.avatar}>👨‍🎓</span></div>

        <div style={S.card}>
          <button onClick={() => navigate('/')} style={S.back}>← Back</button>
          <h1 style={S.title}>Welcome, Student! 📚</h1>
          <p style={S.sub}>Sign in to join amazing quizzes</p>

          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={S.inputWrap}>
              <input className="form-input" type="email" placeholder="Email"
                value={email} onChange={e => setEmail(e.target.value)} required
                style={S.glassInput} />
              <span style={S.icon}>✏️</span>
            </div>
            <div style={S.inputWrap}>
              <input className="form-input" type="password" placeholder="Password"
                value={password} onChange={e => setPassword(e.target.value)} required
                style={S.glassInput} />
              <span style={S.icon}>🔒</span>
            </div>

            <p style={S.orText}>— or —</p>

            <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Student Google Login */}
          <a href={`${API_URL}/api/auth/google/student`} style={S.googleBtn}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="G" />
            Continue with Google
          </a>

          <p style={S.foot}>Don't have an account? <Link to="/student/register" style={S.link}>Register</Link></p>
          <p style={S.foot}>Are you a teacher? <Link to="/login" style={S.link}>Teacher Login</Link></p>
        </div>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundImage: 'url(/login.jpg)',
    backgroundSize: 'cover', backgroundPosition: 'center',
    padding: 'clamp(12px,4vw,24px)',
    position: 'relative', overflow: 'hidden',
  },
  fl: {
    position: 'absolute', fontWeight: 900,
    textShadow: '0 4px 20px rgba(0,0,0,0.3)',
    userSelect: 'none', pointerEvents: 'none', zIndex: 0,
    filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.25))',
  },
  wrapper: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', zIndex: 1,
    width: '100%', maxWidth: 520,
  },
  avatarWrap: { zIndex: 2, marginBottom: -32, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))' },
  avatar: { fontSize: 'clamp(48px,12vw,72px)', lineHeight: 1 },
  card: {
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 24,
    padding: 'clamp(48px,10vw,68px) clamp(18px,6vw,48px) clamp(24px,6vw,44px)',
    width: '100%',
    border: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
  },
  back: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 13, marginBottom: 12, padding: 0, display: 'block' },
  title: { fontSize: 'clamp(20px,5vw,30px)', fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 6, textShadow: '0 2px 8px rgba(0,0,0,0.2)' },
  sub:   { color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 18, fontSize: 'clamp(13px,3.5vw,17px)' },
  inputWrap: { position: 'relative', marginBottom: 12 },
  glassInput: { background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.3)', paddingRight: 44, backdropFilter: 'blur(8px)' },
  icon:  { position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#64748b', pointerEvents: 'none' },
  orText: { textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '10px 0' },
  btn: {
    width: '100%', padding: 'clamp(12px,3vw,14px)',
    background: 'linear-gradient(135deg,#667eea,#a855f7)', color: '#fff',
    border: 'none', borderRadius: 12, fontSize: 'clamp(14px,4vw,17px)',
    fontWeight: 700, cursor: 'pointer', marginBottom: 10,
    boxShadow: '0 4px 20px rgba(102,126,234,0.45)', transition: 'opacity 0.2s',
  },
  googleBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: 'clamp(11px,3vw,13px)',
    border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12,
    fontSize: 'clamp(13px,3.5vw,15px)', fontWeight: 600,
    color: '#1e293b', background: 'rgba(255,255,255,0.82)',
    cursor: 'pointer', textDecoration: 'none',
    backdropFilter: 'blur(8px)', boxSizing: 'border-box', marginBottom: 4,
  },
  foot: { textAlign: 'center', marginTop: 10, fontSize: 'clamp(12px,3vw,14px)', color: 'rgba(255,255,255,0.8)' },
  link: { color: '#fff', fontWeight: 700, textDecoration: 'none' },
};
