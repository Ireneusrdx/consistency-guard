import crypto from 'crypto';

/**
 * AES-256-GCM encryption for stored provider API keys.
 *
 * - Keys are encrypted at rest; the plaintext only exists transiently
 *   server-side at the moment a provider request is made.
 * - Ciphertext format: base64(iv):base64(ciphertext):base64(authTag)
 * - NEVER log, return, or expose decrypted keys.
 */

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not configured. Set it in the server environment.');
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Derive a 32-byte key from any passphrase via SHA-256.
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptApiKey(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Cannot encrypt an empty API key.');
  }
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptApiKey(payload: string): string {
  const key = getKey();
  const parts = payload.split(':');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new Error('Stored credential is malformed and cannot be decrypted.');
  }
  const [ivB64, encB64, tagB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Mask a key for display, e.g. "sk-••••••••ab12". Never reveal more than this. */
export function maskApiKey(key: string): string {
  const trimmed = (key || '').trim();
  if (trimmed.length <= 8) return '••••••••';
  const last4 = trimmed.slice(-4);
  const prefixMatch = trimmed.match(/^(sk-[a-zA-Z]*-|pplx-|gsk_|AIza)/);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  return `${prefix}••••••••${last4}`;
}
