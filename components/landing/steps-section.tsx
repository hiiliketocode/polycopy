"use client"

import { useState } from "react"
import Link from "next/link"
import { Users, TrendingUp, Copy, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function StepsSection() {
  const [currentStep, setCurrentStep] = useState(0)
  
  const steps = [
    { step: "1", icon: Users, title: "Connect", desc: "Link your Polymarket account securely in seconds" },
    { step: "2", icon: TrendingUp, title: "Find", desc: "Browse and follow the highest performing traders" },
    { step: "3", icon: Copy, title: "Copy", desc: "Mirror their trades automatically or manually" },
  ]

  const nextStep = () => {
    setCurrentStep((prev) => (prev + 1) % steps.length)
  }

  const prevStep = () => {
    setCurrentStep((prev) => (prev - 1 + steps.length) % steps.length)
  }

  return (
    <section className="py-16 lg:py-24 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-10 lg:mb-14">
          <h2 className="text-2xl lg:text-4xl font-bold text-foreground mb-3 lg:mb-4">
            Get started in 3 simple steps
          </h2>
          <p className="text-muted-foreground text-base lg:text-lg max-w-2xl mx-auto">
            No experience required. Start copying winning trades in minutes.
          </p>
        </div>

        {/* Mobile Carousel */}
        <div className="md:hidden mb-10">
          <div className="relative px-12 max-w-sm mx-auto">
            {/* Carousel Container with fixed height */}
            <div className="relative min-h-[240px]">
              {/* Carousel Items */}
              {steps.map((item, i) => (
                <div 
                  key={i}
                  className={`transition-opacity duration-300 ${
                    i === currentStep ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 pointer-events-none'
                  }`}
                >
                  <div className="text-center bg-card rounded-2xl border border-border p-6">
                    {/* Step Number Badge */}
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-polycopy-yellow text-neutral-black text-sm font-bold flex items-center justify-center">
                      {item.step}
                    </div>
                    
                    {/* Icon */}
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-polycopy-yellow/10 mb-4 mt-2">
                      <item.icon className="w-7 h-7 text-polycopy-yellow" />
                    </div>
                    
                    {/* Content */}
                    <h3 className="font-bold text-foreground text-lg mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Navigation Arrows */}
            <button
              onClick={prevStep}
              className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors z-10"
              aria-label="Previous step"
            >
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <button
              onClick={nextStep}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors z-10"
              aria-label="Next step"
            >
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
          </div>

          {/* Dots Indicator */}
          <div className="flex justify-center gap-2 mt-6">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep ? "bg-polycopy-yellow" : "bg-border"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Desktop Grid */}
        <div className="hidden md:block max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-6 lg:gap-8">
            {steps.map((item, i) => (
              <div key={i} className="relative text-center bg-card rounded-2xl border border-border p-6 lg:p-8">
                {/* Step Number Badge */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-polycopy-yellow text-neutral-black text-sm font-bold flex items-center justify-center">
                  {item.step}
                </div>
                
                {/* Icon */}
                <div className="inline-flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-xl bg-polycopy-yellow/10 mb-4 mt-2">
                  <item.icon className="w-7 h-7 lg:w-8 lg:h-8 text-polycopy-yellow" />
                </div>
                
                {/* Content */}
                <h3 className="font-bold text-foreground text-lg lg:text-xl mb-2">{item.title}</h3>
                <p className="text-sm lg:text-base text-muted-foreground">{item.desc}</p>

                {/* Connector Arrow (desktop only) */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 lg:-right-5 w-8 lg:w-10 h-px bg-border">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sign Up CTA */}
        <div className="text-center mt-10 lg:mt-12">
          <Link href="/login?mode=signup">
            <Button 
              size="lg" 
              className="bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover font-semibold px-8"
            >
              Sign Up Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
