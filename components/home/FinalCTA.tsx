import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function FinalCTA() {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 py-20 lg:py-32">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-4xl lg:text-6xl font-black text-white mb-6 leading-tight">
          Start building your copy trade feed
        </h2>
        <p className="text-xl text-slate-300 mb-10">
          Discover top traders, curate your feed, and copy your favorite trades all in one place.
        </p>
        
        <Link href="/login?mode=signup">
          <Button 
            size="lg" 
            className="bg-[#FDB022] text-slate-900 hover:bg-yellow-400 px-12 py-7 text-xl font-bold"
          >
            Sign Up Free - No Credit Card Required
          </Button>
        </Link>
      </div>
    </div>
  );
}
