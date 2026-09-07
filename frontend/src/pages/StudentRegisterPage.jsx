import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentRegisterPage() {
  const [form, setForm]     = useState({ email: '', password: '', displayName: '', rollNumber: '', section: '', course: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/student/register`, {
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
    <div className="auth-page" style={{ background: 'linear-gradient(135deg,#06b6d4 0%,#3b82f6 100%)' }}>
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <button onClick={() => navigate('/')} style={S.back}>← Back</button>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>👨‍🎓</div>
        <h1 style={S.title}>Student Register</h1>
        <p style={S.sub}>Create your student account</p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className="form-label">Full Name *</label>
          <input className="form-input" placeholder="Prince Kumar"
            value={form.displayName} onChange={e => update('displayName', e.target.value)}
            required style={{ marginBottom: 12 }} />

          <label className="form-label">Email *</label>
          <input className="form-input" type="email" placeholder="student@example.com"
            value={form.email} onChange={e => update('email', e.target.value)}
            required style={{ marginBottom: 12 }} />

          <label className="form-label">Password *</label>
          <input className="form-input" type="password" placeholder="••••••••"
            value={form.password} onChange={e => update('password', e.target.value)}
            required style={{ marginBottom: 12 }} />

          <label className="form-label">Roll Number</label>
          <input className="form-input" placeholder="e.g. 2201234"
            value={form.rollNumber} onChange={e => update('rollNumber', e.target.value)}
            style={{ marginBottom: 12 }} />

          {/* Section + Course — stack on mobile via .form-row */}
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <label className="form-label">Section</label>
              <input className="form-input" placeholder="e.g. A"
                value={form.section} onChange={e => update('section', e.target.value)}
                style={{ marginBottom: 12 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Course</label>
              <input className="form-input" placeholder="e.g. BCA"
                value={form.course} onChange={e => update('course', e.target.value)}
                style={{ marginBottom: 12 }} />
            </div>
          </div>

          <button className="btn-primary" type="submit" disabled={loading}
            style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)', marginTop: 4 }}>
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        </form>

        <p style={S.foot}>Already have an account? <Link to="/student/login" style={S.link}>Sign In</Link></p>
      </div>
    </div>
  );
}

const S = {
  back:  { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, marginBottom: 10, padding: 0 },
  title: { fontSize: 'clamp(20px,5vw,24px)', fontWeight: 800, color: '#1e293b', textAlign: 'center', marginBottom: 4 },
  sub:   { color: '#94a3b8', textAlign: 'center', marginBottom: 18, fontSize: 'clamp(12px,3vw,14px)' },
  foot:  { textAlign: 'center', marginTop: 14, fontSize: 'clamp(12px,3vw,13px)', color: '#94a3b8' },
  link:  { color: '#3b82f6', fontWeight: 600, textDecoration: 'none' },
};
