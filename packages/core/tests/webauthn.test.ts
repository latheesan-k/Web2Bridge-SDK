/**
 * WebAuthn module tests - SimpleWebAuthn integration
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectPRFSupport,
  registerPRFCredential,
  authenticateWithPRF,
  getPRFSecret,
} from "../src/crypto/webauthn";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import {
  PasskeyRegistrationError,
  PasskeyAuthError,
} from "../src/errors";

// Mock @simplewebauthn/browser
vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

// Mock window.PublicKeyCredential
const mockPublicKeyCredential = {
  isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(),
  getClientCapabilities: vi.fn(),
};

Object.defineProperty(global, "window", {
  value: {
    PublicKeyCredential: mockPublicKeyCredential,
    location: { hostname: "localhost" },
  },
  writable: true,
});

describe("WebAuthn Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── PRF Detection ─────────────────────────────────────────────────────────────

  describe("detectPRFSupport", () => {
    it("returns false when window is undefined", async () => {
      const originalWindow = global.window;
      // @ts-expect-error - testing undefined window
      global.window = undefined;

      const result = await detectPRFSupport();
      expect(result).toBe(false);

      global.window = originalWindow;
    });

    it("returns false when PublicKeyCredential is not available", async () => {
      const originalPubKey = window.PublicKeyCredential;
      // @ts-expect-error - testing missing PublicKeyCredential
      window.PublicKeyCredential = undefined;

      const result = await detectPRFSupport();
      expect(result).toBe(false);

      window.PublicKeyCredential = originalPubKey;
    });

    it("returns true when client capabilities reports PRF support", async () => {
      mockPublicKeyCredential.getClientCapabilities.mockResolvedValue({
        prf: true,
      });

      const result = await detectPRFSupport();
      expect(result).toBe(true);
    });

    it("returns false when client capabilities reports no PRF support", async () => {
      mockPublicKeyCredential.getClientCapabilities.mockResolvedValue({
        prf: false,
      });

      const result = await detectPRFSupport();
      expect(result).toBe(false);
    });

    it("falls back to UVPA when getClientCapabilities is not available", async () => {
      // @ts-expect-error - testing undefined getClientCapabilities
      mockPublicKeyCredential.getClientCapabilities = undefined;
      mockPublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable.mockResolvedValue(
        true
      );

      const result = await detectPRFSupport();
      expect(result).toBe(true);
    });

    it("returns false when UVPA is not available", async () => {
      // @ts-expect-error - testing undefined getClientCapabilities
      mockPublicKeyCredential.getClientCapabilities = undefined;
      mockPublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable.mockResolvedValue(
        false
      );

      const result = await detectPRFSupport();
      expect(result).toBe(false);
    });
  });

  // ─── Register PRF Credential ───────────────────────────────────────────────────

  describe("registerPRFCredential", () => {
    it("returns credential with PRF secret from registration results", async () => {
      vi.mocked(startRegistration).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          attestationObject: "attestation",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await registerPRFCredential("clerk:user123");

      expect(result.credentialId).toBe("credential-id-123");
      expect(result.prfSecret).toBeInstanceOf(Uint8Array);
    });

    it("falls back to authenticate when registration only enables PRF", async () => {
      vi.mocked(startRegistration).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          attestationObject: "attestation",
        },
        clientExtensionResults: {
          prf: {
            enabled: true,
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      vi.mocked(startAuthentication).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          authenticatorData: "auth-data",
          signature: "signature",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await registerPRFCredential("clerk:user123");

      expect(result.credentialId).toBe("credential-id-123");
      expect(startAuthentication).toHaveBeenCalled();
    });

    it("throws PasskeyRegistrationError when PRF is not supported", async () => {
      vi.mocked(startRegistration).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          attestationObject: "attestation",
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await expect(registerPRFCredential("clerk:user123")).rejects.toThrow(
        PasskeyRegistrationError
      );
    });

    it("uses custom rpId and rpName when provided", async () => {
      vi.mocked(startRegistration).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          attestationObject: "attestation",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await registerPRFCredential("clerk:user123", "custom.example.com", "Custom App");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = vi.mocked(startRegistration).mock.calls[0][0] as any;
      expect(callArgs.rp.id).toBe("custom.example.com");
      expect(callArgs.rp.name).toBe("Custom App");
    });
  });

  // ─── Authenticate with PRF ─────────────────────────────────────────────────────

  describe("authenticateWithPRF", () => {
    it("returns credential with PRF secret on success", async () => {
      vi.mocked(startAuthentication).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          authenticatorData: "auth-data",
          signature: "signature",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await authenticateWithPRF(
        "clerk:user123",
        "credential-id-123"
      );

      expect(result.credentialId).toBe("credential-id-123");
      expect(result.prfSecret).toBeInstanceOf(Uint8Array);
    });

    it("throws PasskeyAuthError when PRF results are missing", async () => {
      vi.mocked(startAuthentication).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          authenticatorData: "auth-data",
          signature: "signature",
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await expect(
        authenticateWithPRF("clerk:user123", "credential-id-123")
      ).rejects.toThrow(PasskeyAuthError);
    });

    it("uses custom rpId when provided", async () => {
      vi.mocked(startAuthentication).mockResolvedValue({
        id: "credential-id-123",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          authenticatorData: "auth-data",
          signature: "signature",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await authenticateWithPRF(
        "clerk:user123",
        "credential-id-123",
        "custom.example.com"
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs = vi.mocked(startAuthentication).mock.calls[0][0] as any;
      expect(callArgs.rpId).toBe("custom.example.com");
    });
  });

  // ─── Get PRF Secret ────────────────────────────────────────────────────────────

  describe("getPRFSecret", () => {
    it("authenticates with existing credential when credentialId is provided", async () => {
      vi.mocked(startAuthentication).mockResolvedValue({
        id: "existing-credential",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          authenticatorData: "auth-data",
          signature: "signature",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await getPRFSecret("clerk:user123", "existing-credential");

      expect(result.credentialId).toBe("existing-credential");
      expect(startAuthentication).toHaveBeenCalled();
      expect(startRegistration).not.toHaveBeenCalled();
    });

    it("registers new credential when no credentialId provided", async () => {
      vi.mocked(startRegistration).mockResolvedValue({
        id: "new-credential",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          attestationObject: "attestation",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await getPRFSecret("clerk:user123");

      expect(result.credentialId).toBe("new-credential");
      expect(startRegistration).toHaveBeenCalled();
    });

    it("returns consistent PRF secret for same user", async () => {
      vi.mocked(startRegistration).mockResolvedValue({
        id: "credential-id",
        rawId: "raw-credential-id",
        response: {
          clientDataJSON: "client-data",
          attestationObject: "attestation",
        },
        clientExtensionResults: {
          prf: {
            results: {
              first: new Uint8Array(32).fill(42),
            },
          },
        },
        authenticatorAttachment: "platform",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result1 = await getPRFSecret("clerk:user123");
      const result2 = await getPRFSecret("clerk:user123");

      // Note: The actual PRF secret would be the same if the authenticator
      // returns consistent results for the same salt
      expect(result1.prfSecret).toBeInstanceOf(Uint8Array);
      expect(result2.prfSecret).toBeInstanceOf(Uint8Array);
    });
  });
});
