import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Login failed');
      if (data.role !== 'student') return setError('This account is not a student account');
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', 'student');
      navigate('/student/dashboard');
    } catch {
      setError('Network error');
    } finally { setLoading(false); }
  }

  return (
    <div style={S.page}>
      {/* Decorative floating elements */}
      <div style={{ ...S.floater, top: '8%', left: '6%', fontSize: 64, transform: 'rotate(-15deg)', color: '#f97316' }}>?</div>
      <div style={{ ...S.floater, top: '15%', right: '8%', fontSize: 80, transform: 'rotate(10deg)', color: '#ec4899' }}>?</div>
      <div style={{ ...S.floater, top: '40%', left: '3%', fontSize: 56, transform: 'rotate(5deg)', color: '#a855f7' }}>?</div>
      <div style={{ ...S.floater, bottom: '20%', left: '10%', fontSize: 72, transform: 'rotate(-8deg)', color: '#22c55e' }}>✓</div>
      <div style={{ ...S.floater, bottom: '10%', right: '5%', fontSize: 60, transform: 'rotate(12deg)', color: '#f97316' }}>?</div>
      <div style={{ ...S.floater, top: '55%', right: '4%', fontSize: 50, transform: 'rotate(-20deg)', color: '#22c55e' }}>✓</div>
      <div style={{ ...S.floater, bottom: '35%', right: '12%', fontSize: 44, transform: 'rotate(8deg)', color: '#ec4899' }}>?</div>

      {/* Card wrapper with avatar above */}
      <div style={S.wrapper}>
        {/* Floating avatar above card */}
        <div style={S.avatarWrap}>
          <div style={S.avatar}>👨‍🎓</div>
        </div>

        <div style={S.card}>
          <button onClick={() => navigate('/')} style={S.back}>← Back</button>

          <h1 style={S.title}>Welcome, Student! 📚</h1>
          <p style={S.sub}>Sign in to join amazing quizzes</p>

          {error && <div style={S.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={S.inputWrap}>
              <input
                style={S.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <span style={S.inputIcon}>✏️</span>
            </div>

            <div style={S.inputWrap}>
              <input
                style={S.input}
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <span style={S.inputIcon}>??</span>
            </div>

            <div style={S.divider}><span style={S.dividerText}>or</span></div>

            <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={S.footNote}>
            Don't have an account? <Link to="/student/register" style={S.link}>Register</Link>
          </p>
          <p style={S.footNote}>
            Are you a teacher? <Link to="/login" style={S.link}>Teacher Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: 'url(/login.jpg)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  floater: {
    position: 'absolute',
    fontWeight: 900,
    textShadow: '0 4px 20px rgba(0,0,0,0.3)',
    userSelect: 'none',
    pointerEvents: 'none',
    zIndex: 0,
    filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.25))',
  },
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 560,
  },
  avatarWrap: {
    zIndex: 2,
    marginBottom: -36,
    filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))',
  },
  avatar: {
    fontSize: 72,
    lineHeight: 1,
  },
  card: {
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 24,
    padding: '72px 56px 52px',
    width: '100%',
    minHeight: 480,
    border: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
    position: 'relative',
    boxSizing: 'border-box',
  },
  back: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    fontSize: 13,
    marginBottom: 16,
    padding: 0,
    display: 'block',
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    textShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  sub: {
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 18,
  },
  inputWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '16px 52px 16px 18px',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 12,
    fontSize: 17,
    outline: 'none',
    color: '#1e293b',
    background: 'rgba(255,255,255,0.85)',
    boxSizing: 'border-box',
    backdropFilter: 'blur(8px)',
  },
  inputIcon: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 16,
    color: '#64748b',
    pointerEvents: 'none',
  },
  btn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #667eea, #a855f7)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
    marginBottom: 12,
    boxShadow: '0 4px 20px rgba(102,126,234,0.5)',
    transition: 'opacity 0.2s',
  },
  errorBox: {
    background: 'rgba(254,242,242,0.9)',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    marginBottom: 16,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '16px 0',
    gap: 12,
  },
  dividerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    width: '100%',
    textAlign: 'center',
  },
  footNote: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
  },
  link: {
    color: '#fff',
    fontWeight: 700,
    textDecoration: 'none',
  },
};
