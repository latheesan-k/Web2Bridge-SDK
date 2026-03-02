/* eslint-disable @typescript-eslint/no-explicit-any */
import { PasskeyRegistrationError, PasskeyAuthError, PRFNotSupportedError } from "../errors";

export interface PRFCredentialResult {
  credentialId: ArrayBuffer;
  prfSecret: ArrayBuffer;
}

/**
 * Returns a deterministic 32-byte PRF eval salt derived from namespacedUserId.
 * The PRF `first` input must be stable and predictable across logins so that
 * the authenticator always outputs the same 32-byte secret for a given user.
 * PRD §2.1: "namespaced user ID as the relying party salt".
 */
async function getPRFSalt(namespacedUserId: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(namespacedUserId);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

/**
 * Detects whether the current browser + device supports the WebAuthn PRF
 * extension for platform authenticators.
 *
 * Strategy (layered, most-reliable first):
 *  1. `PublicKeyCredential.getClientCapabilities()` — Chrome 128+ returns a
 *     fine-grained capability map including `prf`.
 *  2. `PublicKeyCredential.isConditionalMediationAvailable()` — a reasonable
 *     heuristic: browsers that implement conditional UI also implement PRF on
 *     supporting platforms.
 *  3. Platform authenticator presence via `isUserVerifyingPlatformAuthenticatorAvailable`.
 *
 * Falls back to `false` (conservative) — callers should handle the password
 * fallback path rather than assuming PRF works.
 */
export async function detectPRFSupport(): Promise<boolean> {
  if (typeof window === "undefined" || !(window as any).PublicKeyCredential) {
    return false;
  }

  const pubKey = (window as any).PublicKeyCredential as any;

  try {
    // Level 1: explicit capability declaration (Chrome 128+)
    if (typeof pubKey.getClientCapabilities === "function") {
      try {
        const caps = await pubKey.getClientCapabilities();
        if (typeof caps?.prf === "boolean") {
          return caps.prf;
        }
      } catch {
        // Not available on this build — continue
      }
    }

    // Level 2: platform authenticator presence
    const isUVPAA = await pubKey.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isUVPAA) {
      return false;
    }

    // Level 3: conditional mediation availability as a heuristic
    // (browsers that ship conditional mediation also tend to ship PRF for
    // platform passkeys, e.g. Chrome on macOS Sequoia, Chrome on Android 14+)
    if (typeof pubKey.isConditionalMediationAvailable === "function") {
      try {
        return await pubKey.isConditionalMediationAvailable();
      } catch {
        // fall through
      }
    }

    // Default: conservative — do not claim PRF support without evidence
    return false;
  } catch {
    return false;
  }
}

export async function registerPRFCredential(
  namespacedUserId: string,
  rpId?: string,
  rpName?: string,
): Promise<PRFCredentialResult> {
  if (!(window as any).PublicKeyCredential) {
    throw new PRFNotSupportedError();
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(namespacedUserId),
  );
  // PRF salt: stable, deterministic, derived from namespacedUserId (PRD §2.1)
  const prfSalt = await getPRFSalt(namespacedUserId);

  const rp = rpId
    ? { id: rpId, name: rpName || "Web2Bridge" }
    : { id: window.location.hostname || "localhost", name: rpName || "Web2Bridge" };

  try {
    const credential: any = await (navigator.credentials as any).create({
      publicKey: {
        rp,
        user: {
          id: new Uint8Array(userIdHash),
          name: namespacedUserId,
          displayName: namespacedUserId,
        },
        challenge,
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
              // Must be deterministic — same salt produces same PRF output.
              first: prfSalt,
            },
          },
        },
      },
    });

    if (!credential) {
      throw new PasskeyRegistrationError("Passkey registration failed");
    }

    const extensionResults = credential.getClientExtensionResults?.() || {};

    let prfSecret: ArrayBuffer;

    if (extensionResults.prf?.evalResult?.first) {
      prfSecret = extensionResults.prf.evalResult.first;
    } else {
      // Authenticator didn't return PRF output during create — try a get.
      const testAuth = await (navigator.credentials as any).get({
        publicKey: {
          rpId: rp.id,
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          userVerification: "required",
          extensions: {
            prf: {
              eval: {
                first: prfSalt,
              },
            },
          },
        },
      });

      const testResults = testAuth?.getClientExtensionResults?.() || {};
      if (!testResults.prf?.evalResult?.first) {
        throw new PasskeyRegistrationError("PRF extension not available on this device");
      }
      prfSecret = testResults.prf.evalResult.first;
    }

    return {
      credentialId: credential.rawId,
      prfSecret,
    };
  } catch (error) {
    if (error instanceof PRFNotSupportedError || error instanceof PasskeyRegistrationError) {
      throw error;
    }
    throw new PasskeyRegistrationError(
      error instanceof Error ? error.message : "Passkey registration failed",
    );
  }
}

export async function authenticateWithPRF(
  namespacedUserId: string,
  rpId?: string,
): Promise<PRFCredentialResult> {
  if (!(window as any).PublicKeyCredential) {
    throw new PRFNotSupportedError();
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  // PRF salt: same deterministic value used during registration
  const prfSalt = await getPRFSalt(namespacedUserId);

  const rpIdResolved = rpId ?? (window.location.hostname || "localhost");

  try {
    const credential: any = await (navigator.credentials as any).get({
      publicKey: {
        rpId: rpIdResolved,
        challenge,
        userVerification: "required",
        extensions: {
          prf: {
            eval: {
              first: prfSalt,
            },
          },
        },
      },
    });

    if (!credential) {
      throw new PasskeyAuthError("Passkey authentication failed");
    }

    const extensionResults = credential.getClientExtensionResults?.() || {};

    if (!extensionResults.prf?.evalResult?.first) {
      throw new PasskeyAuthError("PRF authentication failed — device may not support PRF");
    }

    return {
      credentialId: credential.rawId,
      prfSecret: extensionResults.prf.evalResult.first,
    };
  } catch (error) {
    if (error instanceof PRFNotSupportedError || error instanceof PasskeyAuthError) {
      throw error;
    }
    throw new PasskeyAuthError(
      error instanceof Error ? error.message : "Passkey authentication failed",
    );
  }
}

export async function getPRFSecret(
  namespacedUserId: string,
  existingCredentialId?: ArrayBuffer,
  rpId?: string,
): Promise<ArrayBuffer> {
  if (existingCredentialId) {
    return authenticateWithPRF(namespacedUserId, rpId).then((r) => r.prfSecret);
  }

  try {
    return registerPRFCredential(namespacedUserId, rpId).then((r) => r.prfSecret);
  } catch (error) {
    if (error instanceof PasskeyRegistrationError) {
      return authenticateWithPRF(namespacedUserId, rpId).then((r) => r.prfSecret);
    }
    throw error;
  }
}
