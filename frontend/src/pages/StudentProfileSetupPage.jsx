import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * StudentProfileSetupPage
 *
 * Shown after a student signs in with Google for the first time (or when the
 * backend detects their profile is incomplete — missing rollNumber, etc.).
 *
 * URL params provided by the backend redirect:
 *   setupToken  — short-lived JWT (role: student-setup, 15 min) used to
 *                 authenticate the /student/complete-profile API call.
 *   email       — Google-verified email (read-only, shown for confirmation)
 *   displayName — Google display name (pre-filled, editable)
 *   photoUrl    — Google profile photo URL (optional)
 *
 * On submit: POST /api/auth/student/complete-profile
 *   → returns { token, role: 'student' }
 *   → stores studentToken  (never stored as generic 'token')
 *   → navigates to /student/dashboard
 *
 * Security:
 *   - The setupToken is verified server-side. It cannot be forged.
 *   - Email is shown but NOT re-submitted; the server trusts only the token.
 *   - A teacher's token cannot reach this endpoint (role check in backend).
 */
export default function StudentProfileSetupPage() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();

  const setupToken  = params.get('setupToken')  || '';
  const email       = params.get('email')       || '';
  const photoUrl    = params.get('photoUrl')    || '';

  const [form, setForm] = useState({
    displayName: params.get('displayName') || '',
    rollNumber:  '',
    section:     '',
    course:      '',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // If there is no setupToken in the URL, this page was opened directly — redirect
  useEffect(() => {
    if (!setupToken) navigate('/student/login', { replace: true });
  }, [setupToken, navigate]);

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.displayName.trim()) return setError('Please enter your name');
    setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/student/complete-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken,
          displayName: form.displayName.trim(),
          rollNumber:  form.rollNumber.trim(),
          section:     form.section.trim(),
          course:      form.course.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Profile setup failed');

      // Store as studentToken — never as generic 'token'
      localStorage.setItem('studentToken', data.token);
      navigate('/student/dashboard', { replace: true });
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page" style={{ background: 'linear-gradient(135deg,#06b6d4 0%,#6366f1 100%)' }}>
      <div className="auth-card" style={{ maxWidth: 480 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {photoUrl ? (
            <img src={photoUrl} referrerPolicy="no-referrer" alt="profile"
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
                       margin: '0 auto 10px', border: '3px solid #e0e7ff', display: 'block' }} />
          ) : (
            <div style={{ fontSize: 52, marginBottom: 8 }}>👨‍🎓</div>
          )}
          <h1 style={S.title}>Complete Your Profile</h1>
          <p style={S.sub}>Just a few more details to get you started</p>
        </div>

        {/* Google-verified info banner */}
        <div style={S.infoBanner}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#065f46' }}>Google account verified</div>
            <div style={{ fontSize: 12, color: '#047857', wordBreak: 'break-all' }}>{email}</div>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className="form-label">Full Name *</label>
          <input className="form-input"
            placeholder="Your name"
            value={form.displayName}
            onChange={e => update('displayName', e.target.value)}
            required style={{ marginBottom: 12 }} />

          {/* Email — read-only, provided by Google */}
          <label className="form-label">Email (from Google)</label>
          <input className="form-input" value={email} readOnly
            style={{ marginBottom: 12, background: '#f1f5f9', color: '#64748b', cursor: 'default' }} />

          <label className="form-label">Roll Number <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
          <input className="form-input"
            placeholder="e.g. 2201234"
            value={form.rollNumber}
            onChange={e => update('rollNumber', e.target.value)}
            style={{ marginBottom: 12 }} />

          {/* Section + Course — stack on mobile */}
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <label className="form-label">Section <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
              <input className="form-input"
                placeholder="e.g. A"
                value={form.section}
                onChange={e => update('section', e.target.value)}
                style={{ marginBottom: 12 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Course <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
              <input className="form-input"
                placeholder="e.g. BCA"
                value={form.course}
                onChange={e => update('course', e.target.value)}
                style={{ marginBottom: 12 }} />
            </div>
          </div>

          <button className="btn-primary" type="submit" disabled={loading}
            style={{ background: 'linear-gradient(135deg,#06b6d4,#6366f1)', marginTop: 4 }}>
            {loading ? 'Saving…' : '🎓 Complete Registration'}
          </button>
        </form>

        <p style={S.foot}>
          Wrong account?{' '}
          <button onClick={() => navigate('/student/login')} style={S.backLink}>
            Sign in differently
          </button>
        </p>
      </div>
    </div>
  );
}

const S = {
  title: {
    fontSize: 'clamp(19px,5vw,24px)', fontWeight: 800,
    color: '#1e293b', marginBottom: 4,
  },
  sub: { color: '#94a3b8', fontSize: 'clamp(12px,3vw,14px)', marginBottom: 0 },
  infoBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#ecfdf5', border: '1px solid #a7f3d0',
    borderRadius: 10, padding: '10px 14px', marginBottom: 16,
  },
  foot: {
    textAlign: 'center', marginTop: 16,
    fontSize: 'clamp(12px,3vw,13px)', color: '#94a3b8',
  },
  backLink: {
    background: 'none', border: 'none', color: '#6366f1',
    fontWeight: 600, fontSize: 'inherit', cursor: 'pointer',
    textDecoration: 'underline', padding: 0,
  },
};
