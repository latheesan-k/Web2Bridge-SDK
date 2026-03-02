import type { KdfOptions } from "../config";
import type { Result } from "../auth/adapter";
import { ok, err } from "../auth/adapter";
import { DerivationError } from "../errors";

const HKDF_INFO = "web2bridge-v1";
// PRD §F3: 210,000 iterations for PBKDF2-SHA-256
const PBKDF2_ITERATIONS = 210_000;

export async function deriveWithHKDF(
  inputKeyMaterial: Uint8Array,
  salt: string,
  info: string = HKDF_INFO,
  outputLength: number = 32,
): Promise<Uint8Array> {
  const saltBuffer = new TextEncoder().encode(salt);
  const infoBuffer = new TextEncoder().encode(info);

  const importedKey = await crypto.subtle.importKey(
    "raw",
    inputKeyMaterial.buffer as ArrayBuffer,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      salt: saltBuffer,
      info: infoBuffer,
      hash: "SHA-256",
    },
    importedKey,
    outputLength * 8,
  );

  return new Uint8Array(derivedBits);
}

export async function deriveWithPBKDF2(
  inputKeyMaterial: Uint8Array,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
  outputLength: number = 32,
): Promise<Uint8Array> {
  const saltBuffer = new TextEncoder().encode(salt);

  const importedKey = await crypto.subtle.importKey(
    "raw",
    inputKeyMaterial.buffer as ArrayBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations,
      hash: "SHA-256",
    },
    importedKey,
    outputLength * 8,
  );

  return new Uint8Array(derivedBits);
}

// Lazy-loaded WASM singleton — loaded only if Argon2id is requested.
let argon2Module: unknown = null;

async function loadArgon2Module(): Promise<unknown> {
  if (argon2Module) return argon2Module;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const argon2 = await import(/* webpackIgnore: true */ "argon2-browser") as any;
    // argon2-browser's default export is the module; hash is a top-level export.
    argon2Module = argon2;
    return argon2;
  } catch {
    throw new DerivationError("Failed to load cryptographic module");
  }
}

export async function deriveWithArgon2id(
  inputKeyMaterial: Uint8Array,
  salt: string,
  // PRD §F2b / §F3: memory = 64 MB, iterations = 3, parallelism = 1
  memory: number = 65_536,
  iterations: number = 3,
  parallelism: number = 1,
  outputLength: number = 32,
): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const argon2 = await loadArgon2Module() as any;

  // argon2-browser accepts the password as a Uint8Array for binary safety.
  const result = await argon2.hash({
    pass: inputKeyMaterial,
    salt: salt,
    mem: memory,
    iter: iterations,
    parallelism,
    hashLen: outputLength,
    type: argon2.ArgonType?.Argon2id ?? 2,
  });

  // argon2-browser returns `hash` as a Uint8Array when `pass` is Uint8Array.
  if (result.hash instanceof Uint8Array) {
    return result.hash;
  }
  // Fallback: hex string result
  const hex: string = result.hashHex ?? result.hash;
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
}

/**
 * Derives entropy from a PRF secret using the configured KDF algorithm.
 * PRD §7.2: returns Result<Uint8Array> — never throws.
 */
export async function generateEntropy(
  namespacedUserId: string,
  prfSecret: Uint8Array,
  options?: KdfOptions,
): Promise<Result<Uint8Array>> {
  const algorithm = options?.algorithm ?? "hkdf";

  try {
    let entropy: Uint8Array;
    switch (algorithm) {
      case "hkdf":
        entropy = await deriveWithHKDF(prfSecret, namespacedUserId);
        break;
      case "pbkdf2":
        entropy = await deriveWithPBKDF2(prfSecret, namespacedUserId);
        break;
      case "argon2id":
        entropy = await deriveWithArgon2id(prfSecret, namespacedUserId);
        break;
      default:
        return err(new DerivationError(`Unsupported KDF algorithm: ${algorithm}`));
    }
    return ok(entropy);
  } catch (error) {
    if (error instanceof DerivationError) return err(error);
    return err(
      new DerivationError(
        error instanceof Error ? error.message : "Key derivation failed",
      ),
    );
  }
}
