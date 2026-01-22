"use client"

import { Shield, Lock, DollarSign } from "lucide-react"

const securityFeatures = [
  {
    icon: Shield,
    title: "Turnkey Infrastructure",
    description: "Bank-level encryption powered by Turnkey. Your keys are secured with institutional-grade security."
  },
  {
    icon: Lock,
    title: "Non-Custodial",
    description: "We never see your unencrypted keys. You maintain full control of your wallet at all times."
  },
  {
    icon: DollarSign,
    title: "No Hidden Fees",
    description: "$20/month flat for Premium. That's it. No commissions, no surprises."
  }
]

export function Security() {
  return (
    <section className="py-16 lg:py-32 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          {/* Security Icon */}
          <div className="w-16 h-16 rounded-2xl bg-neutral-black flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-polycopy-yellow" />
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 text-balance">
            Your keys, your security
          </h2>
          <p className="text-lg text-muted-foreground">
            Built on enterprise-grade infrastructure with security as our top priority
          </p>
        </div>

        {/* Security Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-12">
          {securityFeatures.map((feature, index) => (
            <div key={index} className="text-center">
              {/* Icon */}
              <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <feature.icon className="w-7 h-7 text-foreground" />
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
