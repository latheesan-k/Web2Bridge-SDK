import { useMemo } from 'react'
import { useClerk } from '@clerk/clerk-react'
import { Web2BridgeProvider } from '@web2bridge/react'
import { ClerkAdapter } from '@web2bridge/auth-clerk'
import AppContent from './AppContent'

interface AppProps {
  clerkKey: string
  networkId: 0 | 1
  appDomain: string
}

function App({ networkId, appDomain }: AppProps) {
  const clerk = useClerk()

  // Create adapter with the shared Clerk instance from @clerk/clerk-react
  // This ensures session state is synchronized between Clerk React and the adapter
  const adapter = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new ClerkAdapter({ clerk: clerk as any })
  }, [clerk])

  return (
    <Web2BridgeProvider
      adapter={adapter}
      config={{
        appDomain,
        networkId,
        kdf: 'hkdf',
        fallback: { enabled: true, kdf: 'pbkdf2' },
      }}
    >
      <AppContent />
    </Web2BridgeProvider>
  )
}

export default App
