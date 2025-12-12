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
        },
        // Disable embedded wallet creation - users must import their Polymarket wallet
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
          solana: {
            createOnLogin: 'off',
          },
        },
        defaultChain: polygon,
        supportedChains: [polygon, mainnet],
        // Only allow wallet-based login for import flow
        loginMethods: ['wallet'],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
