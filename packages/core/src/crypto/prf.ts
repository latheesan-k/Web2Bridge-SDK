/* eslint-disable @typescript-eslint/no-explicit-any */
import { PasskeyRegistrationError, PasskeyAuthError, PRFNotSupportedError } from "../errors";

export interface PRFCredentialResult {
  credentialId: ArrayBuffer;
  prfSecret: ArrayBuffer;
}

export type PRFSupportLevel =
  | "confirmed"
  | "likely"
  | "possible"
  | "unsupported"
  | "unknown";

export interface PRFDetectionResult {
  supported: boolean;
  level: PRFSupportLevel;
  signal: string;
  details: PRFDetectionDetails;
}

export interface PRFDetectionDetails {
  hasPublicKeyCredential: boolean;
  clientCapabilities: Record<string, boolean> | null;
  uvpaaResult: boolean | null;
  cmaResult: boolean | null;
  browserInfo: BrowserInfo | null;
  platformMeetsMinimumVersion: boolean | null;
}

export interface BrowserInfo {
  browser: "chrome" | "safari" | "firefox" | "edge" | "samsung" | "unknown";
  majorVersion: number;
  os: "android" | "ios" | "macos" | "windows" | "linux" | "unknown";
  osMajorVersion: number;
  osMinorVersion: number;
}

const PRF_MIN_VERSIONS: Record<
  BrowserInfo["browser"],
  Partial<Record<BrowserInfo["os"], { browserMajor: number; osMajor: number; osMinor: number }>>
> = {
  chrome: {
    android: { browserMajor: 116, osMajor: 9, osMinor: 0 },
    // macOS 13.5+ (Ventura) with Chrome 116+
    macos: { browserMajor: 116, osMajor: 13, osMinor: 5 },
    windows: { browserMajor: 116, osMajor: 10, osMinor: 0 },
    ios: { browserMajor: 116, osMajor: 16, osMinor: 0 },
    linux: { browserMajor: 116, osMajor: 0, osMinor: 0 },
  },
  edge: {
    windows: { browserMajor: 116, osMajor: 10, osMinor: 0 },
    macos: { browserMajor: 116, osMajor: 13, osMinor: 5 },
    android: { browserMajor: 116, osMajor: 9, osMinor: 0 },
  },
  safari: {
    ios: { browserMajor: 18, osMajor: 18, osMinor: 0 },
    // FIX: Safari 18+ on macOS Sonoma (14.0)+ supports PRF.
    // The original code required osMajor >= 15 (Sequoia) which was too strict.
    // An M3 MacBook Air ships with Sonoma (14.x) — this was blocking valid devices.
    macos: { browserMajor: 18, osMajor: 14, osMinor: 0 },
  },
  samsung: {
    android: { browserMajor: 24, osMajor: 9, osMinor: 0 },
  },
  firefox: {},
  unknown: {},
};

function parseBrowserInfo(): BrowserInfo | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;

  let os: BrowserInfo["os"] = "unknown";
  let osMajorVersion = 0;
  let osMinorVersion = 0;

  const iosMatch = ua.match(/iP(?:hone|ad|od)[^;]*; CPU (?:iPhone )?OS (\d+)_(\d+)/);
  if (iosMatch) {
    os = "ios";
    osMajorVersion = parseInt(iosMatch[1], 10);
    osMinorVersion = parseInt(iosMatch[2], 10);
  } else if (/Android/.test(ua)) {
    os = "android";
    const m = ua.match(/Android (\d+)(?:\.(\d+))?/);
    if (m) {
      osMajorVersion = parseInt(m[1], 10);
      osMinorVersion = parseInt(m[2] ?? "0", 10);
    }
  } else if (/Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) {
    // FIX: Simplified and corrected macOS detection.
    // The original regex had a confusing double-negative that could misfire.
    os = "macos";
    const m = ua.match(/Mac OS X (\d+)[._](\d+)/);
    if (m) {
      const major = parseInt(m[1], 10);
      const minor = parseInt(m[2], 10);
      // Legacy UAs on macOS 11+ sometimes report "10_16" instead of "11_0".
      // Normalise those so version checks work correctly.
      if (major === 10 && minor >= 16) {
        osMajorVersion = minor - 5; // 10.16 -> 11, 10.17 -> 12, etc.
        osMinorVersion = 0;
      } else {
        osMajorVersion = major;
        osMinorVersion = minor;
      }
    }
  } else if (/Windows/.test(ua)) {
    os = "windows";
    const m = ua.match(/Windows NT (\d+)\.(\d+)/);
    if (m) {
      osMajorVersion = parseInt(m[1], 10) >= 10 ? 10 : parseInt(m[1], 10);
      osMinorVersion = parseInt(m[2], 10);
    }
  } else if (/Linux/.test(ua)) {
    os = "linux";
  }

  let browser: BrowserInfo["browser"] = "unknown";
  let majorVersion = 0;

  const samsungMatch = ua.match(/SamsungBrowser\/(\d+)/);
  const edgeMatch = ua.match(/Edg(?:e|A|iOS)?\/(\d+)/);
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  const safariMatch = ua.match(/Version\/(\d+).*Safari/);
  const firefoxMatch = ua.match(/Firefox\/(\d+)/);

  if (samsungMatch) {
    browser = "samsung";
    majorVersion = parseInt(samsungMatch[1], 10);
  } else if (edgeMatch) {
    browser = "edge";
    majorVersion = parseInt(edgeMatch[1], 10);
  } else if (chromeMatch && /Chrome/.test(ua) && !/Chromium/.test(ua)) {
    browser = "chrome";
    majorVersion = parseInt(chromeMatch[1], 10);
  } else if (safariMatch && /Safari/.test(ua) && !/Chrome/.test(ua)) {
    browser = "safari";
    majorVersion = parseInt(safariMatch[1], 10);
  } else if (firefoxMatch) {
    browser = "firefox";
    majorVersion = parseInt(firefoxMatch[1], 10);
  }

  return { browser, majorVersion, os, osMajorVersion, osMinorVersion };
}

function meetsPRFMinimumVersion(info: BrowserInfo): boolean {
  const osVersions = PRF_MIN_VERSIONS[info.browser];
  if (!osVersions) return false;

  const minReq = osVersions[info.os];
  if (!minReq) return false;

  if (info.majorVersion < minReq.browserMajor) return false;

  if (info.osMajorVersion < minReq.osMajor) return false;
  if (info.osMajorVersion === minReq.osMajor && info.osMinorVersion < minReq.osMinor) return false;

  return true;
}

/**
 * Detailed PRF support detection with browser version analysis
 * @deprecated Use detectPRFSupport from webauthn.ts for simple boolean check, or detectPRFSupportDetailed for detailed analysis
 */
export async function detectPRFSupportDetailed(): Promise<PRFDetectionResult> {
  const details: PRFDetectionDetails = {
    hasPublicKeyCredential: false,
    clientCapabilities: null,
    uvpaaResult: null,
    cmaResult: null,
    browserInfo: null,
    platformMeetsMinimumVersion: null,
  };

  const unsupported = (signal: string): PRFDetectionResult => ({
    supported: false,
    level: "unsupported",
    signal,
    details,
  });
  const unknown = (signal: string): PRFDetectionResult => ({
    supported: false,
    level: "unknown",
    signal,
    details,
  });

  if (typeof window === "undefined") {
    return unknown("ssr");
  }

  const pubKey = (window as any).PublicKeyCredential as any;
  if (!pubKey) {
    details.hasPublicKeyCredential = false;
    return unsupported("no-webauthn-api");
  }
  details.hasPublicKeyCredential = true;

  // Most reliable signal: getClientCapabilities() is a Chrome 128+ / Safari 18+ API
  // that directly reports prf support — prefer this over UA sniffing.
  if (typeof pubKey.getClientCapabilities === "function") {
    try {
      const caps = await pubKey.getClientCapabilities();
      details.clientCapabilities = caps ?? null;
      if (typeof caps?.prf === "boolean") {
        return {
          supported: caps.prf,
          level: caps.prf ? "confirmed" : "unsupported",
          signal: "client-capabilities-prf",
          details,
        };
      }
    } catch {
      // API exists but threw — not authoritative, continue heuristics
    }
  }

  try {
    details.uvpaaResult = await pubKey.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    details.uvpaaResult = false;
  }

  if (!details.uvpaaResult) {
    return unsupported("no-platform-authenticator");
  }

  details.browserInfo = parseBrowserInfo();
  if (details.browserInfo) {
    details.platformMeetsMinimumVersion = meetsPRFMinimumVersion(details.browserInfo);

    if (
      details.browserInfo.browser !== "unknown" &&
      details.browserInfo.os !== "unknown" &&
      !details.platformMeetsMinimumVersion
    ) {
      return unsupported("version-below-minimum");
    }

    if (details.browserInfo.browser === "firefox") {
      return unsupported("firefox-no-prf");
    }
  }

  if (typeof pubKey.isConditionalMediationAvailable === "function") {
    try {
      details.cmaResult = await pubKey.isConditionalMediationAvailable();
    } catch {
      details.cmaResult = null;
    }
  }

  const versionConfirmed = details.platformMeetsMinimumVersion === true;
  const cmaPositive = details.cmaResult === true;

  if (versionConfirmed && cmaPositive) {
    return { supported: true, level: "confirmed", signal: "version+cma", details };
  }
  if (versionConfirmed) {
    return { supported: true, level: "likely", signal: "version-fingerprint", details };
  }
  if (cmaPositive) {
    return { supported: true, level: "likely", signal: "cma-positive", details };
  }

  return { supported: true, level: "possible", signal: "uvpaa-only", details };
}

async function getPRFSalt(namespacedUserId: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(namespacedUserId);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
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

    let prfSecret: ArrayBuffer | undefined;

    if (extensionResults.prf?.results?.first) {
      // Some authenticators return the PRF output immediately during create()
      prfSecret = extensionResults.prf.results.first;
    } else if (extensionResults.prf?.enabled === true) {
      // PRF is enabled on this credential but wasn't evaluated during create() —
      // common for platform authenticators (Touch ID, Face ID). Do a follow-up
      // get() to actually obtain the PRF secret.
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
      if (!testResults.prf?.results?.first) {
        throw new PasskeyRegistrationError("PRF extension not available on this device");
      }
      prfSecret = testResults.prf.results.first;
    } else {
      // PRF extension was not acknowledged — device doesn't support it
      throw new PasskeyRegistrationError("PRF extension not available on this device");
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

    // FIX: `results`, not `evalResult`
    if (!extensionResults.prf?.results?.first) {
      throw new PasskeyAuthError("PRF authentication failed — device may not support PRF");
    }

    return {
      credentialId: credential.rawId,
      prfSecret: extensionResults.prf.results.first,
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
