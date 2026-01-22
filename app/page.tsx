import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { FeaturesCarousel } from "@/components/landing/features-carousel"
import { TopTraders } from "@/components/landing/top-traders"
import { StepsSection } from "@/components/landing/steps-section"
import { Pricing } from "@/components/landing/pricing"
import { Security } from "@/components/landing/security"
import { CTA } from "@/components/landing/cta"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <Hero />
      <FeaturesCarousel />
      <TopTraders />
      <StepsSection />
      <Pricing />
      <Security />
      <CTA />
    </main>
  )
}
