/**
 * Wallet initialization state storage
 * 
 * Stores non-sensitive wallet initialization progress in localStorage.
 * NO cryptographic secrets are stored here - only public addresses and flags.
 * 
 * For PRF path: credentialId is stored (this is a public identifier, not a secret)
 * For password path: encrypted wallet is stored in separate storage
 */

import type { Result } from "../auth/adapter";
import { ok, err } from "../auth/adapter";
import { StorageError } from "../errors";

export const INIT_STATE_KEY = "web2bridge_init_v1";

export interface WalletAddresses {
  payment: string;
  stake: string;
  networkId: number;
}

export interface WalletInitState {
  version: "v1";
  namespacedUserId: string;
  entropyPath: "prf" | "password";
  /** Cached addresses - null until first signing derives the wallet */
  addresses: WalletAddresses | null;
  /** PRF credential ID for re-authentication (public identifier, not a secret) */
  credentialId?: string;
  /** Timestamp of initialization */
  createdAt: number;
  /** App domain for verification */
  appDomain: string;
}

export interface InitStateStorage {
  store(state: WalletInitState): Promise<Result<void>>;
  retrieve(): Promise<Result<WalletInitState | null>>;
  clear(): Promise<Result<void>>;
  hasState(): Promise<boolean>;
  /** Check if state belongs to a specific user */
  belongsToUser(namespacedUserId: string): Promise<boolean>;
}

export class LocalInitStateStorage implements InitStateStorage {
  async store(state: WalletInitState): Promise<Result<void>> {
    try {
      const data = JSON.stringify(state);
      localStorage.setItem(INIT_STATE_KEY, data);
      return ok(undefined);
    } catch (error) {
      return err(
        new StorageError(
          error instanceof Error ? error.message : "Failed to store initialization state"
        )
      );
    }
  }

  async retrieve(): Promise<Result<WalletInitState | null>> {
    try {
      const json = localStorage.getItem(INIT_STATE_KEY);
      if (!json) return ok(null);

      const state = JSON.parse(json) as WalletInitState;

      if (state.version !== "v1") {
        return err(new StorageError("Unsupported initialization state version"));
      }

      return ok(state);
    } catch (error) {
      return err(
        new StorageError(
          error instanceof Error ? error.message : "Failed to retrieve initialization state"
        )
      );
    }
  }

  async clear(): Promise<Result<void>> {
    try {
      localStorage.removeItem(INIT_STATE_KEY);
      return ok(undefined);
    } catch (error) {
      return err(
        new StorageError(
          error instanceof Error ? error.message : "Failed to clear initialization state"
        )
      );
    }
  }

  async hasState(): Promise<boolean> {
    const result = await this.retrieve();
    return !result.error && result.data !== null;
  }

  async belongsToUser(namespacedUserId: string): Promise<boolean> {
    const result = await this.retrieve();
    if (result.error || !result.data) return false;
    return result.data.namespacedUserId === namespacedUserId;
  }
}

/** Factory for creating init state storage */
export function createInitStateStorage(): InitStateStorage {
  return new LocalInitStateStorage();
}
