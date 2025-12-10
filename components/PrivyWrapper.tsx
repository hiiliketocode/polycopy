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
          accentColor: '#FDB022', // Polycopy brand yellow
          logo: 'https://polycopy.app/logo.png',
        },
        // Embedded wallet config - create manually for premium users only
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
          solana: {
            createOnLogin: 'off',
          },
        },
        defaultChain: polygon,
        supportedChains: [polygon],
        loginMethods: ['email'], // Keep it simple, match existing Supabase email auth
      }}
    >
      {children}
    </PrivyProvider>
  );
}
