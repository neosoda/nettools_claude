import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const styles: Record<ToastType, string> = {
  success: 'bg-green-950/90 border-green-700 text-green-300',
  error: 'bg-red-950/90 border-red-700 text-red-300',
  info: 'bg-blue-950/90 border-blue-700 text-blue-300',
  warning: 'bg-amber-950/90 border-amber-700 text-amber-300',
}

const iconStyles: Record<ToastType, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-amber-400',
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000) => {
    const id = `toast-${++nextId}`
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, toast.duration || 4000)
    return () => clearTimeout(timer)
  }, [toast.duration, onClose])

  const Icon = icons[toast.type]

  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 rounded-lg border shadow-xl backdrop-blur-sm',
      'animate-slide-in-right',
      styles[toast.type]
    )}>
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconStyles[toast.type])} />
      <p className="text-sm flex-1">{toast.message}</p>
      <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
