/**
 * Encryption module tests - ChaCha20-Poly1305
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  deriveKeyFromPassword,
  encryptData,
  decryptData,
  generateSalt,
  _setTestKeyDerivationOptions,
} from "../src/crypto/encryption";
import { isResultSuccess, isResultFailure } from "../src/auth/adapter";

// Use lighter Argon2 parameters for faster tests (still validates correctness)
beforeAll(() => {
  _setTestKeyDerivationOptions({ memory: 8192, iterations: 1 }); // 8MB, 1 iteration
});

afterAll(() => {
  _setTestKeyDerivationOptions(null); // Reset to production defaults
});

// ─── Key Derivation ────────────────────────────────────────────────────────────

describe("Encryption Module", () => {
  describe("deriveKeyFromPassword", () => {
    it("produces consistent output for the same inputs", async () => {
      const salt = generateSalt();
      const key1 = await deriveKeyFromPassword("password123", salt);
      const key2 = await deriveKeyFromPassword("password123", salt);
      expect(key1).toEqual(key2);
    });

    it("produces different output for different passwords", async () => {
      const salt = generateSalt();
      const key1 = await deriveKeyFromPassword("password123", salt);
      const key2 = await deriveKeyFromPassword("password456", salt);
      expect(key1).not.toEqual(key2);
    });

    it("produces different output for different salts", async () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const key1 = await deriveKeyFromPassword("password123", salt1);
      const key2 = await deriveKeyFromPassword("password123", salt2);
      expect(key1).not.toEqual(key2);
    });

    it("produces 32-byte key", async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassword("password123", salt);
      expect(key).toHaveLength(32);
    });
  });

  // ─── Encryption / Decryption ───────────────────────────────────────────────────

  describe("encryptData", () => {
    it("encrypts plaintext successfully", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new TextEncoder().encode("hello world");

      const encrypted = await encryptData(plaintext, key);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toHaveLength(12);
      expect(encrypted.tag).toHaveLength(16);
    });

    it("produces different ciphertext for same plaintext (different nonces)", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new TextEncoder().encode("hello world");

      const encrypted1 = await encryptData(plaintext, key);
      const encrypted2 = await encryptData(plaintext, key);

      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
      expect(encrypted1.nonce).not.toEqual(encrypted2.nonce);
    });

    it("uses provided nonce when given", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new TextEncoder().encode("hello world");
      const nonce = new Uint8Array(12).fill(42);

      const encrypted = await encryptData(plaintext, key, nonce);

      expect(encrypted.nonce).toEqual(nonce);
    });
  });

  describe("decryptData", () => {
    it("decrypts ciphertext successfully", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new TextEncoder().encode("hello world");

      const encrypted = await encryptData(plaintext, key);
      const decrypted = await decryptData(encrypted, key);

      expect(isResultSuccess(decrypted)).toBe(true);
      expect(decrypted.data).toEqual(plaintext);
    });

    it("decrypts to original plaintext", async () => {
      const key = new Uint8Array(32).fill(1);
      const originalText = "The quick brown fox jumps over the lazy dog";
      const plaintext = new TextEncoder().encode(originalText);

      const encrypted = await encryptData(plaintext, key);
      const decrypted = await decryptData(encrypted, key);

      expect(isResultSuccess(decrypted)).toBe(true);
      const decoded = new TextDecoder().decode(decrypted.data!);
      expect(decoded).toBe(originalText);
    });

    it("fails with wrong key", async () => {
      const key1 = new Uint8Array(32).fill(1);
      const key2 = new Uint8Array(32).fill(2);
      const plaintext = new TextEncoder().encode("hello world");

      const encrypted = await encryptData(plaintext, key1);
      const decrypted = await decryptData(encrypted, key2);

      expect(isResultFailure(decrypted)).toBe(true);
      expect(decrypted.error?.name).toBe("EncryptionError");
    });

    it("fails with tampered ciphertext", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new TextEncoder().encode("hello world");

      const encrypted = await encryptData(plaintext, key);
      encrypted.ciphertext[0] ^= 0xff; // Tamper with first byte

      const decrypted = await decryptData(encrypted, key);

      expect(isResultFailure(decrypted)).toBe(true);
      expect(decrypted.error?.name).toBe("EncryptionError");
    });

    it("fails with tampered tag", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new TextEncoder().encode("hello world");

      const encrypted = await encryptData(plaintext, key);
      encrypted.tag[0] ^= 0xff; // Tamper with first byte

      const decrypted = await decryptData(encrypted, key);

      expect(isResultFailure(decrypted)).toBe(true);
      expect(decrypted.error?.name).toBe("EncryptionError");
    });
  });

  // ─── Round-trip Tests ──────────────────────────────────────────────────────────

  describe("encryption round-trip", () => {
    it("encrypts and decrypts empty data", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new Uint8Array(0);

      const encrypted = await encryptData(plaintext, key);
      const decrypted = await decryptData(encrypted, key);

      expect(isResultSuccess(decrypted)).toBe(true);
      expect(decrypted.data).toEqual(plaintext);
    });

    it("encrypts and decrypts large data", async () => {
      const key = new Uint8Array(32).fill(1);
      // Use smaller data due to crypto.getRandomValues limit in Node.js (65536 bytes)
      const plaintext = new Uint8Array(65536);
      crypto.getRandomValues(plaintext);

      const encrypted = await encryptData(plaintext, key);
      const decrypted = await decryptData(encrypted, key);

      expect(isResultSuccess(decrypted)).toBe(true);
      expect(decrypted.data).toEqual(plaintext);
    });

    it("encrypts and decrypts binary data", async () => {
      const key = new Uint8Array(32).fill(1);
      const plaintext = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        plaintext[i] = i;
      }

      const encrypted = await encryptData(plaintext, key);
      const decrypted = await decryptData(encrypted, key);

      expect(isResultSuccess(decrypted)).toBe(true);
      expect(decrypted.data).toEqual(plaintext);
    });
  });

  // ─── Salt Generation ───────────────────────────────────────────────────────────

  describe("generateSalt", () => {
    it("generates 16-byte salt by default", () => {
      const salt = generateSalt();
      expect(salt).toHaveLength(16);
    });

    it("generates salt of specified length", () => {
      const salt = generateSalt(32);
      expect(salt).toHaveLength(32);
    });

    it("generates different salts each time", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toEqual(salt2);
    });
  });
});
