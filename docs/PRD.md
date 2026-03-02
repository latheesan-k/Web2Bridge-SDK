# Product Requirements Document (PRD): Web2Bridge SDK

## 1. Overview
**Web2Bridge** is a zero-storage, stateless, client-side SDK that bridges Web2 User Experience with Web3 Self-Custody on the Cardano blockchain. It allows developers to onboard users via any supported social login provider and Passkeys (WebAuthn PRF) to deterministically generate a fully functional, CIP-30 compatible Cardano wallet securely on the user's device.

**Core Value Proposition:**
- **Zero Infrastructure:** No central database or key-management servers.
- **Un-hackable Entropy:** Uses WebAuthn PRF (hardware-backed passkeys) as the primary entropy source, with a secure password-based fallback for unsupported devices.
- **Provider-Agnostic:** Ships with a Clerk adapter out of the box; any social login provider (Auth0, WorkOS, Supabase Auth, Firebase Auth, etc.) can be integrated by implementing a single lightweight `AuthAdapter` interface.
- **Web2 UX:** Users log in with Google/Apple, authenticate with FaceID/TouchID (or a password on older devices), and instantly have a Cardano wallet.

---

## 2. Architecture & Security Model

The SDK operates as a "Stateless Cryptographic Router" with two entropy paths:

### 2.1 Primary Path (WebAuthn PRF)
1. **Auth:** An `AuthAdapter` implementation authenticates the user and surfaces a normalised `userId` string.
2. **Entropy Generation:** The SDK prompts the device's WebAuthn PRF extension using the namespaced user ID as the relying on party salt. The hardware securely outputs a 32-byte predictable secret.
3. **Wallet Derivation:** The SDK combines the namespaced user ID and PRF output using a KDF (default: HKDF-SHA-256, configurable) to generate a BIP39 24-word mnemonic.
4. **HD Isolation:** The mnemonic is passed into `@meshsdk/core`. The SDK derives an App-Isolated wallet using `m/1852'/1815'/AppID'/0/0` where `AppID` is the first 31 bits of the SHA-256 hash of the dApp's domain string.
5. **Session:** The wallet is kept in browser memory for signing transactions. Nothing is persisted.

### 2.2 Fallback Path (Password-Derived Entropy)
Activated automatically when WebAuthn PRF is not available on the user's device or browser.

1. **Auth:** Same as primary — the `AuthAdapter` surfaces the normalised `userId`.
2. **Entropy Generation:** The user is prompted to create (on registration) or enter (on login) a strong spending password. The SDK derives entropy via **Argon2id** (or PBKDF2 as a lighter alternative) using the password as the secret and the namespaced user ID as the salt.
3. **Wallet Derivation:** Identical to the primary path — the derived entropy is converted to a BIP39 24-word mnemonic.
4. **HD Isolation:** Same derivation path: `m/1852'/1815'/AppID'/0/0`.
5. **Session:** Wallet is kept in browser memory only. The password is never stored. Nothing persisted.

> **Zero-Storage Guarantee:** The fallback path preserves the stateless, zero-storage architecture. The password is required on every login to re-derive the wallet — it is never written to `localStorage`, `sessionStorage`, `IndexedDB`, or any external service.

### 2.3 User ID Namespacing
Different auth providers format their user identifiers differently (e.g. Clerk: `user_abc123`, Auth0: `auth0|abc123`). To prevent wallet collisions if the same underlying user ever authenticates via two different providers, the SDK **always namespaces the user ID** with the provider identifier before it is used as a KDF salt or PRF input:

```
namespacedId = "<provider_id>:<raw_user_id>"
// e.g. "clerk:user_abc123" or "auth0:auth0|abc123"
```

The `provider_id` is a short, stable, lowercase string declared by each `AuthAdapter` implementation (e.g. `"clerk"`, `"auth0"`, `"workos"`). This string is part of the cryptographic input and **must never change** once users have registered wallets against it.

### 2.4 Cross-Device Consistency Warning
A user who first registers on a PRF-capable device cannot silently switch to the fallback path on a different device, as the two entropy sources produce different wallets. In this scenario, the user must use their Recovery Phrase (see F6) to restore their wallet. Developers should communicate this clearly in their onboarding UI. The SDK surfaces an `EntropyPathMismatchError` to facilitate this.

---

## 3. Auth Adapter Interface

The `AuthAdapter` is the sole abstraction between the SDK and any identity provider. It is a plain TypeScript interface with no dependencies on vendor SDKs.

```ts
// packages/core/src/auth/adapter.ts

export interface AuthAdapter {
  /**
   * A short, stable, lowercase identifier for this provider.
   * Used to namespace user IDs in KDF inputs.
   * Must never change once users have registered wallets.
   * Examples: "clerk", "auth0", "workos", "supabase"
   */
  readonly providerId: string;

  /**
   * Trigger the provider's login flow.
   * Resolves when the user is authenticated.
   */
  login(): Promise<Result<void>>;

  /**
   * Trigger the provider's logout flow.
   * Resolves when the session is cleared.
   */
  logout(): Promise<Result<void>>;

  /**
   * Return the authenticated user's raw unique identifier.
   * Called after login() resolves successfully.
   * Must return null if no user is currently authenticated.
   */
  getUserId(): Promise<Result<string>>;

  /**
   * Return the current authentication state synchronously.
   * Used to initialise the SDK on page load without triggering a login.
   */
  isAuthenticated(): boolean;
}
```

The SDK core and React packages depend **only** on this interface. No vendor SDK is imported anywhere in `@web2bridge/core` or `@web2bridge/react`.

---

## 4. Device & Browser Support

### 4.1 Primary Path Support (WebAuthn PRF)

| Environment                                                       | PRF Support | Notes                                                                                      |
|-------------------------------------------------------------------|-------------|--------------------------------------------------------------------------------------------|
| iOS 18+ / iPadOS 18+ — Safari 18+                                 | ✅ Full      | Via iCloud Keychain platform passkeys                                                      |
| Android 14+ — Chrome ≥130                                         | ✅ Full      | Via Google Password Manager; depends on updated Play Services                              |
| macOS Sequoia 15.4+ — Chrome/Edge ≥128 or Safari 18.4             | ✅ Full      | Requires iCloud Keychain to be enabled                                                     |
| Any platform — YubiKey 5 series, Google Titan M2, Feitian BioPass | ✅ Full      | Hardware hmac-secret via any PRF-aware browser                                             |
| Firefox (all platforms) — hardware security key                   | 🟡 Partial  | PRF works with external CTAP2 keys only; no platform passkey PRF                           |
| **Windows Hello (Windows 11)**                                    | ❌ None      | Microsoft has not shipped PRF support yet — fallback required                              |
| iOS/iPadOS — external USB/NFC security keys                       | ❌ None      | Apple's WebAuthn implementation does not pass PRF extension data to roaming authenticators |
| Older Android (<14) or Chrome (<130)                              | ❌ None      | Fallback required                                                                          |
| iOS/iPadOS <18                                                    | ❌ None      | Fallback required                                                                          |
| macOS <15 (Sequoia)                                               | ❌ None      | Fallback required                                                                          |

> **Practical implication:** A significant portion of desktop users (particularly Windows users, who represent the largest desktop OS share) will require the fallback path until Microsoft ships PRF support for Windows Hello.

### 4.2 Fallback Path Support
The fallback path depends only on the Web Crypto API, which is universally supported in all modern browsers. It is available on any device or browser that cannot support the primary path.

---

## 5. Tech Stack
- **Language:** TypeScript (Strict Mode).
- **Core Blockchain:** `@meshsdk/core` (Headless Wallet implementation).
- **Identity:** Provider-agnostic via `AuthAdapter` interface. First-party adapter: `@web2bridge/auth-clerk` (wraps `@clerk/clerk-js`).
- **Cryptography:** Web Crypto API, WebAuthn API (PRF extension).
- **Fallback KDF:** `argon2-browser` (WASM, lazy-loaded) for Argon2id; native Web Crypto API for PBKDF2.
- **Testing:** Vitest with `fast-check` for property-based testing.
- **Monorepo Tooling:** pnpm workspaces + Turborepo.

---

## 6. Project Structure

```
web2bridge/
├── packages/
│   ├── core/                          # @web2bridge/core
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   │   └── adapter.ts         # AuthAdapter interface + types (zero vendor deps)
│   │   │   ├── crypto/
│   │   │   │   ├── prf.ts             # WebAuthn PRF detection & extraction
│   │   │   │   ├── kdf.ts             # HKDF / PBKDF2 / Argon2id
│   │   │   │   ├── fallback.ts        # Password-based entropy derivation
│   │   │   │   └── index.ts
│   │   │   ├── derivation/            # Mnemonic + HD path derivation
│   │   │   ├── wallet/                # MeshWallet wrapper + CIP-30 interface
│   │   │   ├── errors.ts              # Typed error classes
│   │   │   └── index.ts
│   │   └── tests/
│   │       └── adapter.contract.ts    # Shared contract test suite all adapters must pass
│   │
│   ├── react/                         # @web2bridge/react
│   │   ├── src/
│   │   │   ├── Web2BridgeProvider.tsx # Accepts an AuthAdapter instance via props
│   │   │   ├── useWeb2Bridge.ts
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── auth-clerk/                    # @web2bridge/auth-clerk
│   │   ├── src/
│   │   │   ├── ClerkAdapter.ts        # Implements AuthAdapter using @clerk/clerk-js
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── auth-auth0/                    # @web2bridge/auth-auth0 (future)
│   │   └── ...                        # Implements AuthAdapter using @auth0/auth0-spa-js
│   │
│   └── auth-workos/                   # @web2bridge/auth-workos (future)
│       └── ...                        # Implements AuthAdapter using @workos-inc/authkit-js
│
├── pnpm-workspace.yaml
└── turbo.json
```

**Dependency rules (enforced via Turborepo boundaries):**
- `@web2bridge/core` — zero vendor auth dependencies. Depends only on `@meshsdk/core` and Web platform APIs.
- `@web2bridge/react` — depends on `@web2bridge/core` only. No vendor auth dependencies.
- `@web2bridge/auth-*` — each depends on `@web2bridge/core` (for the `AuthAdapter` interface and `Result` type) and its respective vendor SDK. No cross-adapter dependencies.

---

## 7. Public API

### 7.1 React Package (`@web2bridge/react`)

#### Provider
The provider accepts an instantiated `AuthAdapter` rather than raw vendor config. This keeps the provider API stable regardless of which auth provider is in use.

```tsx
import { Web2BridgeProvider } from "@web2bridge/react";
import { ClerkAdapter } from "@web2bridge/auth-clerk";

const authAdapter = new ClerkAdapter({ publishableKey: "pk_live_..." });

<Web2BridgeProvider
  adapter={authAdapter}           // required — any AuthAdapter implementation
  config={{
    appDomain: string,            // required — used to derive AppID
    kdf?: "hkdf" | "pbkdf2" | "argon2id",  // optional, defaults to "hkdf"
    fallback?: {
      enabled?: boolean,          // optional, defaults to true
      kdf?: "pbkdf2" | "argon2id" // optional, defaults to "argon2id"
    }
  }}
>
  {children}
</Web2BridgeProvider>
```

Swapping providers requires only changing the adapter import and instantiation — the provider, hook, and all downstream code remain untouched.

#### Hook
```ts
const {
  // State
  isReady: boolean,
  isAuthenticated: boolean,
  wallet: Web2BridgeWallet | null,
  error: Web2BridgeError | null,
  entropyPath: "prf" | "password" | null,  // which entropy path is active

  // Actions — all return Result<T>
  login: () => Promise<Result<void>>,
  logout: () => Promise<Result<void>>,
  exportRecoveryPhrase: () => Promise<Result<string[]>>,
} = useWeb2Bridge();
```

### 7.2 Core Package (`@web2bridge/core`)

```ts
// PRF detection
detectPRFSupport(): Promise<boolean>

// KDF — Primary path (PRF-seeded)
generateEntropy(namespacedUserId: string, prfSecret: Uint8Array, options?: KdfOptions): Promise<Result<Uint8Array>>

// KDF — Fallback path (password-seeded)
generateEntropyFromPassword(namespacedUserId: string, password: string, options?: FallbackKdfOptions): Promise<Result<Uint8Array>>

// Derivation
entropyToMnemonic(entropy: Uint8Array): Result<string[]>
deriveAppId(domain: string): number   // SHA-256 truncated to 31 bits

// Wallet
createWallet(mnemonic: string[], appId: number): Result<Web2BridgeWallet>

// Auth utilities
buildNamespacedUserId(providerId: string, rawUserId: string): string
// e.g. buildNamespacedUserId("clerk", "user_abc") → "clerk:user_abc"
```

### 7.3 Clerk Adapter Package (`@web2bridge/auth-clerk`)

```ts
import { ClerkAdapter } from "@web2bridge/auth-clerk";

const adapter = new ClerkAdapter({
  publishableKey: string,  // required
});

// adapter satisfies AuthAdapter — pass directly to Web2BridgeProvider
```

### 7.4 Writing a Custom Adapter
Any third-party or custom auth provider can be supported by implementing the `AuthAdapter` interface from `@web2bridge/core`:

```ts
import type { AuthAdapter, Result } from "@web2bridge/core";
import { WorkOS } from "@workos-inc/authkit-js";

export class WorkOSAdapter implements AuthAdapter {
  readonly providerId = "workos"; // stable — never change after first deploy

  private client: WorkOS;

  constructor(config: { clientId: string }) {
    this.client = new WorkOS(config.clientId);
  }

  async login(): Promise<Result<void>> {
    try {
      await this.client.signIn();
      return { data: undefined, error: null };
    } catch (e) {
      return { data: null, error: new AuthAdapterError(e) };
    }
  }

  async logout(): Promise<Result<void>> { /* ... */ }

  async getUserId(): Promise<Result<string>> {
    const user = await this.client.getUser();
    return user
      ? { data: user.id, error: null }
      : { data: null, error: new AuthAdapterError("No authenticated user") };
  }

  isAuthenticated(): boolean {
    return this.client.isSignedIn();
  }
}
```

### 7.5 Result Type
All async methods return a `Result<T>` — never throw:
```ts
type Result<T> =
  | { data: T; error: null }
  | { data: null; error: Web2BridgeError }
```

---

## 8. Functional Requirements

### F1. Authentication Module
- The SDK interacts with auth exclusively via the `AuthAdapter` interface — no direct vendor SDK calls anywhere in `core` or `react`.
- On `login()`, the SDK calls `adapter.login()` then `adapter.getUserId()`, builds the namespaced user ID via `buildNamespacedUserId(adapter.providerId, rawId)`, and passes it downstream to the crypto modules.
- On page load, the SDK checks `adapter.isAuthenticated()` to restore session state without triggering a fresh login flow.
- Return typed `Result<void>` — never throw.

### F2. Cryptography & WebAuthn PRF Module
- Detect if the user's browser/device supports WebAuthn PRF via `detectPRFSupport()`.
- If unsupported and fallback is enabled, route to the Fallback Entropy Module (F2b) rather than returning an error.
- If unsupported and fallback is disabled, return `{ data: null, error: PRFNotSupportedError }`.
- Register a new Passkey (on first login) or authenticate an existing one.
- Extract the 32-byte PRF secret from the hardware authenticator.
- Use the **namespaced user ID** (not the raw user ID) as the PRF salt input.

### F2b. Fallback Entropy Module (Password-Based)
- Activated when PRF is unavailable and `fallback.enabled` is `true` (default).
- On first login, prompt the user to create a spending password. Enforce a minimum strength requirement (e.g. zxcvbn score ≥ 3) and surface feedback to the developer via the `error` state.
- On subsequent logins, prompt the user to re-enter their spending password.
- Derive 32 bytes of entropy using the configured `fallback.kdf` algorithm (default: Argon2id):
  - **Argon2id** (default): memory = 64MB, iterations = 3, parallelism = 1; salt = UTF-8 encoded namespaced user ID. Requires `argon2-browser` WASM, loaded lazily.
  - **PBKDF2-SHA-256** (lighter alternative): 210,000 iterations; salt = UTF-8 encoded namespaced user ID; output = 32 bytes.
- The password is never stored, logged, or transmitted. It exists in memory only for the duration of the derivation call.
- Set `entropyPath` state to `"password"`.

### F3. KDF Module (Primary Path)
- Default algorithm: **HKDF-SHA-256**.
  - Input keying material: PRF secret (32 bytes).
  - Salt: UTF-8 encoded namespaced user ID.
  - Info: UTF-8 encoded string `"web2bridge-v1"`.
  - Output length: 32 bytes.
- Supported alternatives (developer-configurable via `kdf` option):
  - **PBKDF2-SHA-256**: 210,000 iterations, salt = namespaced user ID, output = 32 bytes.
  - **Argon2id**: memory = 64MB, iterations = 3, parallelism = 1 (requires `argon2-browser` WASM dependency, loaded lazily).
- The KDF selection is set at `Web2BridgeProvider` config time and cannot change per-session.

### F4. Deterministic Derivation Engine
- Pure function: `GenerateMnemonic(entropy: Uint8Array) → string[]`. Accepts entropy regardless of whether it originated from the PRF or fallback path.
- Convert 256 bits of KDF output into a BIP39 standard 24-word mnemonic.
- Derive `AppID` from the dApp domain: first 31 bits of SHA-256 hash of the domain string (ensuring the value fits within the BIP32 hardened index range `0x00000000–0x7FFFFFFF`).
- HD derivation path: `m/1852'/1815'/AppID'/0/0`.

### F5. Wallet & CIP-30 Interface Wrapper
- Instantiate a headless `MeshWallet` from the derived mnemonic.
- Expose a clean, CIP-30-like interface:
  - `getUsedAddresses(): Promise<Result<string[]>>`
  - `signTx(txCbor: string, partialSign: boolean): Promise<Result<string>>`
  - `signData(address: string, payload: string): Promise<Result<string>>`

### F6. The "Escape Hatch" — Recovery Phrase Export
- `exportRecoveryPhrase()` requires a fresh re-verification before returning the mnemonic words:
  - **Primary path:** Fresh WebAuthn re-authentication.
  - **Fallback path:** Re-entry of the spending password.
- The 24 words are returned as `Result<string[]>` — display logic is left to the developer.
- The mnemonic must never be logged, stored, or transmitted.
- **Cross-device migration:** Developers should prompt users to export and safely store their recovery phrase during onboarding, particularly when the fallback path is active. This is the only mechanism for wallet recovery if the user moves to a new device or switches auth providers.

---

## 9. Error Handling

All errors extend a base `Web2BridgeError` class. The full set of typed errors:

| Error Class                | Trigger                                                                                                                                              |
|----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `PRFNotSupportedError`     | Browser/device does not support WebAuthn PRF and fallback is disabled                                                                                |
| `PasskeyRegistrationError` | Passkey creation failed                                                                                                                              |
| `PasskeyAuthError`         | Passkey authentication failed or was cancelled                                                                                                       |
| `AuthAdapterError`         | Generic error surfaced from any `AuthAdapter` implementation; individual adapters may subclass this (e.g. `ClerkAuthError extends AuthAdapterError`) |
| `DerivationError`          | KDF or mnemonic generation failed                                                                                                                    |
| `WalletError`              | MeshWallet instantiation or signing failed                                                                                                           |
| `ExportVerificationError`  | Re-verification for export failed                                                                                                                    |
| `WeakPasswordError`        | Fallback password does not meet minimum strength requirements                                                                                        |
| `PasswordAuthError`        | Fallback password entry failed or was cancelled                                                                                                      |
| `EntropyPathMismatchError` | User attempts to log in via a different entropy path than was used at registration                                                                   |

The React hook surfaces all errors as `error: Web2BridgeError | null` state — consumers never need `try/catch`.

---

## 10. Non-Functional Requirements

- **Test-Driven Development (TDD):** 100% coverage on the Cryptography (`F2`, `F2b`, `F3`) and Derivation (`F4`) modules.
- **Adapter Contract Tests:** A shared test suite (`packages/core/tests/adapter.contract.ts`) defines a standard battery of behavioural tests that every `AuthAdapter` implementation must pass — login/logout round-trip, `getUserId` contract, `isAuthenticated` state consistency, and `providerId` stability. Each adapter package runs this suite against its own implementation as part of its CI pipeline.
- **Testing Strategy:** Property-based tests using `fast-check` verifying:
  - Determinism: same `(namespacedUserId, PRF_Secret)` always produces the same mnemonic on the primary path.
  - Determinism: same `(namespacedUserId, password)` always produces the same mnemonic on the fallback path.
  - Isolation: different input pairs never produce the same mnemonic (both paths).
  - Path isolation: the PRF and fallback paths never produce the same mnemonic for equivalent inputs.
  - Provider isolation: the same raw user ID from two different providers (different `providerId` values) always produces different wallets.
  - AppID uniqueness: different domain strings produce different AppIDs with negligible collision probability.
  - KDF algorithm substitutability: all KDF options satisfy the same determinism and isolation properties within each path.
- **Zero Storage:** Never write private key, mnemonic, PRF secret, entropy, or spending password to `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or any external service.
- **Browser-only:** Core logic runs entirely in the browser. No Node.js-specific APIs.
- **Migration Safety:** The derivation path includes a version string (`"web2bridge-v1"`) in the HKDF info field. If the algorithm must change in future, bump the version string to derive a new wallet rather than silently breaking existing ones.
- **Adapter `providerId` Immutability:** The `providerId` string declared by each adapter is a cryptographic commitment. Changing it post-deployment silently derives different wallets for all existing users. This constraint must be documented prominently in the adapter authoring guide and enforced via a lint rule where possible.
- **Password UX:** When the fallback path is active, the SDK surfaces `entropyPath: "password"` to allow developer UIs to render a password input. The SDK does not render any UI itself.
