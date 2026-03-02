import { describe, it, expect } from "vitest";
import {
  Web2BridgeError,
  PRFNotSupportedError,
  PasskeyRegistrationError,
  PasskeyAuthError,
  AuthAdapterError,
  DerivationError,
  WalletError,
  ExportVerificationError,
  WeakPasswordError,
  PasswordAuthError,
  EntropyPathMismatchError,
} from "../src/errors";

describe("Error classes", () => {
  describe("Web2BridgeError", () => {
    it("sets correct name and message", () => {
      const error = new Web2BridgeError("test error");
      expect(error.name).toBe("Web2BridgeError");
      expect(error.message).toBe("test error");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("PRFNotSupportedError", () => {
    it("uses default message and correct name", () => {
      const error = new PRFNotSupportedError();
      expect(error.name).toBe("PRFNotSupportedError");
      expect(error.message).toBe("WebAuthn PRF is not supported on this device");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("PasskeyRegistrationError", () => {
    it("sets custom message and correct name", () => {
      const error = new PasskeyRegistrationError("registration failed");
      expect(error.name).toBe("PasskeyRegistrationError");
      expect(error.message).toBe("registration failed");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("PasskeyAuthError", () => {
    it("sets custom message and correct name", () => {
      const error = new PasskeyAuthError("auth failed");
      expect(error.name).toBe("PasskeyAuthError");
      expect(error.message).toBe("auth failed");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("AuthAdapterError", () => {
    it("sets custom message and correct name", () => {
      const error = new AuthAdapterError("adapter error");
      expect(error.name).toBe("AuthAdapterError");
      expect(error.message).toBe("adapter error");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("DerivationError", () => {
    it("sets custom message and correct name", () => {
      const error = new DerivationError("derivation failed");
      expect(error.name).toBe("DerivationError");
      expect(error.message).toBe("derivation failed");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("WalletError", () => {
    it("sets custom message and correct name", () => {
      const error = new WalletError("wallet error");
      expect(error.name).toBe("WalletError");
      expect(error.message).toBe("wallet error");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("ExportVerificationError", () => {
    it("sets custom message and correct name", () => {
      const error = new ExportVerificationError("verification failed");
      expect(error.name).toBe("ExportVerificationError");
      expect(error.message).toBe("verification failed");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("WeakPasswordError", () => {
    it("uses default message when none provided", () => {
      const error = new WeakPasswordError();
      expect(error.name).toBe("WeakPasswordError");
      expect(error.message).toBe("Password does not meet minimum strength requirements");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });

    it("uses custom message when provided", () => {
      const error = new WeakPasswordError("too short");
      expect(error.name).toBe("WeakPasswordError");
      expect(error.message).toBe("too short");
    });
  });

  describe("PasswordAuthError", () => {
    it("sets custom message and correct name", () => {
      const error = new PasswordAuthError("password auth failed");
      expect(error.name).toBe("PasswordAuthError");
      expect(error.message).toBe("password auth failed");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });
  });

  describe("EntropyPathMismatchError", () => {
    it("uses default message when none provided", () => {
      const error = new EntropyPathMismatchError();
      expect(error.name).toBe("EntropyPathMismatchError");
      expect(error.message).toContain("Entropy path mismatch");
      expect(error).toBeInstanceOf(Web2BridgeError);
    });

    it("uses custom message when provided", () => {
      const error = new EntropyPathMismatchError("custom mismatch");
      expect(error.name).toBe("EntropyPathMismatchError");
      expect(error.message).toBe("custom mismatch");
    });
  });

  describe("Inheritance chain", () => {
    it("all errors extend Web2BridgeError which extends Error", () => {
      const errors = [
        new PRFNotSupportedError(),
        new PasskeyRegistrationError("test"),
        new PasskeyAuthError("test"),
        new AuthAdapterError("test"),
        new DerivationError("test"),
        new WalletError("test"),
        new ExportVerificationError("test"),
        new WeakPasswordError(),
        new PasswordAuthError("test"),
        new EntropyPathMismatchError(),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(Web2BridgeError);
        expect(error).toBeInstanceOf(Error);
        expect(error.stack).toBeDefined();
      }
    });
  });
});
