import { RelayClient } from '@polymarket/relayer-client';
import { Wallet } from '@ethersproject/wallet';

// Factory function to create a RelayClient for a specific user
// This is used when executing trades on behalf of users
export function createRelayClient(userPrivateKey: string): RelayClient {
  const wallet = new Wallet(userPrivateKey);
  
  return new RelayClient(
    'https://api.polymarket.com', // Polymarket relayer base URL (without /relayer path)
    137, // Polygon chain ID
    wallet
  );
}

// Note: Do NOT create a global relay client - each trade execution
// needs its own client instance with the user's wallet
