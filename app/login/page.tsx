'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Navigation } from '@/components/polycopy/navigation';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSignupMode, setIsSignupMode] = useState(false);

  // Check if we're in signup mode
  useEffect(() => {
    setIsSignupMode(searchParams.get('mode') === 'signup');
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        },
      });

      if (signInError) {
        setError(signInError.message);
      } else {
        setSuccess(true);
        setEmail(''); // Clear email input after success
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        },
      });

      if (error) {
        setError(error.message);
      }
    } catch (err) {
      setError('Failed to sign in with Google. Please try again.');
    }
  };

  const isProduction = process.env.NODE_ENV === 'production';

  return (
    <>
      <Navigation user={null} />
      {isProduction && (
        <div className="bg-yellow-500 text-slate-900 px-4 py-3 text-center font-semibold border-b-2 border-yellow-600">
          <p>We are currently working on maintenance and will be available again shortly. We apologize for the inconvenience.</p>
        </div>
      )}
      <div className="min-h-[calc(100vh-64px)] bg-slate-50">
        {isSignupMode ? (
          // Signup Page - Split Screen Design
          <div className="min-h-[calc(100vh-64px)] flex flex-col-reverse lg:flex-row">
            {/* Left Side - Value Props */}
            <div className="lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 lg:p-12 flex flex-col justify-center text-white">
              <div className="max-w-xl mx-auto">
                <img 
                  src="/logos/polycopy-logo-white.png"
                  alt="Polycopy"
                  width={202}
                  height={48}
                  className="h-10 w-auto mb-8"
                  style={{ 
                    imageRendering: '-webkit-optimize-contrast',
                    WebkitBackfaceVisibility: 'hidden',
                    backfaceVisibility: 'hidden'
                  }}
                />
                
                <h1 className="text-3xl lg:text-4xl font-bold mb-4 leading-tight">
                  Copy the Best Polymarket Traders
                </h1>
                <p className="text-lg text-slate-300 mb-12">
                  Follow top performers and replicate their winning strategies automatically.
                </p>

                {/* Value Props */}
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-[#FDB022] rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Track Top Traders</h3>
                      <p className="text-slate-400">Monitor the performance of the best Polymarket traders in real-time.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-[#FDB022] rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Auto-Copy Trades</h3>
                      <p className="text-slate-400">Automatically replicate trades from your favorite traders with premium.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-[#FDB022] rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Detailed Analytics</h3>
                      <p className="text-slate-400">Access comprehensive performance metrics and trade history.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Signup Form */}
            <div className="lg:w-1/2 flex items-center justify-center p-6 py-8 lg:p-12 bg-white">
              <div className="w-full max-w-md">
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">Create your account</h2>
                  <p className="text-slate-600">Start copying top traders today</p>
                </div>

                {/* Success Message */}
                {success && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-start gap-2">
                      <span className="text-xl">✓</span>
                      <div>
                        <p className="font-semibold text-green-800">Check your email!</p>
                        <p className="text-sm text-green-700">
                          We've sent you a magic link to create your account. Click the link in your email to get started.
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

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="mb-6">
                    <label htmlFor="email" className="block text-sm font-medium text-slate-900 mb-2">
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
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-[#FDB022] transition-all duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || success}
                    className="w-full bg-[#FDB022] text-slate-900 font-bold py-3 px-4 rounded-xl hover:bg-[#F59E0B] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1"
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
                        Sending...
                      </span>
                    ) : success ? (
                      '✓ Email Sent'
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="mt-6 mb-6 flex items-center">
                  <div className="flex-1 border-t border-slate-300"></div>
                  <span className="px-4 text-sm text-slate-500 font-medium">or</span>
                  <div className="flex-1 border-t border-slate-300"></div>
                </div>

                {/* Google Sign In Button */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading || success}
                  className="w-full bg-white text-slate-700 font-semibold py-3 px-4 rounded-xl border-2 border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>

                {/* Toggle to Login */}
                <div className="mt-6 text-center">
                  <p className="text-sm text-slate-600">
                    Already have an account?{' '}
                    <Link href="/login" className="text-[#FDB022] hover:text-[#E69E1A] font-semibold">
                      Log in
                    </Link>
                  </p>
                </div>

                {/* Legal Disclaimer */}
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <p className="text-center text-xs text-slate-600 leading-relaxed">
                    By signing up, you agree to Polycopy's{' '}
                    <Link href="/terms" className="text-[#FDB022] hover:text-[#E69E1A] font-medium underline">
                      Terms of Service
                    </Link>
                    {' '}and{' '}
                    <Link href="/privacy" className="text-[#FDB022] hover:text-[#E69E1A] font-medium underline">
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Login Page - Original Centered Design
          <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-4">
            <div className="w-full max-w-md">
              {/* Logo/Header */}
              <div className="flex flex-col items-center mb-6">
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
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h2>
                <p className="text-slate-600 mb-6">Sign in to your account</p>

                {/* Success Message */}
                {success && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-start gap-2">
                      <span className="text-xl">✓</span>
                      <div>
                        <p className="font-semibold text-green-800">Check your email!</p>
                        <p className="text-sm text-green-700">
                          We've sent you a magic link to sign in. Click the link in your email to continue.
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
                    💡 We'll send you a magic link to sign in. No password needed!
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="mb-6">
                    <label htmlFor="email" className="block text-sm font-medium text-slate-900 mb-2">
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
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-[#FDB022] transition-all duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || success}
                    className="w-full bg-[#FDB022] text-slate-900 font-bold py-3 px-4 rounded-xl hover:bg-[#F59E0B] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md border-b-4 border-[#D97706] active:border-b-0 active:translate-y-1"
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
                        Sending...
                      </span>
                    ) : success ? (
                      '✓ Email Sent'
                    ) : (
                      '🔗 Send Magic Link'
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="mt-6 mb-6 flex items-center">
                  <div className="flex-1 border-t border-slate-300"></div>
                  <span className="px-4 text-sm text-slate-500 font-medium">or</span>
                  <div className="flex-1 border-t border-slate-300"></div>
                </div>

                {/* Google Sign In Button */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading || success}
                  className="w-full bg-white text-slate-700 font-semibold py-3 px-4 rounded-xl border-2 border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>

                {/* Toggle to Sign Up */}
                <div className="mt-6 text-center">
                  <p className="text-sm text-slate-600">
                    Don't have an account?{' '}
                    <Link href="/login?mode=signup" className="text-[#FDB022] hover:text-[#E69E1A] font-semibold">
                      Sign up
                    </Link>
                  </p>
                </div>

                {/* Legal Disclaimer */}
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-center text-xs text-slate-600 leading-relaxed">
                    Trading involves risk and past performance does not guarantee future results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <>
        <Navigation user={null} />
        <div className="min-h-[calc(100vh-64px)] bg-slate-50 flex items-center justify-center px-4 py-4">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-6">
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
      </>
    }>
      <LoginForm />
    </Suspense>
  );
}
