import { Web2BridgeError } from "../errors";

export interface AuthAdapter {
  readonly providerId: string;
  login(): Promise<Result<void>>;
  logout(): Promise<Result<void>>;
  getUserId(): Promise<Result<string>>;
  isAuthenticated(): boolean;
}

export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: Web2BridgeError };

export function isResultSuccess<T>(result: Result<T>): result is { data: T; error: null } {
  return result.error === null;
}

/**
 * Returns true when `result` represents a failure.
 * Canonical check is `error !== null` — not `data === null`, because
 * Result<void> success has `data: undefined`, not `data: null`.
 */
export function isResultFailure<T>(
  result: Result<T>,
): result is { data: null; error: Web2BridgeError } {
  return result.error !== null;
}

/**
 * Namespaces a raw user ID with its provider prefix to prevent wallet
 * collisions across auth providers (PRD §2.3).
 * Format: "<providerId>:<rawUserId>"
 *
 * Throws synchronously — this is a developer misuse guard, not a runtime
 * user-facing error. Invalid provider IDs should be caught in tests.
 */
export function buildNamespacedUserId(providerId: string, rawUserId: string): string {
  if (!providerId || !/^[a-z][a-z0-9]*$/.test(providerId)) {
    throw new Error("Invalid providerId: must be lowercase alphanumeric, starting with a letter");
  }
  if (!rawUserId) {
    throw new Error("Invalid rawUserId: must be a non-empty string");
  }
  // NOTE: rawUserId is allowed to contain colons (e.g. Auth0: "auth0|abc123")
  // The namespace separator is only the FIRST colon.
  return `${providerId}:${rawUserId}`;
}

export function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

export function err<T>(error: Web2BridgeError): Result<T> {
  return { data: null, error };
}
