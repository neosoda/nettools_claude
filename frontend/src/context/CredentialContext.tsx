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

export function CredentialProvider({ children }: { children: ReactNode }) {
  const [globalCredId, setGlobalCredIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || ''
  })

  const setGlobalCredId = (id: string) => {
    setGlobalCredIdState(id)
    localStorage.setItem(STORAGE_KEY, id)
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
