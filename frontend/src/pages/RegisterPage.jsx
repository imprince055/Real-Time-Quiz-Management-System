import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function RegisterPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Registration failed');
      navigate('/login');
    } catch {
      setError('Network error');
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-page" style={{ background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' }}>
      <div className="auth-card">
        <div style={{ fontSize: 44, textAlign: 'center', marginBottom: 14 }}>🎓</div>
        <h1 style={S.title}>Create Account</h1>
        <p style={S.sub}>Register as a teacher</p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className="form-label">Email</label>
          <input className="form-input" type="email" placeholder="teacher@example.com"
            value={email} onChange={e => setEmail(e.target.value)} required
            style={{ marginBottom: 14 }} />

          <label className="form-label">Password</label>
          <input className="form-input" type="password" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)} required
            style={{ marginBottom: 18 }} />

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        </form>

        <div style={S.divider}><span style={S.divText}>or</span></div>

        <a href={`${API_URL}/api/auth/google`} className="btn-google">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="G" />
          Sign up with Google
        </a>

        <p style={S.foot}>Already have an account? <Link to="/login" style={S.link}>Sign In</Link></p>
      </div>
    </div>
  );
}

const S = {
  title: { fontSize: 'clamp(20px,5vw,26px)', fontWeight: 800, color: '#1e293b', textAlign: 'center', marginBottom: 6 },
  sub:   { color: '#94a3b8', textAlign: 'center', marginBottom: 22, fontSize: 'clamp(12px,3vw,14px)' },
  divider: { display: 'flex', alignItems: 'center', margin: '18px 0' },
  divText: { width: '100%', textAlign: 'center', color: '#cbd5e1', fontSize: 13 },
  foot: { textAlign: 'center', marginTop: 18, fontSize: 'clamp(12px,3vw,13px)', color: '#94a3b8' },
  link: { color: '#667eea', fontWeight: 600, textDecoration: 'none' },
};
