import { describe, it, expect, vi } from "vitest";
import { createWallet, generateMnemonicPhrase, type Web2BridgeWallet } from "../src/wallet";

describe("Wallet Module", () => {
  describe("generateMnemonicPhrase", () => {
    it("should generate 24-word mnemonic by default", () => {
      const mnemonic = generateMnemonicPhrase();
      
      expect(mnemonic).toHaveLength(24);
      expect(mnemonic.every(word => typeof word === "string")).toBe(true);
      expect(mnemonic.every(word => word.length > 0)).toBe(true);
    });

    it("should generate 12-word mnemonic for 128 bits", () => {
      const mnemonic = generateMnemonicPhrase(128);
      
      expect(mnemonic).toHaveLength(12);
    });

    it("should generate unique mnemonics", () => {
      const mnemonic1 = generateMnemonicPhrase();
      const mnemonic2 = generateMnemonicPhrase();
      
      expect(mnemonic1).not.toEqual(mnemonic2);
    });
  });

  describe("createWallet", () => {
    it("should create wallet with valid mnemonic", () => {
      const mnemonic = generateMnemonicPhrase();
      const result = createWallet(mnemonic, 0, { networkId: 0 });
      
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
    });

    it("should create wallet with networkId 0 (testnet)", () => {
      const mnemonic = generateMnemonicPhrase();
      const result = createWallet(mnemonic, 123, { networkId: 0 });
      
      expect(result.error).toBeNull();
      const wallet = result.data as Web2BridgeWallet;
      
      expect(wallet).not.toBeNull();
    });

    it("should create wallet with networkId 1 (mainnet)", () => {
      const mnemonic = generateMnemonicPhrase();
      const result = createWallet(mnemonic, 456, { networkId: 1 });
      
      expect(result.error).toBeNull();
      const wallet = result.data as Web2BridgeWallet;
      
      expect(wallet).not.toBeNull();
    });

    it("should create wallet with fetcher option", () => {
      const mnemonic = generateMnemonicPhrase();
      const mockFetcher = { fetch: vi.fn() };
      const result = createWallet(mnemonic, 0, { networkId: 0, fetcher: mockFetcher });
      
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
    });

    it("should create wallet with submitter option", () => {
      const mnemonic = generateMnemonicPhrase();
      const mockSubmitter = { submit: vi.fn() };
      const result = createWallet(mnemonic, 0, { networkId: 0, submitter: mockSubmitter });
      
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
    });

    it("should create wallet with both fetcher and submitter options", () => {
      const mnemonic = generateMnemonicPhrase();
      const mockFetcher = { fetch: vi.fn() };
      const mockSubmitter = { submit: vi.fn() };
      const result = createWallet(mnemonic, 0, { networkId: 0, fetcher: mockFetcher, submitter: mockSubmitter });
      
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
    });

    it("should return error for invalid inputs", () => {
      const result = createWallet([], 0, { networkId: 0 });
      
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it("should return error for empty mnemonic array", () => {
      const result = createWallet([], 100, { networkId: 0 });
      
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
      expect(result.error?.name).toBe("WalletError");
    });
  });

  describe("Addresses", () => {
    it("should get used addresses (testnet)", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getUsedAddresses();
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toMatch(/^addr_test1/);
    });

    it("should get unused addresses", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getUnusedAddresses();
      expect(result.error).toBeNull();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should get change address (testnet)", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getChangeAddress();
      expect(result.error).toBeNull();
      expect(result.data).toMatch(/^addr_test1/);
    });

    it("should get reward (stake) addresses (testnet)", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getRewardAddresses();
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toMatch(/^stake_test1/);
    });

    it("should get mainnet address prefixes", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 1 }).data!;
      
      const used = await wallet.getUsedAddresses();
      expect(used.data![0]).toMatch(/^addr1/);

      const reward = await wallet.getRewardAddresses();
      expect(reward.data![0]).toMatch(/^stake1/);
    });
  });

  describe("Network", () => {
    it("should return network ID 0 for testnet", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getNetworkId();
      expect(result.error).toBeNull();
      expect(result.data).toBe(0);
    });

    it("should return network ID 1 for mainnet", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 1 }).data!;
      
      const result = await wallet.getNetworkId();
      expect(result.error).toBeNull();
      expect(result.data).toBe(1);
    });
  });

  describe("Balance & Assets (require fetcher)", () => {
    it("getBalance returns WalletError without fetcher", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getBalance();
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });

    it("getLovelace returns WalletError without fetcher", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getLovelace();
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });

    it("getAssets returns WalletError without fetcher", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getAssets();
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });

    it("getPolicyIds returns WalletError without fetcher", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getPolicyIds();
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });

    it("getPolicyIdAssets returns WalletError without fetcher", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getPolicyIdAssets("abc123");
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });
  });

  describe("UTxOs (require fetcher)", () => {
    it("getUtxos returns WalletError without fetcher", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getUtxos();
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });

    it("getCollateral returns WalletError without fetcher", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.getCollateral();
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });
  });

  describe("Signing", () => {
    it("signTx returns WalletError for invalid CBOR", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.signTx("invalid-cbor");
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });

    it("signTxs returns WalletError for invalid CBOR", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.signTxs(["invalid-cbor"]);
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });

    it("signData succeeds with a valid address and payload", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;

      const addr = (await wallet.getUsedAddresses()).data![0];
      const result = await wallet.signData(addr, "test payload");
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
    });

    it("signData returns WalletError for invalid address", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;

      const result = await wallet.signData("addr_test1invalid", "test payload");
      expect(result.error).not.toBeNull();
    });
  });

  describe("Submission", () => {
    it("submitTx returns WalletError without submitter", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet = createWallet(mnemonic, 0, { networkId: 0 }).data!;
      
      const result = await wallet.submitTx("fake-signed-tx");
      expect(result.error).not.toBeNull();
      expect(result.error!.name).toBe("WalletError");
    });
  });

  describe("Determinism", () => {
    it("should create wallet with same mnemonic consistently", () => {
      const testMnemonic = generateMnemonicPhrase();
      
      const result1 = createWallet(testMnemonic, 0, { networkId: 0 });
      const result2 = createWallet(testMnemonic, 0, { networkId: 0 });
      
      expect(result1.error).toBeNull();
      expect(result2.error).toBeNull();
    });

    it("same mnemonic produces same addresses", async () => {
      const mnemonic = generateMnemonicPhrase();
      const wallet1 = createWallet(mnemonic, 42, { networkId: 0 }).data!;
      const wallet2 = createWallet(mnemonic, 42, { networkId: 0 }).data!;

      const addr1 = await wallet1.getUsedAddresses();
      const addr2 = await wallet2.getUsedAddresses();
      expect(addr1.data).toEqual(addr2.data);

      const stake1 = await wallet1.getRewardAddresses();
      const stake2 = await wallet2.getRewardAddresses();
      expect(stake1.data).toEqual(stake2.data);
    });
  });
});
