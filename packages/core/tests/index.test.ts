import { describe, it, expect } from "vitest";

/**
 * Test that verifies all public exports from the core package are accessible.
 * This ensures the index.ts file properly re-exports all modules.
 */
describe("Core Package Index Exports", () => {
  it("exports all public modules", async () => {
    const exports = await import("../src/index");
    
    // Auth adapter exports
    expect(exports.ok).toBeDefined();
    expect(exports.err).toBeDefined();
    expect(exports.buildNamespacedUserId).toBeDefined();
    expect(exports.isResultSuccess).toBeDefined();
    expect(exports.isResultFailure).toBeDefined();
    
    // Crypto exports
    expect(exports.deriveWithHKDF).toBeDefined();
    expect(exports.deriveWithPBKDF2).toBeDefined();
    expect(exports.deriveWithArgon2id).toBeDefined();
    expect(exports.generateEntropy).toBeDefined();
    expect(exports.generateEntropyFromPassword).toBeDefined();
    expect(exports.validatePasswordStrength).toBeDefined();
    expect(exports.getPasswordStrengthScore).toBeDefined();
    expect(exports.verifyPasswordEntropy).toBeDefined();
    expect(exports.detectPRFSupport).toBeDefined();
    expect(exports.registerPRFCredential).toBeDefined();
    expect(exports.authenticateWithPRF).toBeDefined();
    expect(exports.getPRFSecret).toBeDefined();
    
    // Derivation exports
    expect(exports.deriveAppId).toBeDefined();
    expect(exports.entropyToMnemonic).toBeDefined();
    
    // Wallet exports
    expect(exports.createWallet).toBeDefined();
    
    // Error exports
    expect(exports.Web2BridgeError).toBeDefined();
    expect(exports.PRFNotSupportedError).toBeDefined();
    expect(exports.PasskeyRegistrationError).toBeDefined();
    expect(exports.PasskeyAuthError).toBeDefined();
    expect(exports.AuthAdapterError).toBeDefined();
    expect(exports.DerivationError).toBeDefined();
    expect(exports.WalletError).toBeDefined();
    expect(exports.ExportVerificationError).toBeDefined();
    expect(exports.WeakPasswordError).toBeDefined();
    expect(exports.PasswordAuthError).toBeDefined();
    expect(exports.EntropyPathMismatchError).toBeDefined();
    
    // Config exports
    expect(exports.getDefaultConfig).toBeDefined();
  });

  it("exports are callable functions", async () => {
    const exports = await import("../src/index");
    
    // Test that key functions are callable
    expect(typeof exports.ok).toBe("function");
    expect(typeof exports.err).toBe("function");
    expect(typeof exports.buildNamespacedUserId).toBe("function");
    expect(typeof exports.getDefaultConfig).toBe("function");
    expect(typeof exports.validatePasswordStrength).toBe("function");
  });

  it("ok and err return Result objects", async () => {
    const { ok, err } = await import("../src/index");
    
    const success = ok("data");
    expect(success.data).toBe("data");
    expect(success.error).toBeNull();
    
    const failure = err(new Error("test"));
    expect(failure.data).toBeNull();
    expect(failure.error).toBeInstanceOf(Error);
  });
});
