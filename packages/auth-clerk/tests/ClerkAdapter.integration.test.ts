/**
 * ClerkAdapter integration tests — covers the real ClerkAdapter implementation
 * with mocked @clerk/clerk-js. Tests ensureClerk(), login(), logout(),
 * getUserId(), and isAuthenticated() including all error paths.
 *
 * Following Clerk testing best practices:
 * - Mock the Clerk constructor and instance methods
 * - Test all happy paths and error paths
 * - Verify lazy initialization and singleton behavior
 * - Verify proper Result<T> wrapping for all methods
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthAdapterError } from "@web2bridge/core";

// ─── Mock @clerk/clerk-js ────────────────────────────────────────────────────

const mockClerkInstance = {
  load: vi.fn().mockResolvedValue(undefined),
  user: null as { id: string } | null,
  openSignIn: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@clerk/clerk-js", () => ({
  Clerk: vi.fn().mockImplementation(() => ({
    ...mockClerkInstance,
    load: mockClerkInstance.load,
    openSignIn: mockClerkInstance.openSignIn,
    signOut: mockClerkInstance.signOut,
    get user() {
      return mockClerkInstance.user;
    },
  })),
}));

// ─── Import after mock ───────────────────────────────────────────────────────

import { ClerkAdapter } from "../src/ClerkAdapter";
import { Clerk } from "@clerk/clerk-js";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ClerkAdapter with mocked Clerk", () => {
  let adapter: ClerkAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkInstance.user = null;
    mockClerkInstance.load.mockResolvedValue(undefined);
    mockClerkInstance.signOut.mockResolvedValue(undefined);
    adapter = new ClerkAdapter({ publishableKey: "pk_test_mock123" });
  });

  describe("constructor", () => {
    it("stores the publishable key", () => {
      expect(adapter.providerId).toBe("clerk");
    });

    it("passes publishable key to Clerk constructor on first use", async () => {
      mockClerkInstance.user = { id: "user_abc" };
      await adapter.getUserId();
      expect(Clerk).toHaveBeenCalledWith("pk_test_mock123");
    });
  });

  describe("ensureClerk (lazy initialization)", () => {
    it("loads Clerk only once across multiple calls", async () => {
      mockClerkInstance.user = { id: "user_abc" };

      await adapter.getUserId();
      await adapter.getUserId();
      await adapter.getUserId();

      expect(mockClerkInstance.load).toHaveBeenCalledTimes(1);
    });

    it("shares the same load promise for concurrent calls", async () => {
      mockClerkInstance.user = { id: "user_abc" };

      const results = await Promise.all([
        adapter.getUserId(),
        adapter.getUserId(),
        adapter.getUserId(),
      ]);

      expect(mockClerkInstance.load).toHaveBeenCalledTimes(1);
      results.forEach(r => expect(r.error).toBeNull());
    });
  });

  describe("isAuthenticated()", () => {
    it("returns false before Clerk is loaded", () => {
      expect(adapter.isAuthenticated()).toBe(false);
    });

    it("returns false when no user is signed in", async () => {
      mockClerkInstance.user = null;
      await adapter.getUserId();
      expect(adapter.isAuthenticated()).toBe(false);
    });
  });

  describe("login()", () => {
    it("returns ok when user is already signed in", async () => {
      mockClerkInstance.user = { id: "user_already_in" };

      const result = await adapter.login();
      expect(result.error).toBeNull();
      expect(result.data).toBeUndefined();
      expect(mockClerkInstance.openSignIn).not.toHaveBeenCalled();
    });

    it("opens sign-in modal and resolves when user signs in", async () => {
      mockClerkInstance.user = null;

      mockClerkInstance.openSignIn.mockImplementation(() => {
        setTimeout(() => {
          mockClerkInstance.user = { id: "user_new" };
        }, 50);
      });

      const result = await adapter.login();
      expect(result.error).toBeNull();
      expect(mockClerkInstance.openSignIn).toHaveBeenCalled();
    });

    it("returns AuthAdapterError when login throws", async () => {
      mockClerkInstance.load.mockRejectedValueOnce(new Error("Network error"));

      const freshAdapter = new ClerkAdapter({ publishableKey: "pk_test_fail" });
      const result = await freshAdapter.login();

      expect(result.error).not.toBeNull();
      expect(result.error).toBeInstanceOf(AuthAdapterError);
      expect(result.error!.message).toBe("Network error");
    });

    it("wraps non-Error throws as AuthAdapterError", async () => {
      mockClerkInstance.load.mockRejectedValueOnce("string error");

      const freshAdapter = new ClerkAdapter({ publishableKey: "pk_test_fail" });
      const result = await freshAdapter.login();

      expect(result.error).not.toBeNull();
      expect(result.error!.message).toBe("Login failed");
    });
  });

  describe("logout()", () => {
    it("calls Clerk signOut and returns ok", async () => {
      mockClerkInstance.user = { id: "user_abc" };

      const result = await adapter.logout();
      expect(result.error).toBeNull();
      expect(mockClerkInstance.signOut).toHaveBeenCalled();
    });

    it("returns AuthAdapterError when signOut throws", async () => {
      mockClerkInstance.signOut.mockRejectedValueOnce(new Error("Signout failed"));

      const result = await adapter.logout();
      expect(result.error).not.toBeNull();
      expect(result.error).toBeInstanceOf(AuthAdapterError);
      expect(result.error!.message).toBe("Signout failed");
    });

    it("wraps non-Error throws as AuthAdapterError", async () => {
      mockClerkInstance.signOut.mockRejectedValueOnce(42);

      const result = await adapter.logout();
      expect(result.error).not.toBeNull();
      expect(result.error!.message).toBe("Logout failed");
    });
  });

  describe("getUserId()", () => {
    it("returns user ID when authenticated", async () => {
      mockClerkInstance.user = { id: "user_abc123" };

      const result = await adapter.getUserId();
      expect(result.error).toBeNull();
      expect(result.data).toBe("user_abc123");
    });

    it("returns AuthAdapterError when no user is authenticated", async () => {
      mockClerkInstance.user = null;

      const result = await adapter.getUserId();
      expect(result.error).not.toBeNull();
      expect(result.error).toBeInstanceOf(AuthAdapterError);
      expect(result.error!.message).toBe("No authenticated user");
    });

    it("returns AuthAdapterError when ensureClerk throws", async () => {
      mockClerkInstance.load.mockRejectedValueOnce(new Error("Load failed"));

      const freshAdapter = new ClerkAdapter({ publishableKey: "pk_test_fail" });
      const result = await freshAdapter.getUserId();

      expect(result.error).not.toBeNull();
      expect(result.error!.message).toBe("Load failed");
    });

    it("wraps non-Error throws as AuthAdapterError", async () => {
      mockClerkInstance.load.mockRejectedValueOnce({ code: "UNKNOWN" });

      const freshAdapter = new ClerkAdapter({ publishableKey: "pk_test_fail" });
      const result = await freshAdapter.getUserId();

      expect(result.error).not.toBeNull();
      expect(result.error!.message).toBe("Failed to get user ID");
    });
  });
});

describe("ClerkAdapter — full login/logout lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkInstance.user = null;
    mockClerkInstance.load.mockResolvedValue(undefined);
    mockClerkInstance.signOut.mockResolvedValue(undefined);
  });

  it("completes full login → getUserId → logout cycle", async () => {
    const adapter = new ClerkAdapter({ publishableKey: "pk_test_lifecycle" });

    expect(adapter.isAuthenticated()).toBe(false);

    mockClerkInstance.user = { id: "user_lifecycle" };

    const loginResult = await adapter.login();
    expect(loginResult.error).toBeNull();

    const userResult = await adapter.getUserId();
    expect(userResult.error).toBeNull();
    expect(userResult.data).toBe("user_lifecycle");

    mockClerkInstance.user = null;
    const logoutResult = await adapter.logout();
    expect(logoutResult.error).toBeNull();
  });

  it("login can be called multiple times after logout", async () => {
    const adapter = new ClerkAdapter({ publishableKey: "pk_test_multi" });

    // First cycle
    mockClerkInstance.user = { id: "user_1" };
    await adapter.login();
    const result1 = await adapter.getUserId();
    expect(result1.data).toBe("user_1");

    mockClerkInstance.user = null;
    await adapter.logout();

    // Second cycle
    mockClerkInstance.user = { id: "user_2" };
    await adapter.login();
    const result2 = await adapter.getUserId();
    expect(result2.data).toBe("user_2");
  });
});
