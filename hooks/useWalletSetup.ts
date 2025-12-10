'use client';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useWalletSetup() {
  const { ready, authenticated, user, login, logout, createWallet } = usePrivy();
  const { wallets } = useWallets();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find the embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  // Create wallet and save to Supabase
  const setupWallet = async () => {
    setIsCreating(true);
    setError(null);
    try {
      // If not authenticated with Privy, login first
      if (!authenticated) {
        await login();
        return; // Will continue after login completes
      }

      // Check if embedded wallet already exists
      let walletAddress = embeddedWallet?.address;
      
      // Create embedded wallet if doesn't exist
      if (!walletAddress) {
        const newWallet = await createWallet();
        walletAddress = newWallet?.address;
      }

      if (!walletAddress) {
        throw new Error('Failed to create wallet');
      }

      // Save wallet address to Supabase profile
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();
      if (!supabaseUser) {
        throw new Error('Not logged in');
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          trading_wallet_address: walletAddress,
          privy_user_id: user?.id,
          wallet_created_at: new Date().toISOString(),
        })
        .eq('id', supabaseUser.id);

      if (updateError) {
        throw updateError;
      }

      return walletAddress;
    } catch (err: any) {
      setError(err.message || 'Failed to setup wallet');
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    ready,
    authenticated,
    embeddedWallet,
    walletAddress: embeddedWallet?.address,
    setupWallet,
    isCreating,
    error,
    privyLogout: logout,
  };
}
