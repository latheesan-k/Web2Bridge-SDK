import { describe, it, expect, beforeEach } from "vitest";
import type { AuthAdapter } from "../src/auth/adapter";

export interface AdapterTestContext {
  adapter: AuthAdapter;
}

export function createAdapterContractTests(
  getAdapter: () => AuthAdapter | Promise<AuthAdapter>
): void {
  describe("AuthAdapter Contract", () => {
    let adapter: AuthAdapter;

    beforeEach(async () => {
      adapter = await getAdapter();
    });

    describe("providerId", () => {
      it("should have a non-empty providerId", () => {
        expect(adapter.providerId).toBeDefined();
        expect(adapter.providerId.length).toBeGreaterThan(0);
      });

      it("should have a lowercase providerId", () => {
        expect(adapter.providerId).toBe(adapter.providerId.toLowerCase());
      });

      it("should have a stable providerId (lowercase alphanumeric, starting with a letter)", () => {
        const validPattern = /^[a-z][a-z0-9]*$/;
        expect(validPattern.test(adapter.providerId)).toBe(true);
      });
    });

    describe("login()", () => {
      it("should return a Result<void>", async () => {
        const result = await adapter.login();
        
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("error");
        
        if (result.error) {
          expect(result.data).toBeNull();
        } else {
          expect(result.data).toBeUndefined();
        }
      });
    });

    describe("logout()", () => {
      it("should return a Result<void>", async () => {
        const result = await adapter.logout();
        
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("error");
        
        if (result.error) {
          expect(result.data).toBeNull();
        } else {
          expect(result.data).toBeUndefined();
        }
      });
    });

    describe("getUserId()", () => {
      it("should return a Result<string> when authenticated", async () => {
        await adapter.login();
        
        const result = await adapter.getUserId();
        
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("error");
        
        if (!result.error) {
          expect(typeof result.data).toBe("string");
          expect(result.data!.length).toBeGreaterThan(0);
        }
      });

      it("should return null data when not authenticated", async () => {
        await adapter.logout();
        
        const result = await adapter.getUserId();
        
        if (!result.error) {
          expect(result.data).toBeNull();
        }
      });
    });

    describe("isAuthenticated()", () => {
      it("should return boolean", () => {
        const result = adapter.isAuthenticated();
        expect(typeof result).toBe("boolean");
      });

      it("should be consistent with getUserId() after login/logout", async () => {
        const beforeLogin = adapter.isAuthenticated();
        
        if (!beforeLogin) {
          await adapter.login();
        }
        
        const afterLogin = adapter.isAuthenticated();
        const userIdResult = await adapter.getUserId();
        
        expect(afterLogin).toBe(true);
        expect(userIdResult.error).toBeNull();
        expect(userIdResult.data).not.toBeNull();
        
        await adapter.logout();
        
        const afterLogout = adapter.isAuthenticated();
        expect(afterLogout).toBe(false);
      });
    });

    describe("login/logout round-trip", () => {
      it("should complete a full login/logout cycle", async () => {
        expect(adapter.isAuthenticated()).toBe(false);
        
        const loginResult = await adapter.login();
        
        if (!loginResult.error) {
          expect(adapter.isAuthenticated()).toBe(true);
          
          const userIdResult = await adapter.getUserId();
          expect(userIdResult.error).toBeNull();
          expect(userIdResult.data).not.toBeNull();
          
          const logoutResult = await adapter.logout();
          expect(logoutResult.error).toBeNull();
          
          expect(adapter.isAuthenticated()).toBe(false);
        }
      });
    });
  });
}

export function runAdapterContractTests(
  name: string,
  getAdapter: () => AuthAdapter | Promise<AuthAdapter>
): void {
  describe(name, () => {
    createAdapterContractTests(getAdapter);
  });
}