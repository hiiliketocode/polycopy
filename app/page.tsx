'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // If logged in, go to Feed
      if (session?.user) {
        router.push('/feed');
      } else {
        // If not logged in, go to Home page
        router.replace('/home');
      }
    };

    checkAuthAndRedirect();
  }, [router]);

  // Show loading state while checking auth
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-yellow mx-auto mb-4"></div>
        <p className="text-slate-600 text-lg">Loading...</p>
      </div>
    </div>
  );
}
