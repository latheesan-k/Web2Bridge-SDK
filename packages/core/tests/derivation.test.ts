import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  entropyToMnemonic,
  mnemonicToEntropy,
  verifyMnemonic,
  deriveAppId,
  buildHDPath,
  HD_PATH_TEMPLATE,
} from "../src/derivation";
import { isResultSuccess, isResultFailure } from "../src/auth/adapter";

// ─── entropyToMnemonic ─────────────────────────────────────────────────────────

describe("Derivation Module", () => {
  describe("entropyToMnemonic (Result<string[]>)", () => {
    it("converts 32 bytes of entropy to 24 words", async () => {
      const entropy = new Uint8Array(32).fill(0x01);
      const result = await entropyToMnemonic(entropy);
      expect(isResultSuccess(result)).toBe(true);
      expect(result.data).toHaveLength(24);
      expect(result.data!.every((w) => typeof w === "string" && w.length > 0)).toBe(true);
    });

    it("produces deterministic output for the same entropy", async () => {
      const entropy = new Uint8Array(32).fill(0x42);
      const r1 = await entropyToMnemonic(entropy);
      const r2 = await entropyToMnemonic(entropy);
      expect(r1.data).toEqual(r2.data);
    });

    it("produces different output for different entropy", async () => {
      const e1 = new Uint8Array(32).fill(0x01);
      const e2 = new Uint8Array(32).fill(0x02);
      const r1 = await entropyToMnemonic(e1);
      const r2 = await entropyToMnemonic(e2);
      expect(r1.data).not.toEqual(r2.data);
    });

    it("works with 16 bytes entropy (12 words)", async () => {
      const entropy = new Uint8Array(16).fill(0xaa);
      const result = await entropyToMnemonic(entropy);
      expect(isResultSuccess(result)).toBe(true);
      expect(result.data).toHaveLength(12);
    });

    it("returns DerivationError for invalid entropy size", async () => {
      const entropy = new Uint8Array(7).fill(0x01); // not a multiple of 4
      const result = await entropyToMnemonic(entropy);
      expect(isResultFailure(result)).toBe(true);
    });
  });

  // ─── mnemonicToEntropy ───────────────────────────────────────────────────────

  describe("mnemonicToEntropy", () => {
    it("converts mnemonic back to original entropy", async () => {
      const original = new Uint8Array(32).fill(0x01);
      const result = await entropyToMnemonic(original);
      expect(isResultSuccess(result)).toBe(true);
      const recovered = await mnemonicToEntropy(result.data!);
      expect(recovered).toEqual(original);
    });

    it("throws on an invalid word", async () => {
      await expect(mnemonicToEntropy(["abandon", "ability", "xxxxx"])).rejects.toThrow();
    });

    it("throws on wrong checksum", async () => {
      const entropy = new Uint8Array(32).fill(0x01);
      const result = await entropyToMnemonic(entropy);
      const tampered = [...result.data!];
      tampered[0] = tampered[0] === "abandon" ? "ability" : "abandon";
      await expect(mnemonicToEntropy(tampered)).rejects.toThrow("Invalid checksum");
    });
  });

  // ─── verifyMnemonic ──────────────────────────────────────────────────────────

  describe("verifyMnemonic", () => {
    it("returns true for a valid mnemonic", async () => {
      const entropy = new Uint8Array(32).fill(0x01);
      const result = await entropyToMnemonic(entropy);
      expect(await verifyMnemonic(result.data!)).toBe(true);
    });

    it("returns false for an invalid mnemonic", async () => {
      expect(await verifyMnemonic(["abandon", "xxxxx", "invalid"])).toBe(false);
    });
  });

  // ─── deriveAppId ─────────────────────────────────────────────────────────────

  describe("deriveAppId", () => {
    it("produces a consistent AppID for the same domain", async () => {
      expect(await deriveAppId("example.com")).toEqual(await deriveAppId("example.com"));
    });

    it("produces a different AppID for different domains", async () => {
      expect(await deriveAppId("example.com")).not.toEqual(
        await deriveAppId("example.org"),
      );
    });

    it("produces an AppID within the 31-bit BIP32 range", async () => {
      const appId = await deriveAppId("example.com");
      expect(appId).toBeGreaterThanOrEqual(0);
      expect(appId).toBeLessThanOrEqual(0x7fffffff);
    });

    it("is case-insensitive (domain is lowercased before hashing)", async () => {
      expect(await deriveAppId("EXAMPLE.COM")).toEqual(await deriveAppId("example.com"));
    });
  });

  // ─── buildHDPath ─────────────────────────────────────────────────────────────

  describe("buildHDPath", () => {
    it("uses the correct Cardano path template", () => {
      expect(HD_PATH_TEMPLATE).toBe("m/1852'/1815'/{appId}'/0/0");
    });

    it("builds the HD path for AppID = 0", () => {
      expect(buildHDPath(0)).toBe("m/1852'/1815'/0'/0/0");
    });

    it("builds the HD path for a large AppID", () => {
      expect(buildHDPath(123456)).toBe("m/1852'/1815'/123456'/0/0");
    });

    it("throws for AppID out of range", () => {
      expect(() => buildHDPath(-1)).toThrow();
      expect(() => buildHDPath(0x80000000)).toThrow();
    });
  });

  // ─── Round-trip determinism ──────────────────────────────────────────────────

  describe("Round-trip determinism", () => {
    it("maintains consistency across multiple entropy ↔ mnemonic conversions", async () => {
      const entropy = new Uint8Array(32).fill(0xde);
      const r1 = await entropyToMnemonic(entropy);
      const entropy2 = await mnemonicToEntropy(r1.data!);
      const r2 = await entropyToMnemonic(entropy2);
      expect(r1.data).toEqual(r2.data);
    });
  });

  // ─── Property-based: AppID uniqueness ────────────────────────────────────────

  describe("Property-based: AppID uniqueness (fast-check)", () => {
    it("different domain strings produce different AppIDs with negligible collision probability", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-z0-9.-]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-z0-9.-]+$/.test(s)),
          async (domain1, domain2) => {
            if (domain1 === domain2) return true;
            const id1 = await deriveAppId(domain1);
            const id2 = await deriveAppId(domain2);
            // Collisions are statistically negligible with SHA-256; this catches bugs
            return id1 !== id2 || domain1 === domain2;
          },
        ),
        { numRuns: 30 },
      );
    });

    it("all derived AppIDs are in the valid BIP32 hardened index range", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (domain) => {
            const appId = await deriveAppId(domain);
            return appId >= 0 && appId <= 0x7fffffff;
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
