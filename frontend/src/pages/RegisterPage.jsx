import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
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
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>🎓</div>
        <h1 style={S.title}>Create Account</h1>
        <p style={S.sub}>Register as a teacher</p>
        {error && <div style={S.errorBox}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={S.label}>Email</label>
          <input style={S.input} type="email" placeholder="teacher@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          <button style={S.btn} type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
        </form>
        <div style={S.divider}><span style={S.dividerText}>or</span></div>
        <a href={`${API_URL}/api/auth/google`} style={S.googleBtn}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="G" style={{ marginRight: 10 }} />
          Sign up with Google
        </a>
        <p style={S.footNote}>Already have an account? <Link to="/login" style={S.link}>Sign In</Link></p>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20 },
  card: { background: '#fff', borderRadius: 20, padding: '48px 40px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: 800, color: '#1e293b', textAlign: 'center', marginBottom: 6 },
  sub: { color: '#94a3b8', textAlign: 'center', marginBottom: 28, fontSize: 14 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 },
  input: { display: 'block', width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 15, marginBottom: 18, outline: 'none', color: '#1e293b', background: '#f8fafc' },
  btn: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  footNote: { textAlign: 'center', marginTop: 20, fontSize: 13, color: '#94a3b8' },
  link: { color: '#667eea', fontWeight: 600, textDecoration: 'none' },
  divider: { display: 'flex', alignItems: 'center', margin: '20px 0', gap: 12 },
  dividerText: { color: '#cbd5e1', fontSize: 13, background: '#fff', padding: '0 8px' },
  googleBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 15, fontWeight: 600, color: '#1e293b', background: '#fff', cursor: 'pointer', textDecoration: 'none', marginBottom: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
};
