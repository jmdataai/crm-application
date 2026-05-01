import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import { Eye, EyeOff, ArrowRight } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const getRedirectPath = (userData) => {
    if (!userData?.role) return '/sales';
    if (userData.role === 'worker') return '/timesheet';
    if (userData.role === 'viewer') return '/timesheet/approvals';
    return '/sales';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await login(email, password);
      navigate(getRedirectPath(userData));
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--surface)' }}>
      {/* Left Panel - Branding */}
      <div 
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ 
          background: 'linear-gradient(160deg, #0C162A 0%, #141B34 60%, #1e2d52 100%)',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative rings */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', border: '1px solid rgba(68,104,176,0.15)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(68,104,176,0.2)', pointerEvents: 'none' }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '2rem' }}>
            <img src="/jm-logo.png" alt="JMData" style={{ width: 48, height: 48, borderRadius: '0.75rem', objectFit: 'cover' }} />
            <div>
              <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#92A0BA', fontFamily: 'var(--font-ui)' }}>JMData Talent</p>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#FAF7FB', fontFamily: 'var(--font-display)' }}>CRM Platform</p>
            </div>
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', color: '#FAF7FB', fontFamily: 'var(--font-display)', marginBottom: '1rem' }}>
            Precision hiring.<br />
            <span style={{ color: '#4468B0' }}>No guesswork.</span>
          </h1>
          <p style={{ color: '#92A0BA', fontSize: '1rem', lineHeight: 1.6, fontFamily: 'var(--font-display)' }}>The modern platform for sales and recruitment teams</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ padding: '1rem 1.25rem', borderRadius: '0.875rem', background: 'rgba(68,104,176,0.12)', border: '1px solid rgba(68,104,176,0.2)' }}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.9375rem', color: '#FAF7FB', fontFamily: 'var(--font-display)' }}>Sales CRM</p>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#92A0BA', fontFamily: 'var(--font-display)' }}>Manage leads, track follow-ups, and close deals faster</p>
          </div>
          <div style={{ padding: '1rem 1.25rem', borderRadius: '0.875rem', background: 'rgba(68,104,176,0.12)', border: '1px solid rgba(68,104,176,0.2)' }}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 700, fontSize: '0.9375rem', color: '#FAF7FB', fontFamily: 'var(--font-display)' }}>Recruitment ATS</p>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#92A0BA', fontFamily: 'var(--font-display)' }}>Streamline hiring with a powerful candidate pipeline</p>
          </div>
        </div>

        <p style={{ fontSize: '0.75rem', color: '#92A0BA', fontFamily: 'var(--font-ui)', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.6 }}>
          © 2026 JMData Talent. All rights reserved.
        </p>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fadeIn">
          <div className="text-center mb-8">
            <h2 className="headline-sm mb-2" style={{ color: 'var(--on-surface)' }}>Welcome back</h2>
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div 
                className="p-4 rounded-lg body-md"
                style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}
                data-testid="login-error"
              >
                {error}
              </div>
            )}

            <div>
              <label className="label-sm block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="Enter your email"
                required
                data-testid="login-email"
              />
            </div>

            <div>
              <label className="label-sm block mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-12"
                  placeholder="Enter your password"
                  required
                  data-testid="login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--on-surface-variant)' }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
              data-testid="login-submit"
            >
              {loading ? 'Signing in...' : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Don't have an account?{' '}
            <Link to="/register" className="font-medium" style={{ color: 'var(--primary)' }} data-testid="go-to-register">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
