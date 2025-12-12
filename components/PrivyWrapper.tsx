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
          createOnLogin: 'off',
          requireUserPasswordOnCreate: false,
        },
        defaultChain: polygon,
        supportedChains: [polygon, mainnet],
        // Only allow wallet-based login for import flow
        loginMethods: ['wallet'],
        externalWallets: {
          coinbaseWallet: { 
            connectionOptions: 'eoaOnly' 
          },
          metamask: { 
            connectionOptions: 'eoaOnly' 
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
