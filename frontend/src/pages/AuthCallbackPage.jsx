import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * AuthCallbackPage
 *
 * Handles the redirect from ALL Google OAuth callbacks:
 *   Teacher:  /api/auth/google/callback
 *              → ?token=...&role=teacher  → stores teacherToken
 *   Student (complete profile):
 *              /api/auth/google/student/callback
 *              → ?token=...&role=student  → stores studentToken
 *   Student (incomplete profile): backend redirects to /student/profile-setup directly,
 *              so this page is NOT involved in that flow.
 *
 * Error cases handled:
 *   ?error=account_is_teacher  — student tried Google login but email is a teacher account
 *   ?error=account_is_student  — teacher tried Google login but email is a student account
 *   ?error=google_failed       — generic OAuth failure
 */
export default function AuthCallbackPage() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const role  = params.get('role') || 'teacher';
    const error = params.get('error');

    if (token) {
      if (role === 'student') {
        // Never overwrites teacherToken — stored under a separate key
        localStorage.setItem('studentToken', token);
        navigate('/student/dashboard', { replace: true });
      } else {
        // Never overwrites studentToken — stored under a separate key
        localStorage.setItem('teacherToken', token);
        navigate('/dashboard', { replace: true });
      }
      return;
    }

    // No token — redirect to the appropriate login page with the error code
    if (error === 'account_is_teacher') {
      navigate('/student/login?error=account_is_teacher', { replace: true });
    } else if (error === 'account_is_student') {
      navigate('/login?error=account_is_student', { replace: true });
    } else {
      // Fallback: go back to whichever login page makes sense
      navigate('/login?error=' + (error || 'unknown'), { replace: true });
    }
  }, [params, navigate]);

  return null;
}
