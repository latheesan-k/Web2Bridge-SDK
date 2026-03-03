/**
 * Storage abstraction for encrypted wallets and initialization state
 */

import type { Result } from "../auth/adapter";

export interface StoredWallet {
  version: "v1";
  /** Encrypted mnemonic (ChaCha20-Poly1305) */
  ciphertext: Uint8Array;
  /** Nonce (12 bytes for ChaCha20-Poly1305) */
  nonce: Uint8Array;
  /** Authentication tag (16 bytes) */
  tag: Uint8Array;
  /** Salt for key derivation */
  salt: Uint8Array;
  /** Timestamp */
  createdAt: number;
  /** User identifier */
  namespacedUserId: string;
}

export interface WalletStorage {
  /** Store encrypted wallet */
  store(wallet: StoredWallet): Promise<Result<void>>;
  /** Retrieve encrypted wallet */
  retrieve(): Promise<Result<StoredWallet | null>>;
  /** Clear stored wallet */
  clear(): Promise<Result<void>>;
  /** Check if storage has a wallet for this user */
  hasWallet(namespacedUserId: string): Promise<boolean>;
}

export const STORAGE_KEY = "web2bridge_wallet_v1";

// Re-export initialization state types
export type {
  WalletInitState,
  WalletAddresses,
  InitStateStorage,
} from "./init-state";
export {
  LocalInitStateStorage,
  createInitStateStorage,
  INIT_STATE_KEY,
} from "./init-state"; 
