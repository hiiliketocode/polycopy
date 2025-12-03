'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/logos/polycopy-logo-primary.svg"
            alt="Polycopy"
            className="h-12 w-auto mb-3"
            style={{ imageRendering: 'crisp-edges' }}
          />
          <p className="text-slate-600 text-center">Copy the best Polymarket traders</p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
          <h2 className="text-2xl font-bold text-[#0F0F0F] mb-2">Welcome back</h2>
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
                  Sending...
                </span>
              ) : success ? (
                '✓ Email Sent'
              ) : (
                '🔗 Send Magic Link'
              )}
            </button>
          </form>

          {/* Footer Text */}
          <p className="text-center text-sm text-slate-500 mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}

