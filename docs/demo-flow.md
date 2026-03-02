# Demo Application Flow

The demo app (`demo/`) demonstrates the correct SDK integration pattern. It implements a **3-phase flow** with a **wallet-per-operation security model** — private keys never persist in memory between operations.

## The 3-Phase Flow

```
Phase 1           Phase 2              Phase 3
Social Login  →   Issue Wallet    →    Sign / Verify
(Clerk auth)      (PRF or password)    (re-enter password each time)
```

### Phase 1: Social Sign-in

The user authenticates with their social identity provider (Clerk). **No password is needed at this step.**

- PRF support is detected on mount (`prfSupported` / `requiresPassword`)
- The "Sign in with Clerk" button opens the Clerk modal
- After authentication, the UI transitions to Phase 2 showing the user's email
- The SDK's `authenticate()` method handles this step

### Phase 2: Issue Wallet

After authentication, the wallet is derived:

- **PRF-capable devices:** Biometric prompt → wallet derived automatically
- **Fallback devices:** User enters a spending password → wallet derived from password

The wallet is used to extract public addresses (stake, payment), then **immediately locked** via `lockWallet()`. Only addresses remain in the UI — no private keys persist.

### Phase 3: Sign & Verify

Each signing operation requires **re-entering the spending password** (or re-authenticating via biometrics on PRF devices):

1. User types a message
2. User re-enters their spending password
3. Click "Sign" → wallet is re-derived → message is signed → wallet is locked
4. The CBOR signature is displayed and auto-verified

This ensures private keys exist in memory **only for the duration of the signing operation**.

## Security Model: Wallet-Per-Operation

**The wallet must not remain loaded in memory.** This is a critical security invariant:

- `login()` returns the wallet instance for immediate use
- After each operation (address derivation, signing), call `lockWallet()` to wipe the wallet
- The next operation requires the password/PRF again
- Addresses (public data) can be cached and displayed; private keys cannot

## Key SDK Methods Used

| Method                           | When Used                                                      |
|----------------------------------|----------------------------------------------------------------|
| `authenticate()`                 | Phase 1 — social sign-in only                                  |
| `login({ password })`            | Phase 2 & 3 — derive wallet (returns wallet for immediate use) |
| `lockWallet()`                   | After every operation — clears wallet from memory              |
| `wallet.getUsedAddresses()`      | Phase 2 — extract addresses after wallet creation              |
| `wallet.signData(addr, payload)` | Phase 3 — sign a message                                       |

## Common Mistakes to Avoid

| Mistake                                                         | Why It's Wrong                                                                                        |
|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| Asking for password BEFORE social sign-in                       | Social auth runs first; PRF detection on mount tells you if password is needed                        |
| Keeping wallet in memory after login                            | Private keys must not persist; lock the wallet after each operation                                   |
| Calling `login()` for auth only                                 | Use `authenticate()` for auth; `login()` also derives a wallet                                        |
| Showing error alerts for PRF fallback                           | The `requiresPassword` state handles this seamlessly — no error needed                                |
| Calling `adapter.login()` before checking if password is needed | The provider's early guard prevents this, but the demo should disable the button during PRF detection |

## Running the Demo

```bash
cp demo/.env.example demo/.env
# Set VITE_CLERK_PUBLISHABLE_KEY in demo/.env
cd demo && pnpm dev
```
