/**
 * Comprehensive Web2BridgeProvider tests — covers the login, logout,
 * and exportRecoveryPhrase flows with mocked core dependencies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import type { AuthAdapter, Result } from "@web2bridge/core";
import {
  ok, err, AuthAdapterError, PRFNotSupportedError,
  ExportVerificationError, EntropyPathMismatchError,
  DerivationError,
} from "@web2bridge/core";
import { Web2BridgeProvider, useWeb2Bridge } from "../src/useWeb2Bridge";
import type { Web2BridgeConfig } from "../src/useWeb2Bridge";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock @web2bridge/core crypto and derivation modules
vi.mock("@web2bridge/core", async () => {
  const actual = await vi.importActual<typeof import("@web2bridge/core")>("@web2bridge/core");
  return {
    ...actual,
    isPRFSupported: vi.fn().mockResolvedValue(false),
    getPRFSecret: vi.fn(),
    authenticateWithPRF: vi.fn(),
    generateEntropy: vi.fn(),
    generateEntropyFromPassword: vi.fn().mockResolvedValue(
      actual.ok(new Uint8Array(32).fill(42))
    ),
    entropyToMnemonic: vi.fn().mockReturnValue(
      actual.ok(Array(24).fill("abandon"))
    ),
    createWallet: vi.fn().mockReturnValue(
      actual.ok({
        getUsedAddresses: vi.fn().mockResolvedValue({ data: ["addr_test1"], error: null }),
        getChangeAddress: vi.fn().mockResolvedValue({ data: "addr_test1", error: null }),
        getRewardAddresses: vi.fn().mockResolvedValue({ data: ["stake_test1"], error: null }),
        getBalance: vi.fn().mockResolvedValue({ data: [], error: null }),
        getLovelace: vi.fn().mockResolvedValue({ data: "0", error: null }),
        getAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIdAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIds: vi.fn().mockResolvedValue({ data: [], error: null }),
        getUtxos: vi.fn().mockResolvedValue({ data: [], error: null }),
        getCollateral: vi.fn().mockResolvedValue({ data: [], error: null }),
        signTx: vi.fn().mockResolvedValue({ data: "signed", error: null }),
        signTxs: vi.fn().mockResolvedValue({ data: ["signed"], error: null }),
        signData: vi.fn().mockResolvedValue({ data: "signature", error: null }),
        submitTx: vi.fn().mockResolvedValue({ data: "txhash", error: null }),
        getNetworkId: vi.fn().mockResolvedValue({ data: 0, error: null }),
      })
    ),
    deriveAppId: vi.fn().mockResolvedValue(12345),
    buildNamespacedUserId: vi.fn().mockReturnValue("clerk:user_test123"),
    getDefaultConfig: vi.fn().mockImplementation((config: Web2BridgeConfig) => ({
      appDomain: config.appDomain,
      networkId: config.networkId ?? 0,
      kdf: config.kdf ?? "hkdf",
      fallback: {
        enabled: config.fallback?.enabled ?? true,
        kdf: config.fallback?.kdf ?? "pbkdf2",
      },
    })),
  };
});

// Import mocked modules for assertions
import {
  isPRFSupported,
  generateEntropyFromPassword,
  entropyToMnemonic,
  createWallet,
  authenticateWithPRF,
} from "@web2bridge/core";

// Helper to flush the async PRF detection effect that runs on mount
async function flushPrfDetection() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockAdapter(overrides?: Partial<AuthAdapter>): AuthAdapter {
  return {
    providerId: "clerk",
    login: vi.fn().mockResolvedValue(ok(undefined)),
    logout: vi.fn().mockResolvedValue(ok(undefined)),
    getUserId: vi.fn().mockResolvedValue(ok("user_test123")),
    isAuthenticated: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

const defaultConfig: Web2BridgeConfig = {
  appDomain: "test.example.com",
  networkId: 0,
  kdf: "hkdf",
  fallback: { enabled: true, kdf: "pbkdf2" },
};

function wrapper(adapter: AuthAdapter, config = defaultConfig) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Web2BridgeProvider adapter={adapter} config={config}>
        {children}
      </Web2BridgeProvider>
    );
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Web2BridgeProvider — hardware detection at init", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes prfSupported=false and requiresPassword=true when PRF is unavailable", async () => {
    vi.mocked(isPRFSupported).mockResolvedValue(false);
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await flushPrfDetection();

    expect(result.current.prfSupported).toBe(false);
    expect(result.current.requiresPassword).toBe(true);
  });

  it("exposes prfSupported=true and requiresPassword=false when PRF is available", async () => {
    vi.mocked(isPRFSupported).mockResolvedValue(true);
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await flushPrfDetection();

    expect(result.current.prfSupported).toBe(true);
    expect(result.current.requiresPassword).toBe(false);
  });

  it("exposes requiresPassword=false when PRF unsupported but fallback disabled", async () => {
    vi.mocked(isPRFSupported).mockResolvedValue(false);
    const adapter = createMockAdapter();
    const config: Web2BridgeConfig = {
      ...defaultConfig,
      fallback: { enabled: false },
    };

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter, config),
    });

    await flushPrfDetection();

    expect(result.current.prfSupported).toBe(false);
    expect(result.current.requiresPassword).toBe(false);
  });
});

describe("Web2BridgeProvider — login flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPRFSupported).mockResolvedValue(false);
    vi.mocked(generateEntropyFromPassword).mockResolvedValue(
      ok(new Uint8Array(32).fill(42))
    );
    vi.mocked(entropyToMnemonic).mockReturnValue(
      ok(Array(24).fill("abandon"))
    );
  });

  it("completes password fallback login successfully", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.wallet).toBeNull();

    await act(async () => {
      const loginResult = await result.current.login({ password: "MyStr0ng!P@ss2024" });
      expect(loginResult.error).toBeNull();
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.wallet).not.toBeNull();
    expect(result.current.entropyPath).toBe("password");
  });

  it("returns error when adapter login fails", async () => {
    const adapter = createMockAdapter({
      login: vi.fn().mockResolvedValue(err(new AuthAdapterError("Login failed"))),
    });

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login();
      expect(loginResult.error).not.toBeNull();
      expect(loginResult.error!.message).toBe("Login failed");
    });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it("returns error when getUserId fails", async () => {
    const adapter = createMockAdapter({
      getUserId: vi.fn().mockResolvedValue(err(new AuthAdapterError("No user"))),
    });

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login();
      expect(loginResult.error).not.toBeNull();
    });
  });

  it("requests password when PRF unavailable and no password provided", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login();
      expect(loginResult.error).not.toBeNull();
      expect(loginResult.error!.message).toContain("Password required");
    });
  });

  it("returns PRFNotSupportedError when fallback is disabled and PRF unavailable", async () => {
    const adapter = createMockAdapter();
    const config: Web2BridgeConfig = {
      ...defaultConfig,
      fallback: { enabled: false },
    };

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter, config),
    });

    await act(async () => {
      const loginResult = await result.current.login();
      expect(loginResult.error).not.toBeNull();
    });
  });

  it("returns error when generateEntropyFromPassword fails", async () => {
    vi.mocked(generateEntropyFromPassword).mockResolvedValue(
      err(new DerivationError("KDF failed"))
    );

    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login({ password: "MyStr0ng!P@ss2024" });
      expect(loginResult.error).not.toBeNull();
      expect(loginResult.error!.message).toBe("KDF failed");
    });
  });

  it("returns error when entropyToMnemonic fails", async () => {
    vi.mocked(entropyToMnemonic).mockReturnValue(
      err(new DerivationError("Mnemonic generation failed"))
    );

    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login({ password: "MyStr0ng!P@ss2024" });
      expect(loginResult.error).not.toBeNull();
    });
  });

  it("returns error when createWallet fails", async () => {
    vi.mocked(createWallet).mockReturnValue(
      // @ts-expect-error — mock error result
      { data: null, error: new DerivationError("Wallet creation failed") }
    );

    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login({ password: "MyStr0ng!P@ss2024" });
      expect(loginResult.error).not.toBeNull();
    });

    // Restore
    vi.mocked(createWallet).mockReturnValue(
      ok({
        getUsedAddresses: vi.fn().mockResolvedValue({ data: ["addr_test1"], error: null }),
        getChangeAddress: vi.fn().mockResolvedValue({ data: "addr_test1", error: null }),
        getRewardAddresses: vi.fn().mockResolvedValue({ data: ["stake_test1"], error: null }),
        getBalance: vi.fn().mockResolvedValue({ data: [], error: null }),
        getLovelace: vi.fn().mockResolvedValue({ data: "0", error: null }),
        getAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIdAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIds: vi.fn().mockResolvedValue({ data: [], error: null }),
        getUtxos: vi.fn().mockResolvedValue({ data: [], error: null }),
        getCollateral: vi.fn().mockResolvedValue({ data: [], error: null }),
        signTx: vi.fn().mockResolvedValue({ data: "signed", error: null }),
        signTxs: vi.fn().mockResolvedValue({ data: ["signed"], error: null }),
        signData: vi.fn().mockResolvedValue({ data: "signature", error: null }),
        submitTx: vi.fn().mockResolvedValue({ data: "txhash", error: null }),
        getNetworkId: vi.fn().mockResolvedValue({ data: 0, error: null }),
      } as any)
    );
  });

  it("detects entropy path mismatch (PRD §2.4)", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login({
        password: "MyStr0ng!P@ss2024",
        expectedEntropyPath: "prf",
      });
      expect(loginResult.error).not.toBeNull();
      expect(loginResult.error!.name).toBe("EntropyPathMismatchError");
    });
  });
});

describe("Web2BridgeProvider — logout flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPRFSupported).mockResolvedValue(false);
    vi.mocked(generateEntropyFromPassword).mockResolvedValue(
      ok(new Uint8Array(32).fill(42))
    );
    vi.mocked(entropyToMnemonic).mockReturnValue(
      ok(Array(24).fill("abandon"))
    );
    vi.mocked(createWallet).mockReturnValue(
      ok({
        getUsedAddresses: vi.fn().mockResolvedValue({ data: ["addr_test1"], error: null }),
        getChangeAddress: vi.fn().mockResolvedValue({ data: "addr_test1", error: null }),
        getRewardAddresses: vi.fn().mockResolvedValue({ data: ["stake_test1"], error: null }),
        getBalance: vi.fn().mockResolvedValue({ data: [], error: null }),
        getLovelace: vi.fn().mockResolvedValue({ data: "0", error: null }),
        getAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIdAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIds: vi.fn().mockResolvedValue({ data: [], error: null }),
        getUtxos: vi.fn().mockResolvedValue({ data: [], error: null }),
        getCollateral: vi.fn().mockResolvedValue({ data: [], error: null }),
        signTx: vi.fn().mockResolvedValue({ data: "signed", error: null }),
        signTxs: vi.fn().mockResolvedValue({ data: ["signed"], error: null }),
        signData: vi.fn().mockResolvedValue({ data: "signature", error: null }),
        submitTx: vi.fn().mockResolvedValue({ data: "txhash", error: null }),
        getNetworkId: vi.fn().mockResolvedValue({ data: 0, error: null }),
      } as any)
    );
  });

  it("clears wallet, entropyPath, and auth state on logout", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.wallet).not.toBeNull();

    await act(async () => {
      const logoutResult = await result.current.logout();
      expect(logoutResult.error).toBeNull();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.wallet).toBeNull();
    expect(result.current.entropyPath).toBeNull();
  });

  it("surfaces adapter logout error", async () => {
    const adapter = createMockAdapter({
      logout: vi.fn().mockResolvedValue(err(new AuthAdapterError("Logout failed"))),
    });

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    await act(async () => {
      const logoutResult = await result.current.logout();
      expect(logoutResult.error).not.toBeNull();
      expect(logoutResult.error!.message).toBe("Logout failed");
    });
  });
});

describe("Web2BridgeProvider — exportRecoveryPhrase flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPRFSupported).mockResolvedValue(false);
    vi.mocked(generateEntropyFromPassword).mockResolvedValue(
      ok(new Uint8Array(32).fill(42))
    );
    vi.mocked(entropyToMnemonic).mockReturnValue(
      ok(Array(24).fill("abandon"))
    );
    vi.mocked(createWallet).mockReturnValue(
      ok({
        getUsedAddresses: vi.fn().mockResolvedValue({ data: ["addr_test1"], error: null }),
        getChangeAddress: vi.fn().mockResolvedValue({ data: "addr_test1", error: null }),
        getRewardAddresses: vi.fn().mockResolvedValue({ data: ["stake_test1"], error: null }),
        getBalance: vi.fn().mockResolvedValue({ data: [], error: null }),
        getLovelace: vi.fn().mockResolvedValue({ data: "0", error: null }),
        getAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIdAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIds: vi.fn().mockResolvedValue({ data: [], error: null }),
        getUtxos: vi.fn().mockResolvedValue({ data: [], error: null }),
        getCollateral: vi.fn().mockResolvedValue({ data: [], error: null }),
        signTx: vi.fn().mockResolvedValue({ data: "signed", error: null }),
        signTxs: vi.fn().mockResolvedValue({ data: ["signed"], error: null }),
        signData: vi.fn().mockResolvedValue({ data: "signature", error: null }),
        submitTx: vi.fn().mockResolvedValue({ data: "txhash", error: null }),
        getNetworkId: vi.fn().mockResolvedValue({ data: 0, error: null }),
      } as any)
    );
  });

  it("returns error when not logged in", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase();
      expect(exportResult.error).not.toBeNull();
      expect(exportResult.error!.name).toBe("ExportVerificationError");
      expect(exportResult.error!.message).toContain("login first");
    });
  });

  it("exports recovery phrase with correct password verification (password path)", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    expect(result.current.entropyPath).toBe("password");

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase({
        password: "MyStr0ng!P@ss2024",
      });
      expect(exportResult.error).toBeNull();
      expect(exportResult.data).toHaveLength(24);
      expect(exportResult.data![0]).toBe("abandon");
    });
  });

  it("returns error when password not provided for password path", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase();
      expect(exportResult.error).not.toBeNull();
      expect(exportResult.error!.name).toBe("ExportVerificationError");
      expect(exportResult.error!.message).toContain("Password required");
    });
  });

  it("returns error when password verification fails (mnemonic mismatch)", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    // Make the verification return a different mnemonic
    vi.mocked(entropyToMnemonic).mockReturnValueOnce(
      ok(Array(24).fill("zoo"))
    );

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase({
        password: "WrongP@ss2024!!!",
      });
      expect(exportResult.error).not.toBeNull();
      expect(exportResult.error!.name).toBe("ExportVerificationError");
    });
  });

  it("returns error when entropy generation fails during verification", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    vi.mocked(generateEntropyFromPassword).mockResolvedValueOnce(
      err(new DerivationError("KDF failed"))
    );

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase({
        password: "MyStr0ng!P@ss2024",
      });
      expect(exportResult.error).not.toBeNull();
      expect(exportResult.error!.name).toBe("ExportVerificationError");
    });
  });

  it("returns error when mnemonic generation fails during verification", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    vi.mocked(entropyToMnemonic).mockReturnValueOnce(
      err(new DerivationError("mnemonic failed"))
    );

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase({
        password: "MyStr0ng!P@ss2024",
      });
      expect(exportResult.error).not.toBeNull();
      expect(exportResult.error!.name).toBe("ExportVerificationError");
    });
  });

  it("returns a copy of mnemonic (not the original ref)", async () => {
    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login({ password: "MyStr0ng!P@ss2024" });
    });

    let exportedPhrase: string[] | undefined;
    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase({
        password: "MyStr0ng!P@ss2024",
      });
      exportedPhrase = exportResult.data ?? undefined;
    });

    expect(exportedPhrase).toBeDefined();
    // Mutating the returned array should not affect internal state
    exportedPhrase![0] = "modified";

    await act(async () => {
      const exportResult2 = await result.current.exportRecoveryPhrase({
        password: "MyStr0ng!P@ss2024",
      });
      expect(exportResult2.data![0]).toBe("abandon");
    });
  });
});

describe("Web2BridgeProvider — PRF path login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPRFSupported).mockResolvedValue(true);
    vi.mocked(entropyToMnemonic).mockResolvedValue(
      ok(Array(24).fill("abandon"))
    );
    vi.mocked(createWallet).mockReturnValue(
      ok({
        getUsedAddresses: vi.fn().mockResolvedValue({ data: ["addr_test1"], error: null }),
        getChangeAddress: vi.fn().mockResolvedValue({ data: "addr_test1", error: null }),
        getRewardAddresses: vi.fn().mockResolvedValue({ data: ["stake_test1"], error: null }),
        getBalance: vi.fn().mockResolvedValue({ data: [], error: null }),
        getLovelace: vi.fn().mockResolvedValue({ data: "0", error: null }),
        getAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIdAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIds: vi.fn().mockResolvedValue({ data: [], error: null }),
        getUtxos: vi.fn().mockResolvedValue({ data: [], error: null }),
        getCollateral: vi.fn().mockResolvedValue({ data: [], error: null }),
        signTx: vi.fn().mockResolvedValue({ data: "signed", error: null }),
        signTxs: vi.fn().mockResolvedValue({ data: ["signed"], error: null }),
        signData: vi.fn().mockResolvedValue({ data: "signature", error: null }),
        submitTx: vi.fn().mockResolvedValue({ data: "txhash", error: null }),
        getNetworkId: vi.fn().mockResolvedValue({ data: 0, error: null }),
      } as any)
    );
  });

  it("completes PRF login when PRF is supported", async () => {
    const { getPRFSecret, generateEntropy } = await import("@web2bridge/core");
    vi.mocked(getPRFSecret).mockResolvedValue({
      credentialId: "test-credential-id",
      prfSecret: new Uint8Array(32),
    });
    vi.mocked(generateEntropy).mockResolvedValue(
      ok(new Uint8Array(32).fill(42))
    );

    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login();
      expect(loginResult.error).toBeNull();
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.entropyPath).toBe("prf");
  });

  it("falls back to password when PRF entropy generation fails and fallback enabled", async () => {
    const { getPRFSecret, generateEntropy } = await import("@web2bridge/core");
    vi.mocked(getPRFSecret).mockResolvedValue({
      credentialId: "test-credential-id",
      prfSecret: new Uint8Array(32),
    });
    vi.mocked(generateEntropy).mockResolvedValue(
      err(new DerivationError("entropy failed"))
    );
    vi.mocked(generateEntropyFromPassword).mockResolvedValue(
      ok(new Uint8Array(32).fill(42))
    );

    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      const loginResult = await result.current.login({ password: "MyStr0ng!P@ss2024" });
      expect(loginResult.error).toBeNull();
    });

    expect(result.current.entropyPath).toBe("password");
  });
});

describe("Web2BridgeProvider — PRF path exportRecoveryPhrase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPRFSupported).mockResolvedValue(true);
    vi.mocked(entropyToMnemonic).mockResolvedValue(
      ok(Array(24).fill("abandon"))
    );
    vi.mocked(createWallet).mockReturnValue(
      ok({
        getUsedAddresses: vi.fn().mockResolvedValue({ data: ["addr_test1"], error: null }),
        getChangeAddress: vi.fn().mockResolvedValue({ data: "addr_test1", error: null }),
        getRewardAddresses: vi.fn().mockResolvedValue({ data: ["stake_test1"], error: null }),
        getBalance: vi.fn().mockResolvedValue({ data: [], error: null }),
        getLovelace: vi.fn().mockResolvedValue({ data: "0", error: null }),
        getAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIdAssets: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPolicyIds: vi.fn().mockResolvedValue({ data: [], error: null }),
        getUtxos: vi.fn().mockResolvedValue({ data: [], error: null }),
        getCollateral: vi.fn().mockResolvedValue({ data: [], error: null }),
        signTx: vi.fn().mockResolvedValue({ data: "signed", error: null }),
        signTxs: vi.fn().mockResolvedValue({ data: ["signed"], error: null }),
        signData: vi.fn().mockResolvedValue({ data: "signature", error: null }),
        submitTx: vi.fn().mockResolvedValue({ data: "txhash", error: null }),
        getNetworkId: vi.fn().mockResolvedValue({ data: 0, error: null }),
      } as any)
    );
  });

  it("exports recovery phrase via PRF re-authentication", async () => {
    const { getPRFSecret, generateEntropy } = await import("@web2bridge/core");
    vi.mocked(getPRFSecret).mockResolvedValue({
      credentialId: "test-credential-id",
      prfSecret: new Uint8Array(32),
    });
    vi.mocked(generateEntropy).mockResolvedValue(
      ok(new Uint8Array(32).fill(42))
    );
    vi.mocked(authenticateWithPRF).mockResolvedValue({
      credentialId: "test-credential-id",
      prfSecret: new Uint8Array(32),
    });

    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login();
    });

    expect(result.current.entropyPath).toBe("prf");

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase();
      expect(exportResult.error).toBeNull();
      expect(exportResult.data).toHaveLength(24);
    });
  });

  it("returns error when PRF re-authentication fails during export", async () => {
    const { getPRFSecret, generateEntropy } = await import("@web2bridge/core");
    vi.mocked(getPRFSecret).mockResolvedValue({
      credentialId: "test-credential-id",
      prfSecret: new Uint8Array(32),
    });
    vi.mocked(generateEntropy).mockResolvedValue(
      ok(new Uint8Array(32).fill(42))
    );
    vi.mocked(authenticateWithPRF).mockRejectedValue(new Error("re-auth failed"));

    const adapter = createMockAdapter();

    const { result } = renderHook(() => useWeb2Bridge(), {
      wrapper: wrapper(adapter),
    });

    await act(async () => {
      await result.current.login();
    });

    await act(async () => {
      const exportResult = await result.current.exportRecoveryPhrase();
      expect(exportResult.error).not.toBeNull();
      expect(exportResult.error!.name).toBe("ExportVerificationError");
    });
  });
});
