import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function ResultsPage() {
  const { roomCode } = useParams();
  const navigate     = useNavigate();
  const token        = localStorage.getItem('teacherToken');

  const [data,      setData]    = useState(null);
  const [lb,        setLb]      = useState([]);
  const [error,     setError]   = useState('');
  const [lbLoading, setLbLoad]  = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/sessions/${roomCode}/results`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Failed to load results'));
  }, [roomCode, token]);

  useEffect(() => {
    if (!data?.session?._id) return;
    setLbLoad(true);
    fetch(`${API_URL}/api/sessions/${data.session._id}/leaderboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setLb(d); })
      .catch(() => {})
      .finally(() => setLbLoad(false));
  }, [data, token]);

  if (error) return (
    <div style={S.page}>
      <div style={S.navbar}><button onClick={() => navigate('/dashboard')} style={S.back}>← Dashboard</button></div>
      <div style={S.center}><p style={{ color: '#dc2626' }}>{error}</p></div>
    </div>
  );
  if (!data) return (
    <div style={S.page}>
      <div style={S.navbar}><button onClick={() => navigate('/dashboard')} style={S.back}>← Dashboard</button></div>
      <div style={S.center}><p style={{ color: '#94a3b8' }}>Loading…</p></div>
    </div>
  );

  const { scores, quiz, session } = data;
  const rows  = lb.length > 0 ? lb : scores.map(s => ({
    displayName: s.displayName, correctAnswers: s.score,
    incorrectAnswers: s.total - s.score, totalQuestions: s.total,
    timeTaken: null, percentage: Math.round((s.score / s.total) * 100),
  }));

  const avg     = rows.length ? (rows.reduce((a, r) => a + (r.correctAnswers ?? 0), 0) / rows.length).toFixed(1) : 0;
  const highest = rows.length ? Math.max(...rows.map(r => r.correctAnswers ?? 0)) : 0;
  const total   = rows[0]?.totalQuestions ?? rows[0]?.total ?? 0;
  const pMap    = {}; (session.participants || []).forEach(p => { pMap[p.displayName] = p; });

  function exportCSV() {
    const csvRows = [['Rank','Name','Roll No','Section','Course','Correct','Wrong','Total','%','Time(s)']];
    rows.forEach((r, i) => {
      const p   = pMap[r.displayName] || {};
      const rank = r.rank ?? r.rankAtSubmission ?? i + 1;
      const pct  = r.percentage ?? Math.round(((r.correctAnswers ?? 0) / (total || 1)) * 100);
      csvRows.push([rank, r.displayName, p.rollNumber||'-', p.section||'-', p.course||'-',
        r.correctAnswers??0, r.incorrectAnswers??0, total, pct+'%', r.timeTaken??'—']);
    });
    const csv = csvRows.map(r => r.join(',')).join('\n');
    const a   = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `${quiz.title}-results.csv`; a.click();
  }

  return (
    <div style={S.page}>
      <div style={S.navbar}>
        <button onClick={() => navigate('/dashboard')} style={S.back}>← Dashboard</button>
        <span style={S.navTitle}>📊 {quiz.title}</span>
        <button onClick={exportCSV} style={S.exportBtn}>📥 Export</button>
      </div>

      <div style={S.body}>
        {/* Stats */}
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          {[
            { num: rows.length, label: 'Students' },
            { num: avg,         label: 'Avg Correct' },
            { num: `${highest}/${total}`, label: 'Highest' },
            { num: quiz.questions?.length || 0, label: 'Questions' },
          ].map(s => (
            <div key={s.label} style={S.statCard}>
              <div style={S.statNum}>{s.num}</div>
              <div style={S.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table — scrolls horizontally on mobile */}
        <div style={S.tableCard}>
          {lbLoading && lb.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>Loading leaderboard…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="lb-table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    {['Rank','Name','Roll No','Section','Course','Correct','Wrong','Time','%'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const p    = pMap[r.displayName] || {};
                    const rank = r.rank ?? r.rankAtSubmission ?? i + 1;
                    const correct = r.correctAnswers ?? r.score ?? 0;
                    const wrong   = r.incorrectAnswers ?? (total - correct);
                    const pct     = r.percentage ?? (total > 0 ? Math.round((correct / total) * 100) : 0);
                    return (
                      <tr key={r.displayName} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ fontWeight: 700 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</td>
                        <td style={{ fontWeight: 600 }}>{r.displayName}</td>
                        <td>{p.rollNumber || '—'}</td>
                        <td>{p.section    || '—'}</td>
                        <td>{p.course     || '—'}</td>
                        <td style={{ color: '#16a34a', fontWeight: 700 }}>{correct}</td>
                        <td style={{ color: '#dc2626' }}>{wrong}</td>
                        <td>{r.timeTaken != null ? `${r.timeTaken}s` : '—'}</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12,
                            background: pct >= 70 ? '#dcfce7' : pct >= 40 ? '#fef9c3' : '#fee2e2',
                            color:      pct >= 70 ? '#16a34a' : pct >= 40 ? '#92400e' : '#dc2626' }}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length === 0 && !lbLoading && (
            <p style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>No results yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  page:     { minHeight: '100vh', background: '#f0f4ff' },
  navbar:   { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 var(--page-px)', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', gap: 10 },
  back:     { background: 'none', border: 'none', color: '#4f46e5', fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  navTitle: { fontWeight: 800, fontSize: 'clamp(13px,3.5vw,17px)', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'center', padding: '0 8px' },
  exportBtn: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: 'clamp(7px,2vw,9px) clamp(10px,3vw,16px)', fontWeight: 600, fontSize: 'clamp(12px,3vw,14px)', cursor: 'pointer', whiteSpace: 'nowrap' },
  body:     { maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px,4vw,36px) var(--page-px)' },
  center:   { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' },
  statCard: { background: '#fff', borderRadius: 13, padding: 'clamp(14px,3vw,20px)', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  statNum:  { fontSize: 'clamp(22px,5vw,30px)', fontWeight: 800, color: '#4f46e5', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#94a3b8', fontWeight: 600 },
  tableCard: { background: '#fff', borderRadius: 13, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
};
