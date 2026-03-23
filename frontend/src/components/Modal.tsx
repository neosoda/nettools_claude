import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl transition-opacity animate-in fade-in duration-200" 
        onClick={onClose} 
      />
      <div className={cn(
        'relative w-full bg-slate-900/90 backdrop-blur-3xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200',
        sizes[size], className
      )}>
        {/* Subtle top highlight */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04] bg-white/[0.02]">
          <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">{title}</h2>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
