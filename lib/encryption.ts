import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  throw new Error('WALLET_ENCRYPTION_KEY environment variable is required in production');
}

/**
 * Encrypt a private key for secure storage
 * Uses AES-256-GCM for authenticated encryption
 */
export function encryptPrivateKey(privateKey: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

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
 */
export function decryptPrivateKey(encryptedData: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

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
