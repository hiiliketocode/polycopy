'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { polygon } from 'viem/chains';

export default function PrivyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#FDB022',
          logo: 'https://polycopy.app/logo.png',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        defaultChain: polygon,
        supportedChains: [polygon],
        loginMethods: ['email'],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
