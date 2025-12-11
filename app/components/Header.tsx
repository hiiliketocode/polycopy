'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const navItems = [
    { href: '/feed', label: 'Feed' },
    { href: '/discover', label: 'Discover' },
    { href: '/profile', label: 'Profile' },
  ];

  const isActive = (href: string) => {
    if (href === '/feed') {
      return pathname === '/' || pathname === '/feed';
    }
    if (href === '/discover') {
      return pathname === '/discover';
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200">
      <div className="flex h-14 items-center justify-between px-4 max-w-7xl mx-auto">
        {/* Left: Logo + Desktop Nav */}
        <div className="flex items-center gap-6">
          {/* Logo - Full logo for all screen sizes */}
          <Link href="/" className="flex items-center">
            <img 
              src="/logos/polycopy-logo-primary.png"
              alt="Polycopy"
              width={135}
              height={32}
              className="h-8 w-auto"
              style={{ 
                imageRendering: '-webkit-optimize-contrast',
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden'
              }}
            />
          </Link>
          
          {/* Desktop Navigation - hidden on mobile */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    active
                      ? 'bg-[#0F0F0F] text-white'
                      : 'text-[#0F0F0F] hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {/* Avatar */}
              <Link href="/profile">
                <div className="h-8 w-8 rounded-full bg-[#FDB022] ring-2 ring-white shadow-sm cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center">
                  <span className="text-sm font-bold text-[#0F0F0F]">
                    {user.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
              </Link>
            </>
          ) : (
            <>
              {/* Log In - Secondary style */}
              <button
                onClick={() => router.push('/login')}
                className="text-sm font-medium text-[#0F0F0F] hover:text-slate-600 transition-colors"
              >
                Log In
              </button>
              
              {/* Sign Up - Primary style with brand color */}
              <button
                onClick={() => router.push('/login?mode=signup')}
                className="px-4 py-1.5 text-sm font-semibold bg-[#FDB022] hover:bg-[#E69E1A] text-[#0F0F0F] rounded-lg transition-colors"
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

