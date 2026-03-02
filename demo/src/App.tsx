import { useState, useCallback } from 'react'
import { useWeb2Bridge } from '@web2bridge/react'
import { useClerk } from '@clerk/clerk-react'
import AuthSection from './components/AuthSection'
import VerifySection from './components/VerifySection'

function App() {
  const { isAuthenticated, logout, lockWallet } = useWeb2Bridge()
  const clerk = useClerk()
  const [pendingCbor, setPendingCbor] = useState<string | null>(null)
  const [walletIssued, setWalletIssued] = useState(false)

  const handleLogout = async () => {
    lockWallet()
    setWalletIssued(false)
    setPendingCbor(null)
    await logout()
    await clerk.signOut()
  }

  const handleSignedMessage = useCallback((cbor: string) => {
    setPendingCbor(cbor)
  }, [])

  return (
    <>
      <nav className="nav">
        <div className="nav-brand">
          <span>⬡</span> Web2Bridge Demo
        </div>
        <div className="nav-right">
          <span className="badge badge-network">
            {import.meta.env.VITE_NETWORK_ID === '1' ? 'Mainnet' : 'Preprod'}
          </span>
          {isAuthenticated && (
            <button className="btn-sm btn-danger" onClick={handleLogout}>Sign Out</button>
          )}
        </div>
      </nav>

      <AuthSection onSignedMessage={handleSignedMessage} onWalletIssued={() => setWalletIssued(true)} />

      {isAuthenticated && walletIssued && (
        <>
          <div className="flow-connector">↓</div>
          <VerifySection pendingCbor={pendingCbor} onConsumed={() => setPendingCbor(null)} />
        </>
      )}

      <footer className="footer">
        Powered by <a href="https://github.com/latheesan-k/Web2Bridge-SDK" target="_blank" rel="noopener">Web2Bridge SDK</a>
      </footer>
    </>
  )
}

export default App
