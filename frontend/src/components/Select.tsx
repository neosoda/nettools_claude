import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
  icon?: React.ReactNode
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, icon, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold text-slate-300 tracking-wide">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none z-10">
            {icon}
          </div>
        )}
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-200 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-slate-900/90 hover:border-slate-600',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-700/60',
            icon ? 'pl-10 pr-10' : 'pr-10',
            className
          )}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-slate-800 text-slate-200">{opt.label}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
        </div>
      </div>
    </div>
  )
)
Select.displayName = 'Select'
export default Select
