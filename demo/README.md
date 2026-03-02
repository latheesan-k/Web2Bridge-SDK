# Web2Bridge SDK Demo

A proof-of-concept demo application that integrates the **Web2Bridge SDK** to demonstrate social authentication with temporary Cardano wallet provisioning, message signing with CIP-8 CBOR output, and signature verification.

## Features

- **Social Authentication** - Sign in with Clerk (Google, GitHub, etc.)
- **Temporary Wallet** - Automatically provisioned deterministic Cardano wallet
- **Message Signing** - Sign messages and get CBOR hex output
- **CIP-8 Verification** - Verify signed CBOR signatures against wallet addresses
- **PRF Support** - Uses WebAuthn PRF for hardware-backed key derivation (with password fallback)

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Web2Bridge SDK** - Core SDK packages (`@web2bridge/core`, `@web2bridge/react`, `@web2bridge/auth-clerk`)
- **Clerk** - Authentication provider
- **OatCSS** - Semantic, zero-dependency UI library
- **TypeScript** - Type safety

## Prerequisites

Before running this demo, you need:

1. **Clerk Account** - Sign up at [https://clerk.com](https://clerk.com) and create an application
2. **Node.js** - Version 18 or higher
3. **pnpm** - Package manager (the SDK workspace uses pnpm)

## Setup

### 1. Configure Environment Variables

Copy the example environment file and add your Clerk publishable key:

```bash
cp .env.example .env
```

Edit `.env` and add your values:

```bash
# Clerk Publishable Key
# Get yours from https://dashboard.clerk.com
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE

# Cardano Network ID
# 0 = Preprod (testnet) - RECOMMENDED for testing
# 1 = Mainnet
VITE_NETWORK_ID=0

# App Domain for wallet derivation
# This is used to derive the wallet's app-specific path
VITE_APP_DOMAIN=[REDACTED]
```

### 2. Install Dependencies

Install the demo's dependencies. The Web2Bridge SDK packages are linked from the parent workspace:

```bash
# From the demo directory
pnpm install

# Or if you're in the SDK root
pnpm install --filter @web2bridge/demo
```

### 3. Build the SDK (if needed)

If you've made changes to the SDK packages or this is your first time running the demo, build the SDK:

```bash
# From the SDK root directory
cd ..
pnpm run build

# Then return to demo
cd demo
```

### 4. Run the Development Server

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`

## Usage

### 1. Sign In

- Click "Sign in with Clerk" button
- Choose your preferred social login (Google, GitHub, etc.)
- The Web2Bridge SDK will automatically:
  - Authenticate you via Clerk
  - Generate a unique namespaced user ID
  - Derive wallet entropy using WebAuthn PRF (or password fallback)
  - Create a temporary Cardano wallet

### 2. Sign a Message

- Enter any message in the "Message to Sign" field
- Click "Sign Message"
- The wallet will sign the message using CIP-8 format
- Copy the resulting CBOR hex output

### 3. Verify a Signature

- Switch to the "Verify Signature" tab
- Paste the wallet address, original message, and CBOR signature
- Click "Verify Signature"
- The app will validate the CIP-8 signature and show:
  - Whether the signature is valid
  - The signer's address (if valid)

## Architecture

### Wallet Derivation

The temporary wallet is deterministically derived from:

1. **Social Auth Provider** (e.g., Clerk) → Unique User ID
2. **Namespaced ID** → Format: `clerk:<user_id>`
3. **Entropy Derivation**:
   - **PRF Path** (preferred): WebAuthn PRF extension for hardware-backed keys
   - **Password Path** (fallback): Argon2id/PBKDF2 KDF with spending password
4. **HD Wallet Path** → BIP-44 derivation with app-specific index

### CIP-8 Signatures

The demo uses CIP-8 (Cardano Signatures) format:

- **COSE_Sign1** structure for signatures
- **Ed25519** cryptographic algorithm
- **CBOR** encoding for compact representation

### Key Files

```
demo/
├── src/
│   ├── components/
│   │   ├── Login.tsx           # Social auth interface
│   │   ├── WalletDashboard.tsx # Wallet info + tab navigation
│   │   ├── SignMessage.tsx     # Message signing UI
│   │   └── VerifySignature.tsx # CIP-8 verification UI
│   ├── hooks/
│   │   └── useCip8Verify.ts    # CIP-8 verification logic
│   ├── main.tsx                # App entry with Web2BridgeProvider
│   └── App.tsx                 # Main app component
├── .env.example                # Required environment variables
└── README.md                   # This file
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Your Clerk application's publishable key |
| `VITE_NETWORK_ID` | No | Cardano network (0 = preprod, 1 = mainnet). Default: 0 |
| `VITE_APP_DOMAIN` | No | Domain for wallet derivation path. Default: [REDACTED] |

## Troubleshooting

### "Cannot find module '@web2bridge/core'"

Make sure the SDK is built:

```bash
cd ..
pnpm run build
cd demo
```

### "VITE_CLERK_PUBLISHABLE_KEY is not defined"

Copy `.env.example` to `.env` and add your Clerk publishable key:

```bash
cp .env.example .env
# Edit .env and add your key
```

### PRF Not Available

If your browser doesn't support WebAuthn PRF:

1. The app will automatically fall back to password mode
2. Enter a spending password when prompted
3. The wallet will be derived using Argon2id/PBKDF2 instead

## Security Notes

⚠️ **This is a demo application for testing purposes.**

- Temporary wallets are ephemeral and stored only in memory
- No private keys or mnemonics are persisted
- Social auth sessions may expire
- Use **testnet (networkId: 0)** for all testing
- Never use production wallets or real funds with this demo

## Development

### Available Scripts

```bash
pnpm dev        # Start development server (port 3000)
pnpm build      # Build for production
pnpm preview    # Preview production build
pnpm typecheck  # Run TypeScript type checking
```

### Customizing

The demo uses **OatCSS** for styling - a semantic, zero-dependency UI library. See [oat.ink](https://oat.ink) for documentation.

To customize the appearance:

1. Edit custom styles in `index.html` (in the `<style>` tag)
2. Or add a custom CSS file and import it in `main.tsx`

## Learn More

- **Web2Bridge SDK**: [GitHub Repository](https://github.com/latheesan-k/Web2Bridge-SDK)
- **Clerk**: [https://clerk.com](https://clerk.com)
- **OatCSS**: [https://oat.ink](https://oat.ink)
- **CIP-8**: [Cardano Improvement Proposal 8](https://cips.cardano.org/cips/cip8/)
- **Cardano Preprod Testnet**: [https://docs.cardano.org/cardano-testnet/getting-started](https://docs.cardano.org/cardano-testnet/getting-started)

## License

This demo is part of the Web2Bridge SDK and follows the same license.
