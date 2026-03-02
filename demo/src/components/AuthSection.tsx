import { useState } from 'react'
import { useWeb2Bridge } from '@web2bridge/react'
import { useUser } from '@clerk/clerk-react'
import { PRFNotSupportedError } from '@web2bridge/core'

interface AuthSectionProps {
  onSignedMessage: (cbor: string) => void
  onWalletIssued: () => void
}

interface WalletAddresses {
  payment: string
  stake: string
  networkId: number
}

function AuthSection({ onSignedMessage, onWalletIssued }: AuthSectionProps) {
  const {
    isAuthenticated, error, requiresPassword, prfSupported,
    authenticate, login, lockWallet,
  } = useWeb2Bridge()
  const { user } = useUser()

  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [addresses, setAddresses] = useState<WalletAddresses | null>(null)
  const [walletPassword, setWalletPassword] = useState('')
  const [isCreatingWallet, setIsCreatingWallet] = useState(false)

  const isDetecting = prfSupported === null

  // ── Phase 1: Not authenticated ──────────────────────────────────────
  if (!isAuthenticated) {
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
                <li>{prfSupported ? 'Confirm with biometrics (FaceID / TouchID)' : 'Enter your spending password'}</li>
                <li>Your wallet is ready — sign messages, verify signatures</li>
              </ol>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Phase 2: Authenticated, wallet not yet issued ───────────────────
  if (!addresses) {
    return (
      <div>
        <div className="section-label">✅ Authenticated</div>
        <div className="card">
          <div className="card-title">Welcome{user?.primaryEmailAddress ? `, ${user.primaryEmailAddress.emailAddress}` : ''}</div>
          <div className="card-sub">
            Signed in successfully. {requiresPassword
              ? 'Enter a spending password to derive your wallet.'
              : 'Unlocking your wallet with biometrics...'}
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
            disabled={isCreatingWallet || (requiresPassword && !walletPassword)}
            style={{ maxWidth: 320, margin: requiresPassword ? '16px auto 0' : '0 auto' }}
          >
            {isCreatingWallet
              ? <><span className="spinner" /> Deriving wallet...</>
              : 'Issue Wallet'}
          </button>
        </div>
      </div>
    )
  }

  async function handleCreateWallet() {
    setIsCreatingWallet(true)
    const result = await login(requiresPassword ? { password: walletPassword } : undefined)
    if (result.data) {
      const w = result.data
      const addrs = await w.getUsedAddresses()
      const rewards = await w.getRewardAddresses()
      const net = await w.getNetworkId()
      if (!addrs.error && addrs.data?.length && !rewards.error && rewards.data?.length) {
        setAddresses({
          payment: addrs.data[0],
          stake: rewards.data[0],
          networkId: net.data ?? 0,
        })
        onWalletIssued()
      }
      lockWallet()
    }
    setIsCreatingWallet(false)
  }

  // ── Phase 3: Wallet issued — show addresses + sign-per-operation ────
  return <WalletPanel addresses={addresses} requiresPassword={requiresPassword} onSignedMessage={onSignedMessage} />
}


interface WalletPanelProps {
  addresses: WalletAddresses
  requiresPassword: boolean
  onSignedMessage: (cbor: string) => void
}

function WalletPanel({ addresses, requiresPassword, onSignedMessage }: WalletPanelProps) {
  const { login, lockWallet } = useWeb2Bridge()

  const [message, setMessage] = useState('')
  const [signPassword, setSignPassword] = useState('')
  const [signedCbor, setSignedCbor] = useState<string | null>(null)
  const [isSigning, setIsSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const networkLabel = addresses.networkId === 1 ? 'Mainnet' : 'Preprod Testnet'

  const handleSign = async () => {
    if (!message.trim() || (requiresPassword && !signPassword)) return
    setIsSigning(true)
    setSignError(null)
    setSignedCbor(null)

    const result = await login(requiresPassword ? { password: signPassword } : undefined)
    if (result.error) {
      setSignError(result.error.message)
      setIsSigning(false)
      return
    }

    const wallet = result.data!
    const payload = JSON.stringify({
      stake_address: addresses.stake,
      message: message.trim(),
    })

    try {
      const sigResult = await wallet.signData(addresses.payment, payload)
      if (sigResult.error) {
        setSignError(sigResult.error.message)
      } else if (sigResult.data) {
        setSignedCbor(sigResult.data)
        onSignedMessage(sigResult.data)
      }
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Signing failed')
    } finally {
      lockWallet()
      setSignPassword('')
      setIsSigning(false)
    }
  }

  const handleCopy = () => {
    if (signedCbor) {
      navigator.clipboard.writeText(signedCbor)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div>
      <div className="section-label">✅ Wallet Issued</div>
      <div className="card">
        <div className="card-title">
          Your Wallet
          <span className={`badge ${addresses.networkId === 1 ? 'badge-mainnet' : 'badge-network'}`} style={{ fontSize: '0.65rem', marginLeft: 8 }}>
            {networkLabel}
          </span>
        </div>
        <div className="card-sub">
          Authenticated via social login, verified, and wallet issued.
          Secured via {requiresPassword ? 'spending password' : 'biometrics'} — keys exist only in your browser during signing.
        </div>

        <div className="identity-section">
          <div className="identity-row">
            <div className="identity-label">
              <span className="identity-icon">🔑</span>
              Stake Address <span className="identity-hint">(your unique on-chain identity)</span>
            </div>
            <div className="mono-box identity-value">{addresses.stake}</div>
          </div>
          <div className="identity-row">
            <div className="identity-label">
              <span className="identity-icon">💳</span>
              Payment Address <span className="identity-hint">(receive funds here)</span>
            </div>
            <div className="mono-box identity-value">{addresses.payment}</div>
          </div>
          <div className="identity-row">
            <div className="identity-label">
              <span className="identity-icon">🌐</span>
              Network
            </div>
            <div className="identity-meta">
              {networkLabel} (ID: {addresses.networkId}) — {addresses.networkId === 1
                ? 'Real ADA transactions'
                : 'Test network for development'}
            </div>
          </div>
        </div>
      </div>

      <div className="section-label">✍️ Sign a Message</div>
      <div className="card">
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Prove ownership of your wallet by signing a message with your private key.
          {requiresPassword ? ' Re-enter your spending password to unlock signing.' : ''}
        </div>

        <label htmlFor="msg-input">Message</label>
        <input
          id="msg-input"
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message to sign..."
          style={{ marginBottom: 12 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && message.trim() && (!requiresPassword || signPassword)) handleSign() }}
        />

        {requiresPassword && (
          <>
            <label htmlFor="sign-password">Spending Password</label>
            <input
              id="sign-password"
              type="password"
              value={signPassword}
              onChange={(e) => setSignPassword(e.target.value)}
              placeholder="Re-enter to unlock signing..."
              style={{ marginBottom: 12 }}
              onKeyDown={(e) => { if (e.key === 'Enter' && signPassword && message.trim()) handleSign() }}
            />
          </>
        )}

        <button
          className="btn-primary"
          onClick={handleSign}
          disabled={isSigning || !message.trim() || (requiresPassword && !signPassword)}
        >
          {isSigning ? <><span className="spinner" /> Unlocking &amp; Signing...</> : 'Sign Message'}
        </button>

        {signError && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {signError}
          </div>
        )}
      </div>

      {signedCbor && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Signed Output</div>
            <button className="btn-copy" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="cbor-box">{signedCbor}</div>
          <div className="alert alert-info" style={{ fontSize: '0.78rem' }}>
            ↓ This signature has been auto-verified in the section below.
          </div>
        </div>
      )}
    </div>
  )
}

export default AuthSection
