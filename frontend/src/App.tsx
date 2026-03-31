import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Network, DatabaseBackup, GitCompare, ShieldCheck,
  Terminal, CalendarClock, GitGraph, ScrollText, Settings, Activity, Square, KeyRound, Package
} from 'lucide-react'
import { cn } from './lib/utils'
import logo from './assets/images/logo.png'
import { EventsOn } from '../wailsjs/runtime/runtime'
import { CredentialProvider, useGlobalCredential } from './context/CredentialContext'
import { ToastProvider } from './components/Toast'
import backend from './lib/backend'

import ScanPage from './pages/ScanPage'
import BackupPage from './pages/BackupPage'
import DiffPage from './pages/DiffPage'
import AuditPage from './pages/AuditPage'
import PlaybookPage from './pages/PlaybookPage'
import SchedulerPage from './pages/SchedulerPage'
import TopologyPage from './pages/TopologyPage'
import LogsPage from './pages/LogsPage'
import SettingsPage from './pages/SettingsPage'
import InventoryPage from './pages/InventoryPage'

const navItems = [
  { to: '/scan', icon: Network, label: 'Découverte' },
  { to: '/inventory', icon: Package, label: 'Inventaire' },
  { to: '/backup', icon: DatabaseBackup, label: 'Backups' },
  { to: '/diff', icon: GitCompare, label: 'Comparateur' },
  { to: '/audit', icon: ShieldCheck, label: 'Audit' },
  { to: '/playbook', icon: Terminal, label: 'Playbooks' },
  { to: '/scheduler', icon: CalendarClock, label: 'Planificateur' },
  { to: '/topology', icon: GitGraph, label: 'Topologie' },
  { to: '/logs', icon: ScrollText, label: 'Journaux' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

function SidebarCredentialSelector() {
  const { globalCredId, setGlobalCredId } = useGlobalCredential()
  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => backend.GetCredentials(),
  })

  // Clear stale credential ID if the referenced credential no longer exists
  useEffect(() => {
    const list = credentials as any[]
    if (globalCredId && list.length > 0) {
      const exists = list.some((c: any) => c.id === globalCredId)
      if (!exists) setGlobalCredId('')
    }
  }, [credentials, globalCredId, setGlobalCredId])

  if ((credentials as any[]).length === 0) return null

  return (
    <div className="px-4 py-3 mx-2 mt-2 bg-slate-800/40 rounded-xl border border-white/[0.05] flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <KeyRound className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">Credential Actif</span>
      </div>
      <div className="relative">
        <select
          value={globalCredId}
          onChange={e => setGlobalCredId(e.target.value)}
          className="w-full appearance-none bg-slate-900/80 border border-slate-700/60 rounded-lg text-xs font-medium text-slate-200 px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:bg-slate-800 transition-colors"
        >
          <option value="">— Aucun —</option>
          {(credentials as any[]).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
        </div>
      </div>
    </div>
  )
}

function WindowTitleSync() {
  const location = useLocation()

  useEffect(() => {
    const current = navItems.find(item => item.to === location.pathname)
    const title = current ? `NetTools — ${current.label}` : 'NetTools'
    void backend.WindowSetTitle?.(title)
  }, [location.pathname])

  return null
}

function AppContent() {
  const [hasRunningTask, setHasRunningTask] = useState(false)
  const [stopStatus, setStopStatus] = useState('')

  useEffect(() => {
    const unsub1 = EventsOn('scan:progress', () => setHasRunningTask(true))
    const unsub2 = EventsOn('scan:complete', () => setHasRunningTask(false))
    const unsub3 = EventsOn('tasks:stopped', () => {
      setHasRunningTask(false)
      setStopStatus('Arrêté')
      setTimeout(() => setStopStatus(''), 2000)
    })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  return (
    <div className="flex h-screen bg-[#030712] text-slate-200 selection:bg-blue-500/30">
      <WindowTitleSync />
      
      {/* Sidebar */}
      <nav className="flex flex-col w-[260px] bg-transparent shrink-0 py-3 pl-3">
        <div className="flex-1 flex flex-col bg-slate-900/40 rounded-2xl border border-white/[0.04] overflow-hidden backdrop-blur-xl shadow-2xl">
          
          {/* Logo / Header */}
          <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.04] shrink-0">
            <img src={logo} alt="NetTools Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 text-sm tracking-wide">
              NetTools
            </span>
          </div>

          <SidebarCredentialSelector />

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 group relative overflow-hidden',
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 font-bold shadow-sm shadow-blue-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]',
                )}
              >
                {({ isActive }) => (
                  <>
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 transition-opacity duration-300", 
                      isActive && "opacity-100"
                    )} />
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-blue-500 rounded-r-md shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                    )}
                    <Icon className={cn("w-4 h-4 shrink-0 transition-all duration-300 relative z-10", isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" : "group-hover:scale-110 group-hover:text-blue-300")} />
                    <span className="relative z-10">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>

          {/* Footer actions */}
          <div className="px-4 py-4 border-t border-white/[0.04] space-y-3 bg-slate-950/20">
            {hasRunningTask && (
              <button
                onClick={() => void backend.StopAllTasks()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all shadow-sm shadow-red-500/5 active:scale-95"
              >
                <Square className="w-3.5 h-3.5 fill-red-500/20" />
                Arrêter les tâches
              </button>
            )}
            {stopStatus && <p className="text-xs text-center text-emerald-400 font-medium animate-in fade-in slide-in-from-bottom-2">{stopStatus}</p>}
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-600 text-center">Version 1.3.0</p>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden p-3 relative">
        <div className="w-full h-full bg-[#0a0f1c] rounded-2xl border border-white/[0.04] shadow-2xl overflow-hidden relative flex flex-col">
          <Routes>
            <Route path="/" element={<ScanPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/diff" element={<DiffPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/playbook" element={<PlaybookPage />} />
            <Route path="/scheduler" element={<SchedulerPage />} />
            <Route path="/topology" element={<TopologyPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <CredentialProvider>
        <AppContent />
      </CredentialProvider>
    </ToastProvider>
  )
}
