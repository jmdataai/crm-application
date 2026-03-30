import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { formatApiError } from '../services/api';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('sales_rep');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(name, email, password, role);
      navigate('/sales');
    } catch (err) {
      setError(formatApiError(err));
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
          background: 'linear-gradient(135deg, var(--tertiary) 0%, var(--tertiary-container) 100%)',
          color: 'white'
        }}
      >
        <div>
          <h1 className="display-lg mb-4">Join CRM Hub</h1>
          <p className="body-md opacity-90">Start managing your sales and recruitment today</p>
        </div>
        <div className="space-y-8">
          <div className="animate-slideIn" style={{ animationDelay: '0.1s' }}>
            <p className="headline-sm mb-2">For Sales Teams</p>
            <p className="body-md opacity-80">Import leads, track activities, never miss a follow-up</p>
          </div>
          <div className="animate-slideIn" style={{ animationDelay: '0.2s' }}>
            <p className="headline-sm mb-2">For Recruiters</p>
            <p className="body-md opacity-80">Manage candidates through your hiring pipeline</p>
          </div>
        </div>
        <p className="label-sm opacity-60">Get started in minutes</p>
      </div>

      {/* Right Panel - Register Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fadeIn">
          <div className="text-center mb-8">
            <h2 className="headline-sm mb-2" style={{ color: 'var(--on-surface)' }}>Create account</h2>
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Get started with CRM Hub</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div 
                className="p-4 rounded-lg body-md"
                style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}
                data-testid="register-error"
              >
                {error}
              </div>
            )}

            <div>
              <label className="label-sm block mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="Enter your full name"
                required
                data-testid="register-name"
              />
            </div>

            <div>
              <label className="label-sm block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="Enter your email"
                required
                data-testid="register-email"
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
                  placeholder="Create a password"
                  required
                  minLength={6}
                  data-testid="register-password"
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

            <div>
              <label className="label-sm block mb-2">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input-field"
                data-testid="register-role"
              >
                <option value="sales_rep">Sales Representative</option>
                <option value="recruiter">Recruiter</option>
                <option value="manager">Manager</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
              data-testid="register-submit"
            >
              {loading ? 'Creating account...' : (
                <>
                  Create Account
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-medium" style={{ color: 'var(--primary)' }} data-testid="go-to-login">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
