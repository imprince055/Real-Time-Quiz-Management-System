import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function JoinPage() {
  const { roomCode } = useParams();
  const [form, setForm] = useState({
    displayName: sessionStorage.getItem('displayName') || '',
    rollNumber: sessionStorage.getItem('rollNumber') || '',
    section: sessionStorage.getItem('section') || '',
    course: sessionStorage.getItem('course') || '',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function handleJoin(e) {
    e.preventDefault();
    if (!form.displayName.trim()) return setError('Please enter your name');
    sessionStorage.setItem('displayName', form.displayName.trim());
    sessionStorage.setItem('rollNumber', form.rollNumber.trim());
    sessionStorage.setItem('section', form.section.trim());
    sessionStorage.setItem('course', form.course.trim());
    navigate(`/student/${roomCode}`);
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.icon}>🎯</div>
        <h1 style={S.title}>Join Quiz</h1>
        <p style={S.sub}>Room <span style={S.code}>{roomCode}</span></p>
        {error && <div style={S.errorBox}>{error}</div>}
        <form onSubmit={handleJoin}>
          <label style={S.label}>Full Name *</label>
          <input style={S.input} placeholder="e.g. Prince Kumar" value={form.displayName} onChange={e => update('displayName', e.target.value)} required autoFocus />

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

          <button type="submit" style={S.btn}>Join Quiz →</button>
        </form>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20 },
  card: { background: '#fff', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 800, color: '#1e293b', textAlign: 'center', marginBottom: 6 },
  sub: { color: '#94a3b8', textAlign: 'center', marginBottom: 24, fontSize: 14 },
  code: { background: '#e0e7ff', color: '#4f46e5', padding: '2px 10px', borderRadius: 6, fontWeight: 700, fontFamily: 'monospace' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5, marginTop: 2 },
  input: { display: 'block', width: '100%', padding: '11px 13px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 14, marginBottom: 12, outline: 'none', color: '#1e293b', background: '#f8fafc' },
  row: { display: 'flex', gap: 12 },
  btn: { width: '100%', padding: '13px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 },
};
