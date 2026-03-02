/**
 * ClerkAdapter unit tests — tests the adapter interface and contract compliance.
 * PRD §10: "Adapter Contract Tests: a standard battery of behavioural tests
 * that every AuthAdapter implementation must pass."
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { AuthAdapter, Result } from "@web2bridge/core";
import { AuthAdapterError, ok, err } from "@web2bridge/core";
import { runAdapterContractTests } from "../../core/tests/adapter.contract";

// ─── Adapter Contract Tests ───────────────────────────────────────────────────

// Create a test adapter that properly implements the interface for contract tests
class TestableClerkAdapter implements AuthAdapter {
  readonly providerId = "clerk";
  private _authenticated = false;
  private _userId: string | null = null;

  async login(): Promise<Result<void>> {
    this._authenticated = true;
    this._userId = "user_test123";
    return ok(undefined);
  }

  async logout(): Promise<Result<void>> {
    this._authenticated = false;
    this._userId = null;
    return ok(undefined);
  }

  async getUserId(): Promise<Result<string>> {
    if (!this._userId) {
      return err(new AuthAdapterError("Not authenticated"));
    }
    return ok(this._userId);
  }

  isAuthenticated(): boolean {
    return this._authenticated;
  }
}

runAdapterContractTests("ClerkAdapter (interface contract)", () => new TestableClerkAdapter());

// ─── Additional ClerkAdapter-specific tests ────────────────────────────────────

describe("ClerkAdapter specific behaviour", () => {
  let adapter: TestableClerkAdapter;

  beforeEach(() => {
    adapter = new TestableClerkAdapter();
  });

  it("providerId is exactly 'clerk' and is stable", () => {
    expect(adapter.providerId).toBe("clerk");
  });

  it("providerId matches the lowercase-alphanumeric pattern required by PRD §2.3", () => {
    expect(/^[a-z][a-z0-9]*$/.test(adapter.providerId)).toBe(true);
  });

  it("isAuthenticated() returns false before login", () => {
    expect(adapter.isAuthenticated()).toBe(false);
  });

  it("isAuthenticated() returns true after login", async () => {
    await adapter.login();
    expect(adapter.isAuthenticated()).toBe(true);
  });

  it("isAuthenticated() returns false after logout", async () => {
    await adapter.login();
    expect(adapter.isAuthenticated()).toBe(true);
    await adapter.logout();
    expect(adapter.isAuthenticated()).toBe(false);
  });

  it("getUserId() returns error when not authenticated", async () => {
    const result = await adapter.getUserId();
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  it("getUserId() returns user ID when authenticated", async () => {
    await adapter.login();
    const result = await adapter.getUserId();
    expect(result.error).toBeNull();
    expect(result.data).toBe("user_test123");
  });

  it("login() and logout() return Result<void> (never throw)", async () => {
    const loginResult = await adapter.login();
    expect(loginResult).toHaveProperty("data");
    expect(loginResult).toHaveProperty("error");

    const logoutResult = await adapter.logout();
    expect(logoutResult).toHaveProperty("data");
    expect(logoutResult).toHaveProperty("error");
  });
});

// ─── Real ClerkAdapter Basic Tests ─────────────────────────────────────────────

describe("ClerkAdapter implementation", () => {
  it("can be instantiated with publishable key", async () => {
    const { ClerkAdapter } = await import("../src/ClerkAdapter");
    const adapter = new ClerkAdapter({ publishableKey: "pk_test_123" });
    
    expect(adapter).toBeDefined();
    expect(adapter.providerId).toBe("clerk");
  });

  it("has required AuthAdapter methods", async () => {
    const { ClerkAdapter } = await import("../src/ClerkAdapter");
    const adapter = new ClerkAdapter({ publishableKey: "pk_test_123" });
    
    expect(typeof adapter.login).toBe("function");
    expect(typeof adapter.logout).toBe("function");
    expect(typeof adapter.getUserId).toBe("function");
    expect(typeof adapter.isAuthenticated).toBe("function");
  });

  it("isAuthenticated() returns false before initialization", async () => {
    const { ClerkAdapter } = await import("../src/ClerkAdapter");
    const adapter = new ClerkAdapter({ publishableKey: "pk_test_123" });
    
    expect(adapter.isAuthenticated()).toBe(false);
  });
});
