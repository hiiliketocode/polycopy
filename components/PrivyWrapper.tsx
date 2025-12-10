'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { polygon, mainnet } from 'viem/chains';

export default function PrivyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#FDB022',
          // Remove logo to avoid 404 error
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        defaultChain: polygon,
        // Support both Polygon and Ethereum mainnet for funding flexibility
        supportedChains: [polygon, mainnet],
        loginMethods: ['email'],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
