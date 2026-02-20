'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UpgradeModal } from '@/components/polycopy/upgrade-modal';
import { Crown } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname === '/login' || pathname?.startsWith('/login?') || pathname === '/onboarding') {
    return null;
  }

  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/feed') {
      return pathname === '/' || pathname === '/feed';
    }
    if (href === '/discover') {
      return pathname === '/discover';
    }
    if (href === '/trading') {
      return pathname === '/trading' || pathname?.startsWith('/trading/') || pathname?.startsWith('/ft') || pathname?.startsWith('/lt');
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
        }
      } catch (error) {
        console.error('[BottomNav] failed to resolve user status', error);
        if (isMounted) {
          setIsAdmin(false);
          setIsPremium(false);
          setIsLoggedIn(false);
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

          {/* Portfolio */}
          <Link 
            href="/portfolio" 
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={navItemStyle}
          >
            <div style={iconContainerStyle} className="flex items-center justify-center">
              <svg 
                className={`h-6 w-6 ${isActive('/portfolio') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16v-5M12 16v-8M17 16v-3" />
              </svg>
            </div>
            <span className={`text-xs ${isActive('/portfolio') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
              Portfolio
            </span>
          </Link>

          {/* Account */}
          <Link 
            href="/settings" 
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={navItemStyle}
          >
            <div style={iconContainerStyle} className="flex items-center justify-center">
              <svg 
                className={`h-6 w-6 ${isActive('/settings') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.8 19.2a6 6 0 00-11.6 0" />
              </svg>
            </div>
            <span className={`text-xs ${isActive('/settings') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
              Account
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

          {/* Trading (LT/FT) - Only show for admin users */}
          {isAdmin && (
            <Link 
              href="/trading" 
              className="flex-1 flex flex-col items-center justify-center gap-1"
              style={navItemStyle}
            >
              <div style={iconContainerStyle} className="flex items-center justify-center">
                <svg 
                  className={`h-6 w-6 ${isActive('/trading') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className={`text-xs ${isActive('/trading') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
                Trading
              </span>
            </Link>
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
