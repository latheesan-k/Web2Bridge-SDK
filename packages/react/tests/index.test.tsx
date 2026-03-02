import { describe, it, expect } from "vitest";

/**
 * Test that verifies all public exports from the react package are accessible.
 * This ensures the index.ts file properly re-exports all modules.
 */
describe("React Package Index Exports", () => {
  it("exports all public modules", async () => {
    const exports = await import("../src/index");
    
    // Main exports
    expect(exports.Web2BridgeProvider).toBeDefined();
    expect(exports.useWeb2Bridge).toBeDefined();
    expect(exports.Web2BridgeContext).toBeDefined();
  });

  it("exports are valid React components and hooks", async () => {
    const exports = await import("../src/index");
    
    // Web2BridgeProvider should be a component (function)
    expect(typeof exports.Web2BridgeProvider).toBe("function");
    
    // useWeb2Bridge should be a hook (function)
    expect(typeof exports.useWeb2Bridge).toBe("function");
    
    // Web2BridgeContext should be a React context object
    expect(exports.Web2BridgeContext).toBeDefined();
    expect(typeof exports.Web2BridgeContext).toBe("object");
  });

  it("exports type-only re-exports don't break the build", async () => {
    // Type exports (type Web2BridgeConfig, etc.) don't exist at runtime,
    // but the import should succeed without errors
    const exports = await import("../src/index");
    
    // Verify the import worked
    expect(exports).toBeDefined();
    
    // Runtime values exist
    expect(exports.Web2BridgeProvider).toBeDefined();
    expect(exports.useWeb2Bridge).toBeDefined();
    expect(exports.Web2BridgeContext).toBeDefined();
  });
});
