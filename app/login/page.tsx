'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [password, setPassword] = useState('');

  // Check if we're in signup mode
  useEffect(() => {
    setIsSignupMode(searchParams.get('mode') === 'signup');
  }, [searchParams]);

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    if (!email || !password) {
      setError('Email and password are required');
      setLoading(false);
      return;
    }

    try {
      const authAction = isSignupMode
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });

      const { error: authError } = await authAction;

      if (authError) {
        setError(authError.message);
      } else {
        setSuccess(true);
        setEmail('');
        setPassword('');
        if (!isSignupMode) {
          router.push('/');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/logos/polycopy-logo-primary.png"
            alt="Polycopy"
            width={202}
            height={48}
            className="h-12 w-auto mb-3"
            style={{ 
              imageRendering: '-webkit-optimize-contrast',
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden'
            }}
          />
          <p className="text-slate-600 text-center">Copy the best Polymarket traders</p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
          <h2 className="text-2xl font-bold text-[#0F0F0F] mb-2">
            {isSignupMode ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-slate-600 mb-6">
            {isSignupMode ? 'Start copying the best Polymarket traders' : 'Sign in to your account'}
          </p>

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-start gap-2">
                <span className="text-xl">✓</span>
                <div>
                  <p className="font-semibold text-green-800">Success!</p>
                  <p className="text-sm text-green-700">
                    {isSignupMode 
                      ? 'Your account is ready. You can sign in now.'
                      : 'You are signed in.'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start gap-2">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="font-semibold text-red-800">Error</p>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-800">
              💡 {isSignupMode 
                ? 'Create an account with your email and a password.'
                : 'Sign in with your email and password.'
              }
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handlePasswordAuth}>
            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-[#0F0F0F] mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading || success}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-[#FDB022] transition-all duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed text-[#0F0F0F]"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-[#0F0F0F] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                disabled={loading || success}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-[#FDB022] transition-all duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed text-[#0F0F0F]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full bg-[#FDB022] text-[#0F0F0F] font-bold py-3 px-4 rounded-xl hover:bg-[#F59E0B] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {isSignupMode ? 'Creating...' : 'Signing in...'}
                </span>
              ) : success ? (
                '✓ Success'
              ) : (
                isSignupMode ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Toggle between Sign Up and Log In */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              {isSignupMode ? (
                <>
                  Already have an account?{' '}
                  <Link href="/login" className="text-[#FDB022] hover:text-[#E69E1A] font-semibold">
                    Log in
                  </Link>
                </>
              ) : (
                <>
                  Don't have an account?{' '}
                  <Link href="/login?mode=signup" className="text-[#FDB022] hover:text-[#E69E1A] font-semibold">
                    Sign up
                  </Link>
                </>
              )}
            </p>
          </div>

          {/* Legal Disclaimer */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-center text-xs text-slate-600 leading-relaxed">
              By signing up, you agree to Polycopy's{' '}
              <Link href="/terms" className="text-[#FDB022] hover:text-[#E69E1A] font-medium underline">
                Terms of Service
              </Link>
              {' '}and{' '}
              <Link href="/privacy" className="text-[#FDB022] hover:text-[#E69E1A] font-medium underline">
                Privacy Policy
              </Link>
              . Trading involves risk and past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <img 
              src="/logos/polycopy-logo-primary.png"
              alt="Polycopy"
              width={202}
              height={48}
              className="h-12 w-auto mb-3"
              style={{ 
                imageRendering: '-webkit-optimize-contrast',
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden'
              }}
            />
            <p className="text-slate-600 text-center">Copy the best Polymarket traders</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
            <div className="animate-pulse">
              <div className="h-8 bg-slate-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2 mb-6"></div>
              <div className="h-12 bg-slate-200 rounded mb-6"></div>
              <div className="h-12 bg-slate-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
