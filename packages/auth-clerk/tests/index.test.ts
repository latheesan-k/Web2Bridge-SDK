import { describe, it, expect } from "vitest";

/**
 * Test that verifies all public exports from the auth-clerk package are accessible.
 * This ensures the index.ts file properly re-exports all modules.
 */
describe("Auth-Clerk Package Index Exports", () => {
  it("exports ClerkAdapter", async () => {
    const exports = await import("../src/index");
    
    expect(exports.ClerkAdapter).toBeDefined();
    expect(typeof exports.ClerkAdapter).toBe("function");
  });

  it("ClerkAdapter is a constructor", async () => {
    const { ClerkAdapter } = await import("../src/index");
    
    // Should be able to create an instance
    const adapter = new ClerkAdapter({ publishableKey: "pk_test_123" });
    expect(adapter).toBeInstanceOf(ClerkAdapter);
    expect(adapter.providerId).toBe("clerk");
  });
});
