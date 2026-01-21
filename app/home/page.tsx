import { Hero } from '@/components/home/Hero';
import { CurationCarousel } from '@/components/home/CurationCarousel';
import { HowToCopyTrade } from '@/components/home/HowToCopyTrade';
import { PricingComparison } from '@/components/home/PricingComparison';
import { TrendingTraders } from '@/components/home/TrendingTraders';
import { SecuritySection } from '@/components/home/SecuritySection';
import { FinalCTA } from '@/components/home/FinalCTA';

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Hero />
      <CurationCarousel />
      <HowToCopyTrade />
      <PricingComparison />
      <TrendingTraders />
      <SecuritySection />
      <FinalCTA />
    </main>
  );
}
