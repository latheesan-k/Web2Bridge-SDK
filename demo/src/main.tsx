import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { Web2BridgeProvider } from '@web2bridge/react'
import { ClerkAdapter } from '@web2bridge/auth-clerk'
import App from './App'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const networkId = parseInt(import.meta.env.VITE_NETWORK_ID || '0', 10) as 0 | 1
const appDomain = import.meta.env.VITE_APP_DOMAIN || 'demo.web2bridge.local'

if (!clerkKey) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY is not defined. ' +
    'Please copy .env.example to .env and add your Clerk publishable key.'
  )
}

const adapter = new ClerkAdapter({ publishableKey: clerkKey })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkKey}>
      <Web2BridgeProvider
        adapter={adapter}
        config={{
          appDomain,
          networkId,
          kdf: 'hkdf',
          fallback: { enabled: true, kdf: 'pbkdf2' },
        }}
      >
        <App />
      </Web2BridgeProvider>
    </ClerkProvider>
  </React.StrictMode>
)
