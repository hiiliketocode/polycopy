'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/polycopy-v2/logo';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSignupMode, setIsSignupMode] = useState(false);

  useEffect(() => {
    setIsSignupMode(searchParams.get('mode') === 'signup');

    const urlError = searchParams.get('error');
    if (urlError === 'link_expired') {
      setError('Your magic link has expired. This usually happens when the email takes too long to arrive. Please request a new one.');
    } else if (urlError === 'auth_failed') {
      setError('Authentication failed. Please try again.');
    } else if (urlError === 'auth_error') {
      setError('An authentication error occurred. Please try again.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

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
        setEmail('');
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

  return (
    <>
      {/* Minimal nav bar */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo variant="horizontal" size="sm" href="/v2/landing" />
          <div className="hidden items-center gap-3 md:flex">
            {!isSignupMode ? (
              <Link
                href="/v2/login?mode=signup"
                className="bg-poly-yellow px-5 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                START FREE
              </Link>
            ) : (
              <Link
                href="/v2/login"
                className="px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:text-poly-yellow"
              >
                SIGN IN
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="min-h-[calc(100vh-64px)] bg-poly-cream">
        {isSignupMode ? (
          /* ─── Signup: Split Screen ─── */
          <div className="min-h-[calc(100vh-64px)] flex flex-col-reverse lg:flex-row">
            {/* Left: Value Props */}
            <div className="lg:w-1/2 bg-poly-black p-6 lg:p-12 flex flex-col justify-center text-white">
              <div className="max-w-xl mx-auto">
                <Logo variant="horizontal" size="md" className="mb-8 brightness-0 invert" />

                <h1 className="font-sans text-3xl lg:text-4xl font-black uppercase tracking-tight mb-4 leading-tight">
                  Copy the Best Polymarket Traders
                </h1>
                <p className="font-body text-lg text-white/60 mb-12">
                  Follow top performers and replicate their winning strategies automatically.
                </p>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-poly-yellow flex items-center justify-center">
                      <svg className="w-6 h-6 text-poly-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-sans font-bold text-lg uppercase tracking-wide mb-1">Track Top Traders</h3>
                      <p className="font-body text-white/50">Monitor the performance of the best Polymarket traders in real-time.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-poly-yellow flex items-center justify-center">
                      <svg className="w-6 h-6 text-poly-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-sans font-bold text-lg uppercase tracking-wide mb-1">Auto-Copy Trades</h3>
                      <p className="font-body text-white/50">Automatically replicate trades from your favorite traders with premium.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-poly-yellow flex items-center justify-center">
                      <svg className="w-6 h-6 text-poly-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-sans font-bold text-lg uppercase tracking-wide mb-1">Detailed Analytics</h3>
                      <p className="font-body text-white/50">Access comprehensive performance metrics and trade history.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Signup Form */}
            <div className="lg:w-1/2 flex items-center justify-center p-6 py-8 lg:p-12 bg-poly-cream">
              <div className="w-full max-w-md">
                <div className="mb-8">
                  <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50 mb-2">
                    GET STARTED
                  </div>
                  <h2 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black mb-2">
                    Create your account
                  </h2>
                  <p className="font-body text-poly-black/60">Start copying top traders today</p>
                </div>

                {success && (
                  <div className="mb-6 p-4 bg-profit-green/10 border border-profit-green/30">
                    <div className="flex items-start gap-2">
                      <span className="font-sans text-sm font-bold uppercase text-profit-green">Check your email!</span>
                    </div>
                    <p className="text-sm font-body text-poly-black/70 mt-1">
                      We&apos;ve sent you a magic link to create your account. Click the link in your email to get started.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mb-6 p-4 bg-loss-red/10 border border-loss-red/30">
                    <p className="font-sans text-sm font-bold uppercase text-loss-red">Error</p>
                    <p className="text-sm font-body text-poly-black/70 mt-1">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-6">
                    <label htmlFor="email" className="block font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50 mb-2">
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
                      className="w-full px-4 py-3 border border-border bg-white font-body text-poly-black placeholder:text-poly-black/30 focus:outline-none focus:ring-2 focus:ring-poly-yellow focus:border-poly-yellow transition-all duration-200 disabled:bg-poly-cream disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || success}
                    className="w-full bg-poly-yellow text-poly-black font-sans font-bold uppercase tracking-widest py-3.5 px-4 text-sm hover:bg-poly-black hover:text-poly-yellow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending...
                      </span>
                    ) : success ? (
                      'EMAIL SENT'
                    ) : (
                      'CREATE ACCOUNT'
                    )}
                  </button>
                </form>

                <div className="mt-6 mb-6 flex items-center">
                  <div className="flex-1 border-t border-border"></div>
                  <span className="px-4 font-sans text-xs font-bold uppercase tracking-widest text-poly-black/40">or</span>
                  <div className="flex-1 border-t border-border"></div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading || success}
                  className="w-full bg-white text-poly-black font-sans font-bold uppercase tracking-widest py-3.5 px-4 text-sm border border-border hover:bg-poly-black/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>

                <div className="mt-6 text-center">
                  <p className="font-body text-sm text-poly-black/60">
                    Already have an account?{' '}
                    <Link href="/v2/login" className="text-poly-yellow hover:text-poly-yellow-hover font-sans font-bold uppercase text-xs tracking-widest">
                      Log in
                    </Link>
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-border">
                  <p className="text-center text-xs font-body text-poly-black/40 leading-relaxed">
                    By signing up, you agree to Polycopy&apos;s{' '}
                    <Link href="/terms" className="text-poly-yellow hover:text-poly-yellow-hover font-medium underline">
                      Terms of Service
                    </Link>
                    {' '}and{' '}
                    <Link href="/privacy" className="text-poly-yellow hover:text-poly-yellow-hover font-medium underline">
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── Login: Centered ─── */
          <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-4">
            <div className="w-full max-w-md">
              <div className="flex flex-col items-center mb-6">
                <Logo variant="horizontal" size="md" className="mb-3" />
                <p className="font-body text-poly-black/60 text-center">Copy the best Polymarket traders</p>
              </div>

              <div className="bg-white border border-border p-8">
                <div className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50 mb-2">
                  WELCOME BACK
                </div>
                <h2 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black mb-2">Sign In</h2>
                <p className="font-body text-poly-black/60 mb-6">Sign in to your account</p>

                {success && (
                  <div className="mb-6 p-4 bg-profit-green/10 border border-profit-green/30">
                    <div className="flex items-start gap-2">
                      <span className="font-sans text-sm font-bold uppercase text-profit-green">Check your email!</span>
                    </div>
                    <p className="text-sm font-body text-poly-black/70 mt-1">
                      We&apos;ve sent you a magic link to sign in. Click the link in your email to continue.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mb-6 p-4 bg-loss-red/10 border border-loss-red/30">
                    <p className="font-sans text-sm font-bold uppercase text-loss-red">Error</p>
                    <p className="text-sm font-body text-poly-black/70 mt-1">{error}</p>
                  </div>
                )}

                <div className="mb-6 p-4 bg-info-blue/10 border border-info-blue/30">
                  <p className="text-sm font-body text-poly-black/70">
                    We&apos;ll send you a magic link to sign in. No password needed!
                  </p>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="mb-6">
                    <label htmlFor="email" className="block font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50 mb-2">
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
                      className="w-full px-4 py-3 border border-border bg-white font-body text-poly-black placeholder:text-poly-black/30 focus:outline-none focus:ring-2 focus:ring-poly-yellow focus:border-poly-yellow transition-all duration-200 disabled:bg-poly-cream disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || success}
                    className="w-full bg-poly-yellow text-poly-black font-sans font-bold uppercase tracking-widest py-3.5 px-4 text-sm hover:bg-poly-black hover:text-poly-yellow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending...
                      </span>
                    ) : success ? (
                      'EMAIL SENT'
                    ) : (
                      'SEND MAGIC LINK'
                    )}
                  </button>
                </form>

                <div className="mt-6 mb-6 flex items-center">
                  <div className="flex-1 border-t border-border"></div>
                  <span className="px-4 font-sans text-xs font-bold uppercase tracking-widest text-poly-black/40">or</span>
                  <div className="flex-1 border-t border-border"></div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading || success}
                  className="w-full bg-white text-poly-black font-sans font-bold uppercase tracking-widest py-3.5 px-4 text-sm border border-border hover:bg-poly-black/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>

                <div className="mt-6 text-center">
                  <p className="font-body text-sm text-poly-black/60">
                    Don&apos;t have an account?{' '}
                    <Link href="/v2/login?mode=signup" className="text-poly-yellow hover:text-poly-yellow-hover font-sans font-bold uppercase text-xs tracking-widest">
                      Sign up
                    </Link>
                  </p>
                </div>

                <div className="mt-6 pt-6 border-t border-border">
                  <p className="text-center text-xs font-body text-poly-black/40 leading-relaxed">
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

export default function V2LoginPage() {
  return (
    <Suspense fallback={
      <>
        <nav className="sticky top-0 z-50 border-b border-border bg-card">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Logo variant="horizontal" size="sm" href="/v2/landing" />
          </div>
        </nav>
        <div className="min-h-[calc(100vh-64px)] bg-poly-cream flex items-center justify-center px-4 py-4">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-6">
              <Logo variant="horizontal" size="md" className="mb-3" />
              <p className="font-body text-poly-black/60 text-center">Copy the best Polymarket traders</p>
            </div>
            <div className="bg-white border border-border p-8">
              <div className="animate-pulse">
                <div className="h-3 bg-poly-black/10 w-1/3 mb-3"></div>
                <div className="h-8 bg-poly-black/10 w-3/4 mb-2"></div>
                <div className="h-4 bg-poly-black/10 w-1/2 mb-6"></div>
                <div className="h-12 bg-poly-black/10 mb-6"></div>
                <div className="h-12 bg-poly-black/10"></div>
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
