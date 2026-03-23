import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

const variants = {
  primary:   'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white shadow-md shadow-blue-500/20 border border-blue-400/20 active:scale-[0.98]',
  secondary: 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/50 shadow-sm active:scale-[0.98]',
  danger:    'bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-md shadow-red-500/20 border border-red-400/20 active:scale-[0.98]',
  ghost:     'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] active:scale-[0.98]',
  outline:   'border-2 border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800 active:scale-[0.98]',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl font-semibold',
  icon: 'p-2 rounded-lg',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant], sizes[size], className
      )}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
export default Button
