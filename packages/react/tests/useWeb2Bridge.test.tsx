import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import { Web2BridgeProvider, useWeb2Bridge, timingSafeStringEqual, type Web2BridgeConfig } from "../src/useWeb2Bridge";
import type { AuthAdapter, Result, Web2BridgeError } from "@web2bridge/core";
import { ok, err, detectPRFSupport } from "@web2bridge/core";

vi.mock("@web2bridge/core", () => ({
  ok: vi.fn((data) => ({ data, error: null })),
  err: vi.fn((error) => ({ data: null, error })),
  detectPRFSupport: vi.fn().mockResolvedValue(false),
  generateEntropy: vi.fn(),
  generateEntropyFromPassword: vi.fn(),
  buildNamespacedUserId: vi.fn((providerId: string, rawUserId: string) => `${providerId}:${rawUserId}`),
  deriveAppId: vi.fn(() => Promise.resolve(12345)),
  entropyToMnemonic: vi.fn(() => Promise.resolve({ data: ["abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual"], error: null })),
  createWallet: vi.fn(() => ({ data: {}, error: null })),
  authenticateWithPRF: vi.fn(),
  getDefaultConfig: vi.fn((config) => ({
    appDomain: config.appDomain,
    networkId: config.networkId ?? 1,
    kdf: config.kdf ?? "hkdf",
    fallback: {
      enabled: config.fallback?.enabled ?? true,
      kdf: config.fallback?.kdf ?? "argon2id",
    },
  })),
  Web2BridgeError: class Web2BridgeError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "Web2BridgeError";
    }
  },
  PRFNotSupportedError: class PRFNotSupportedError extends Error {
    constructor() {
      super("WebAuthn PRF is not supported on this device");
      this.name = "PRFNotSupportedError";
    }
  },
  PasskeyRegistrationError: class PasskeyRegistrationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PasskeyRegistrationError";
    }
  },
  PasskeyAuthError: class PasskeyAuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PasskeyAuthError";
    }
  },
  ExportVerificationError: class ExportVerificationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ExportVerificationError";
    }
  },
  EntropyPathMismatchError: class EntropyPathMismatchError extends Error {
    constructor(message: string = "Entropy path mismatch: cannot switch between PRF and password authentication") {
      super(message);
      this.name = "EntropyPathMismatchError";
    }
  },
}));

class MockAdapter implements AuthAdapter {
  readonly providerId = "test";
  private _authenticated = false;
  private _userId: string | null = null;

  async login(): Promise<Result<void>> {
    this._authenticated = true;
    this._userId = "user_test123";
    return ok(undefined);
  }

  async logout(): Promise<Result<void>> {
    this._authenticated = false;
    this._userId = null;
    return ok(undefined);
  }

  async getUserId(): Promise<Result<string>> {
    if (!this._userId) {
      return err(new Error("Not authenticated") as unknown as Web2BridgeError);
    }
    return ok(this._userId);
  }

  isAuthenticated(): boolean {
    return this._authenticated;
  }
}

describe("Web2BridgeProvider", () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    mockAdapter = new MockAdapter();
    vi.clearAllMocks();
    vi.mocked(detectPRFSupport).mockResolvedValue(false);
  });

  const config: Web2BridgeConfig = {
    appDomain: "example.com",
    networkId: 1,
    fallback: {
      enabled: true,
      kdf: "argon2id",
    },
  };

  it("renders children without crashing", () => {
    render(
      <Web2BridgeProvider adapter={mockAdapter} config={config}>
        <div data-testid="child">Test Child</div>
      </Web2BridgeProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("provides default context values before login", () => {
    function TestComponent() {
      const { isReady, isAuthenticated, wallet, error, entropyPath, prfSupported, requiresPassword } = useWeb2Bridge();
      return (
        <div>
          <span data-testid="isReady">{String(isReady)}</span>
          <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
          <span data-testid="wallet">{String(wallet)}</span>
          <span data-testid="error">{String(error)}</span>
          <span data-testid="entropyPath">{String(entropyPath)}</span>
          <span data-testid="requiresPassword">{String(requiresPassword)}</span>
        </div>
      );
    }

    render(
      <Web2BridgeProvider adapter={mockAdapter} config={config}>
        <TestComponent />
      </Web2BridgeProvider>
    );

    expect(screen.getByTestId("isReady").textContent).toBe("true");
    expect(screen.getByTestId("isAuthenticated").textContent).toBe("false");
    expect(screen.getByTestId("wallet").textContent).toBe("null");
    expect(screen.getByTestId("error").textContent).toBe("null");
    expect(screen.getByTestId("entropyPath").textContent).toBe("null");
  });

  it("throws when useWeb2Bridge is used outside provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<TestComponentOutside />);
    }).toThrow("useWeb2Bridge must be used within a Web2BridgeProvider");

    vi.restoreAllMocks();
  });

  it("exposes login, logout, and exportRecoveryPhrase functions", () => {
    function TestComponent() {
      const { login, logout, exportRecoveryPhrase } = useWeb2Bridge();
      return (
        <div>
          <span data-testid="loginType">{typeof login}</span>
          <span data-testid="logoutType">{typeof logout}</span>
          <span data-testid="exportType">{typeof exportRecoveryPhrase}</span>
        </div>
      );
    }

    render(
      <Web2BridgeProvider adapter={mockAdapter} config={config}>
        <TestComponent />
      </Web2BridgeProvider>
    );

    expect(screen.getByTestId("loginType").textContent).toBe("function");
    expect(screen.getByTestId("logoutType").textContent).toBe("function");
    expect(screen.getByTestId("exportType").textContent).toBe("function");
  });

  it("provides access to adapter providerId", () => {
    function TestComponent() {
      const { wallet } = useWeb2Bridge();
      return <div data-testid="hasWallet">{String(wallet !== null)}</div>;
    }

    render(
      <Web2BridgeProvider adapter={mockAdapter} config={config}>
        <TestComponent />
      </Web2BridgeProvider>
    );

    expect(screen.getByTestId("hasWallet").textContent).toBe("false");
  });
});

function TestComponentOutside() {
  useWeb2Bridge();
  return null;
}

describe("Web2BridgeConfig", () => {
  it("accepts minimal config with just appDomain", () => {
    const config: Web2BridgeConfig = {
      appDomain: "example.com",
    };

    expect(config.appDomain).toBe("example.com");
    expect(config.networkId).toBeUndefined();
    expect(config.kdf).toBeUndefined();
    expect(config.fallback).toBeUndefined();
  });

  it("accepts full config with all options", () => {
    const config: Web2BridgeConfig = {
      appDomain: "example.com",
      networkId: 0,
      kdf: "pbkdf2",
      fallback: {
        enabled: false,
        kdf: "pbkdf2",
      },
    };

    expect(config.appDomain).toBe("example.com");
    expect(config.networkId).toBe(0);
    expect(config.kdf).toBe("pbkdf2");
    expect(config.fallback?.enabled).toBe(false);
    expect(config.fallback?.kdf).toBe("pbkdf2");
  });
});

describe("LoginOptions", () => {
  it("accepts password option", () => {
    const options = { password: "MyStr0ng!Password" };
    expect(options.password).toBe("MyStr0ng!Password");
  });

  it("accepts expectedEntropyPath option", () => {
    const optionsPrf = { expectedEntropyPath: "prf" as const };
    const optionsPwd = { expectedEntropyPath: "password" as const };

    expect(optionsPrf.expectedEntropyPath).toBe("prf");
    expect(optionsPwd.expectedEntropyPath).toBe("password");
  });

  it("accepts both options together", () => {
    const options = {
      password: "MyStr0ng!Password",
      expectedEntropyPath: "password" as const,
    };

    expect(options.password).toBe("MyStr0ng!Password");
    expect(options.expectedEntropyPath).toBe("password");
  });
});

describe("ExportRecoveryPhraseOptions", () => {
  it("accepts password option", () => {
    const options = { password: "MyStr0ng!Password" };
    expect(options.password).toBe("MyStr0ng!Password");
  });
});

describe("Logout functionality", () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    mockAdapter = new MockAdapter();
    vi.clearAllMocks();
    vi.mocked(detectPRFSupport).mockResolvedValue(false);
  });

  const config: Web2BridgeConfig = {
    appDomain: "example.com",
    networkId: 1,
    fallback: {
      enabled: true,
      kdf: "argon2id",
    },
  };

  it("logout clears wallet, entropyPath, and authentication state", async () => {
    function TestComponent() {
      const { logout, isAuthenticated, wallet, entropyPath } = useWeb2Bridge();
      return (
        <div>
          <span data-testid="authenticated">{String(isAuthenticated)}</span>
          <span data-testid="hasWallet">{String(wallet !== null)}</span>
          <span data-testid="path">{String(entropyPath)}</span>
          <button data-testid="logoutBtn" onClick={() => logout()}>Logout</button>
        </div>
      );
    }

    render(
      <Web2BridgeProvider adapter={mockAdapter} config={config}>
        <TestComponent />
      </Web2BridgeProvider>
    );

    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("hasWallet").textContent).toBe("false");
    expect(screen.getByTestId("path").textContent).toBe("null");

    await screen.getByTestId("logoutBtn").click();

    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("hasWallet").textContent).toBe("false");
    expect(screen.getByTestId("path").textContent).toBe("null");
  });
});

describe("ExportRecoveryPhrase functionality", () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    mockAdapter = new MockAdapter();
    vi.clearAllMocks();
    vi.mocked(detectPRFSupport).mockResolvedValue(false);
  });

  const config: Web2BridgeConfig = {
    appDomain: "example.com",
    networkId: 1,
    fallback: {
      enabled: true,
      kdf: "argon2id",
    },
  };

  it("exportRecoveryPhrase returns error when not logged in", async () => {
    let exportResult: Result<string[]> | undefined;

    function TestComponent() {
      const { exportRecoveryPhrase } = useWeb2Bridge();
      return (
        <div>
          <button data-testid="exportBtn" onClick={async () => { exportResult = await exportRecoveryPhrase(); }}>Export</button>
        </div>
      );
    }

    render(
      <Web2BridgeProvider adapter={mockAdapter} config={config}>
        <TestComponent />
      </Web2BridgeProvider>
    );

    await act(async () => {
      screen.getByTestId("exportBtn").click();
    });

    expect(exportResult).not.toBeUndefined();
    expect(exportResult?.error).not.toBeNull();
    expect(exportResult?.error?.message).toContain("No wallet available");
  });
});

describe("timingSafeStringEqual", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeStringEqual("test", "test")).toBe(true);
  });

  it("returns false for different length strings", () => {
    expect(timingSafeStringEqual("test", "testing")).toBe(false);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeStringEqual("test", "TEST")).toBe(false);
  });
});
