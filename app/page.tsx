'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // If logged in, go to Feed
      if (user) {
        router.push('/feed');
      } else {
        // If not logged in, go to Discover
        router.push('/discover');
      }
    };

    checkAuthAndRedirect();
  }, [router]);

  // Show loading state while checking auth
  const isProduction = process.env.NODE_ENV === 'production';
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {isProduction && (
        <div className="bg-yellow-500 text-slate-900 px-4 py-3 text-center font-semibold border-b-2 border-yellow-600">
          <p>We are currently working on maintenance and will be available again shortly. We apologize for the inconvenience.</p>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-yellow mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">Loading...</p>
        </div>
      </div>
    </div>
  );
}
