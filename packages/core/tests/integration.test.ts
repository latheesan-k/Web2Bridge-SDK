import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { generateEntropy } from "../src/crypto/kdf";
import { generateEntropyFromPassword } from "../src/crypto/fallback";
import {
  entropyToMnemonic,
  mnemonicToEntropy,
  deriveAppId,
  buildHDPath,
} from "../src/derivation";
import { buildNamespacedUserId, isResultSuccess } from "../src/auth/adapter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function prfEntropy(userId: string, prfBytes: number[]): Promise<Uint8Array> {
  const prfSecret = new Uint8Array(prfBytes);
  const result = await generateEntropy(userId, prfSecret);
  if (!isResultSuccess(result)) throw new Error("generateEntropy failed: " + result.error?.message);
  return result.data!;
}

async function pwdEntropy(userId: string, password: string): Promise<Uint8Array> {
  const result = await generateEntropyFromPassword(userId, password, { algorithm: "pbkdf2" });
  if (!isResultSuccess(result)) throw new Error("generateEntropyFromPassword failed: " + result.error?.message);
  return result.data!;
}

async function toMnemonic(entropy: Uint8Array): Promise<string[]> {
  const result = await entropyToMnemonic(entropy);
  if (!isResultSuccess(result)) throw new Error("entropyToMnemonic failed: " + result.error?.message);
  return result.data!;
}

// ─── PRF Path ─────────────────────────────────────────────────────────────────

describe("Integration Tests: Full Flow", () => {
  describe("Full PRF Path Flow", () => {
    it("completes a full entropy → mnemonic → entropy round-trip", async () => {
      const userId = "clerk:user_test123";
      const entropy = await prfEntropy(userId, Array(32).fill(0xab));
      expect(entropy).toHaveLength(32);

      const mnemonic = await toMnemonic(entropy);
      expect(mnemonic).toHaveLength(24);

      const recovered = await mnemonicToEntropy(mnemonic);
      expect(recovered).toEqual(entropy);
    });

    it("derives different wallets for different domains (different AppIDs)", async () => {
      const appId1 = await deriveAppId("domain-a.example.com");
      const appId2 = await deriveAppId("domain-b.example.com");
      expect(buildHDPath(appId1)).not.toEqual(buildHDPath(appId2));
    });

    it("produces deterministic output for the same inputs", async () => {
      const userId = "clerk:user_deterministic";
      const e1 = await prfEntropy(userId, Array(32).fill(0x11));
      const e2 = await prfEntropy(userId, Array(32).fill(0x11));
      expect(e1).toEqual(e2);

      const m1 = await toMnemonic(e1);
      const m2 = await toMnemonic(e2);
      expect(m1).toEqual(m2);
    });

    it("produces different output for different namespacedUserIds", async () => {
      const e1 = await prfEntropy("clerk:user1", Array(32).fill(0x22));
      const e2 = await prfEntropy("clerk:user2", Array(32).fill(0x22));
      expect(e1).not.toEqual(e2);
    });
  });

  // ─── Fallback (Password) Path ─────────────────────────────────────────────

  describe("Full Fallback Path Flow", () => {
    it("completes a full password → entropy → mnemonic flow", async () => {
      const userId = "clerk:user_fallback";
      const entropy = await pwdEntropy(userId, "securePassword123!");
      expect(entropy).toHaveLength(32);

      const mnemonic = await toMnemonic(entropy);
      expect(mnemonic).toHaveLength(24);

      const recovered = await mnemonicToEntropy(mnemonic);
      expect(recovered).toEqual(entropy);
    });

    it("produces different mnemonics for different passwords", async () => {
      const userId = "clerk:user_test";
      const e1 = await pwdEntropy(userId, "MyStr0ng!Pass1");
      const e2 = await pwdEntropy(userId, "MyStr0ng!Pass2");
      expect(e1).not.toEqual(e2);
      expect((await toMnemonic(e1)).join(" ")).not.toEqual((await toMnemonic(e2)).join(" "));
    });

    it("produces deterministic output for the same password", async () => {
      const userId = "clerk:user_samepwd";
      const e1 = await pwdEntropy(userId, "samePassword123!");
      const e2 = await pwdEntropy(userId, "samePassword123!");
      expect(e1).toEqual(e2);
    });

    it("produces different output for different users with same password", async () => {
      const password = "samePassword123!";
      const e1 = await pwdEntropy("clerk:user1", password);
      const e2 = await pwdEntropy("clerk:user2", password);
      expect(e1).not.toEqual(e2);
    });
  });

  // ─── Path Isolation ───────────────────────────────────────────────────────

  describe("Path Isolation: PRF vs Fallback", () => {
    it("PRF and fallback paths never produce the same entropy for equivalent inputs", async () => {
      const userId = "clerk:user_isolation";
      const prfEnt = await prfEntropy(userId, Array(32).fill(0x33));
      const pwdEnt = await pwdEntropy(userId, "somepassword123!");
      expect(prfEnt).not.toEqual(pwdEnt);
      expect((await toMnemonic(prfEnt)).join(" ")).not.toEqual(
        (await toMnemonic(pwdEnt)).join(" "),
      );
    });
  });

  // ─── Provider Isolation ───────────────────────────────────────────────────

  describe("Provider Isolation", () => {
    it("same raw userId with different providers produces different wallets", async () => {
      const rawUserId = "user_shared123";
      const prfBytes = Array(32).fill(0x44);

      const nsClerk = buildNamespacedUserId("clerk", rawUserId);
      const nsAuth0 = buildNamespacedUserId("auth0", rawUserId);

      expect(nsClerk).not.toEqual(nsAuth0);

      const eClerk = await prfEntropy(nsClerk, prfBytes);
      const eAuth0 = await prfEntropy(nsAuth0, prfBytes);

      expect(eClerk).not.toEqual(eAuth0);
      expect((await toMnemonic(eClerk)).join(" ")).not.toEqual(
        (await toMnemonic(eAuth0)).join(" "),
      );
    });
  });

  // ─── AppID Uniqueness ─────────────────────────────────────────────────────

  describe("AppID Uniqueness", () => {
    it("five different domain strings produce five unique AppIDs", async () => {
      const domains = [
        "example.com",
        "test.app",
        "web2bridge.io",
        "subdomain.example.org",
        "another-domain.io",
      ];
      const appIds = await Promise.all(domains.map(deriveAppId));
      expect(new Set(appIds).size).toBe(domains.length);
    });

    it("all AppIDs are within the valid BIP32 hardened range", async () => {
      const domains = ["example.com", "test.app", "web2bridge.io", "sub.example.org"];
      for (const domain of domains) {
        const id = await deriveAppId(domain);
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThanOrEqual(0x7fffffff);
      }
    });

    it("produces a deterministic AppID for the same domain", async () => {
      const domain = "deterministic.example.com";
      expect(await deriveAppId(domain)).toBe(await deriveAppId(domain));
    });
  });

  // ─── HD Path Construction ─────────────────────────────────────────────────

  describe("HD Path Construction", () => {
    it("builds the correct Cardano HD path", () => {
      const appId = 123456;
      expect(buildHDPath(appId)).toBe(`m/1852'/1815'/${appId}'/0/0`);
    });

    it("produces different paths for different AppIDs", () => {
      expect(buildHDPath(100)).not.toEqual(buildHDPath(200));
    });
  });

  // ─── Mnemonic ↔ Entropy Round-trip ───────────────────────────────────────

  describe("Mnemonic ↔ Entropy Round-trip", () => {
    it("entropyToMnemonic and mnemonicToEntropy are inverse operations", async () => {
      const entropy = new Uint8Array(32).fill(0x55);
      const mnemonic = await toMnemonic(entropy);
      expect(await mnemonicToEntropy(mnemonic)).toEqual(entropy);
    });

    it("handles 16-byte entropy (12 words)", async () => {
      const entropy = new Uint8Array(16).fill(0x66);
      const mnemonic = await toMnemonic(entropy);
      expect(mnemonic).toHaveLength(12);
      expect(await mnemonicToEntropy(mnemonic)).toEqual(entropy);
    });
  });

  // ─── KDF Algorithm Substitutability ──────────────────────────────────────

  describe("KDF Algorithm Substitutability", () => {
    it("HKDF and PBKDF2 produce different but valid 32-byte outputs", async () => {
      const userId = "test:user";
      const prfSecret = new Uint8Array(32).fill(0x42);

      const hkdf = await generateEntropy(userId, prfSecret, { algorithm: "hkdf" });
      const pbkdf2 = await generateEntropy(userId, prfSecret, { algorithm: "pbkdf2" });

      expect(isResultSuccess(hkdf)).toBe(true);
      expect(isResultSuccess(pbkdf2)).toBe(true);
      expect(hkdf.data).not.toEqual(pbkdf2.data);
      expect(hkdf.data).toHaveLength(32);
      expect(pbkdf2.data).toHaveLength(32);
    });
  });

  // ─── Property-Based: Full Path Determinism (fast-check) ──────────────────

  describe("Property-based: PRF path determinism (fast-check)", () => {
    it("same (userId, prfSecret) always produces the same entropy", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 30 }).filter((s) => /^[a-z0-9]+$/.test(s)),
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          async (rawId, prfBytes) => {
            const userId = `clerk:${rawId}`;
            const e1 = await generateEntropy(userId, prfBytes, { algorithm: "hkdf" });
            const e2 = await generateEntropy(userId, prfBytes, { algorithm: "hkdf" });
            if (!isResultSuccess(e1) || !isResultSuccess(e2)) return true;
            return e1.data!.length === e2.data!.length && e1.data!.every((b, i) => b === e2.data![i]);
          },
        ),
        { numRuns: 15 },
      );
    });
  });

  // ─── Property-Based: Fallback Path Determinism (fast-check) ────────────────
  // PRD §10: "same (namespacedUserId, password) always produces the same mnemonic
  // on the fallback path"

  describe("Property-based: Fallback path determinism (fast-check)", () => {
    it("same (userId, password) always produces the same entropy", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9]+$/.test(s)),
          async (rawId) => {
            const userId = `clerk:${rawId}`;
            const password = "MyStr0ng!Pass123";
            const e1 = await generateEntropyFromPassword(userId, password, { algorithm: "pbkdf2" });
            const e2 = await generateEntropyFromPassword(userId, password, { algorithm: "pbkdf2" });
            if (!isResultSuccess(e1) || !isResultSuccess(e2)) return true;
            return e1.data!.length === e2.data!.length && e1.data!.every((b, i) => b === e2.data![i]);
          },
        ),
        { numRuns: 10 },
      );
    });

    it("different passwords produce different entropy for the same user", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9]+$/.test(s)),
          async (rawId) => {
            const userId = `clerk:${rawId}`;
            const e1 = await generateEntropyFromPassword(userId, "MyStr0ng!PassA1", { algorithm: "pbkdf2" });
            const e2 = await generateEntropyFromPassword(userId, "MyStr0ng!PassB2", { algorithm: "pbkdf2" });
            if (!isResultSuccess(e1) || !isResultSuccess(e2)) return true;
            return !e1.data!.every((b, i) => b === e2.data![i]);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  // ─── Property-Based: Path Isolation PRF vs Fallback (fast-check) ───────────
  // PRD §10: "the PRF and fallback paths never produce the same mnemonic for
  // equivalent inputs"

  describe("Property-based: Path isolation PRF vs Fallback (fast-check)", () => {
    it("PRF and fallback paths produce different entropy for the same userId", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9]+$/.test(s)),
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          async (rawId, prfBytes) => {
            const userId = `clerk:${rawId}`;
            const prfResult = await generateEntropy(userId, prfBytes, { algorithm: "hkdf" });
            const pwdResult = await generateEntropyFromPassword(userId, "MyStr0ng!Pass123", { algorithm: "pbkdf2" });
            if (!isResultSuccess(prfResult) || !isResultSuccess(pwdResult)) return true;
            return !prfResult.data!.every((b, i) => b === pwdResult.data![i]);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  // ─── Property-Based: KDF Algorithm Substitutability (fast-check) ───────────
  // PRD §10: "all KDF options satisfy the same determinism and isolation
  // properties within each path"

  describe("Property-based: KDF algorithm substitutability (fast-check)", () => {
    it("all KDF algorithms are deterministic for the same inputs", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9]+$/.test(s)),
          async (prfBytes, rawId) => {
            const userId = `clerk:${rawId}`;
            for (const algo of ["hkdf", "pbkdf2"] as const) {
              const e1 = await generateEntropy(userId, prfBytes, { algorithm: algo });
              const e2 = await generateEntropy(userId, prfBytes, { algorithm: algo });
              if (!isResultSuccess(e1) || !isResultSuccess(e2)) continue;
              if (!e1.data!.every((b, i) => b === e2.data![i])) return false;
            }
            return true;
          },
        ),
        { numRuns: 10 },
      );
    });

    it("different KDF algorithms produce different outputs for the same inputs", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9]+$/.test(s)),
          async (prfBytes, rawId) => {
            const userId = `clerk:${rawId}`;
            const hkdf = await generateEntropy(userId, prfBytes, { algorithm: "hkdf" });
            const pbkdf2 = await generateEntropy(userId, prfBytes, { algorithm: "pbkdf2" });
            if (!isResultSuccess(hkdf) || !isResultSuccess(pbkdf2)) return true;
            return !hkdf.data!.every((b, i) => b === pbkdf2.data![i]);
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});
