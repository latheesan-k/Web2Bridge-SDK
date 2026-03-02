import { describe, it, expect } from "vitest";
import { getDefaultConfig, type Web2BridgeConfig } from "../src/config";

describe("Config Module", () => {
  describe("getDefaultConfig", () => {
    it("returns default values for minimal config", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
      };

      const result = getDefaultConfig(config);

      expect(result.appDomain).toBe("example.com");
      expect(result.networkId).toBe(1);
      expect(result.kdf).toBe("hkdf");
      expect(result.fallback.enabled).toBe(true);
      expect(result.fallback.kdf).toBe("argon2id");
    });

    it("preserves provided networkId", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
        networkId: 0,
      };

      const result = getDefaultConfig(config);
      expect(result.networkId).toBe(0);
    });

    it("preserves provided kdf algorithm", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
        kdf: "pbkdf2",
      };

      const result = getDefaultConfig(config);
      expect(result.kdf).toBe("pbkdf2");
    });

    it("allows disabling fallback", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
        fallback: {
          enabled: false,
        },
      };

      const result = getDefaultConfig(config);
      expect(result.fallback.enabled).toBe(false);
    });

    it("allows setting fallback KDF", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
        fallback: {
          kdf: "pbkdf2",
        },
      };

      const result = getDefaultConfig(config);
      expect(result.fallback.kdf).toBe("pbkdf2");
    });

    it("preserves both fallback settings when provided", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
        networkId: 1,
        kdf: "argon2id",
        fallback: {
          enabled: false,
          kdf: "pbkdf2",
        },
      };

      const result = getDefaultConfig(config);

      expect(result.appDomain).toBe("example.com");
      expect(result.networkId).toBe(1);
      expect(result.kdf).toBe("argon2id");
      expect(result.fallback.enabled).toBe(false);
      expect(result.fallback.kdf).toBe("pbkdf2");
    });

    it("uses default fallback when fallback is not provided", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
      };

      const result = getDefaultConfig(config);
      expect(result.fallback.enabled).toBe(true);
      expect(result.fallback.kdf).toBe("argon2id");
    });

    it("uses default fallback.kdf when only fallback.enabled is provided", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
        fallback: {
          enabled: false,
        },
      };

      const result = getDefaultConfig(config);
      expect(result.fallback.enabled).toBe(false);
      expect(result.fallback.kdf).toBe("argon2id");
    });

    it("uses default fallback.enabled when only fallback.kdf is provided", () => {
      const config: Web2BridgeConfig = {
        appDomain: "example.com",
        fallback: {
          kdf: "pbkdf2",
        },
      };

      const result = getDefaultConfig(config);
      expect(result.fallback.enabled).toBe(true);
      expect(result.fallback.kdf).toBe("pbkdf2");
    });
  });
});
