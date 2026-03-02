import { DerivationError } from "../errors";
import type { Result } from "../auth/adapter";
import { ok, err } from "../auth/adapter";
import {
  entropyToMnemonicWords,
  mnemonicToEntropyWords,
  validateMnemonic,
} from "./bip39";

export const HD_PATH_TEMPLATE = "m/1852'/1815'/{appId}'/0/0";

/**
 * Converts 32 bytes of entropy to a BIP39 24-word mnemonic.
 * PRD §7.2: returns Promise<Result<string[]>> — never throws.
 */
export async function entropyToMnemonic(entropy: Uint8Array): Promise<Result<string[]>> {
  try {
    const words = await entropyToMnemonicWords(entropy);
    return ok(words);
  } catch (error) {
    return err(
      new DerivationError(
        error instanceof Error ? error.message : "Failed to convert entropy to mnemonic",
      ),
    );
  }
}

/**
 * Converts a BIP39 mnemonic back to entropy bytes.
 * Throws DerivationError on invalid mnemonic or checksum failure.
 */
export async function mnemonicToEntropy(mnemonic: string[]): Promise<Uint8Array> {
  try {
    return await mnemonicToEntropyWords(mnemonic);
  } catch (error) {
    throw new DerivationError(
      error instanceof Error ? error.message : "Failed to convert mnemonic to entropy",
    );
  }
}

export async function verifyMnemonic(mnemonic: string[]): Promise<boolean> {
  try {
    return await validateMnemonic(mnemonic);
  } catch {
    return false;
  }
}

/**
 * Derives a numeric AppID from a domain string.
 * AppID = first 31 bits of SHA-256(domain.toLowerCase()).
 * This ensures it fits within the BIP32 hardened index range 0x00000000–0x7FFFFFFF.
 * PRD §F4, §7.2.
 */
export async function deriveAppId(domain: string): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(domain.toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);

  const fullValue =
    (hashArray[0] << 24) | (hashArray[1] << 16) | (hashArray[2] << 8) | hashArray[3];
  // Shift right by 1 to clear the top bit → value in [0, 0x7FFFFFFF]
  const first31Bits = (fullValue >>> 1) >>> 0;

  return first31Bits;
}

export function buildHDPath(appId: number): string {
  if (appId < 0 || appId > 0x7fffffff) {
    throw new DerivationError("AppID must be between 0 and 0x7FFFFFFF");
  }
  return HD_PATH_TEMPLATE.replace("{appId}", appId.toString());
}

export {
  entropyToMnemonicWords,
  mnemonicToEntropyWords,
  validateMnemonic,
} from "./bip39";
