/**
 * ChaCha20-Poly1305 encryption for wallet storage
 */

import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { argon2id } from "@noble/hashes/argon2";
import type { Result } from "../auth/adapter";
import { ok, err } from "../auth/adapter";
import { EncryptionError } from "../errors";

// Argon2id parameters (OWASP recommended minimum)
const ARGON2_MEMORY = 65536; // 64 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;

/** Internal options for testing - NOT for production use */
interface KeyDerivationOptions {
  memory?: number;
  iterations?: number;
}

let testKeyDerivationOptions: KeyDerivationOptions | null = null;

/**
 * Set test-specific key derivation options (for faster tests only)
 * @internal Do not use in production code
 */
export function _setTestKeyDerivationOptions(options: KeyDerivationOptions | null): void {
  // Prevent accidental use in production
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    throw new Error(
      'Test key derivation options cannot be used in production. ' +
      'This function is for testing only.'
    );
  }
  testKeyDerivationOptions = options;
}

export interface EncryptedData {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
  salt: Uint8Array;
}

/**
 * Derive encryption key from password using Argon2id
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);

  // Use test options if set (for faster tests), otherwise use production defaults
  const memory = testKeyDerivationOptions?.memory ?? ARGON2_MEMORY;
  const iterations = testKeyDerivationOptions?.iterations ?? ARGON2_ITERATIONS;

  const key = argon2id(passwordBytes, salt, {
    t: iterations,
    m: memory,
    p: ARGON2_PARALLELISM,
    dkLen: 32, // 256-bit key for ChaCha20-Poly1305
  });

  // Clear password from memory immediately after use
  passwordBytes.fill(0);

  return key;
}

/**
 * Encrypt data with ChaCha20-Poly1305
 */
export async function encryptData(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array,
): Promise<EncryptedData> {
  const iv = nonce ?? crypto.getRandomValues(new Uint8Array(12));

  const cipher = chacha20poly1305(key, iv);
  const ciphertext = cipher.encrypt(plaintext);

  // Noble ciphers returns ciphertext with tag appended
  // Tag is last 16 bytes
  const tag = ciphertext.slice(-16);
  const encrypted = ciphertext.slice(0, -16);

  return {
    ciphertext: encrypted,
    nonce: iv,
    tag,
    salt: new Uint8Array(0), // Salt is managed separately
  };
}

/**
 * Decrypt data with ChaCha20-Poly1305
 */
export async function decryptData(
  encrypted: EncryptedData,
  key: Uint8Array,
): Promise<Result<Uint8Array>> {
  try {
    const cipher = chacha20poly1305(key, encrypted.nonce);

    // Reconstruct ciphertext with tag
    const fullCiphertext = new Uint8Array(
      encrypted.ciphertext.length + encrypted.tag.length,
    );
    fullCiphertext.set(encrypted.ciphertext);
    fullCiphertext.set(encrypted.tag, encrypted.ciphertext.length);

    const plaintext = cipher.decrypt(fullCiphertext);
    return ok(plaintext);
  } catch (error) {
    return err(
      new EncryptionError(
        error instanceof Error ? error.message : "Decryption failed",
      ),
    );
  }
}

/**
 * Generate random salt
 */
export function generateSalt(length = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
