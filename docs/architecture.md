# Architecture

## System Overview — Trust Boundaries

Everything below the dashed line runs **entirely in the user's browser**. No private key, mnemonic, entropy, or password ever crosses a network boundary.

```
  ╔══════════════════════════════════════════════════════════════════════════╗
  ║                         EXTERNAL SERVICES                                ║
  ║  (only service the SDK talks to — provides identity, never sees keys)    ║
  ║                                                                          ║
  ║   ┌─────────────────────────────────────┐                                ║
  ║   │     Identity Provider (Clerk, …)    │                                ║
  ║   │                                     │                                ║
  ║   │  • Google / Apple / GitHub OAuth    │                                ║
  ║   │  • Returns: user_id, session token  │                                ║
  ║   │  • Never sees: keys, entropy, pwd   │                                ║
  ║   └─────────────────────────────────────┘                                ║
  ╚═══════════════════════════╤══════════════════════════════════════════════╝
                              │ user_id (only data that crosses the boundary)
  ════════════════════════════╪═══════════════════════════════════════════════
                              │
  ╔═══════════════════════════╧══════════════════════════════════════════════╗
  ║                     USER'S BROWSER (100% client-side)                    ║
  ║                                                                          ║
  ║   ┌──────────────────────────────────────────────────────────────────┐   ║
  ║   │                      Web2Bridge SDK                              │   ║
  ║   │                                                                  │   ║
  ║   │  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐   │   ║
  ║   │  │  AuthAdapter │──▶│  Crypto/KDF  │──▶│ Derivation & Wallet │   │   ║
  ║   │  │  (identity)  │   │  (entropy)   │   │ (BIP39 → CIP-30)    │   │   ║
  ║   │  └──────────────┘   └──────┬───────┘   └─────────────────────┘   │   ║
  ║   │                           │                                      │   ║
  ║   │                    ┌──────┴───────┐                              │   ║
  ║   │                    │  WebAuthn /  │                              │   ║
  ║   │                    │  Password    │                              │   ║
  ║   │                    │  (secret)    │                              │   ║
  ║   │                    └──────────────┘                              │   ║
  ║   └──────────────────────────────────────────────────────────────────┘   ║
  ║                                                                          ║
  ║   ┌───────────────────────────────────────┐                              ║
  ║   │     Device Secure Enclave (optional)  │                              ║
  ║   │     FaceID / TouchID / YubiKey        │                              ║
  ║   │     PRF secret never leaves hardware  │                              ║
  ║   └───────────────────────────────────────┘                              ║
  ║                                                                          ║
  ║   Storage used: NONE                                                     ║
  ║   (no localStorage, sessionStorage, IndexedDB, cookies, or servers)      ║
  ╚════════════════════════════════════════════════════════════════════──════╝
```

## Package Architecture

The SDK is split into three packages with strict dependency boundaries. Auth vendor SDKs are isolated in adapter packages — the core and React packages have **zero vendor auth dependencies**.

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                          Your Application                                │
  │                                                                          │
  │   import { Web2BridgeProvider, useWeb2Bridge } from "@web2bridge/react"  │
  │   import { ClerkAdapter } from "@web2bridge/auth-clerk"                  │
  └──────────┬──────────────────────────────────┬────────────────────────────┘
             │                                  │
             ▼                                  ▼
  ┌─────────────────────────┐     ┌──────────────────────────────┐
  │   @web2bridge/react     │     │   @web2bridge/auth-clerk     │
  │                         │     │                              │
  │  • Web2BridgeProvider   │     │  • ClerkAdapter              │
  │  • useWeb2Bridge() hook │     │  • implements AuthAdapter    │
  │  • Orchestrates login   │     │  • Wraps @clerk/clerk-js     │
  │    flow & state mgmt    │     │                              │
  └──────────┬──────────────┘     └──────────────┬───────────────┘
             │                                   │
             │         depends on                │ depends on
             ▼                                   ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                     @web2bridge/core                         │
  │                                                              │
  │  auth/        AuthAdapter interface, Result<T>, namespacing  │
  │  crypto/      PRF detection, HKDF, PBKDF2, Argon2id          │
  │  derivation/  BIP39 mnemonic, AppID, HD path                 │
  │  wallet/      Web2BridgeWallet (CIP-30 via MeshWallet)       │
  │  errors.ts    Typed error hierarchy                          │
  │                                                              │
  │  External deps: @meshsdk/core, Web Crypto API, WebAuthn API  │
  └──────────────────────────────────────────────────────────────┘
```

**Dependency rules:**
- `@web2bridge/core` — zero vendor auth dependencies. Depends only on `@meshsdk/core` and Web platform APIs.
- `@web2bridge/react` — depends on `@web2bridge/core` only. No vendor auth dependencies.
- `@web2bridge/auth-*` — each depends on `@web2bridge/core` (for the `AuthAdapter` interface) and its respective vendor SDK.

## Cryptographic Pipeline

Both entropy paths (PRF and password) converge at the same derivation engine — same mnemonic format, same HD path, same wallet interface.

```
┌───────────────┐     ┌───────────────────┐     ┌───────────────────┐     ┌────────────────┐
│  Social Login │ ──▶ │ Entropy Generation│ ──▶ │ Wallet Derivation │ ──▶ │  Ready to Sign │
│  (Clerk, etc) │     │  (PRF / Password) │     │  (HKDF → BIP39)   │     │  (CIP-30)      │
└───────────────┘     └───────────────────┘     └───────────────────┘     └────────────────┘
```

### Primary Path — WebAuthn PRF

1. User authenticates via social login (Clerk, Auth0, etc.)
2. SDK prompts the device's WebAuthn PRF extension using the namespaced user ID as the relying party salt
3. Hardware securely outputs a 32-byte deterministic secret (FaceID, TouchID, YubiKey)
4. Secret is fed through HKDF-SHA-256 → BIP39 24-word mnemonic → HD wallet at `m/1852'/1815'/AppID'/0/0`
5. Wallet exists in memory only for the duration of the operation, then is destroyed.

### Fallback Path — Password-Derived

Activated automatically when WebAuthn PRF is unavailable on the user's device.

1. Same social login authentication
2. User provides a spending password (strength enforced via zxcvbn, score >= 3)
3. Password + namespaced user ID → Argon2id (64 MB, 3 iterations) or PBKDF2 → 32 bytes of entropy
4. Same derivation pipeline: entropy → BIP39 mnemonic → HD wallet
5. Password is never stored — required every time the wallet is used

### User ID Namespacing

User IDs are always namespaced with the provider identifier before cryptographic use:

```
namespacedId = "<provider_id>:<raw_user_id>"
// "clerk:user_abc123" vs "auth0:user_abc123"
```

Different providers always produce different wallets, even for the same underlying user. The `providerId` is a cryptographic commitment and **must never change** once users have registered wallets.
