import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react'
import { cn } from '../lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200 shadow-[0_8px_30px_rgb(16,185,129,0.12)]',
  error: 'border-red-500/30 bg-red-950/40 text-red-200 shadow-[0_8px_30px_rgb(239,68,68,0.12)]',
  warning: 'border-amber-500/30 bg-amber-950/40 text-amber-200 shadow-[0_8px_30px_rgb(245,158,11,0.12)]',
  info: 'border-blue-500/30 bg-blue-950/40 text-blue-200 shadow-[0_8px_30px_rgb(59,130,246,0.12)]',
}

const iconStyles: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-sm w-full font-sans">
        {toasts.map(t => {
          const Icon = icons[t.type]
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3.5 rounded-xl border backdrop-blur-xl animate-in slide-in-from-right-8 fade-in duration-300 text-sm font-medium tracking-wide',
                styles[t.type]
              )}
            >
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0 animate-pulse', iconStyles[t.type])} />
              <span className="flex-1 drop-shadow-sm">{t.message}</span>
              <button 
                onClick={() => removeToast(t.id)} 
                className={cn('shrink-0 p-1 rounded-md transition-colors opacity-60 hover:opacity-100 hover:bg-white/10', iconStyles[t.type])}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
