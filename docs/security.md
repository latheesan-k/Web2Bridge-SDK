# Security

## Where are the private keys stored?

**Nowhere.** Private keys are never stored — not in `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or any server. The wallet is deterministically re-derived from the user's identity + entropy source on every signing operation. Keys exist only in browser memory for the duration of the operation, then are destroyed.

## What if your servers get hacked?

**There are no servers.** Web2Bridge is a client-side SDK with zero backend infrastructure. There is no database to breach, no key vault to compromise, and no API that handles private keys. The auth provider (Clerk, Auth0, etc.) only provides the user's identity — it never sees entropy, keys, or mnemonics.

## Can you access my users' wallets?

**No.** The SDK is open source and runs entirely in the user's browser. Wallet derivation depends on a secret only the user possesses — either a hardware-backed passkey (WebAuthn PRF) or a spending password. Neither the SDK author, the dApp developer, nor the auth provider can reconstruct the wallet without the user's secret.

## Security Model — Who Sees What

```
  ┌────────────────────┬──────────┬───────────┬───────────────┬──────────────┐
  │                    │ Identity │ PRF/      │ Entropy /     │ Private      │
  │     Party          │ Provider │ Password  │ Mnemonic      │ Keys         │
  │                    │ user_id  │ (secret)  │ (24 words)    │              │
  ├────────────────────┼──────────┼───────────┼───────────────┼──────────────┤
  │ Auth Provider      │    ✅    │     ❌    │      ❌       │      ❌      │
  │ dApp Developer     │    ❌    │     ❌    │      ❌       │      ❌      │
  │ SDK Author         │    ❌    │     ❌    │      ❌       │      ❌      │
  │ Device Hardware    │    ❌    │  ✅ (PRF) │      ❌       │      ❌      │
  │ User's Browser     │    ✅    │  ✅ *     │  ✅ (memory)  │  ✅ (memory) │
  │ (during operation) │          │           │               │              │
  │ After Operation    │    ❌    │     ❌    │      ❌       │      ❌      │
  │ (nothing persists) │          │           │               │              │
  └────────────────────┴──────────┴───────────┴───────────────┴──────────────┘

  ✅ = has access     ❌ = never sees this data
  * PRF secret stays in hardware; password is in memory only during derivation
```

## Cryptographic Building Blocks

| Primitive | Implementation |
|---|---|
| Entropy (primary) | WebAuthn PRF extension — hardware-backed, phishing-resistant |
| Entropy (fallback) | Argon2id (64 MB, 3 iter) via `argon2-browser` WASM, or PBKDF2-SHA-256 (210k iter) |
| Key derivation | HKDF-SHA-256 via Web Crypto API (FIPS-validated) |
| Mnemonic | BIP39 standard — 256 bits → 24-word mnemonic |
| HD derivation | BIP32 at `m/1852'/1815'/AppID'/0/0` |
| Wallet | CIP-30 compatible via `@meshsdk/core` |
| Password strength | zxcvbn (minimum score 3) |

## Cross-device Migration

A user who first registers on a PRF-capable device cannot silently switch to the fallback path on a different device — the two entropy sources produce different wallets. The SDK surfaces an `EntropyPathMismatchError` to facilitate this. Users should export and safely store their recovery phrase during onboarding.
