/**
 * WebAuthn implementation using SimpleWebAuthn
 * Handles PRF extension for entropy extraction
 */

import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import {
  PasskeyRegistrationError,
  PasskeyAuthError,
  PRFNotSupportedError,
} from "../errors";

// Type definitions from @simplewebauthn/types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  clientExtensionResults: Record<string, unknown>;
  authenticatorAttachment?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: Record<string, unknown>;
  authenticatorAttachment?: string;
}

interface PublicKeyCredentialCreationOptionsJSON {
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { alg: number; type: string }[];
  timeout?: number;
  excludeCredentials?: { id: string; type: string; transports?: string[] }[];
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    residentKey?: string;
    userVerification?: string;
  };
  attestation?: string;
  extensions?: Record<string, unknown>;
}

interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  userVerification?: string;
  extensions?: Record<string, unknown>;
}

export interface PRFCredentialResult {
  credentialId: string;
  prfSecret: Uint8Array;
}

export interface PRFExtensionResults {
  prf?: {
    results?: {
      first?: Uint8Array;
    };
    enabled?: boolean;
  };
}

/**
 * Detect PRF support using client capabilities API
 */
export async function detectPRFSupport(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const pubKey = (window as unknown as Window & {
    PublicKeyCredential?: typeof PublicKeyCredential & {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
  }).PublicKeyCredential;

  if (!pubKey) return false;

  // Modern API: getClientCapabilities (Chrome 128+, Safari 18+)
  if (typeof pubKey.getClientCapabilities === "function") {
    try {
      const caps = await pubKey.getClientCapabilities();
      if (typeof caps?.prf === "boolean") {
        return caps.prf;
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: Check UVPA (User Verifying Platform Authenticator)
  try {
    const uvpa = await pubKey.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!uvpa) return false;
  } catch {
    return false;
  }

  // Check for PRF extension support via feature detection
  try {
    // Try to detect if extensions are supported
    const dummyChallenge = crypto.getRandomValues(new Uint8Array(32));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _testOptions: PublicKeyCredentialCreationOptionsJSON = {
      challenge: bufferToBase64URL(dummyChallenge),
      rp: { name: "Test", id: window.location.hostname },
      user: {
        id: bufferToBase64URL(dummyChallenge),
        name: "test",
        displayName: "Test",
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      extensions: {
        prf: {
          eval: {
            first: bufferToBase64URL(dummyChallenge),
          },
        },
      } as Record<string, unknown>,
    };

    // We don't actually create a credential here, just checking if the API accepts PRF
    // This is a best-effort detection
  } catch {
    // Ignore errors during detection
  }

  // Assume supported if UVPA is available - actual support determined during registration
  return true;
}

/**
 * Check if PRF is supported - returns boolean for simple use cases
 */
export async function isPRFSupported(): Promise<boolean> {
  const supported = await detectPRFSupport();
  return supported;
}

/**
 * Get PRF salt from namespaced user ID
 */
async function getPRFSalt(namespacedUserId: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(namespacedUserId);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

/**
 * Register a new PRF credential
 */
export async function registerPRFCredential(
  namespacedUserId: string,
  rpId?: string,
  rpName?: string,
): Promise<PRFCredentialResult> {
  const prfSalt = await getPRFSalt(namespacedUserId);
  const userIdHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(namespacedUserId),
  );

  const rp = {
    id: rpId ?? window.location.hostname,
    name: rpName ?? "Web2Bridge",
  };

  const options: PublicKeyCredentialCreationOptionsJSON = {
    challenge: bufferToBase64URL(crypto.getRandomValues(new Uint8Array(32))),
    rp,
    user: {
      id: bufferToBase64URL(new Uint8Array(userIdHash)),
      name: namespacedUserId,
      displayName: namespacedUserId,
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },
      { alg: -257, type: "public-key" },
    ],
    authenticatorSelection: {
      userVerification: "required",
      residentKey: "required",
      authenticatorAttachment: "platform",
    },
    extensions: {
      prf: {
        eval: {
          first: bufferToBase64URL(prfSalt),
        },
      },
    } as Record<string, unknown>,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await startRegistration(options as any);

    // Extract PRF results from clientExtensionResults
    const extResults = response.clientExtensionResults as PRFExtensionResults;
    let prfSecret: Uint8Array | undefined;

    if (extResults.prf?.results?.first) {
      // PRF returned results during registration
      prfSecret = base64URLToBuffer(
        bufferToBase64URL(new Uint8Array(extResults.prf.results.first)),
      );
    } else if (extResults.prf?.enabled === true) {
      // PRF is enabled but we need to authenticate to get results
      // This is common for platform authenticators
      const authResult = await authenticateWithPRFInternal(
        response.id,
        namespacedUserId,
        rpId,
      );
      prfSecret = authResult.prfSecret;
    } else {
      throw new PasskeyRegistrationError(
        "PRF extension not supported on this device",
      );
    }

    return {
      credentialId: response.id,
      prfSecret,
    };
  } catch (error) {
    if (
      error instanceof PasskeyRegistrationError ||
      error instanceof PRFNotSupportedError
    ) {
      throw error;
    }
    throw new PasskeyRegistrationError(
      error instanceof Error ? error.message : "Passkey registration failed",
    );
  }
}

/**
 * Authenticate with PRF to get secret
 */
export async function authenticateWithPRF(
  namespacedUserId: string,
  credentialId: string,
  rpId?: string,
): Promise<PRFCredentialResult> {
  return authenticateWithPRFInternal(credentialId, namespacedUserId, rpId);
}

async function authenticateWithPRFInternal(
  credentialId: string,
  namespacedUserId: string,
  rpId?: string,
): Promise<PRFCredentialResult> {
  const prfSalt = await getPRFSalt(namespacedUserId);

  const options: PublicKeyCredentialRequestOptionsJSON = {
    challenge: bufferToBase64URL(crypto.getRandomValues(new Uint8Array(32))),
    allowCredentials: [{ id: credentialId, type: "public-key" }],
    userVerification: "required",
    extensions: {
      prf: {
        eval: {
          first: bufferToBase64URL(prfSalt),
        },
      },
    } as Record<string, unknown>,
  };

  if (rpId) {
    options.rpId = rpId;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await startAuthentication(options as any);

    // Extract PRF results
    const extResults = response.clientExtensionResults as PRFExtensionResults;

    if (!extResults.prf?.results?.first) {
      throw new PasskeyAuthError(
        "PRF authentication failed - device may not support PRF",
      );
    }

    return {
      credentialId: response.id,
      prfSecret: base64URLToBuffer(
        bufferToBase64URL(new Uint8Array(extResults.prf.results.first)),
      ),
    };
  } catch (error) {
    if (error instanceof PasskeyAuthError || error instanceof PRFNotSupportedError) {
      throw error;
    }
    throw new PasskeyAuthError(
      error instanceof Error ? error.message : "Passkey authentication failed",
    );
  }
}

/**
 * Get PRF secret - register if no credential exists, otherwise authenticate
 */
export async function getPRFSecret(
  namespacedUserId: string,
  existingCredentialId?: string,
  rpId?: string,
): Promise<PRFCredentialResult> {
  if (existingCredentialId) {
    return authenticateWithPRF(namespacedUserId, existingCredentialId, rpId);
  }

  try {
    return await registerPRFCredential(namespacedUserId, rpId);
  } catch (error) {
    if (error instanceof PasskeyRegistrationError) {
      // Try authenticating instead - credential might already exist
      // Note: We need to know the credential ID for this to work
      // This is a limitation - we may need to store credential IDs separately
      throw error;
    }
    throw error;
  }
}

// Utility functions
function bufferToBase64URL(buffer: Uint8Array): string {
  const bytes = Array.from(buffer);
  const base64 = btoa(String.fromCharCode.apply(null, bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64URLToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
