export type EntropyPath = "prf" | "password" | null;

export type KdfAlgorithm = "hkdf" | "pbkdf2" | "argon2id";

export type FallbackKdfAlgorithm = "pbkdf2" | "argon2id";

export type NetworkId = 0 | 1;

export interface KdfOptions {
  algorithm: KdfAlgorithm;
}

export interface FallbackKdfOptions {
  algorithm: FallbackKdfAlgorithm;
}

export interface FallbackConfig {
  enabled?: boolean;
  kdf?: FallbackKdfAlgorithm;
}

export interface Web2BridgeConfig {
  appDomain: string;
  networkId?: NetworkId;
  kdf?: KdfAlgorithm;
  fallback?: FallbackConfig;
}

export interface Web2BridgeProviderConfig extends Web2BridgeConfig {
  fallback: FallbackConfig;
}

export function getDefaultConfig(config: Web2BridgeConfig): Web2BridgeProviderConfig {
  return {
    appDomain: config.appDomain,
    networkId: config.networkId ?? 1,
    kdf: config.kdf ?? "hkdf",
    fallback: {
      enabled: config.fallback?.enabled ?? true,
      kdf: config.fallback?.kdf ?? "argon2id",
    },
  };
}
