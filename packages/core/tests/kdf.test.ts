/**
 * KDF tests — covers generateEntropy with all algorithms (HKDF, PBKDF2,
 * Argon2id), edge cases, custom parameters, and error handling.
 *
 * argon2-browser is mocked because it requires browser WASM which is
 * unavailable in the Node test environment. The mock validates that the
 * correct parameters are forwarded and both return-value paths
 * (Uint8Array hash vs hex string) are handled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock argon2-browser BEFORE importing kdf.ts so the dynamic import resolves to our mock
const mockHash = vi.fn();
vi.mock("argon2-browser", () => ({
  default: {
    hash: mockHash,
    ArgonType: { Argon2id: 2 },
  },
  hash: mockHash,
  ArgonType: { Argon2id: 2 },
}));

import {
  generateEntropy,
  deriveWithHKDF,
  deriveWithPBKDF2,
  deriveWithArgon2id,
} from "../src/crypto/kdf";

describe("generateEntropy", () => {
  const userId = "clerk:user_test123";
  const prfSecret = new Uint8Array(32).fill(42);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to HKDF when no options provided", async () => {
    const result = await generateEntropy(userId, prfSecret);
    expect(result.error).toBeNull();
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data!.length).toBe(32);
  });

  it("uses HKDF when explicitly specified", async () => {
    const result = await generateEntropy(userId, prfSecret, { algorithm: "hkdf" });
    expect(result.error).toBeNull();

    const direct = await deriveWithHKDF(prfSecret, userId);
    expect(Buffer.from(result.data!).equals(Buffer.from(direct))).toBe(true);
  });

  it("uses PBKDF2 when specified", async () => {
    const result = await generateEntropy(userId, prfSecret, { algorithm: "pbkdf2" });
    expect(result.error).toBeNull();

    const direct = await deriveWithPBKDF2(prfSecret, userId);
    expect(Buffer.from(result.data!).equals(Buffer.from(direct))).toBe(true);
  });

  it("uses Argon2id when specified", async () => {
    const fakeHash = new Uint8Array(32).fill(0xab);
    mockHash.mockResolvedValue({ hash: fakeHash });

    const result = await generateEntropy(userId, prfSecret, { algorithm: "argon2id" });
    expect(result.error).toBeNull();
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data!.length).toBe(32);
    expect(mockHash).toHaveBeenCalledTimes(1);
  });

  it("returns error for unsupported algorithm", async () => {
    // @ts-expect-error — testing unsupported value
    const result = await generateEntropy(userId, prfSecret, { algorithm: "scrypt" });
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("Unsupported KDF algorithm");
  });

  it("HKDF and PBKDF2 produce different outputs for same inputs", async () => {
    const hkdfResult = await generateEntropy(userId, prfSecret, { algorithm: "hkdf" });
    const pbkdf2Result = await generateEntropy(userId, prfSecret, { algorithm: "pbkdf2" });

    expect(hkdfResult.error).toBeNull();
    expect(pbkdf2Result.error).toBeNull();
    expect(Buffer.from(hkdfResult.data!).equals(Buffer.from(pbkdf2Result.data!))).toBe(false);
  });

  it("wraps Argon2id errors as DerivationError Result", async () => {
    mockHash.mockRejectedValue(new Error("WASM init failed"));

    const result = await generateEntropy(userId, prfSecret, { algorithm: "argon2id" });
    expect(result.error).not.toBeNull();
    expect(result.error!.name).toBe("DerivationError");
  });
});

describe("deriveWithArgon2id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Uint8Array hash when argon2 returns Uint8Array", async () => {
    const expected = new Uint8Array(32).fill(0xcd);
    mockHash.mockResolvedValue({ hash: expected });

    const result = await deriveWithArgon2id(new Uint8Array(32).fill(1), "salt");
    expect(result).toBe(expected);
  });

  it("parses hex string when argon2 returns hashHex", async () => {
    mockHash.mockResolvedValue({ hash: "not-a-uint8array", hashHex: "aabbccdd" });

    const result = await deriveWithArgon2id(new Uint8Array(32).fill(1), "salt");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
  });

  it("forwards correct default parameters to argon2.hash", async () => {
    mockHash.mockResolvedValue({ hash: new Uint8Array(32) });

    const ikm = new Uint8Array(32).fill(5);
    await deriveWithArgon2id(ikm, "my-salt");

    expect(mockHash).toHaveBeenCalledWith({
      pass: ikm,
      salt: "my-salt",
      mem: 65_536,
      iter: 3,
      parallelism: 1,
      hashLen: 32,
      type: 2,
    });
  });

  it("forwards custom parameters to argon2.hash", async () => {
    mockHash.mockResolvedValue({ hash: new Uint8Array(64) });

    const ikm = new Uint8Array(16).fill(9);
    await deriveWithArgon2id(ikm, "salt", 32_768, 5, 2, 64);

    expect(mockHash).toHaveBeenCalledWith({
      pass: ikm,
      salt: "salt",
      mem: 32_768,
      iter: 5,
      parallelism: 2,
      hashLen: 64,
      type: 2,
    });
  });

  it("is deterministic (same inputs → same mock output)", async () => {
    const hash = new Uint8Array(32).fill(0x42);
    mockHash.mockResolvedValue({ hash });

    const r1 = await deriveWithArgon2id(new Uint8Array(32).fill(1), "salt");
    const r2 = await deriveWithArgon2id(new Uint8Array(32).fill(1), "salt");
    expect(Buffer.from(r1).equals(Buffer.from(r2))).toBe(true);
  });
});

describe("deriveWithHKDF edge cases", () => {
  it("supports custom info string", async () => {
    const key = new Uint8Array(32).fill(1);
    const result1 = await deriveWithHKDF(key, "salt", "info-a");
    const result2 = await deriveWithHKDF(key, "salt", "info-b");
    expect(Buffer.from(result1).equals(Buffer.from(result2))).toBe(false);
  });

  it("supports custom output length", async () => {
    const key = new Uint8Array(32).fill(1);
    const result = await deriveWithHKDF(key, "salt", "web2bridge-v1", 64);
    expect(result.length).toBe(64);
  });
});

describe("deriveWithPBKDF2 edge cases", () => {
  it("supports custom iteration count", async () => {
    const key = new Uint8Array(32).fill(1);
    const result1 = await deriveWithPBKDF2(key, "salt", 1000);
    const result2 = await deriveWithPBKDF2(key, "salt", 2000);
    expect(Buffer.from(result1).equals(Buffer.from(result2))).toBe(false);
  });

  it("supports custom output length", async () => {
    const key = new Uint8Array(32).fill(1);
    const result = await deriveWithPBKDF2(key, "salt", 1000, 64);
    expect(result.length).toBe(64);
  });
});
