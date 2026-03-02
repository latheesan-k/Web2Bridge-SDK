// zxcvbn v4 ships as a default export — named import does not exist
import zxcvbn from "zxcvbn";
import { WeakPasswordError, DerivationError } from "../errors";
import type { Result } from "../auth/adapter";
import { ok, err } from "../auth/adapter";
import type { FallbackKdfOptions } from "../config";
import { deriveWithPBKDF2, deriveWithArgon2id } from "./kdf";

const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_STRENGTH_SCORE_THRESHOLD = 3;

// Rate-limiting state is scoped to a factory so it is not shared across
// independent module consumers (e.g. tests, SSR, concurrent wallets).
function createRateLimiter() {
  let failedAttempts = 0;
  const MAX_ATTEMPTS_BEFORE_DELAY = 3;
  const BASE_DELAY_MS = 100;
  const MAX_DELAY_MS = 5000;

  async function applyDelay(): Promise<void> {
    if (failedAttempts >= MAX_ATTEMPTS_BEFORE_DELAY) {
      const delay = Math.min(
        BASE_DELAY_MS * Math.pow(2, failedAttempts - MAX_ATTEMPTS_BEFORE_DELAY),
        MAX_DELAY_MS,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    failedAttempts++;
  }

  function reset(): void {
    failedAttempts = 0;
  }

  return { applyDelay, reset };
}

// One rate-limiter per module load — exported so the react layer can share a
// single instance across login calls within the same session.
export const defaultRateLimiter = createRateLimiter();

export function validatePasswordStrength(password: string): boolean {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }

  const result = zxcvbn(password);
  return result.score >= PASSWORD_STRENGTH_SCORE_THRESHOLD;
}

export function getPasswordStrengthScore(password: string): number {
  return zxcvbn(password).score;
}

/**
 * Derives 32 bytes of entropy from a spending password using the configured
 * fallback KDF algorithm (default: Argon2id per PRD §F2b).
 *
 * Returns Result<Uint8Array> — never throws.
 */
export async function generateEntropyFromPassword(
  namespacedUserId: string,
  password: string,
  options?: FallbackKdfOptions,
): Promise<Result<Uint8Array>> {
  await defaultRateLimiter.applyDelay();

  if (!validatePasswordStrength(password)) {
    return err(
      new WeakPasswordError(
        "Password must be at least 8 characters and meet strength requirements",
      ),
    );
  }

  const passwordBytes = new TextEncoder().encode(password);
  const algorithm = options?.algorithm ?? "argon2id";

  try {
    let entropy: Uint8Array;

    switch (algorithm) {
      case "argon2id":
        entropy = await deriveWithArgon2id(passwordBytes, namespacedUserId);
        break;
      case "pbkdf2":
        entropy = await deriveWithPBKDF2(passwordBytes, namespacedUserId);
        break;
      default:
        return err(new DerivationError("Unsupported fallback KDF algorithm"));
    }

    passwordBytes.fill(0);
    defaultRateLimiter.reset();
    return ok(entropy);
  } catch (error) {
    passwordBytes.fill(0);
    if (error instanceof DerivationError) return err(error);
    return err(
      new DerivationError(
        error instanceof Error ? error.message : "Key derivation failed",
      ),
    );
  }
}

/**
 * Re-derives entropy from a password and compares byte-by-byte to expected.
 * Uses constant-time comparison to prevent timing side-channels.
 */
export async function verifyPasswordEntropy(
  namespacedUserId: string,
  password: string,
  expectedEntropy: Uint8Array,
  options?: FallbackKdfOptions,
): Promise<boolean> {
  const result = await generateEntropyFromPassword(
    namespacedUserId,
    password,
    options,
  );
  if (result.error) return false;

  const derived = result.data!;
  if (derived.length !== expectedEntropy.length) return false;

  // Constant-time comparison — never short-circuit
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived[i] ^ expectedEntropy[i];
  }
  return diff === 0;
}
