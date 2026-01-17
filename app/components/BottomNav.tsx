'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UpgradeModal } from '@/components/polycopy/upgrade-modal';
import { Button } from '@/components/ui/button';
import { Crown } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  // Hide bottom nav on login/signup pages
  if (pathname === '/login' || pathname?.startsWith('/login?')) {
    return null;
  }

  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  const isActive = (href: string) => {
    if (href === '/feed') {
      return pathname === '/' || pathname === '/feed';
    }
    if (href === '/discover') {
      return pathname === '/discover';
    }
    return pathname.startsWith(href);
  };

  // Shared styles for nav items to ensure they're locked in place
  const navItemStyle = {
    height: '56px',
    minHeight: '56px',
    maxHeight: '56px',
    transform: 'translate3d(0, 0, 0)',
    backfaceVisibility: 'hidden' as const,
    WebkitBackfaceVisibility: 'hidden' as const
  };

  const iconContainerStyle = {
    height: '24px',
    width: '24px',
    minHeight: '24px',
    minWidth: '24px'
  };

  useEffect(() => {
    let isMounted = true;

    const checkUserStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (isMounted) {
            setIsAdmin(false);
            setIsPremium(false);
            setIsLoggedIn(false);
            setHasCheckedAuth(true);
          }
          return;
        }

        if (isMounted) {
          setIsLoggedIn(true);
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_admin, is_premium')
          .eq('id', user.id)
          .maybeSingle();

        if (isMounted) {
          setIsAdmin(Boolean(profile?.is_admin && !error));
          setIsPremium(Boolean(profile?.is_premium && !error));
          setHasCheckedAuth(true);
        }
      } catch (error) {
        console.error('[BottomNav] failed to resolve user status', error);
        if (isMounted) {
          setIsAdmin(false);
          setIsPremium(false);
          setIsLoggedIn(false);
          setHasCheckedAuth(true);
        }
      }
    };

    checkUserStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      {hasCheckedAuth && !isLoggedIn && (
        <div
          className="md:hidden fixed left-0 right-0 z-[9998] px-4"
          style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 8px)' }}
        >
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <Button asChild variant="outline" className="w-full border-slate-300 text-slate-700">
              <Link href="/login">Log In</Link>
            </Button>
            <Button asChild className="w-full bg-[#FDB022] text-slate-900 hover:bg-[#FDB022]/90">
              <Link href="/login?mode=signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      )}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 w-full z-[9999] bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
        style={{ 
          height: '64px',
          minHeight: '64px',
          maxHeight: '64px',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          willChange: 'transform',
          position: 'fixed'
        }}
      >
        <div 
          className="max-w-md mx-auto flex items-center justify-around px-4"
          style={{
            height: '64px',
            minHeight: '64px',
            maxHeight: '64px',
            position: 'relative'
          }}
        >
          {/* Feed */}
          <Link 
            href="/feed" 
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={navItemStyle}
          >
            <div style={iconContainerStyle} className="flex items-center justify-center">
              <svg 
                className={`h-6 w-6 ${isActive('/feed') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <span className={`text-xs ${isActive('/feed') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
              Feed
            </span>
          </Link>

          {/* Discover */}
          <Link 
            href="/discover" 
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={navItemStyle}
          >
            <div style={iconContainerStyle} className="flex items-center justify-center">
              <svg 
                className={`h-6 w-6 ${isActive('/discover') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <span className={`text-xs ${isActive('/discover') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
              Discover
            </span>
          </Link>

          {/* Profile */}
          <Link 
            href="/profile" 
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={navItemStyle}
          >
            <div style={iconContainerStyle} className="flex items-center justify-center">
              <svg 
                className={`h-6 w-6 ${isActive('/profile') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className={`text-xs ${isActive('/profile') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
              Profile
            </span>
          </Link>

          {/* Get Premium - Only show for logged in free users */}
          {isLoggedIn && !isPremium && (
            <button 
              onClick={() => setUpgradeModalOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={navItemStyle}
            >
              <div style={iconContainerStyle} className="flex items-center justify-center">
                <Crown className="h-5 w-5 text-yellow-500" />
              </div>
              <span className="text-[10px] font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent leading-tight">
                Get
              </span>
              <span className="text-[10px] font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent leading-tight -mt-0.5">
                Premium
              </span>
            </button>
          )}

          {/* Admin - Only show for admin users */}
          {isAdmin && (
            <Link 
              href="/admin/users" 
              className="flex-1 flex flex-col items-center justify-center gap-1"
              style={navItemStyle}
            >
              <div style={iconContainerStyle} className="flex items-center justify-center">
                <svg 
                  className={`h-6 w-6 ${isActive('/admin/users') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8a6 6 0 11-8 0 6 6 0 018 0zm-1 8h-4l-1 5h6l-1-5z" />
                </svg>
              </div>
              <span className={`text-xs ${isActive('/admin/users') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
                Admin
              </span>
            </Link>
          )}
        </div>
      </nav>

      {/* Upgrade Modal */}
      {isLoggedIn && !isPremium && (
        <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />
      )}
    </>
  );
}
