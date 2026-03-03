import { useWeb2Bridge } from '@web2bridge/react'
import { useClerk } from '@clerk/clerk-react'
import AuthSection from './components/AuthSection'
import VerifySection from './components/VerifySection'
import SkeletonScreen from './components/SkeletonScreen'

function AppContent() {
  const {
    isLoading,
    isAuthenticated,
    isWalletReady,
    walletAddresses,
    logout,
    lockWallet
  } = useWeb2Bridge()
  const clerk = useClerk()

  const handleLogout = async () => {
    lockWallet()
    await logout()
    await clerk.signOut()
  }

  // Show skeleton screen while auth state is being determined
  // This prevents the flicker of unauthenticated UI when a session exists
  if (isLoading) {
    return <SkeletonScreen />
  }

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
          {(isAuthenticated || isWalletReady) && (
            <button className="btn-sm btn-danger" onClick={handleLogout}>Sign Out</button>
          )}
        </div>
      </nav>

      <AuthSection />

      {isWalletReady && walletAddresses && (
        <>
          <div className="flow-connector">↓</div>
          <VerifySection pendingCbor={null} onConsumed={() => { }} />
        </>
      )}

      <footer className="footer">
        Powered by <a href="https://github.com/latheesan-k/Web2Bridge-SDK" target="_blank" rel="noopener">Web2Bridge SDK</a>
      </footer>
    </>
  )
}

export default AppContent
