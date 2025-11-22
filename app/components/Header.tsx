'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

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
          {/* Desktop Logo - Full logo with text */}
          <Link href="/" className="hidden md:flex items-center">
            <Image 
              src="/logos/polycopy-logo-primary.svg"
              alt="Polycopy"
              width={500}
              height={150}
              priority
              className="h-8 w-auto"
            />
          </Link>

          {/* Mobile Logo - Icon only */}
          <Link href="/" className="md:hidden flex items-center">
            <Image 
              src="/logos/polycopy-logo-icon.svg"
              alt="Polycopy"
              width={100}
              height={100}
              priority
              className="h-8 w-8"
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

        {/* Right: Search + Actions */}
        <div className="flex items-center gap-4">
          {/* Search - Desktop only */}
          <button className="hidden md:flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          
          {user ? (
            <>
              {/* Notification Bell */}
              <button className="relative text-slate-500 hover:text-slate-700 transition-colors">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              
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
            <button
              onClick={() => router.push('/login')}
              className="text-sm font-medium text-[#0F0F0F] hover:text-slate-600 transition-colors"
            >
              Sign in →
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

