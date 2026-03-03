/**
 * localStorage-based wallet storage
 */

import type { Result } from "../auth/adapter";
import { ok, err } from "../auth/adapter";
import { StorageError } from "../errors";
import type { StoredWallet, WalletStorage } from "./index";
import { STORAGE_KEY } from "./index";

interface LocalStorageData {
  version: "v1";
  ciphertext: string; // base64
  nonce: string; // base64
  tag: string; // base64
  salt: string; // base64
  createdAt: number;
  namespacedUserId: string;
}

export class LocalWalletStorage implements WalletStorage {
  async store(wallet: StoredWallet): Promise<Result<void>> {
    try {
      const data: LocalStorageData = {
        version: wallet.version,
        ciphertext: bufferToBase64(wallet.ciphertext),
        nonce: bufferToBase64(wallet.nonce),
        tag: bufferToBase64(wallet.tag),
        salt: bufferToBase64(wallet.salt),
        createdAt: wallet.createdAt,
        namespacedUserId: wallet.namespacedUserId,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return ok(undefined);
    } catch (error) {
      return err(
        new StorageError(
          error instanceof Error ? error.message : "Failed to store wallet",
        ),
      );
    }
  }

  async retrieve(): Promise<Result<StoredWallet | null>> {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return ok(null);

      const data = JSON.parse(json) as LocalStorageData;

      if (data.version !== "v1") {
        return err(new StorageError("Unsupported wallet version"));
      }

      const wallet: StoredWallet = {
        version: data.version,
        ciphertext: base64ToBuffer(data.ciphertext),
        nonce: base64ToBuffer(data.nonce),
        tag: base64ToBuffer(data.tag),
        salt: base64ToBuffer(data.salt),
        createdAt: data.createdAt,
        namespacedUserId: data.namespacedUserId,
      };

      return ok(wallet);
    } catch (error) {
      return err(
        new StorageError(
          error instanceof Error ? error.message : "Failed to retrieve wallet",
        ),
      );
    }
  }

  async clear(): Promise<Result<void>> {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return ok(undefined);
    } catch (error) {
      return err(
        new StorageError(
          error instanceof Error ? error.message : "Failed to clear wallet",
        ),
      );
    }
  }

  async hasWallet(namespacedUserId: string): Promise<boolean> {
    const result = await this.retrieve();
    if (result.error || !result.data) return false;
    return result.data.namespacedUserId === namespacedUserId;
  }
}

function bufferToBase64(buffer: Uint8Array): string {
  const bytes = Array.from(buffer);
  const binary = String.fromCharCode.apply(null, bytes);
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
