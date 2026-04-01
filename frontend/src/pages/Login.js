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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/sales');
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
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)',
          color: 'white'
        }}
      >
        <div>
          <h1 className="display-lg mb-4">CRM Hub</h1>
          <p className="body-md opacity-90">The modern platform for sales and recruitment teams</p>
        </div>
        <div className="space-y-8">
          <div className="animate-slideIn" style={{ animationDelay: '0.1s' }}>
            <p className="headline-sm mb-2">Sales CRM</p>
            <p className="body-md opacity-80">Manage leads, track follow-ups, and close deals faster</p>
          </div>
          <div className="animate-slideIn" style={{ animationDelay: '0.2s' }}>
            <p className="headline-sm mb-2">Recruitment ATS</p>
            <p className="body-md opacity-80">Streamline hiring with a powerful candidate pipeline</p>
          </div>
        </div>
        <p className="label-sm opacity-60">Built for modern teams</p>
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
