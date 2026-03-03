/**
 * Storage module tests - localStorage-based wallet storage
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalWalletStorage } from "../src/storage/local";
import { STORAGE_KEY } from "../src/storage/index";
import { isResultSuccess, isResultFailure } from "../src/auth/adapter";
import type { StoredWallet } from "../src/storage/index";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    getStore: () => store,
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

describe("LocalWalletStorage", () => {
  let storage: LocalWalletStorage;

  beforeEach(() => {
    storage = new LocalWalletStorage();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ─── Store ─────────────────────────────────────────────────────────────────────

  describe("store", () => {
    it("stores wallet successfully", async () => {
      const wallet: StoredWallet = {
        version: "v1",
        ciphertext: new Uint8Array([1, 2, 3]),
        nonce: new Uint8Array(12),
        tag: new Uint8Array(16),
        salt: new Uint8Array(16),
        createdAt: Date.now(),
        namespacedUserId: "clerk:user123",
      };

      const result = await storage.store(wallet);

      expect(isResultSuccess(result)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String)
      );
    });

    it("stores wallet data that can be retrieved", async () => {
      const wallet: StoredWallet = {
        version: "v1",
        ciphertext: new Uint8Array([1, 2, 3]),
        nonce: new Uint8Array(12).fill(1),
        tag: new Uint8Array(16).fill(2),
        salt: new Uint8Array(16).fill(3),
        createdAt: 1234567890,
        namespacedUserId: "clerk:user123",
      };

      await storage.store(wallet);
      const retrieved = await storage.retrieve();

      expect(isResultSuccess(retrieved)).toBe(true);
      expect(retrieved.data).not.toBeNull();
      expect(retrieved.data!.namespacedUserId).toBe("clerk:user123");
      expect(retrieved.data!.version).toBe("v1");
      expect(retrieved.data!.createdAt).toBe(1234567890);
    });
  });

  // ─── Retrieve ──────────────────────────────────────────────────────────────────

  describe("retrieve", () => {
    it("returns null when no wallet stored", async () => {
      const result = await storage.retrieve();

      expect(isResultSuccess(result)).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns error for invalid JSON", async () => {
      localStorageMock.setItem(STORAGE_KEY, "not valid json");

      const result = await storage.retrieve();

      expect(isResultFailure(result)).toBe(true);
      expect(result.error?.name).toBe("StorageError");
    });

    it("returns error for unsupported version", async () => {
      localStorageMock.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: "v2",
          ciphertext: "abc",
          nonce: "def",
          tag: "ghi",
          salt: "jkl",
          createdAt: 123,
          namespacedUserId: "user",
        })
      );

      const result = await storage.retrieve();

      expect(isResultFailure(result)).toBe(true);
      expect(result.error?.name).toBe("StorageError");
    });

    it("correctly decodes base64 data", async () => {
      const wallet: StoredWallet = {
        version: "v1",
        ciphertext: new Uint8Array([1, 2, 3, 4, 5]),
        nonce: new Uint8Array(12).fill(1),
        tag: new Uint8Array(16).fill(2),
        salt: new Uint8Array(16).fill(3),
        createdAt: 1234567890,
        namespacedUserId: "clerk:user123",
      };

      await storage.store(wallet);
      const retrieved = await storage.retrieve();

      expect(isResultSuccess(retrieved)).toBe(true);
      expect(retrieved.data!.ciphertext).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
      expect(retrieved.data!.nonce).toEqual(new Uint8Array(12).fill(1));
      expect(retrieved.data!.tag).toEqual(new Uint8Array(16).fill(2));
      expect(retrieved.data!.salt).toEqual(new Uint8Array(16).fill(3));
    });
  });

  // ─── Clear ─────────────────────────────────────────────────────────────────────

  describe("clear", () => {
    it("removes stored wallet", async () => {
      const wallet: StoredWallet = {
        version: "v1",
        ciphertext: new Uint8Array([1, 2, 3]),
        nonce: new Uint8Array(12),
        tag: new Uint8Array(16),
        salt: new Uint8Array(16),
        createdAt: Date.now(),
        namespacedUserId: "clerk:user123",
      };

      await storage.store(wallet);
      const clearResult = await storage.clear();

      expect(isResultSuccess(clearResult)).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);

      const retrieveResult = await storage.retrieve();
      expect(retrieveResult.data).toBeNull();
    });

    it("succeeds when no wallet exists", async () => {
      const result = await storage.clear();

      expect(isResultSuccess(result)).toBe(true);
    });
  });

  // ─── HasWallet ─────────────────────────────────────────────────────────────────

  describe("hasWallet", () => {
    it("returns false when no wallet stored", async () => {
      const result = await storage.hasWallet("clerk:user123");
      expect(result).toBe(false);
    });

    it("returns true when wallet exists for user", async () => {
      const wallet: StoredWallet = {
        version: "v1",
        ciphertext: new Uint8Array([1, 2, 3]),
        nonce: new Uint8Array(12),
        tag: new Uint8Array(16),
        salt: new Uint8Array(16),
        createdAt: Date.now(),
        namespacedUserId: "clerk:user123",
      };

      await storage.store(wallet);
      const result = await storage.hasWallet("clerk:user123");

      expect(result).toBe(true);
    });

    it("returns false when wallet belongs to different user", async () => {
      const wallet: StoredWallet = {
        version: "v1",
        ciphertext: new Uint8Array([1, 2, 3]),
        nonce: new Uint8Array(12),
        tag: new Uint8Array(16),
        salt: new Uint8Array(16),
        createdAt: Date.now(),
        namespacedUserId: "clerk:user123",
      };

      await storage.store(wallet);
      const result = await storage.hasWallet("clerk:user456");

      expect(result).toBe(false);
    });
  });

  // ─── Binary Data Round-trip ────────────────────────────────────────────────────

  describe("binary data round-trip", () => {
    it("preserves binary data through store and retrieve", async () => {
      const wallet: StoredWallet = {
        version: "v1",
        ciphertext: new Uint8Array(256).map((_, i) => i),
        nonce: new Uint8Array(12).map((_, i) => i * 2),
        tag: new Uint8Array(16).map((_, i) => i * 3),
        salt: new Uint8Array(16).map((_, i) => i * 4),
        createdAt: 1234567890,
        namespacedUserId: "clerk:user123",
      };

      await storage.store(wallet);
      const retrieved = await storage.retrieve();

      expect(isResultSuccess(retrieved)).toBe(true);
      expect(retrieved.data!.ciphertext).toEqual(wallet.ciphertext);
      expect(retrieved.data!.nonce).toEqual(wallet.nonce);
      expect(retrieved.data!.tag).toEqual(wallet.tag);
      expect(retrieved.data!.salt).toEqual(wallet.salt);
    });
  });
});
