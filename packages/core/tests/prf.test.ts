/**
 * PRF module tests — exercises detectPRFSupport, registerPRFCredential,
 * authenticateWithPRF, and getPRFSecret with mocked WebAuthn browser APIs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectPRFSupport,
  registerPRFCredential,
  authenticateWithPRF,
  getPRFSecret,
} from "../src/crypto/prf";
import { PRFNotSupportedError, PasskeyRegistrationError, PasskeyAuthError } from "../src/errors";

function createMockCredential(prfOutput: ArrayBuffer | null, rawId?: ArrayBuffer) {
  return {
    rawId: rawId ?? new ArrayBuffer(32),
    getClientExtensionResults: () =>
      prfOutput
        ? { prf: { evalResult: { first: prfOutput } } }
        : {},
  };
}

describe("detectPRFSupport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when window is undefined (Node environment)", async () => {
    vi.stubGlobal("window", undefined);
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });

  it("returns false when PublicKeyCredential is not available", async () => {
    vi.stubGlobal("window", {});
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });

  it("returns true when getClientCapabilities reports prf: true", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockResolvedValue({ prf: true }),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(true);
  });

  it("returns false when getClientCapabilities reports prf: false", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockResolvedValue({ prf: false }),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });

  it("falls back to platform authenticator check when getClientCapabilities has no prf", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockResolvedValue({}),
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });

  it("uses conditional mediation when platform authenticator is available", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockResolvedValue({}),
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        isConditionalMediationAvailable: vi.fn().mockResolvedValue(true),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(true);
  });

  it("returns false when conditional mediation is unavailable", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockResolvedValue({}),
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        isConditionalMediationAvailable: vi.fn().mockResolvedValue(false),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });

  it("returns false when conditional mediation throws", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockResolvedValue({}),
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        isConditionalMediationAvailable: vi.fn().mockRejectedValue(new Error("fail")),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });

  it("returns false when getClientCapabilities throws", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        getClientCapabilities: vi.fn().mockRejectedValue(new Error("fail")),
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });

  it("returns false when isUVPAA is available but no conditional mediation function", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      },
    });
    const result = await detectPRFSupport();
    expect(result).toBe(false);
  });
});

describe("registerPRFCredential", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws PRFNotSupportedError when PublicKeyCredential is not available", async () => {
    vi.stubGlobal("window", {});
    await expect(registerPRFCredential("clerk:user1")).rejects.toThrow(PRFNotSupportedError);
  });

  it("returns credential with PRF secret from create", async () => {
    const prfSecret = new ArrayBuffer(32);
    const rawId = new ArrayBuffer(16);
    const mockCred = createMockCredential(prfSecret, rawId);

    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { create: vi.fn().mockResolvedValue(mockCred) },
    });

    const result = await registerPRFCredential("clerk:user1");
    expect(result.credentialId).toBe(rawId);
    expect(result.prfSecret).toBe(prfSecret);
  });

  it("falls back to get() when create does not return PRF output", async () => {
    const prfSecret = new ArrayBuffer(32);
    const rawId = new ArrayBuffer(16);
    const createCred = createMockCredential(null, rawId);
    const getCred = createMockCredential(prfSecret);

    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: {
        create: vi.fn().mockResolvedValue(createCred),
        get: vi.fn().mockResolvedValue(getCred),
      },
    });

    const result = await registerPRFCredential("clerk:user1");
    expect(result.prfSecret).toBe(prfSecret);
  });

  it("throws PasskeyRegistrationError when PRF not available on device", async () => {
    const createCred = createMockCredential(null);
    const getCred = createMockCredential(null);

    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: {
        create: vi.fn().mockResolvedValue(createCred),
        get: vi.fn().mockResolvedValue(getCred),
      },
    });

    await expect(registerPRFCredential("clerk:user1")).rejects.toThrow(PasskeyRegistrationError);
  });

  it("throws PasskeyRegistrationError when credential is null", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { create: vi.fn().mockResolvedValue(null) },
    });

    await expect(registerPRFCredential("clerk:user1")).rejects.toThrow(PasskeyRegistrationError);
  });

  it("uses custom rpId and rpName when provided", async () => {
    const prfSecret = new ArrayBuffer(32);
    const mockCred = createMockCredential(prfSecret);
    const createFn = vi.fn().mockResolvedValue(mockCred);

    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", { credentials: { create: createFn } });

    await registerPRFCredential("clerk:user1", "example.com", "MyApp");

    const callArgs = createFn.mock.calls[0][0];
    expect(callArgs.publicKey.rp.id).toBe("example.com");
    expect(callArgs.publicKey.rp.name).toBe("MyApp");
  });

  it("wraps unexpected errors as PasskeyRegistrationError", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { create: vi.fn().mockRejectedValue(new Error("unexpected")) },
    });

    await expect(registerPRFCredential("clerk:user1")).rejects.toThrow(PasskeyRegistrationError);
  });

  it("re-throws PRFNotSupportedError without wrapping", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { create: vi.fn().mockRejectedValue(new PRFNotSupportedError()) },
    });

    await expect(registerPRFCredential("clerk:user1")).rejects.toThrow(PRFNotSupportedError);
  });

  it("wraps non-Error throws as PasskeyRegistrationError", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { create: vi.fn().mockRejectedValue("string error") },
    });

    await expect(registerPRFCredential("clerk:user1")).rejects.toThrow(PasskeyRegistrationError);
  });
});

describe("authenticateWithPRF", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws PRFNotSupportedError when PublicKeyCredential is not available", async () => {
    vi.stubGlobal("window", {});
    await expect(authenticateWithPRF("clerk:user1")).rejects.toThrow(PRFNotSupportedError);
  });

  it("returns credential with PRF secret on success", async () => {
    const prfSecret = new ArrayBuffer(32);
    const rawId = new ArrayBuffer(16);
    const mockCred = createMockCredential(prfSecret, rawId);

    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { get: vi.fn().mockResolvedValue(mockCred) },
    });

    const result = await authenticateWithPRF("clerk:user1");
    expect(result.credentialId).toBe(rawId);
    expect(result.prfSecret).toBe(prfSecret);
  });

  it("throws PasskeyAuthError when credential is null", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { get: vi.fn().mockResolvedValue(null) },
    });

    await expect(authenticateWithPRF("clerk:user1")).rejects.toThrow(PasskeyAuthError);
  });

  it("throws PasskeyAuthError when PRF eval result is missing", async () => {
    const mockCred = createMockCredential(null);

    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { get: vi.fn().mockResolvedValue(mockCred) },
    });

    await expect(authenticateWithPRF("clerk:user1")).rejects.toThrow(PasskeyAuthError);
  });

  it("uses custom rpId when provided", async () => {
    const prfSecret = new ArrayBuffer(32);
    const mockCred = createMockCredential(prfSecret);
    const getFn = vi.fn().mockResolvedValue(mockCred);

    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", { credentials: { get: getFn } });

    await authenticateWithPRF("clerk:user1", "example.com");

    const callArgs = getFn.mock.calls[0][0];
    expect(callArgs.publicKey.rpId).toBe("example.com");
  });

  it("wraps unexpected errors as PasskeyAuthError", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { get: vi.fn().mockRejectedValue(new Error("network error")) },
    });

    await expect(authenticateWithPRF("clerk:user1")).rejects.toThrow(PasskeyAuthError);
  });

  it("re-throws PasskeyAuthError without wrapping", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { get: vi.fn().mockRejectedValue(new PasskeyAuthError("cancelled")) },
    });

    const err = await authenticateWithPRF("clerk:user1").catch(e => e);
    expect(err).toBeInstanceOf(PasskeyAuthError);
    expect(err.message).toBe("cancelled");
  });

  it("wraps non-Error throws as PasskeyAuthError", async () => {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", {
      credentials: { get: vi.fn().mockRejectedValue("string error") },
    });

    await expect(authenticateWithPRF("clerk:user1")).rejects.toThrow(PasskeyAuthError);
  });
});

describe("getPRFSecret", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setupWebAuthnMocks() {
    vi.stubGlobal("window", {
      PublicKeyCredential: {},
      location: { hostname: "localhost" },
    });
  }

  it("authenticates with existing credential when credentialId is provided", async () => {
    const prfSecret = new ArrayBuffer(32);
    const mockCred = createMockCredential(prfSecret);

    setupWebAuthnMocks();
    vi.stubGlobal("navigator", {
      credentials: { get: vi.fn().mockResolvedValue(mockCred) },
    });

    const result = await getPRFSecret("clerk:user1", new ArrayBuffer(16));
    expect(result).toBe(prfSecret);
  });

  it("registers new credential when no credentialId provided", async () => {
    const prfSecret = new ArrayBuffer(32);
    const mockCred = createMockCredential(prfSecret);

    setupWebAuthnMocks();
    vi.stubGlobal("navigator", {
      credentials: { create: vi.fn().mockResolvedValue(mockCred) },
    });

    const result = await getPRFSecret("clerk:user1");
    expect(result).toBe(prfSecret);
  });

  it("propagates PasskeyRegistrationError from registration", async () => {
    setupWebAuthnMocks();
    vi.stubGlobal("navigator", {
      credentials: {
        create: vi.fn().mockRejectedValue(new PasskeyRegistrationError("exists")),
        get: vi.fn().mockResolvedValue(createMockCredential(new ArrayBuffer(32))),
      },
    });

    await expect(getPRFSecret("clerk:user1")).rejects.toThrow(PasskeyRegistrationError);
  });

  it("propagates PRFNotSupportedError from registration", async () => {
    setupWebAuthnMocks();
    vi.stubGlobal("navigator", {
      credentials: {
        create: vi.fn().mockRejectedValue(new PRFNotSupportedError()),
      },
    });

    await expect(getPRFSecret("clerk:user1")).rejects.toThrow(PRFNotSupportedError);
  });
});
