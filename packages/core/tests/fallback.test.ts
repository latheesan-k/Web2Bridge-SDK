/**
 * Fallback module tests — covers generateEntropyFromPassword with all
 * algorithms (PBKDF2, Argon2id), error handling, and password validation.
 *
 * argon2-browser is mocked to avoid WASM dependency in Node tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHash = vi.fn();
vi.mock("argon2-browser", () => ({
  default: {
    hash: mockHash,
    ArgonType: { Argon2id: 2 },
  },
  hash: mockHash,
  ArgonType: { Argon2id: 2 },
}));

import { generateEntropyFromPassword, validatePasswordStrength, getPasswordStrengthScore } from "../src/crypto/fallback";

const STRONG_PASSWORD = "MyStr0ng!P@ssword2024";
const userId = "clerk:user_test123";

describe("generateEntropyFromPassword additional tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue({ hash: new Uint8Array(32).fill(0xab) });
  });

  it("returns error for unsupported fallback KDF algorithm", async () => {
    // @ts-expect-error — testing unsupported value
    const result = await generateEntropyFromPassword(userId, STRONG_PASSWORD, { algorithm: "scrypt" });
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("Unsupported fallback KDF algorithm");
  });

  it("returns WeakPasswordError for passwords below minimum length", async () => {
    const result = await generateEntropyFromPassword(userId, "short");
    expect(result.error).not.toBeNull();
    expect(result.error!.name).toBe("WeakPasswordError");
  });

  it("returns WeakPasswordError for empty password", async () => {
    const result = await generateEntropyFromPassword(userId, "");
    expect(result.error).not.toBeNull();
    expect(result.error!.name).toBe("WeakPasswordError");
  });

  it("succeeds with PBKDF2 algorithm", async () => {
    const result = await generateEntropyFromPassword(userId, STRONG_PASSWORD, { algorithm: "pbkdf2" });
    expect(result.error).toBeNull();
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data!.length).toBe(32);
  });

  it("succeeds with Argon2id algorithm (mocked)", async () => {
    const result = await generateEntropyFromPassword(userId, STRONG_PASSWORD, { algorithm: "argon2id" });
    expect(result.error).toBeNull();
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data!.length).toBe(32);
    expect(mockHash).toHaveBeenCalledTimes(1);
  });

  it("defaults to Argon2id when no algorithm specified", async () => {
    const result = await generateEntropyFromPassword(userId, STRONG_PASSWORD);
    expect(result.error).toBeNull();
    expect(mockHash).toHaveBeenCalledTimes(1);
  });

  it("returns DerivationError when Argon2id hash throws", async () => {
    mockHash.mockRejectedValue(new Error("WASM crashed"));

    const result = await generateEntropyFromPassword(userId, STRONG_PASSWORD, { algorithm: "argon2id" });
    expect(result.error).not.toBeNull();
    expect(result.error!.name).toBe("DerivationError");
  });

  it("PBKDF2 is deterministic for same inputs", async () => {
    const opts = { algorithm: "pbkdf2" as const };
    const result1 = await generateEntropyFromPassword(userId, STRONG_PASSWORD, opts);
    const result2 = await generateEntropyFromPassword(userId, STRONG_PASSWORD, opts);
    expect(result1.error).toBeNull();
    expect(result2.error).toBeNull();
    expect(Buffer.from(result1.data!).equals(Buffer.from(result2.data!))).toBe(true);
  });

  it("different passwords produce different entropy", async () => {
    const opts = { algorithm: "pbkdf2" as const };
    const result1 = await generateEntropyFromPassword(userId, STRONG_PASSWORD, opts);
    const result2 = await generateEntropyFromPassword(userId, "AnotherStr0ng!P@ss99", opts);
    expect(result1.error).toBeNull();
    expect(result2.error).toBeNull();
    expect(Buffer.from(result1.data!).equals(Buffer.from(result2.data!))).toBe(false);
  });

  it("different user IDs produce different entropy", async () => {
    const opts = { algorithm: "pbkdf2" as const };
    const result1 = await generateEntropyFromPassword("clerk:alice", STRONG_PASSWORD, opts);
    const result2 = await generateEntropyFromPassword("clerk:bob", STRONG_PASSWORD, opts);
    expect(result1.error).toBeNull();
    expect(result2.error).toBeNull();
    expect(Buffer.from(result1.data!).equals(Buffer.from(result2.data!))).toBe(false);
  });
});

describe("validatePasswordStrength edge cases", () => {
  it("rejects common dictionary passwords", () => {
    expect(validatePasswordStrength("password")).toBe(false);
    expect(validatePasswordStrength("12345678")).toBe(false);
    expect(validatePasswordStrength("qwerty12")).toBe(false);
  });

  it("accepts strong passwords with mixed character types", () => {
    expect(validatePasswordStrength("X9#kLm@pQ2&zW7")).toBe(true);
  });
});

describe("getPasswordStrengthScore edge cases", () => {
  it("returns 0 for trivially weak passwords", () => {
    expect(getPasswordStrengthScore("password")).toBeLessThan(2);
  });

  it("returns high score for strong random passwords", () => {
    expect(getPasswordStrengthScore("X9#kLm@pQ2&zW7!")).toBeGreaterThanOrEqual(3);
  });
});
