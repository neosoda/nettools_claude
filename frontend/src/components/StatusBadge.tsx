import { cn } from '../lib/utils'

interface StatusBadgeProps {
  status: 'success' | 'failed' | 'running' | 'online' | 'offline' | 'unknown' | string
  className?: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  success: { label: 'Succès', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' },
  failed:  { label: 'Échec',  className: 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' },
  running: { label: 'En cours', className: 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)] pulse-dot' },
  online:  { label: 'En ligne', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' },
  offline: { label: 'Hors ligne', className: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' },
  unknown: { label: 'Inconnu', className: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' },
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? { label: status, className: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase backdrop-blur-sm transition-all', cfg.className, className)}>
      {cfg.label}
    </span>
  )
}
