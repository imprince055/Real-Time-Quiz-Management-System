import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentLoginPage from './pages/StudentLoginPage';
import StudentRegisterPage from './pages/StudentRegisterPage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import DashboardPage from './pages/DashboardPage';
import CreateQuizPage from './pages/CreateQuizPage';
import TeacherRoomPage from './pages/TeacherRoomPage';
import JoinPage from './pages/JoinPage';
import StudentRoomPage from './pages/StudentRoomPage';
import ResultsPage from './pages/ResultsPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

function TeacherRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

function StudentRoute({ children }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  return token && role === 'student' ? children : <Navigate to="/student/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Teacher */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<TeacherRoute><DashboardPage /></TeacherRoute>} />
      <Route path="/quiz/create" element={<TeacherRoute><CreateQuizPage /></TeacherRoute>} />
      <Route path="/room/:roomCode" element={<TeacherRoute><TeacherRoomPage /></TeacherRoute>} />
      <Route path="/results/:roomCode" element={<TeacherRoute><ResultsPage /></TeacherRoute>} />

      {/* Student */}
      <Route path="/student/login" element={<StudentLoginPage />} />
      <Route path="/student/register" element={<StudentRegisterPage />} />
      <Route path="/student/dashboard" element={<StudentRoute><StudentDashboardPage /></StudentRoute>} />

      {/* Shared */}
      <Route path="/join/:roomCode" element={<JoinPage />} />
      <Route path="/student/:roomCode" element={<StudentRoomPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
