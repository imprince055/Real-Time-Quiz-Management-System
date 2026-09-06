import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentRegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', rollNumber: '', section: '', course: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/student/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Registration failed');
      navigate('/student/login');
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <button onClick={() => navigate('/')} style={S.back}>← Back</button>
        <div style={S.logo}>👨‍🎓</div>
        <h1 style={S.title}>Student Register</h1>
        <p style={S.sub}>Create your student account</p>
        {error && <div style={S.errorBox}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label style={S.label}>Full Name *</label>
          <input style={S.input} placeholder="Prince Kumar" value={form.displayName} onChange={e => update('displayName', e.target.value)} required />
          <label style={S.label}>Email *</label>
          <input style={S.input} type="email" placeholder="student@example.com" value={form.email} onChange={e => update('email', e.target.value)} required />
          <label style={S.label}>Password *</label>
          <input style={S.input} type="password" placeholder="••••••••" value={form.password} onChange={e => update('password', e.target.value)} required />
          <label style={S.label}>Roll Number</label>
          <input style={S.input} placeholder="e.g. 2201234" value={form.rollNumber} onChange={e => update('rollNumber', e.target.value)} />
          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Section</label>
              <input style={S.input} placeholder="e.g. A" value={form.section} onChange={e => update('section', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Course</label>
              <input style={S.input} placeholder="e.g. BCA" value={form.course} onChange={e => update('course', e.target.value)} />
            </div>
          </div>
          <button style={S.btn} type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
        </form>
        <p style={S.footNote}>Already have an account? <Link to="/student/login" style={S.link}>Sign In</Link></p>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)', padding: 20 },
  card: { background: '#fff', borderRadius: 20, padding: '36px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  back: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, marginBottom: 12, padding: 0 },
  logo: { fontSize: 44, textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 800, color: '#1e293b', textAlign: 'center', marginBottom: 6 },
  sub: { color: '#94a3b8', textAlign: 'center', marginBottom: 20, fontSize: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5, marginTop: 2 },
  input: { display: 'block', width: '100%', padding: '11px 13px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 14, marginBottom: 12, outline: 'none', color: '#1e293b', background: '#f8fafc' },
  row: { display: 'flex', gap: 12 },
  btn: { width: '100%', padding: '13px', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 },
  footNote: { textAlign: 'center', marginTop: 14, fontSize: 13, color: '#94a3b8' },
  link: { color: '#3b82f6', fontWeight: 600, textDecoration: 'none' },
};
