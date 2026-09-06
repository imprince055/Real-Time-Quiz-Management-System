import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function ResultsPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('teacherToken');

  const [data, setData]         = useState(null);
  const [leaderboard, setLb]    = useState([]);
  const [error, setError]       = useState('');
  const [lbLoading, setLbLoad]  = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/sessions/${roomCode}/results`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Failed to load results'));
  }, [roomCode, token]);

  useEffect(() => {
    if (!data?.session?._id) return;
    setLbLoad(true);
    fetch(`${API_URL}/api/sessions/${data.session._id}/leaderboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((lb) => { if (Array.isArray(lb)) setLb(lb); })
      .catch(() => {})
      .finally(() => setLbLoad(false));
  }, [data, token]);

  if (error) return (
    <div style={S.page}>
      <div style={S.navbar}>
        <button onClick={() => navigate('/dashboard')} style={S.back}>← Dashboard</button>
      </div>
      <div style={S.center}><p style={{ color: '#dc2626' }}>{error}</p></div>
    </div>
  );

  if (!data) return (
    <div style={S.page}>
      <div style={S.navbar}>
        <button onClick={() => navigate('/dashboard')} style={S.back}>← Dashboard</button>
      </div>
      <div style={S.center}><p style={{ color: '#94a3b8' }}>Loading...</p></div>
    </div>
  );

  const { scores, quiz, session } = data;

  const rows = leaderboard.length > 0 ? leaderboard : scores.map((s) => ({
    displayName: s.displayName,
    correctAnswers: s.score,
    incorrectAnswers: (s.total - s.score),
    totalQuestions: s.total,
    timeTaken: null,
    rankAtSubmission: null,
    percentage: Math.round((s.score / s.total) * 100),
  }));

  const avg     = rows.length ? (rows.reduce((a, r) => a + (r.correctAnswers ?? r.score ?? 0), 0) / rows.length).toFixed(1) : 0;
  const highest = rows.length ? Math.max(...rows.map((r) => r.correctAnswers ?? r.score ?? 0)) : 0;
  const total   = rows[0]?.totalQuestions ?? rows[0]?.total ?? 0;

  const participantMap = {};
  (session.participants || []).forEach((p) => { participantMap[p.displayName] = p; });

  function exportCSV() {
    const csvRows = [['Rank', 'Name', 'Roll No', 'Section', 'Course', 'Correct', 'Incorrect', 'Total', '%', 'Time (s)']];
    rows.forEach((r, i) => {
      const p   = participantMap[r.displayName] || {};
      const rank = r.rank ?? r.rankAtSubmission ?? i + 1;
      const pct  = r.percentage ?? Math.round(((r.correctAnswers ?? 0) / (total || 1)) * 100);
      csvRows.push([rank, r.displayName, p.rollNumber || '-', p.section || '-', p.course || '-',
        r.correctAnswers ?? 0, r.incorrectAnswers ?? 0, total, pct + '%', r.timeTaken ?? '—']);
    });
    const csv = csvRows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${quiz.title}-results.csv`; a.click();
  }

  return (
    <div style={S.page}>
      <div style={S.navbar}>
        <button onClick={() => navigate('/dashboard')} style={S.back}>← Dashboard</button>
        <span style={S.navTitle}>📊 Results — {quiz.title}</span>
        <button onClick={exportCSV} style={S.exportBtn}>📥 Export CSV</button>
      </div>

      <div style={S.body}>
        {/* Stats row */}
        <div style={S.statsRow}>
          <div style={S.statCard}>
            <div style={S.statNum}>{rows.length}</div>
            <div style={S.statLabel}>Students</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statNum}>{avg}</div>
            <div style={S.statLabel}>Avg Correct</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statNum}>{highest}/{total}</div>
            <div style={S.statLabel}>Highest</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statNum}>{quiz.questions?.length || 0}</div>
            <div style={S.statLabel}>Questions</div>
          </div>
        </div>

        {/* Leaderboard table */}
        <div style={S.tableCard}>
          {lbLoading && leaderboard.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Loading leaderboard...</p>
          ) : (
            <table style={S.table}>
              <thead>
                <tr style={S.thead}>
                  <th style={S.th}>Rank</th>
                  <th style={S.th}>Name</th>
                  <th style={S.th}>Roll No</th>
                  <th style={S.th}>Section</th>
                  <th style={S.th}>Course</th>
                  <th style={S.th}>Correct</th>
                  <th style={S.th}>Wrong</th>
                  <th style={S.th}>Time</th>
                  <th style={S.th}>%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const p       = participantMap[r.displayName] || {};
                  const rank    = r.rank ?? r.rankAtSubmission ?? i + 1;
                  const correct = r.correctAnswers ?? r.score ?? 0;
                  const wrong   = r.incorrectAnswers ?? (total - correct);
                  const pct     = r.percentage ?? (total > 0 ? Math.round((correct / total) * 100) : 0);
                  return (
                    <tr key={r.displayName} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={S.td}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{r.displayName}</td>
                      <td style={S.td}>{p.rollNumber || '—'}</td>
                      <td style={S.td}>{p.section || '—'}</td>
                      <td style={S.td}>{p.course || '—'}</td>
                      <td style={{ ...S.td, color: '#16a34a', fontWeight: 700 }}>{correct}</td>
                      <td style={{ ...S.td, color: '#dc2626' }}>{wrong}</td>
                      <td style={S.td}>{r.timeTaken != null ? `${r.timeTaken}s` : '—'}</td>
                      <td style={S.td}>
                        <span style={{
                          ...S.pctBadge,
                          background: pct >= 70 ? '#dcfce7' : pct >= 40 ? '#fef9c3' : '#fee2e2',
                          color:      pct >= 70 ? '#16a34a' : pct >= 40 ? '#92400e' : '#dc2626',
                        }}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {rows.length === 0 && !lbLoading && (
            <p style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No results yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#f0f4ff' },
  navbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  back: { background: 'none', border: 'none', color: '#4f46e5', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  navTitle: { fontWeight: 800, fontSize: 17, color: '#1e293b' },
  exportBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  body: { maxWidth: 1100, margin: '0 auto', padding: '36px 24px' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 },
  statCard: { background: '#fff', borderRadius: 14, padding: '20px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  statNum: { fontSize: 32, fontWeight: 800, color: '#4f46e5', marginBottom: 4 },
  statLabel: { fontSize: 13, color: '#94a3b8', fontWeight: 600 },
  tableCard: { background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8fafc' },
  th: { padding: '13px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' },
  td: { padding: '13px 16px', fontSize: 14, color: '#1e293b', borderBottom: '1px solid #f1f5f9' },
  pctBadge: { padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13 },
};
