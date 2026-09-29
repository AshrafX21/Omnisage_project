/**
 * AuthPage.jsx
 *
 * Full-screen login / create-account page shown whenever the user is not
 * authenticated. Toggles between "Sign In" and "Create Account" modes.
 */

import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, Loader2 } from 'lucide-react';

function OmnisageMark({ size = 20 }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="7.5" stroke="white" strokeWidth="2" strokeOpacity="0.95" />
      <polyline
        points="2.5,10 5,10 6.5,7 8,13 9.5,8.5 11,10 13,10 17.5,10"
        stroke="white" strokeWidth="1.6" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
import { apiService } from '../services/apiService';

export default function AuthPage({ onAuthSuccess }) {
  const [mode, setMode]         = useState('login');   // 'login' | 'register'
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const isLogin = mode === 'login';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin && fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const data = isLogin
        ? await apiService.login(email, password)
        : await apiService.register(fullName, email, password);
      onAuthSuccess(data.user);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        (isLogin ? 'Invalid email or password.' : 'Could not create account. Try a different email.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: '#080c14',
      backgroundImage: `
        radial-gradient(ellipse at 15% 10%,  hsla(215,90%,14%,0.60) 0px, transparent 52%),
        radial-gradient(ellipse at 85% 90%,  hsla(260,80%,12%,0.45) 0px, transparent 52%)
      `,
    }}>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(13,19,34,0.80)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '20px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)',
        padding: '36px 32px 32px',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <div style={{
            width: '40px', height: '40px',
            background: 'linear-gradient(135deg, hsl(215,90%,45%), hsl(175,75%,38%))',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(16,160,130,0.30)',
            flexShrink: 0,
          }}>
            <OmnisageMark size={20} />
          </div>
          <div>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: '17px', fontWeight: 700, color: 'white', margin: 0, letterSpacing: '-0.02em' }}>Omnisage</p>
            <p style={{ fontSize: '10px', color: 'hsl(175,70%,48%)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Medical Ledger</p>
          </div>
        </div>

        {/* Heading */}
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '22px', fontWeight: 800, color: 'white', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px' }}>
          {isLogin
            ? 'Sign in to access your medical records.'
            : 'Start managing your health records securely.'}
        </p>

        {/* Mode toggle */}
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          padding: '4px',
          marginBottom: '24px',
        }}>
          {['login', 'register'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'all 0.2s',
                background: mode === m ? 'rgba(59,130,246,0.20)' : 'transparent',
                color: mode === m ? 'hsl(215,90%,65%)' : '#475569',
                boxShadow: mode === m ? 'inset 0 0 0 1px rgba(59,130,246,0.25)' : 'none',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Full Name (register only) */}
          {!isLogin && (
            <div>
              <label style={labelStyle}>Full Name</label>
              <div style={inputWrap}>
                <User style={inputIcon} />
                <input
                  type="text"
                  placeholder="Alex Mercer"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label style={labelStyle}>Email Address</label>
            <div style={inputWrap}>
              <Mail style={inputIcon} />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={labelStyle}>Password</label>
            <div style={inputWrap}>
              <Lock style={inputIcon} />
              <input
                type={showPw ? 'text' : 'password'}
                placeholder={isLogin ? '••••••••' : 'At least 6 characters'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ ...inputStyle, paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#475569', padding: '2px',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {showPw
                  ? <EyeOff style={{ width: '15px', height: '15px' }} />
                  : <Eye    style={{ width: '15px', height: '15px' }} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.22)',
              borderRadius: '10px', padding: '10px 14px',
              fontSize: '12px', color: '#f87171',
            }}>
              <AlertCircle style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '13px',
              background: loading ? 'rgba(59,130,246,0.50)' : 'hsl(215,90%,50%)',
              color: 'white',
              border: 'none', borderRadius: '12px',
              fontSize: '13px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              letterSpacing: '0.01em',
            }}
          >
            {loading
              ? <><Loader2 style={{ width: '15px', height: '15px', animation: 'spin 0.75s linear infinite' }} /> {isLogin ? 'Signing in…' : 'Creating account…'}</>
              : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Footer hint */}
        <p style={{ fontSize: '11px', color: '#334155', textAlign: 'center', marginTop: '20px', lineHeight: 1.6 }}>
          {isLogin
            ? <>No account?{' '}
                <button type="button" onClick={() => { setMode('register'); setError(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(215,90%,60%)', fontSize: '11px', fontWeight: 600, padding: 0 }}>
                  Create one
                </button>
              </>
            : <>Already have an account?{' '}
                <button type="button" onClick={() => { setMode('login'); setError(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(215,90%,60%)', fontSize: '11px', fontWeight: 600, padding: 0 }}>
                  Sign in
                </button>
              </>}
        </p>

        {/* Demo hint */}
        {isLogin && (
          <div style={{
            marginTop: '16px',
            padding: '10px 14px',
            background: 'rgba(52,211,153,0.05)',
            border: '1px solid rgba(52,211,153,0.12)',
            borderRadius: '10px',
            fontSize: '11px', color: '#475569', textAlign: 'center', lineHeight: 1.7,
          }}>
            <span style={{ color: '#34d399', fontWeight: 600 }}>Demo account</span><br />
            patient@omnisage.com &nbsp;/&nbsp; omnisage123
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared micro-styles ──────────────────────────────────────────────── */

const labelStyle = {
  display: 'block',
  fontSize: '11px', fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: '6px',
};

const inputWrap = {
  position: 'relative',
  display: 'flex', alignItems: 'center',
};

const inputIcon = {
  position: 'absolute', left: '13px',
  width: '15px', height: '15px',
  color: '#475569', pointerEvents: 'none',
};

const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  padding: '11px 14px 11px 38px',
  fontSize: '13px', color: 'white',
  outline: 'none',
  fontFamily: "'Inter', sans-serif",
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
};
