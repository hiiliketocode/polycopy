import { Lock, Shield, DollarSign } from 'lucide-react';

export function SecuritySection() {
  const features = [
    {
      icon: Shield,
      title: 'Turnkey Infrastructure',
      description: 'Bank-level encryption powered by Turnkey. Your keys are secured with institutional-grade security.'
    },
    {
      icon: Lock,
      title: 'Non-Custodial',
      description: 'We never see your unencrypted keys. You maintain full control of your wallet at all times.'
    },
    {
      icon: DollarSign,
      title: 'No Hidden Fees',
      description: '$20/month flat for Premium. That\'s it. No commissions, no surprises.'
    }
  ];

  return (
    <div className="bg-white py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-900 rounded-2xl mb-6">
            <Shield className="w-10 h-10 text-[#FDB022]" />
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6">
            Your keys, your security
          </h2>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Built on enterprise-grade infrastructure with security as our top priority
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-50 rounded-xl mb-4">
                  <Icon className="w-8 h-8 text-slate-900" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
