import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface CredentialContextValue {
  globalCredId: string
  setGlobalCredId: (id: string) => void
}

const CredentialContext = createContext<CredentialContextValue>({
  globalCredId: '',
  setGlobalCredId: () => {},
})

const STORAGE_KEY = 'nettools_global_cred_id'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export function CredentialProvider({ children }: { children: ReactNode }) {
  const [globalCredId, setGlobalCredIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || ''
  })

  // Validate stored credential still exists on mount
  useEffect(() => {
    if (!globalCredId) return
    getBackend().then(m => m.GetCredentials()).then(creds => {
      const ids = (creds || []).map((c: any) => c.id)
      if (!ids.includes(globalCredId)) {
        setGlobalCredIdState('')
        localStorage.removeItem(STORAGE_KEY)
      }
    }).catch(() => {})
  }, [])

  const setGlobalCredId = (id: string) => {
    setGlobalCredIdState(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <CredentialContext.Provider value={{ globalCredId, setGlobalCredId }}>
      {children}
    </CredentialContext.Provider>
  )
}

export function useGlobalCredential() {
  return useContext(CredentialContext)
}
