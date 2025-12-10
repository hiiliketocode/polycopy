'use client';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useWalletSetup() {
  const { ready, authenticated, user, login, logout, createWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWalletCreation, setPendingWalletCreation] = useState(false);

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  // Watch for authentication changes - create wallet after login completes
  useEffect(() => {
    const createWalletAfterLogin = async () => {
      if (!pendingWalletCreation || !authenticated || !walletsReady) return;

      console.log('Creating wallet after login...');
      setPendingWalletCreation(false);

      try {
        // Check if embedded wallet already exists
        let walletAddress = embeddedWallet?.address;
        
        if (!walletAddress) {
          console.log('No embedded wallet found, creating one...');
          const newWallet = await createWallet();
          walletAddress = newWallet?.address;
        }

        if (!walletAddress) {
          throw new Error('Failed to create wallet');
        }

        console.log('Wallet created:', walletAddress);

        // Save wallet address to Supabase
        const { data: { user: supabaseUser } } = await supabase.auth.getUser();
        if (!supabaseUser) {
          throw new Error('Not logged in to Polycopy');
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

        console.log('Wallet saved to profile');
        window.location.reload();
      } catch (err: any) {
        console.error('Wallet creation error:', err);
        setError(err.message || 'Failed to create wallet');
        setIsCreating(false);
      }
    };

    createWalletAfterLogin();
  }, [pendingWalletCreation, authenticated, walletsReady, embeddedWallet, createWallet, user?.id]);

  // Also watch for authenticated becoming true (login completed)
  useEffect(() => {
    if (authenticated && isCreating && !pendingWalletCreation) {
      console.log('Auth detected, triggering wallet creation');
      setPendingWalletCreation(true);
    }
  }, [authenticated, isCreating, pendingWalletCreation]);

  const setupWallet = useCallback(async () => {
    setIsCreating(true);
    setError(null);

    if (authenticated) {
      // Already logged into Privy, create wallet directly
      console.log('Already authenticated, creating wallet...');
      setPendingWalletCreation(true);
    } else {
      // Not authenticated, open Privy login modal
      console.log('Not authenticated, opening login...');
      login();
      // The useEffect watching 'authenticated' will trigger wallet creation when login completes
    }
  }, [authenticated, login]);

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
