'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/following', label: 'Following', icon: '📋' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-gray-200">
      <div className="flex items-center justify-around h-16 md:h-20 max-w-7xl mx-auto md:gap-8 md:px-8">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center justify-center
                min-h-[48px] md:min-h-[56px] flex-1 md:flex-initial md:min-w-[120px]
                transition-all duration-200 ease-in-out
                rounded-lg md:mx-2
                ${
                  active
                    ? 'bg-primary text-tertiary'
                    : 'bg-secondary text-tertiary hover:bg-gray-50'
                }
              `}
            >
              <span className="text-2xl md:text-3xl mb-0.5 md:mb-1">{item.icon}</span>
              <span className="text-xs md:text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

