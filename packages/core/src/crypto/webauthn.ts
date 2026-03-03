/**
 * WebAuthn implementation using native Web Authentication API
 * Handles PRF extension for entropy extraction
 *
 * Note: We use the native API instead of SimpleWebAuthn because
 * SimpleWebAuthn doesn't properly support the PRF extension.
 */

import {
  PasskeyRegistrationError,
  PasskeyAuthError,
  PRFNotSupportedError,
} from "../errors";

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
  console.log("[WebAuthn] Detecting PRF support...");

  if (typeof window === "undefined") {
    console.log("[WebAuthn] Not in browser environment");
    return false;
  }

  const pubKey = (window as unknown as Window & {
    PublicKeyCredential?: typeof PublicKeyCredential & {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
  }).PublicKeyCredential;

  if (!pubKey) {
    console.log("[WebAuthn] PublicKeyCredential not available");
    return false;
  }

  // Modern API: getClientCapabilities (Chrome 128+, Safari 18+)
  if (typeof pubKey.getClientCapabilities === "function") {
    try {
      console.log("[WebAuthn] Trying getClientCapabilities() API");
      const caps = await pubKey.getClientCapabilities();
      console.log("[WebAuthn] Client capabilities:", caps);
      if (typeof caps?.prf === "boolean") {
        console.log("[WebAuthn] PRF support from getClientCapabilities:", caps.prf);
        return caps.prf;
      }
    } catch (e) {
      console.log("[WebAuthn] getClientCapabilities() failed:", e);
      // Continue to fallback
    }
  } else {
    console.log("[WebAuthn] getClientCapabilities() not available, using fallback detection");
  }

  // Fallback: Check UVPA (User Verifying Platform Authenticator)
  try {
    const uvpa = await pubKey.isUserVerifyingPlatformAuthenticatorAvailable();
    console.log("[WebAuthn] UVPA available:", uvpa);
    if (!uvpa) return false;
  } catch (e) {
    console.log("[WebAuthn] UVPA check failed:", e);
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
  console.log("[WebAuthn] PRF assumed supported based on UVPA availability");
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
  console.log("[WebAuthn] Starting PRF credential registration", {
    namespacedUserId,
    rpId: rpId ?? window.location.hostname,
    rpName: rpName ?? "Web2Bridge",
  });

  const prfSalt = await getPRFSalt(namespacedUserId);
  console.log("[WebAuthn] Generated PRF salt length:", prfSalt.byteLength);

  const userIdHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(namespacedUserId),
  );

  // Create native WebAuthn credential creation options
  const credentialCreationOptions: CredentialCreationOptions = {
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        id: rpId ?? window.location.hostname,
        name: rpName ?? "Web2Bridge",
      },
      user: {
        id: new Uint8Array(userIdHash) as BufferSource,
        name: namespacedUserId,
        displayName: namespacedUserId,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" as PublicKeyCredentialType },
        { alg: -257, type: "public-key" as PublicKeyCredentialType },
      ],
      authenticatorSelection: {
        userVerification: "required" as UserVerificationRequirement,
        residentKey: "required" as ResidentKeyRequirement,
        authenticatorAttachment: "platform" as AuthenticatorAttachment,
      },
      extensions: {
        prf: {
          eval: {
            first: prfSalt as BufferSource, // Pass raw Uint8Array to native API
          },
        },
      },
    },
  };

  console.log("[WebAuthn] Registration options created", {
    rpId: credentialCreationOptions.publicKey?.rp.id,
    rpName: credentialCreationOptions.publicKey?.rp.name,
    userId: bufferToBase64URL(new Uint8Array(userIdHash)),
    prfSaltLength: prfSalt.byteLength,
  });

  console.log("[WebAuthn] Calling navigator.credentials.create()...");
  console.log("[WebAuthn] PRF salt will be passed as Uint8Array of length:", prfSalt.byteLength);

  try {
    const credential = await navigator.credentials.create(credentialCreationOptions);

    if (!credential || credential.type !== "public-key") {
      throw new PasskeyRegistrationError("Failed to create credential");
    }

    const pkCredential = credential as PublicKeyCredential;
    const response = pkCredential.response as AuthenticatorAttestationResponse;

    const credentialId = bufferToBase64URL(new Uint8Array(pkCredential.rawId));

    console.log("[WebAuthn] Registration response received", {
      id: credentialId,
      authenticatorAttachment: pkCredential.authenticatorAttachment,
      transports: response.getTransports?.(),
    });

    // Extract PRF results from clientExtensionResults
    const extResults = pkCredential.getClientExtensionResults() as PRFExtensionResults;
    console.log("[WebAuthn] clientExtensionResults:", JSON.stringify(extResults, null, 2));

    let prfSecret: Uint8Array | undefined;

    if (extResults.prf?.results?.first) {
      // PRF returned results during registration
      console.log("[WebAuthn] PRF results returned directly during registration");
      console.log("[WebAuthn] PRF secret length:", extResults.prf.results.first.byteLength);
      prfSecret = new Uint8Array(extResults.prf.results.first);
    } else if (extResults.prf?.enabled === true) {
      // PRF is enabled but we need to authenticate to get results
      // This is common for platform authenticators
      console.log("[WebAuthn] PRF enabled but no results yet, attempting authentication to get secret");
      const authResult = await authenticateWithPRFInternal(
        credentialId,
        namespacedUserId,
        rpId,
      );
      prfSecret = authResult.prfSecret;
    } else {
      console.error("[WebAuthn] PRF extension not supported - extResults.prf:", extResults.prf);
      throw new PasskeyRegistrationError(
        "PRF extension not supported on this device",
      );
    }

    console.log("[WebAuthn] PRF registration successful, secret length:", prfSecret.byteLength);
    return {
      credentialId,
      prfSecret,
    };
  } catch (error) {
    console.error("[WebAuthn] PRF registration failed:", error);
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
  console.log("[WebAuthn] Starting PRF authentication", {
    credentialId,
    namespacedUserId,
    rpId,
  });

  const prfSalt = await getPRFSalt(namespacedUserId);
  console.log("[WebAuthn] Generated PRF salt length:", prfSalt.byteLength);

  // Convert to native WebAuthn format
  const credentialRequestOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [
        {
          id: base64URLToBuffer(credentialId) as BufferSource,
          type: "public-key" as PublicKeyCredentialType,
        },
      ],
      userVerification: "required" as UserVerificationRequirement,
      rpId,
      extensions: {
        prf: {
          eval: {
            first: prfSalt as BufferSource, // Pass raw Uint8Array to native API
          },
        },
      },
    },
  };

  console.log("[WebAuthn] Calling navigator.credentials.get()...");
  console.log("[WebAuthn] PRF salt will be passed as Uint8Array of length:", prfSalt.byteLength);

  try {
    const credential = await navigator.credentials.get(credentialRequestOptions);

    if (!credential || credential.type !== "public-key") {
      throw new PasskeyAuthError("Failed to get credential");
    }

    const pkCredential = credential as PublicKeyCredential;
    const resultCredentialId = bufferToBase64URL(new Uint8Array(pkCredential.rawId));

    console.log("[WebAuthn] Authentication response received", {
      id: resultCredentialId,
      authenticatorAttachment: pkCredential.authenticatorAttachment,
    });

    // Extract PRF results
    const extResults = pkCredential.getClientExtensionResults() as PRFExtensionResults;
    console.log("[WebAuthn] clientExtensionResults:", JSON.stringify(extResults, null, 2));

    if (!extResults.prf?.results?.first) {
      console.error("[WebAuthn] No PRF results in authentication response");
      throw new PasskeyAuthError(
        "PRF authentication failed - device may not support PRF",
      );
    }

    console.log("[WebAuthn] PRF authentication successful, secret length:", extResults.prf.results.first.byteLength);
    return {
      credentialId: resultCredentialId,
      prfSecret: new Uint8Array(extResults.prf.results.first),
    };
  } catch (error) {
    console.error("[WebAuthn] PRF authentication failed:", error);
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
