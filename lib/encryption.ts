/**
 * DEPRECATED: This encryption module is no longer used for wallet private keys.
 * 
 * We now use Privy for all private key storage and encryption.
 * Privy handles encryption/decryption securely on their infrastructure.
 * We only store public wallet addresses in our database.
 * 
 * This file is kept for backwards compatibility only.
 * DO NOT USE for new implementations.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Get the encryption key from environment variables
 * Only checks at runtime, not during build
 * 
 * @deprecated Use Privy for wallet encryption instead
 */
function getEncryptionKey(): string {
  const key = process.env.WALLET_ENCRYPTION_KEY || '';
  if (!key) {
    throw new Error('WALLET_ENCRYPTION_KEY environment variable is required');
  }
  return key;
}

/**
 * Encrypt a private key for secure storage
 * Uses AES-256-GCM for authenticated encryption
 * 
 * @deprecated Use Privy's importWallet() instead - they handle encryption
 */
export function encryptPrivateKey(privateKey: string): string {
  const ENCRYPTION_KEY = getEncryptionKey();

  // Generate a random initialization vector
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the private key
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get the authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine iv + authTag + encrypted data
  const result = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  
  return result;
}

/**
 * Decrypt a private key for use in trade execution
 * Only call this server-side when needed
 * 
 * @deprecated Use Privy's wallet.signTransaction() instead
 */
export function decryptPrivateKey(encryptedData: string): string {
  const ENCRYPTION_KEY = getEncryptionKey();

  try {
    // Split the encrypted data
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }
    
    // Convert from hex
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Create decipher
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt private key');
  }
}

/**
 * Validate that a string is a valid Ethereum private key
 */
export function isValidPrivateKey(key: string): boolean {
  // Remove 0x prefix if present
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
  
  // Check if it's 64 hex characters
  return /^[0-9a-fA-F]{64}$/.test(cleanKey);
}
