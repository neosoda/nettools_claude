import { Routes, Route, NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Network, DatabaseBackup, GitCompare, ShieldCheck,
  Terminal, CalendarClock, GitGraph, ScrollText, Settings, Activity, Square, KeyRound,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react'
import { cn } from './lib/utils'
import { EventsOn } from '../wailsjs/runtime/runtime'
import { CredentialProvider, useGlobalCredential } from './context/CredentialContext'
import { ToastProvider } from './components/Toast'

import ScanPage from './pages/ScanPage'
import BackupPage from './pages/BackupPage'
import DiffPage from './pages/DiffPage'
import AuditPage from './pages/AuditPage'
import PlaybookPage from './pages/PlaybookPage'
import SchedulerPage from './pages/SchedulerPage'
import TopologyPage from './pages/TopologyPage'
import LogsPage from './pages/LogsPage'
import SettingsPage from './pages/SettingsPage'

const navItems = [
  { to: '/scan', icon: Network, label: 'Découverte' },
  { to: '/backup', icon: DatabaseBackup, label: 'Backups' },
  { to: '/diff', icon: GitCompare, label: 'Comparateur' },
  { to: '/audit', icon: ShieldCheck, label: 'Audit' },
  { to: '/playbook', icon: Terminal, label: 'Playbooks' },
  { to: '/scheduler', icon: CalendarClock, label: 'Planificateur' },
  { to: '/topology', icon: GitGraph, label: 'Topologie' },
  { to: '/logs', icon: ScrollText, label: 'Journaux' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

async function getBackend() { return import('../wailsjs/go/main/App') }

function SidebarCredentialSelector({ collapsed }: { collapsed: boolean }) {
  const { globalCredId, setGlobalCredId } = useGlobalCredential()
  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: async () => { const m = await getBackend(); return m.GetCredentials() },
  })

  if ((credentials as any[]).length === 0) return null
  if (collapsed) {
    const active = (credentials as any[]).find((c: any) => c.id === globalCredId)
    return (
      <div className="px-2 py-2 border-b border-slate-800" title={active ? `Credential: ${active.name}` : 'Aucun credential'}>
        <KeyRound className={cn('w-4 h-4 mx-auto', globalCredId ? 'text-green-400' : 'text-slate-600')} />
      </div>
    )
  }

  return (
    <div className="px-3 py-2 border-b border-slate-800">
      <div className="flex items-center gap-1.5 mb-1">
        <KeyRound className="w-3 h-3 text-slate-500" />
        <span className="text-xs text-slate-500">Credential actif</span>
      </div>
      <select
        value={globalCredId}
        onChange={e => setGlobalCredId(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 px-2 py-1 focus:outline-none focus:border-blue-500"
      >
        <option value="">— Aucun —</option>
        {(credentials as any[]).map((c: any) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  )
}

function AppContent() {
  const [hasRunningTask, setHasRunningTask] = useState(false)
  const [taskInfo, setTaskInfo] = useState('')
  const [stopStatus, setStopStatus] = useState('')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed))
  }, [collapsed])

  useEffect(() => {
    const unsub1 = EventsOn('scan:progress', (data: any) => {
      setHasRunningTask(true)
      setTaskInfo(`Scan ${data?.ip || ''}`)
    })
    const unsub2 = EventsOn('scan:complete', () => { setHasRunningTask(false); setTaskInfo('') })
    const unsub3 = EventsOn('backup:progress', (data: any) => {
      if (data?.status === 'running') {
        setHasRunningTask(true)
        setTaskInfo(`Backup ${data?.device_ip || ''}`)
      }
    })
    const unsub4 = EventsOn('tasks:stopped', () => {
      setHasRunningTask(false)
      setTaskInfo('')
      setStopStatus('Arrêté')
      setTimeout(() => setStopStatus(''), 2000)
    })
    return () => { unsub1(); unsub2(); unsub3(); unsub4() }
  }, [])

  const handleStop = async () => {
    const m = await getBackend()
    await m.StopAllTasks()
  }

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <nav className={cn(
        "flex flex-col bg-slate-900 border-r border-slate-800 shrink-0 transition-all duration-200",
        collapsed ? "w-[56px]" : "w-[220px]"
      )}>
        {/* Logo + collapse toggle */}
        <div className="flex items-center gap-2 px-3 h-14 border-b border-slate-800">
          <Activity className={cn("w-5 h-5 shrink-0", hasRunningTask ? "text-blue-400 animate-pulse" : "text-blue-400")} />
          {!collapsed && <span className="font-semibold text-white text-sm flex-1">NetworkTools</span>}
          <button onClick={() => setCollapsed(c => !c)} className="text-slate-500 hover:text-slate-300 transition-colors" title={collapsed ? 'Développer' : 'Réduire'}>
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Global credential selector */}
        <SidebarCredentialSelector collapsed={collapsed} />

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 py-2.5 text-sm transition-colors',
                  collapsed ? 'justify-center px-2' : 'px-4',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </div>

        {/* Footer with Stop button and task info */}
        <div className={cn("py-3 border-t border-slate-800 space-y-2", collapsed ? "px-1" : "px-3")}>
          {hasRunningTask && (
            <>
              {!collapsed && taskInfo && (
                <p className="text-xs text-blue-400 text-center truncate animate-pulse">{taskInfo}</p>
              )}
              <button
                onClick={handleStop}
                title="Arrêter les tâches"
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-lg bg-red-600/20 border border-red-600/50 text-red-400 text-xs font-medium hover:bg-red-600/30 transition-colors",
                  collapsed ? "px-1 py-2" : "px-3 py-2"
                )}
              >
                <Square className="w-3.5 h-3.5 shrink-0" />
                {!collapsed && 'Arrêter'}
              </button>
            </>
          )}
          {stopStatus && (
            <p className="text-xs text-center text-green-400">{stopStatus}</p>
          )}
          {!collapsed && <p className="text-xs text-slate-600 text-center">v1.2.0</p>}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/diff" element={<DiffPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/playbook" element={<PlaybookPage />} />
          <Route path="/scheduler" element={<SchedulerPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <CredentialProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </CredentialProvider>
  )
}
