export * from "./auth/adapter";
export * from "./crypto";
export * from "./derivation";
export * from "./wallet";
export * from "./storage";
export * from "./storage/local";
export * from "./errors";
export * from "./config";

// Re-export wallet factory
export {
  createPRFWallet,
  unlockPasswordWallet,
  clearStoredWallet,
  type WalletCreationResult,
  type PRFWalletOptions,
  type PasswordWalletOptions,
  type EntropyPath,
} from "./wallet/factory";
