import type { Result } from "../auth/adapter";
import { WalletError } from "../errors";
import type { NetworkId } from "../config";
import {
  MeshWallet,
  generateMnemonic,
  resolveRewardAddress,
  type DataSignature,
  type Asset,
  type AssetExtended,
  type UTxO,
} from "@meshsdk/core";

/**
 * Complete CIP-30 compatible wallet interface.
 *
 * Every method returns `Result<T>` — consumers never need `try/catch`.
 * Methods that query on-chain data (balances, UTxOs, assets) require a
 * `fetcher` to be provided when creating the wallet. Methods that submit
 * transactions require a `submitter`.
 */
export interface Web2BridgeWallet {
  // ── Addresses ──────────────────────────────────────────────────────

  /** Returns a list of used (derived) addresses controlled by the wallet. */
  getUsedAddresses(): Promise<Result<string[]>>;

  /** Returns a list of unused addresses controlled by the wallet. */
  getUnusedAddresses(): Promise<Result<string[]>>;

  /** Returns the change address for returning leftover assets during transaction creation. */
  getChangeAddress(): Promise<Result<string>>;

  /** Returns the stake / reward addresses. The stake address is the primary unique on-chain identity. */
  getRewardAddresses(): Promise<Result<string[]>>;

  // ── Network ────────────────────────────────────────────────────────

  /** Returns the network ID. `0` = testnet/preprod, `1` = mainnet. */
  getNetworkId(): Promise<Result<number>>;

  // ── Balance & Assets ───────────────────────────────────────────────
  // These methods require a `fetcher` to be configured at wallet creation.

  /** Returns all assets in the wallet. Each asset has a `unit` (policy + asset name hex) and `quantity`. */
  getBalance(): Promise<Result<Asset[]>>;

  /** Returns the ADA balance in lovelace (1 ADA = 1,000,000 lovelace). */
  getLovelace(): Promise<Result<string>>;

  /** Returns detailed asset information including policy ID, asset name, and fingerprint. */
  getAssets(): Promise<Result<AssetExtended[]>>;

  /** Returns assets belonging to a specific policy ID. */
  getPolicyIdAssets(policyId: string): Promise<Result<AssetExtended[]>>;

  /** Returns all unique policy IDs of assets held by the wallet. */
  getPolicyIds(): Promise<Result<string[]>>;

  // ── UTxOs ──────────────────────────────────────────────────────────
  // These methods require a `fetcher` to be configured at wallet creation.

  /** Returns all UTxOs (unspent transaction outputs) controlled by the wallet. */
  getUtxos(): Promise<Result<UTxO[]>>;

  /** Returns UTxOs suitable for use as collateral in Plutus transactions. */
  getCollateral(): Promise<Result<UTxO[]>>;

  // ── Signing ────────────────────────────────────────────────────────

  /**
   * Sign a transaction. Returns the signed transaction in CBOR hex.
   * @param txCbor — unsigned transaction in CBOR hex
   * @param partialSign — set `true` when the transaction needs multiple signers
   */
  signTx(txCbor: string, partialSign?: boolean): Promise<Result<string>>;

  /**
   * Sign multiple transactions at once. Returns an array of signed transactions in CBOR hex.
   * @param txsCbor — array of unsigned transactions in CBOR hex
   * @param partialSign — set `true` when the transactions need multiple signers
   */
  signTxs(txsCbor: string[], partialSign?: boolean): Promise<Result<string[]>>;

  /**
   * Sign arbitrary data (CIP-8 message signing).
   * @param address — the address to sign with
   * @param payload — string or hex payload to sign
   */
  signData(address: string, payload: string): Promise<Result<string>>;

  // ── Submission ─────────────────────────────────────────────────────
  // Requires a `submitter` to be configured at wallet creation.

  /**
   * Submit a signed transaction to the blockchain.
   * @param txCbor — signed transaction in CBOR hex
   * @returns the transaction hash
   */
  submitTx(txCbor: string): Promise<Result<string>>;
}

export interface WalletOptions {
  networkId: NetworkId;
  /** Blockchain data provider for querying UTxOs, balances, and assets. */
  fetcher?: unknown;
  /** Transaction submission provider. */
  submitter?: unknown;
}

export class Web2BridgeWalletImpl implements Web2BridgeWallet {
  private wallet: MeshWallet;
  private networkId: NetworkId;

  constructor(mnemonic: string[], appId: number, options: WalletOptions) {
    this.networkId = options.networkId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walletConfig: any = {
      networkId: options.networkId,
      accountIndex: appId,
      key: {
        type: "mnemonic",
        words: mnemonic,
      },
    };

    if (options.fetcher) {
      walletConfig.fetcher = options.fetcher;
    }
    if (options.submitter) {
      walletConfig.submitter = options.submitter;
    }

    this.wallet = new MeshWallet(walletConfig);
  }

  // ── Addresses ──────────────────────────────────────────────────────

  async getUsedAddresses(): Promise<Result<string[]>> {
    try {
      const addresses = await this.wallet.getUsedAddresses();
      return { data: addresses, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get used addresses",
        ),
      };
    }
  }

  async getUnusedAddresses(): Promise<Result<string[]>> {
    try {
      const addresses = await this.wallet.getUnusedAddresses();
      return { data: addresses, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get unused addresses",
        ),
      };
    }
  }

  async getChangeAddress(): Promise<Result<string>> {
    try {
      const address = await this.wallet.getChangeAddress();
      return { data: address, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get change address",
        ),
      };
    }
  }

  async getRewardAddresses(): Promise<Result<string[]>> {
    try {
      const usedAddresses = await this.wallet.getUsedAddresses();
      if (usedAddresses.length === 0) {
        return { data: [], error: null };
      }
      const stakeAddress = resolveRewardAddress(usedAddresses[0]);
      return { data: [stakeAddress], error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get reward addresses",
        ),
      };
    }
  }

  // ── Network ────────────────────────────────────────────────────────

  async getNetworkId(): Promise<Result<number>> {
    return { data: this.networkId, error: null };
  }

  // ── Balance & Assets ───────────────────────────────────────────────

  async getBalance(): Promise<Result<Asset[]>> {
    try {
      const balance = await this.wallet.getBalance();
      return { data: balance, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get balance",
        ),
      };
    }
  }

  async getLovelace(): Promise<Result<string>> {
    try {
      const lovelace = await this.wallet.getLovelace();
      return { data: lovelace, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get lovelace balance",
        ),
      };
    }
  }

  async getAssets(): Promise<Result<AssetExtended[]>> {
    try {
      const assets = await this.wallet.getAssets();
      return { data: assets, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get assets",
        ),
      };
    }
  }

  async getPolicyIdAssets(policyId: string): Promise<Result<AssetExtended[]>> {
    try {
      const assets = await this.wallet.getPolicyIdAssets(policyId);
      return { data: assets, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get policy assets",
        ),
      };
    }
  }

  async getPolicyIds(): Promise<Result<string[]>> {
    try {
      const policyIds = await this.wallet.getPolicyIds();
      return { data: policyIds, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get policy IDs",
        ),
      };
    }
  }

  // ── UTxOs ──────────────────────────────────────────────────────────

  async getUtxos(): Promise<Result<UTxO[]>> {
    try {
      const utxos = await this.wallet.getUtxos();
      return { data: utxos, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get UTxOs",
        ),
      };
    }
  }

  async getCollateral(): Promise<Result<UTxO[]>> {
    try {
      const collateral = await this.wallet.getCollateral();
      return { data: collateral, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to get collateral",
        ),
      };
    }
  }

  // ── Signing ────────────────────────────────────────────────────────

  async signTx(txCbor: string, partialSign: boolean = false): Promise<Result<string>> {
    try {
      const signedTx = await this.wallet.signTx(txCbor, partialSign);
      return { data: signedTx, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to sign transaction",
        ),
      };
    }
  }

  async signTxs(txsCbor: string[], partialSign: boolean = false): Promise<Result<string[]>> {
    try {
      const signedTxs = await this.wallet.signTxs(txsCbor, partialSign);
      return { data: signedTxs, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to sign transactions",
        ),
      };
    }
  }

  async signData(address: string, payload: string): Promise<Result<string>> {
    try {
      // MeshWallet.signData takes (payload, address) — it handles UTF-8→hex internally
      const signature: DataSignature = await this.wallet.signData(payload, address);
      return { data: signature.signature, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to sign data",
        ),
      };
    }
  }

  // ── Submission ─────────────────────────────────────────────────────

  async submitTx(txCbor: string): Promise<Result<string>> {
    try {
      const txHash = await this.wallet.submitTx(txCbor);
      return { data: txHash, error: null };
    } catch (error) {
      return {
        data: null,
        error: new WalletError(
          error instanceof Error ? error.message : "Failed to submit transaction",
        ),
      };
    }
  }
}

export function createWallet(
  mnemonic: string[],
  _appId: number,
  options: WalletOptions,
): Result<Web2BridgeWallet> {
  try {
    const wallet = new Web2BridgeWalletImpl(mnemonic, _appId, options);
    return { data: wallet, error: null };
  } catch (error) {
    return {
      data: null,
      error: new WalletError(
        error instanceof Error ? error.message : "Failed to create wallet",
      ),
    };
  }
}

export function generateMnemonicPhrase(strength: 128 | 256 = 256): string[] {
  const mnemonicString = generateMnemonic(strength);
  return mnemonicString.split(" ");
}

export {
  MeshWallet,
  generateMnemonic,
  resolveRewardAddress,
  type DataSignature,
  type Asset,
  type AssetExtended,
  type UTxO,
} from "@meshsdk/core";
