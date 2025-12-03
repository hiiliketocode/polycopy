'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();

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
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 w-full z-[9999] bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
      style={{ 
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        perspective: 1000,
        WebkitPerspective: 1000
      }}
    >
      <div className="flex items-center justify-around h-16 px-4 pb-safe">
        {/* Feed */}
        <Link href="/feed" className="flex flex-col items-center justify-center flex-1 gap-1 py-2">
          <svg 
            className={`h-6 w-6 ${isActive('/feed') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <span className={`text-xs ${isActive('/feed') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
            Feed
          </span>
        </Link>

        {/* Discover */}
        <Link href="/discover" className="flex flex-col items-center justify-center flex-1 gap-1 py-2">
          <svg 
            className={`h-6 w-6 ${isActive('/discover') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className={`text-xs ${isActive('/discover') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
            Discover
          </span>
        </Link>

        {/* Profile */}
        <Link href="/profile" className="flex flex-col items-center justify-center flex-1 gap-1 py-2">
          <svg 
            className={`h-6 w-6 ${isActive('/profile') ? 'text-[#0F0F0F]' : 'text-slate-400'}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className={`text-xs ${isActive('/profile') ? 'text-[#0F0F0F] font-semibold' : 'text-slate-500'}`}>
            Profile
          </span>
        </Link>
      </div>
    </nav>
  );
}

