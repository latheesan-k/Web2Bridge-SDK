import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkKey}>
      <App clerkKey={clerkKey} networkId={networkId} appDomain={appDomain} />
    </ClerkProvider>
  </React.StrictMode>
)
