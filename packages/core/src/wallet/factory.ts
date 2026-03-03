/**
 * Wallet factory - creates wallets via PRF or password path
 */

import type { Result } from "../auth/adapter";
import { ok, err } from "../auth/adapter";
import { generateEntropy } from "../crypto/kdf";
import { generateEntropyFromPassword, validatePasswordStrength } from "../crypto/fallback";
import { deriveAppId, entropyToMnemonic } from "../derivation";
import { createWallet as createWalletInstance } from "./index";
import type { Web2BridgeWallet } from "./index";
import type { Web2BridgeProviderConfig } from "../config";
import {
  deriveKeyFromPassword,
  encryptData,
  decryptData,
  generateSalt,
} from "../crypto/encryption";
import type { StoredWallet } from "../storage/index";
import { LocalWalletStorage } from "../storage/local";
import { getPRFSecret } from "../crypto/webauthn";
import {
  WalletError,
  DerivationError,
  EncryptionError,
  StorageError,
  WeakPasswordError,
} from "../errors";

export type EntropyPath = "prf" | "password" | null;

export interface WalletCreationResult {
  wallet: Web2BridgeWallet;
  path: EntropyPath;
  credentialId?: string; // For PRF path
}

export interface PRFWalletOptions {
  namespacedUserId: string;
  appDomain: string;
  config: Web2BridgeProviderConfig;
  existingCredentialId?: string;
}

export interface PasswordWalletOptions {
  namespacedUserId: string;
  password: string;
  appDomain: string;
  config: Web2BridgeProviderConfig;
}

/**
 * Create wallet via PRF path
 */
export async function createPRFWallet(
  options: PRFWalletOptions,
): Promise<Result<WalletCreationResult>> {
  try {
    // Get PRF secret via SimpleWebAuthn
    const prfResult = await getPRFSecret(
      options.namespacedUserId,
      options.existingCredentialId,
    );

    // Derive entropy from PRF secret
    const entropyResult = await generateEntropy(
      options.namespacedUserId,
      new Uint8Array(prfResult.prfSecret),
      { algorithm: options.config.kdf ?? "hkdf" },
    );

    if (entropyResult.error) {
      return err(entropyResult.error);
    }

    // Convert to mnemonic
    const mnemonicResult = await entropyToMnemonic(entropyResult.data!);
    if (mnemonicResult.error) {
      return err(mnemonicResult.error);
    }

    // Derive app ID and create wallet
    const appId = await deriveAppId(options.appDomain);
    const walletResult = createWalletInstance(mnemonicResult.data!, appId, {
      networkId: options.config.networkId ?? 1,
    });

    if (walletResult.error) {
      return err(walletResult.error);
    }

    return ok({
      wallet: walletResult.data!,
      path: "prf",
      credentialId: prfResult.credentialId,
    });
  } catch (error) {
    if (error instanceof DerivationError || error instanceof WalletError) {
      return err(error);
    }
    return err(
      new WalletError(
        error instanceof Error
          ? error.message
          : "Failed to create PRF wallet",
      ),
    );
  }
}

/**
 * Create or unlock wallet via password path
 */
export async function unlockPasswordWallet(
  options: PasswordWalletOptions,
): Promise<Result<WalletCreationResult>> {
  const storage = new LocalWalletStorage();

  // Check if wallet already exists in storage
  const hasWallet = await storage.hasWallet(options.namespacedUserId);

  if (hasWallet) {
    // Unlock existing wallet
    return unlockExistingPasswordWallet(options, storage);
  } else {
    // Create new wallet and store it
    return createNewPasswordWallet(options, storage);
  }
}

async function createNewPasswordWallet(
  options: PasswordWalletOptions,
  storage: LocalWalletStorage,
): Promise<Result<WalletCreationResult>> {
  try {
    // Validate password strength before creating wallet
    if (!validatePasswordStrength(options.password)) {
      return err(
        new WeakPasswordError(
          "Password is too weak. Use at least 8 characters with a mix of letters, numbers, and symbols."
        )
      );
    }

    // Generate entropy from password
    const entropyResult = await generateEntropyFromPassword(
      options.namespacedUserId,
      options.password,
      { algorithm: options.config.fallback?.kdf ?? "argon2id" },
    );

    if (entropyResult.error) {
      return err(entropyResult.error);
    }

    // Convert to mnemonic
    const mnemonicResult = await entropyToMnemonic(entropyResult.data!);
    if (mnemonicResult.error) {
      return err(mnemonicResult.error);
    }

    // Generate encryption key from password and encrypt wallet
    const salt = generateSalt();
    const key = await deriveKeyFromPassword(options.password, salt);

    const mnemonicString = mnemonicResult.data!.join(" ");
    const mnemonicBytes = new TextEncoder().encode(mnemonicString);

    const encrypted = await encryptData(mnemonicBytes, key);

    // Store encrypted wallet
    const storedWallet: StoredWallet = {
      version: "v1",
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
      salt,
      createdAt: Date.now(),
      namespacedUserId: options.namespacedUserId,
    };

    const storeResult = await storage.store(storedWallet);
    if (storeResult.error) {
      return err(storeResult.error);
    }

    // Create wallet instance
    const appId = await deriveAppId(options.appDomain);
    const walletResult = createWalletInstance(mnemonicResult.data!, appId, {
      networkId: options.config.networkId ?? 1,
    });

    if (walletResult.error) {
      return err(walletResult.error);
    }

    // Clear mnemonic from memory (best-effort: JavaScript strings are immutable)
    mnemonicBytes.fill(0);
    mnemonicResult.data!.fill("");

    return ok({
      wallet: walletResult.data!,
      path: "password",
    });
  } catch (error) {
    if (
      error instanceof EncryptionError ||
      error instanceof StorageError ||
      error instanceof WalletError
    ) {
      return err(error);
    }
    return err(
      new WalletError(
        error instanceof Error
          ? error.message
          : "Failed to create password wallet",
      ),
    );
  }
}

async function unlockExistingPasswordWallet(
  options: PasswordWalletOptions,
  storage: LocalWalletStorage,
): Promise<Result<WalletCreationResult>> {
  try {
    // Retrieve encrypted wallet
    const retrieveResult = await storage.retrieve();
    if (retrieveResult.error) {
      return err(retrieveResult.error);
    }
    if (!retrieveResult.data) {
      return err(new StorageError("Wallet not found"));
    }

    const storedWallet = retrieveResult.data;

    // Verify this wallet belongs to the current user
    if (storedWallet.namespacedUserId !== options.namespacedUserId) {
      return err(new StorageError("Wallet belongs to different user"));
    }

    // Derive key from password
    const key = await deriveKeyFromPassword(options.password, storedWallet.salt);

    // Decrypt wallet
    const decryptedResult = await decryptData(
      {
        ciphertext: storedWallet.ciphertext,
        nonce: storedWallet.nonce,
        tag: storedWallet.tag,
        salt: storedWallet.salt,
      },
      key,
    );

    if (decryptedResult.error) {
      // Use generic error to avoid revealing whether wallet exists or password is wrong
      return err(new EncryptionError("Authentication failed - invalid credentials"));
    }

    // Parse mnemonic
    const mnemonicString = new TextDecoder().decode(decryptedResult.data!);
    const mnemonic = mnemonicString.split(" ");

    // Create wallet instance
    const appId = await deriveAppId(options.appDomain);
    const walletResult = createWalletInstance(mnemonic, appId, {
      networkId: options.config.networkId ?? 1,
    });

    if (walletResult.error) {
      return err(walletResult.error);
    }

    return ok({
      wallet: walletResult.data!,
      path: "password",
    });
  } catch (error) {
    if (
      error instanceof EncryptionError ||
      error instanceof StorageError ||
      error instanceof WalletError
    ) {
      return err(error);
    }
    return err(
      new WalletError(
        error instanceof Error ? error.message : "Failed to unlock wallet",
      ),
    );
  }
}

/**
 * Clear stored password wallet
 */
export async function clearStoredWallet(): Promise<Result<void>> {
  const storage = new LocalWalletStorage();
  return storage.clear();
}
