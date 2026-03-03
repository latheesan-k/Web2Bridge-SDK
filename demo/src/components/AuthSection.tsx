import { useState } from 'react'
import { useWeb2Bridge } from '@web2bridge/react'
import { useUser } from '@clerk/clerk-react'
import { PRFNotSupportedError } from '@web2bridge/core'

interface WalletAddresses {
  payment: string
  stake: string
  networkId: number
}

function AuthSection() {
  const {
    isAuthenticated,
    isWalletInitialized,
    isWalletReady,
    walletAddresses,
    isAutoIssuing,
    error,
    requiresPassword,
    prfSupported,
    authenticate,
    autoIssueWallet,
    signMessage,
  } = useWeb2Bridge()
  const { user } = useUser()

  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [walletPassword, setWalletPassword] = useState('')
  const [signPassword, setSignPassword] = useState('')
  const [message, setMessage] = useState('')
  const [signedCbor, setSignedCbor] = useState<string | null>(null)
  const [isSigning, setIsSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isDetecting = prfSupported === null

  // ── Phase 1: Not authenticated, no wallet ─────────────────────────────
  if (!isAuthenticated && !isWalletReady) {
    return (
      <div>
        <div className="section-label">🔐 Get Started</div>
        <div className="card">
          <div className="signin-area">
            <h2>Sign in to get your Wallet</h2>
            <p>
              Sign in with your social account and get a secure Cardano wallet instantly
              — no extensions, no seed phrases, nothing to install.
            </p>

            {error && !(error instanceof PRFNotSupportedError) && (
              <div className="alert alert-error" style={{ textAlign: 'left', marginBottom: 16 }}>
                {error.message}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={async () => {
                setIsAuthenticating(true)
                await authenticate()
                setIsAuthenticating(false)
              }}
              disabled={isAuthenticating || isDetecting}
              style={{ maxWidth: 320, margin: '0 auto' }}
            >
              {isAuthenticating
                ? <><span className="spinner" /> Signing in...</>
                : isDetecting
                  ? <><span className="spinner" /> Detecting device...</>
                  : 'Sign in with Clerk'}
            </button>

            {isDetecting ? (
              <div className="steps-detecting">
                <span className="spinner" style={{ width: 12, height: 12 }} /> Detecting device capabilities...
              </div>
            ) : (
              <ol className="steps">
                <li>Sign in with Google, GitHub, or email</li>
                <li>{prfSupported ? 'Your wallet will be secured with biometrics' : 'Enter a spending password to secure your wallet'}</li>
                <li>Sign messages with lazy authentication — keys exist only during signing</li>
              </ol>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Phase 2: Authenticated, wallet not yet initialized ────────────────
  if (isAuthenticated && !isWalletInitialized && !isWalletReady) {
    return (
      <div>
        <div className="section-label">✅ Authenticated</div>
        <div className="card">
          <div className="card-title">Welcome{user?.primaryEmailAddress ? `, ${user.primaryEmailAddress.emailAddress}` : ''}</div>
          <div className="card-sub">
            {requiresPassword
              ? 'Enter a spending password to create your secure wallet.'
              : 'Setting up your biometric wallet...'}
          </div>

          {error && !(error instanceof PRFNotSupportedError) && (
            <div className="alert alert-error" style={{ textAlign: 'left', marginBottom: 16 }}>
              {error.message}
            </div>
          )}

          {requiresPassword && (
            <div className="password-section">
              <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: 12 }}>
                Your device will use a spending password to secure your wallet.
              </div>
              <label htmlFor="wallet-password">Spending Password</label>
              <input
                id="wallet-password"
                type="password"
                value={walletPassword}
                onChange={(e) => setWalletPassword(e.target.value)}
                placeholder="Choose a strong password..."
                onKeyDown={(e) => { if (e.key === 'Enter' && walletPassword) handleCreateWallet() }}
              />
              <small>This password creates your wallet key. You'll need it each time you sign. It is never stored.</small>
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleCreateWallet}
            disabled={isAutoIssuing || (requiresPassword && !walletPassword)}
            style={{ maxWidth: 320, margin: requiresPassword ? '16px auto 0' : '0 auto' }}
          >
            {isAutoIssuing
              ? <><span className="spinner" /> Creating wallet...</>
              : requiresPassword
                ? 'Create Wallet'
                : <><span className="spinner" /> Auto-configuring...</>}
          </button>
        </div>
      </div>
    )
  }

  // ── Phase 3: Wallet initialized but addresses not cached (PRF path) ────
  if (isWalletInitialized && !isWalletReady) {
    return (
      <div>
        <div className="section-label">🔐 Wallet Ready</div>
        <div className="card">
          <div className="card-title">Your Wallet is Secured</div>
          <div className="card-sub">
            Your wallet is secured with {requiresPassword ? 'your spending password' : 'biometric authentication'}.
            Compose a message to unlock and sign.
          </div>

          <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: 16 }}>
            <strong>Lazy Authentication:</strong> Your wallet keys are not loaded in memory.
            {requiresPassword
              ? ' Enter your password when signing to temporarily unlock.'
              : ' Authenticate with biometrics when signing to temporarily unlock.'}
          </div>

          {renderSignForm(null, true)}
        </div>
      </div>
    )
  }

  // ── Phase 4: Wallet ready with cached addresses ──────────────────────
  if (isWalletReady && walletAddresses) {
    return (
      <div>
        <div className="section-label">✅ Wallet Active</div>
        <div className="card">
          <div className="card-title">
            Your Wallet
            <span className={`badge ${walletAddresses.networkId === 1 ? 'badge-mainnet' : 'badge-network'}`} style={{ fontSize: '0.65rem', marginLeft: 8 }}>
              {walletAddresses.networkId === 1 ? 'Mainnet' : 'Preprod Testnet'}
            </span>
          </div>
          <div className="card-sub">
            Wallet secured via {requiresPassword ? 'spending password' : 'biometrics'} — keys exist only during signing.
          </div>

          <div className="identity-section">
            <div className="identity-row">
              <div className="identity-label">
                <span className="identity-icon">🔑</span>
                Stake Address <span className="identity-hint">(your unique on-chain identity)</span>
              </div>
              <div className="mono-box identity-value">{walletAddresses.stake}</div>
            </div>
            <div className="identity-row">
              <div className="identity-label">
                <span className="identity-icon">💳</span>
                Payment Address <span className="identity-hint">(receive funds here)</span>
              </div>
              <div className="mono-box identity-value">{walletAddresses.payment}</div>
            </div>
          </div>

          <div className="divider" />

          {renderSignForm(walletAddresses, false)}
        </div>
      </div>
    )
  }

  async function handleCreateWallet() {
    const result = await autoIssueWallet(requiresPassword ? walletPassword : undefined)
    if (!result.error) {
      setWalletPassword('')
    }
  }

  function renderSignForm(_addresses: WalletAddresses | null, isFirstSign: boolean) {
    const handleSign = async () => {
      if (!message.trim() || (requiresPassword && !signPassword)) return
      setIsSigning(true)
      setSignError(null)
      setSignedCbor(null)

      const result = await signMessage(message.trim(), requiresPassword ? signPassword : undefined)

      if (result.error) {
        setSignError(result.error.message)
      } else if (result.data) {
        setSignedCbor(result.data)
      }

      setSignPassword('')
      setIsSigning(false)
    }

    const handleCopy = () => {
      if (signedCbor) {
        navigator.clipboard.writeText(signedCbor)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }

    return (
      <>
        <div className="form-group" style={{ marginTop: 16 }}>
          <label htmlFor="message">Message to Sign</label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter any message..."
            rows={3}
          />
        </div>

        {requiresPassword && (
          <div className="password-section" style={{ marginTop: 12 }}>
            <label htmlFor="sign-password">Spending Password</label>
            <input
              id="sign-password"
              type="password"
              value={signPassword}
              onChange={(e) => setSignPassword(e.target.value)}
              placeholder="Enter your spending password to unlock..."
              onKeyDown={(e) => { if (e.key === 'Enter' && message.trim() && (!requiresPassword || signPassword)) handleSign() }}
            />
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleSign}
          disabled={isSigning || !message.trim() || (requiresPassword && !signPassword)}
          style={{ marginTop: 16 }}
        >
          {isSigning
            ? <><span className="spinner" /> {isFirstSign ? 'Unlocking & Signing...' : 'Unlocking & Signing...'}</>
            : requiresPassword
              ? 'Unlock Wallet & Sign'
              : 'Authenticate & Sign'}
        </button>

        {signError && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {signError}
          </div>
        )}

        {signedCbor && (
          <div style={{ marginTop: 16 }}>
            <div className="alert alert-success">
              <strong>Message signed successfully!</strong>
            </div>
            <div className="identity-row" style={{ marginTop: 12 }}>
              <div className="identity-label">Signature (CBOR)</div>
              <div className="mono-box" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {signedCbor}
              </div>
              <button
                className="btn-sm"
                onClick={handleCopy}
                style={{ marginTop: 8 }}
              >
                {copied ? '✓ Copied!' : 'Copy Signature'}
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  // Fallback (should not reach here)
  return null
}

export default AuthSection
