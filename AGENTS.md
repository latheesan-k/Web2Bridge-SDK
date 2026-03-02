# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Web2Bridge SDK is a pnpm + Turborepo monorepo with 3 library packages (`packages/core`, `packages/react`, `packages/auth-clerk`) and 1 demo app (`demo/`). It is a fully client-side TypeScript SDK — no backend, no database, no Docker.

Detailed docs live in `docs/` — see [architecture](docs/architecture.md), [API reference](docs/api-reference.md), [security model](docs/security.md), [demo flow](docs/demo-flow.md), [device support](docs/device-support.md), and [CI/CD](docs/ci-cd.md).

### Key commands

Standard commands are in the root `package.json` and each package's `package.json`:

- **Install:** `pnpm install`
- **Build:** `pnpm build` (runs turbo across all packages — all 4 packages including demo)
- **Lint:** `pnpm lint` (ESLint 8 with `@typescript-eslint/*` — declared in root devDependencies)
- **Test:** `pnpm test` (runs vitest in core/react/auth-clerk packages; 289 tests total)
- **Dev server:** `cd demo && pnpm dev` (Vite on port 3000)

### SDK / Demo flow (critical — read before making changes)

The SDK and demo follow a **3-phase flow** with **wallet-per-operation security**. Full details in [docs/demo-flow.md](docs/demo-flow.md).

1. **Phase 1 — Social sign-in:** User clicks "Sign in with Clerk". No password is needed at this step. PRF support is detected on mount. Use `authenticate()`.
2. **Phase 2 — Issue wallet:** After auth, the UI shows the user's email. If PRF is unavailable (`requiresPassword === true`), a spending password field appears. Use `login({ password })` to derive the wallet, extract public addresses, then immediately call `lockWallet()`.
3. **Phase 3 — Sign per operation:** Every signing operation requires re-entering the spending password (or biometric on PRF devices). Call `login({ password })` to re-derive the wallet, sign, then `lockWallet()`. **The wallet must not remain in memory between operations.**

**Common mistakes to avoid:**
- Do NOT ask for the password before social sign-in — auth runs first
- Do NOT keep the wallet loaded in memory — lock it after every operation
- Do NOT show error alerts for PRF fallback — `requiresPassword` handles this seamlessly
- Do NOT call `login()` for auth-only — use `authenticate()` instead

### SDK architecture

- `@web2bridge/core` — `Web2BridgeWallet` is a full CIP-30 wrapper around MeshWallet. All methods return `Result<T>`.
- `@web2bridge/react` — `Web2BridgeProvider` detects WebAuthn PRF on mount. The `useWeb2Bridge()` hook exposes `authenticate()`, `login()`, `lockWallet()`, `logout()`, and wallet/auth state.
- `@web2bridge/auth-clerk` — `ClerkAdapter` wraps `@clerk/clerk-js`. Uses `openSignIn()` with 200ms polling for auth completion.

### Gotchas

- **ESLint 8 is required:** The root `package.json` declares `eslint@^8` and `@typescript-eslint/parser@^8` / `@typescript-eslint/eslint-plugin@^8`. The config uses the legacy `.eslintrc.json` format which is not compatible with ESLint 9+.
- **`chacha-native` build is skipped:** The native module `chacha-native` (transitive dep of `@meshsdk/core`) is listed in `pnpm.onlyBuiltDependencies` exclusion. It doesn't compile on Node 22 but doesn't affect SDK functionality.
- **Demo requires `VITE_CLERK_PUBLISHABLE_KEY`:** Set via `demo/.env`. Copy `demo/.env.example` and fill in the key from Clerk dashboard. Without it the demo loads but authentication won't work.
- **Demo Clerk instance supports email + Google OAuth:** The Clerk application is configured with email and Google as auth providers. Use `latheesan@protonmail.com` for email sign-in (requires OTP code from the owner).
- **MeshWallet.signData parameter order:** MeshWallet.signData takes `(payload, address)`, NOT `(address, payload)`. The wallet wrapper handles this internally.
- **MeshWallet accountIndex:** The wallet passes `accountIndex: appId` to MeshWallet — do not use `derivationPath` in the key config (it is ignored by MeshWallet for mnemonic keys).
- **Demo Vite build warnings:** The demo `vite build` emits informational warnings from upstream `@harmoniclabs/crypto` (Rollup comment annotations) and a chunk-size notice. These are from third-party code and do not affect functionality.
- **Cloud VM has no WebAuthn PRF:** The cloud environment always falls back to the password-derived entropy path. The `prfSupported` flag resolves to `false` immediately on mount and the demo shows the spending password field automatically.
