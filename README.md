<p align="center">
  <strong>Web2Bridge SDK</strong><br/>
  <em>Zero-storage, stateless, client-side SDK that bridges Web2 UX with Web3 Self-Custody on Cardano.</em>
</p>

<p align="center">
  <a href="docs/architecture.md">Architecture</a> &middot;
  <a href="docs/api-reference.md">API Reference</a> &middot;
  <a href="docs/security.md">Security</a> &middot;
  <a href="docs/demo-flow.md">Demo Flow</a> &middot;
  <a href="docs/device-support.md">Device Support</a> &middot;
  <a href="docs/ci-cd.md">CI/CD</a>
</p>

---

## What is Web2Bridge?

Web2Bridge lets users sign in with Google, Apple, or GitHub and **instantly receive a deterministic, self-custodial Cardano wallet** — no seed phrases, no browser extensions, no servers, no databases.

The wallet is derived in-browser from the user's identity plus a hardware-backed passkey (WebAuthn PRF) or a spending password. Nothing is ever stored or transmitted. The same inputs always produce the same wallet.

| Traditional Web3             | Web2Bridge                  |
|------------------------------|-----------------------------|
| Install browser extension    | Click "Sign in with Google" |
| Write down 24 words on paper | Tap FaceID / TouchID        |
| Verify seed phrase           | Wallet ready. Done.         |

### Key Properties

- **Zero Storage** — Private keys are never persisted anywhere
- **100% Client-Side** — No backend infrastructure, no key-management servers
- **Deterministic** — Same user + same device + same secret = same wallet, every time
- **CIP-30 Compatible** — Standard Cardano wallet interface for signing transactions and data
- **BIP39 Standard** — 24-word recovery phrase importable into any Cardano wallet (Eternl, Nami, etc.)
- **Provider-Agnostic** — Ships with Clerk adapter; plug in Auth0, WorkOS, Supabase, or any provider
- **App-Isolated** — Each dApp gets its own HD derivation path (`m/1852'/1815'/AppID'/0/0`)

---

## Packages

| Package                  | Description                                                   | npm                                                                                                                 |
|--------------------------|---------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `@web2bridge/core`       | Cryptography, KDF, wallet derivation, `AuthAdapter` interface | [![npm](https://img.shields.io/npm/v/@web2bridge/core)](https://www.npmjs.com/package/@web2bridge/core)             |
| `@web2bridge/react`      | React provider + `useWeb2Bridge()` hook                       | [![npm](https://img.shields.io/npm/v/@web2bridge/react)](https://www.npmjs.com/package/@web2bridge/react)           |
| `@web2bridge/auth-clerk` | Clerk adapter (first-party `AuthAdapter` implementation)      | [![npm](https://img.shields.io/npm/v/@web2bridge/auth-clerk)](https://www.npmjs.com/package/@web2bridge/auth-clerk) |

---

## Quick Start

### 1. Install

```bash
npm install @web2bridge/core @web2bridge/react @web2bridge/auth-clerk @clerk/clerk-react
```

### 2. Configure the Provider

```tsx
import { ClerkProvider } from "@clerk/clerk-react";
import { Web2BridgeProvider } from "@web2bridge/react";
import { ClerkAdapter } from "@web2bridge/auth-clerk";

const authAdapter = new ClerkAdapter({ publishableKey: "pk_live_..." });

function App() {
  return (
    <ClerkProvider publishableKey="pk_live_...">
      <Web2BridgeProvider
        adapter={authAdapter}
        config={{
          appDomain: "your-app.com",
          networkId: 0,
          kdf: "hkdf",
          fallback: { enabled: true, kdf: "argon2id" },
        }}
      >
        <YourApp />
      </Web2BridgeProvider>
    </ClerkProvider>
  );
}
```

### 3. Use the Hook

The SDK uses a **3-phase flow**: social sign-in → wallet derivation → per-operation signing. See [Demo Flow](docs/demo-flow.md) for the full pattern.

```tsx
import { useWeb2Bridge } from "@web2bridge/react";

function WalletButton() {
  const { isAuthenticated, requiresPassword, authenticate, login, lockWallet } = useWeb2Bridge();

  // Phase 1: Social sign-in (no password needed)
  if (!isAuthenticated) {
    return <button onClick={authenticate}>Sign in with Clerk</button>;
  }

  // Phase 2 & 3: Derive wallet on demand, lock after use
  const handleSign = async (password: string) => {
    const result = await login({ password });
    if (result.data) {
      const wallet = result.data;
      const sig = await wallet.signData(address, "Hello Cardano!");
      lockWallet(); // keys wiped from memory
    }
  };
}
```

> **Important:** The wallet must not remain loaded in memory. Call `lockWallet()` after every operation. The password/PRF is required each time. See [Demo Flow](docs/demo-flow.md) for details.

For the full API, see [API Reference](docs/api-reference.md).

---

## Development

### Prerequisites

- **Node.js** >= 18
- **pnpm** 9 (`corepack enable && corepack prepare pnpm@9.0.0`)

### Setup

```bash
git clone https://github.com/latheesan-k/Web2Bridge-SDK.git
cd Web2Bridge-SDK
pnpm install
pnpm build
```

### Commands

| Command               | Description                                          |
|-----------------------|------------------------------------------------------|
| `pnpm install`        | Install all dependencies                             |
| `pnpm build`          | Build all packages (Turborepo-orchestrated)          |
| `pnpm test`           | Run all tests (Vitest — 314 tests across 3 packages) |
| `pnpm lint`           | Lint all packages (ESLint)                           |
| `pnpm typecheck`      | Type-check all packages                              |
| `pnpm clean`          | Remove all build artifacts                           |
| `cd demo && pnpm dev` | Start the demo app (Vite, port 3000)                 |

### Project Structure

```
web2bridge-sdk/
├── packages/
│   ├── core/              # @web2bridge/core — crypto, KDF, wallet derivation
│   ├── react/             # @web2bridge/react — React provider + hook
│   └── auth-clerk/        # @web2bridge/auth-clerk — Clerk adapter
├── demo/                  # Interactive demo app (React + Vite)
├── docs/                  # Architecture, API, security, demo flow docs
├── website/               # Static marketing website
├── package.json           # Root workspace config
├── pnpm-workspace.yaml    # pnpm workspace definition
├── turbo.json             # Turborepo task pipeline
└── .eslintrc.json         # Shared ESLint config
```

### Running the Demo

```bash
cp demo/.env.example demo/.env
# Edit demo/.env and set VITE_CLERK_PUBLISHABLE_KEY
cd demo && pnpm dev
```

See [Demo Flow](docs/demo-flow.md) for the intended 3-phase user experience.

---

## FAQ

<details>
<summary><strong>What happens if the user loses their device?</strong></summary>

**PRF path:** If the passkey is synced via iCloud Keychain or Google Password Manager, the wallet can be recovered on a new device. If not, the user needs their exported recovery phrase.

**Password path:** The wallet can be re-derived on any device by signing in and entering the same spending password.

**Recovery phrase:** As a last resort, users can import their 24-word BIP39 mnemonic into any standard Cardano wallet (Eternl, Nami, etc.).
</details>

<details>
<summary><strong>Is the wallet standard or proprietary?</strong></summary>

**Fully standard.** BIP39 mnemonic, BIP32 HD derivation, CIP-30 compatible. The recovery phrase works with any Cardano wallet.
</details>

<details>
<summary><strong>Can two different auth providers produce the same wallet?</strong></summary>

**No.** Every user ID is namespaced with the provider identifier: `clerk:user_abc123` vs `auth0:user_abc123`. Different providers always produce different wallets.
</details>

---

## Tech Stack

| Layer          | Technology                                                    |
|----------------|---------------------------------------------------------------|
| Language       | TypeScript (strict mode)                                      |
| Monorepo       | pnpm 9 workspaces + Turborepo                                 |
| Blockchain     | Cardano via `@meshsdk/core`                                   |
| Authentication | Provider-agnostic `AuthAdapter`; first-party adapter: Clerk   |
| WebAuthn       | `@simplewebauthn/browser` for PRF operations                  |
| Cryptography   | Web Crypto API, ChaCha20-Poly1305, Argon2id (WASM)            |
| Testing        | Vitest + fast-check (property-based) + @testing-library/react |

## License

Copyright 2026 [Latheesan Kanesamoorthy](https://github.com/latheesan-k)

Released under the [Apache License, Version 2.0](LICENSE).
