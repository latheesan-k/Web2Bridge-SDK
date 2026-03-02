/**
 * ClerkAdapter — wraps @clerk/clerk-js (npm package, not a CDN script tag).
 * Loading via npm avoids any CDN Subresource Integrity risk (SEC-03).
 * PRD §3, §7.3.
 */
import { Clerk } from "@clerk/clerk-js";
import type { AuthAdapter, Result } from "@web2bridge/core";
import { AuthAdapterError, ok, err } from "@web2bridge/core";

export interface ClerkAdapterConfig {
  publishableKey: string;
}

export class ClerkAdapter implements AuthAdapter {
  /** Stable provider identifier — MUST NOT change after first deployment. PRD §2.3. */
  readonly providerId = "clerk";

  private readonly publishableKey: string;
  private clerk: InstanceType<typeof Clerk> | null = null;
  private loadPromise: Promise<InstanceType<typeof Clerk>> | null = null;

  constructor(config: ClerkAdapterConfig) {
    this.publishableKey = config.publishableKey;
  }

  /**
   * Lazily initialises the Clerk instance and calls `load()`.
   * Concurrent callers share the same promise, so Clerk is only loaded once.
   */
  private async ensureClerk(): Promise<InstanceType<typeof Clerk>> {
    if (this.clerk) return this.clerk;

    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const instance = new Clerk(this.publishableKey);
      await instance.load();
      this.clerk = instance;
      return instance;
    })();

    return this.loadPromise;
  }

  async login(): Promise<Result<void>> {
    try {
      const clerk = await this.ensureClerk();

      if (clerk.user) {
        return ok(undefined);
      }

      await new Promise<void>((resolve, reject) => {
        clerk.openSignIn({});

        // Poll until the user is signed in or the modal is abandoned.
        const check = setInterval(() => {
          if (clerk.user) {
            clearInterval(check);
            resolve();
          }
        }, 200);

        // 5-minute timeout — user closed modal without signing in.
        const timer = setTimeout(() => {
          clearInterval(check);
          reject(new Error("Sign-in timed out or was cancelled"));
        }, 300_000);

        // Clean up timer if resolved early
        void Promise.resolve().then(() => {
          if (clerk.user) {
            clearInterval(check);
            clearTimeout(timer);
            resolve();
          }
        });
      });

      return ok(undefined);
    } catch (error) {
      return err(
        new AuthAdapterError(error instanceof Error ? error.message : "Login failed"),
      );
    }
  }

  async logout(): Promise<Result<void>> {
    try {
      const clerk = await this.ensureClerk();
      await clerk.signOut();
      return ok(undefined);
    } catch (error) {
      return err(
        new AuthAdapterError(error instanceof Error ? error.message : "Logout failed"),
      );
    }
  }

  async getUserId(): Promise<Result<string>> {
    try {
      const clerk = await this.ensureClerk();

      if (!clerk.user) {
        return err(new AuthAdapterError("No authenticated user"));
      }

      return ok(clerk.user.id);
    } catch (error) {
      return err(
        new AuthAdapterError(
          error instanceof Error ? error.message : "Failed to get user ID",
        ),
      );
    }
  }

  /**
   * Synchronous auth check — safe to call before `ensureClerk()` resolves.
   * Returns false until Clerk has loaded and the user is signed in.
   */
  isAuthenticated(): boolean {
    return this.clerk?.user != null;
  }
}
