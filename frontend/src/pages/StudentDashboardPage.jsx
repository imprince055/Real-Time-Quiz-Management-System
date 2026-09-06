import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function StudentDashboardPage() {
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) { navigate('/student/login'); return; }
    fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.error || data.role !== 'student') { navigate('/student/login'); return; }
        setProfile(data);
        // Pre-fill sessionStorage for join page
        sessionStorage.setItem('displayName', data.displayName);
        sessionStorage.setItem('rollNumber', data.rollNumber || '');
        sessionStorage.setItem('section', data.section || '');
        sessionStorage.setItem('course', data.course || '');
      });
  }, [token, navigate]);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/student/login');
  }

  if (!profile) return (
    <div style={S.page}>
      <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>Loading...</div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.navbar}>
        <span style={S.navBrand}>👨‍🎓 Student Portal</span>
        <button onClick={() => navigate('/')}style={S.back}>Home</button>
        <button onClick={logout} style={S.logoutBtn}>Logout</button>
      </div>
      <div style={S.body}>
        {/* Profile card */}
        <div style={S.profileCard}>
          <div style={S.avatar}>{profile.displayName[0].toUpperCase()}</div>
          <div>
            <div style={S.profileName}>{profile.displayName}</div>
            <div style={S.profileMeta}>
              {profile.rollNumber && <span style={S.tag}>🎫 {profile.rollNumber}</span>}
              {profile.section && <span style={S.tag}>📚 Section {profile.section}</span>}
              {profile.course && <span style={S.tag}>🎓 {profile.course}</span>}
              <span style={S.tag}>✉️ {profile.email}</span>
            </div>
          </div>
        </div>

        {/* Join a quiz */}
        <div style={S.joinCard}>
          <div style={S.joinIcon}>🔗</div>
          <div>
            <div style={S.joinTitle}>Join a Quiz</div>
            <div style={S.joinSub}>Ask your teacher for the quiz link or room code</div>
          </div>
          <JoinByCode navigate={navigate} />
        </div>
      </div>
    </div>
  );
}

function JoinByCode({ navigate }) {
  const [code, setCode] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: 130, outline: 'none' }}
        placeholder="Room code"
        value={code}
        onChange={e => setCode(e.target.value)}
      />
      <button
        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
        onClick={() => code.trim() && navigate(`/join/${code.trim()}`)}
      >
        Join
      </button>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#f0f9ff' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  navBrand: { fontWeight: 800, fontSize: 18, color: '#3b82f6' },
  logoutBtn: { background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  body: { maxWidth: 720, margin: '0 auto', padding: '36px 24px', display: 'flex', flexDirection: 'column', gap: 20 },
  profileCard: { background: '#fff', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  avatar: { width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, flexShrink: 0 },
  profileName: { fontWeight: 800, fontSize: 20, color: '#1e293b', marginBottom: 8 },
  profileMeta: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tag: { background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  joinCard: { background: '#fff', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', flexWrap: 'wrap' },
  joinIcon: { fontSize: 36 },
  joinTitle: { fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 4 },
  joinSub: { fontSize: 13, color: '#94a3b8' },
};
