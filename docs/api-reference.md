# API Reference

## `useWeb2Bridge()` Hook

| Property / Method | Type | Description |
|---|---|---|
| `isReady` | `boolean` | Always `true` — the provider is synchronously ready |
| `isAuthenticated` | `boolean` | Whether the user has an active auth session |
| `wallet` | `Web2BridgeWallet \| null` | CIP-30 wallet instance (transient — cleared after each operation) |
| `error` | `Web2BridgeError \| null` | Last error — consumers never need `try/catch` |
| `entropyPath` | `"prf" \| "password" \| null` | Which entropy source was used |
| `prfSupported` | `boolean \| null` | Whether device supports WebAuthn PRF (`null` while detecting) |
| `requiresPassword` | `boolean` | `true` when PRF unavailable and fallback enabled |
| `authenticate()` | `Promise<Result<void>>` | Sign in with auth provider only (no wallet derivation) |
| `login(opts?)` | `Promise<Result<Web2BridgeWallet>>` | Authenticate (if needed) and derive wallet; returns wallet for immediate use |
| `lockWallet()` | `void` | Clear wallet from memory; auth session remains active |
| `logout()` | `Promise<Result<void>>` | Clear wallet and sign out |
| `exportRecoveryPhrase(opts?)` | `Promise<Result<string[]>>` | Export 24-word mnemonic with re-verification |

## `Result<T>` Type

All async methods return a `Result<T>` — a discriminated union that eliminates `try/catch` boilerplate:

```ts
type Result<T> =
  | { data: T;    error: null }         // Success
  | { data: null; error: Web2BridgeError }  // Failure
```

## Core Package (`@web2bridge/core`)

```ts
detectPRFSupport(): Promise<boolean>

generateEntropy(namespacedUserId: string, prfSecret: Uint8Array, options?: KdfOptions): Promise<Result<Uint8Array>>
generateEntropyFromPassword(namespacedUserId: string, password: string, options?: FallbackKdfOptions): Promise<Result<Uint8Array>>

entropyToMnemonic(entropy: Uint8Array): Result<string[]>
deriveAppId(domain: string): number
buildHDPath(appId: number): string

createWallet(mnemonic: string[], appId: number): Result<Web2BridgeWallet>

buildNamespacedUserId(providerId: string, rawUserId: string): string

validatePasswordStrength(password: string): Result<void>
getPasswordStrengthScore(password: string): number
```

## Writing a Custom Adapter

```ts
import type { AuthAdapter, Result } from "@web2bridge/core";

export class MyAdapter implements AuthAdapter {
  readonly providerId = "myprovider"; // NEVER change after deployment

  async login(): Promise<Result<void>> { /* ... */ }
  async logout(): Promise<Result<void>> { /* ... */ }
  async getUserId(): Promise<Result<string>> { /* ... */ }
  isAuthenticated(): boolean { /* ... */ }
}
```

> **`providerId` rules:** Must be a lowercase alphanumeric string starting with a letter. Changing it after deployment will silently derive different wallets for all existing users.

## Error Classes

All errors extend `Web2BridgeError`:

| Error Class | Trigger |
|---|---|
| `PRFNotSupportedError` | Browser/device does not support WebAuthn PRF and fallback is disabled |
| `PasskeyRegistrationError` | Passkey creation failed |
| `PasskeyAuthError` | Passkey authentication failed or was cancelled |
| `AuthAdapterError` | Generic error from any `AuthAdapter` implementation |
| `DerivationError` | KDF or mnemonic generation failed |
| `WalletError` | MeshWallet instantiation or signing failed |
| `ExportVerificationError` | Re-verification for export failed |
| `WeakPasswordError` | Fallback password does not meet minimum strength requirements |
| `PasswordAuthError` | Fallback password entry failed or was cancelled |
| `EntropyPathMismatchError` | User attempts to log in via a different entropy path than registration |
