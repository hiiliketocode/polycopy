import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { FeaturesCarousel } from "@/components/landing/features-carousel"
import { TopTraders } from "@/components/landing/top-traders"
import { StepsSection } from "@/components/landing/steps-section"
import { Pricing } from "@/components/landing/pricing"
import { Security } from "@/components/landing/security"
import { CTA } from "@/components/landing/cta"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user) {
    redirect("/feed")
  }

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
