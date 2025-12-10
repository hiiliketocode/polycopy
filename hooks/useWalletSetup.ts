'use client';
import { usePrivy, useWallets, useLoginWithEmail } from '@privy-io/react-auth';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useWalletSetup() {
  const { ready, authenticated, user, logout, createWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWalletCreation, setPendingWalletCreation] = useState(false);

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  // Use the login hook with onComplete callback
  const { sendCode, loginWithCode, state } = useLoginWithEmail({
    onComplete: async ({ user, isNewUser }) => {
      console.log('Privy login complete', { user, isNewUser });
      // After login completes, trigger wallet creation
      setPendingWalletCreation(true);
    },
    onError: (error) => {
      console.error('Privy login error:', error);
      setError('Login failed. Please try again.');
      setIsCreating(false);
    },
  });

  // Watch for pending wallet creation after login
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
        // Force reload to show updated profile
        window.location.reload();
      } catch (err: any) {
        console.error('Wallet creation error:', err);
        setError(err.message || 'Failed to create wallet');
      } finally {
        setIsCreating(false);
      }
    };

    createWalletAfterLogin();
  }, [pendingWalletCreation, authenticated, walletsReady, embeddedWallet, createWallet, user?.id]);

  // If already authenticated with Privy, just create wallet directly
  const setupWallet = useCallback(async () => {
    setIsCreating(true);
    setError(null);

    if (authenticated) {
      // Already logged into Privy, create wallet directly
      setPendingWalletCreation(true);
    }
    // If not authenticated, the modal will handle login via sendCode/loginWithCode
  }, [authenticated]);

  return {
    ready,
    authenticated,
    embeddedWallet,
    walletAddress: embeddedWallet?.address,
    setupWallet,
    isCreating,
    error,
    privyLogout: logout,
    // Expose email login methods for the modal
    sendCode,
    loginWithCode,
    loginState: state,
  };
}
