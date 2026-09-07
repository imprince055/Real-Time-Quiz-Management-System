import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function JoinPage() {
  const { roomCode } = useParams();
  const [form, setForm] = useState({
    displayName: sessionStorage.getItem('displayName') || '',
    rollNumber:  sessionStorage.getItem('rollNumber')  || '',
    section:     sessionStorage.getItem('section')     || '',
    course:      sessionStorage.getItem('course')      || '',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function handleJoin(e) {
    e.preventDefault();
    if (!form.displayName.trim()) return setError('Please enter your name');
    sessionStorage.setItem('displayName', form.displayName.trim());
    sessionStorage.setItem('rollNumber',  form.rollNumber.trim());
    sessionStorage.setItem('section',     form.section.trim());
    sessionStorage.setItem('course',      form.course.trim());
    navigate(`/student/${roomCode}`);
  }

  return (
    <div className="auth-page" style={{ background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' }}>
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 44, textAlign: 'center', marginBottom: 10 }}>🎯</div>
        <h1 style={S.title}>Join Quiz</h1>
        <p style={S.sub}>
          Room <span style={S.code}>{roomCode}</span>
        </p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleJoin}>
          <label className="form-label">Full Name *</label>
          <input className="form-input" placeholder="e.g. Prince Kumar"
            value={form.displayName} onChange={e => update('displayName', e.target.value)}
            required autoFocus style={{ marginBottom: 12 }} />

          <label className="form-label">Roll Number</label>
          <input className="form-input" placeholder="e.g. 2201234"
            value={form.rollNumber} onChange={e => update('rollNumber', e.target.value)}
            style={{ marginBottom: 12 }} />

          {/* Section + Course stack on mobile */}
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

          <button className="btn-primary" type="submit"
            style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', marginTop: 4 }}>
            Join Quiz →
          </button>
        </form>
      </div>
    </div>
  );
}

const S = {
  title: { fontSize: 'clamp(20px,5vw,24px)', fontWeight: 800, color: '#1e293b', textAlign: 'center', marginBottom: 6 },
  sub:   { color: '#94a3b8', textAlign: 'center', marginBottom: 20, fontSize: 'clamp(12px,3vw,14px)' },
  code:  { background: '#e0e7ff', color: '#4f46e5', padding: '2px 9px', borderRadius: 6, fontWeight: 700, fontFamily: 'monospace' },
};
