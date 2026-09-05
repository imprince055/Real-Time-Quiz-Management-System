import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const role = params.get('role') || 'teacher';
    const error = params.get('error');
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);
      navigate(role === 'student' ? '/student/dashboard' : '/dashboard', { replace: true });
    } else {
      navigate('/login?error=' + (error || 'unknown'), { replace: true });
    }
  }, [params, navigate]);

  return null;
}
