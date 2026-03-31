import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Play, Eye, Terminal, RefreshCw, Send, Clock } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Select from '../components/Select'
import Input from '../components/Input'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import { formatDate, formatBytes } from '../lib/utils'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useGlobalCredential } from '../context/CredentialContext'
import { getBackend } from '../lib/backend'

type DeviceSource = 'last_scan' | 'manual'

export default function BackupPage() {
  const { globalCredId } = useGlobalCredential()

  // Source des équipements
  const [deviceSource, setDeviceSource] = useState<DeviceSource>('manual')
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [lastScanDevices, setLastScanDevices] = useState<any[]>([])
  const [manualIpText, setManualIpText] = useState('')

  // Config
  const [configType, setConfigType] = useState('running')
  const [backupProgress, setBackupProgress] = useState<Record<string, any>>({})

  // Inline credentials (fallback when no global credential is selected)
  const [inlineUsername, setInlineUsername] = useState('')
  const [inlinePassword, setInlinePassword] = useState('')

  // Historique
  const [selectedDevice, setSelectedDevice] = useState('')
  const [viewBackup, setViewBackup] = useState<string | null>(null)
  const [backupContent, setBackupContent] = useState('')

  // Terminal
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalDevice, setTerminalDevice] = useState('')
  const [terminalCommand, setTerminalCommand] = useState('show version')
  const [terminalLines, setTerminalLines] = useState<Array<{text: string; error: boolean}>>([])
  const [terminalRunning, setTerminalRunning] = useState(false)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // For history device selector: devices auto-populated by scans/backups
  const { data: knownDevices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })

  const { data: backups = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backups', selectedDevice],
    enabled: !!selectedDevice,
    queryFn: async () => { const m = await getBackend(); return m.GetBackups(selectedDevice) },
  })

  // Load last scan devices when source changes
  useEffect(() => {
    if (deviceSource === 'last_scan') {
      getBackend().then(m => m.GetLastScanDevices()).then(devs => {
        setLastScanDevices(devs || [])
        setSelectedDevices((devs || []).map((d: any) => d.id))
      })
    } else {
      setSelectedDevices([])
    }
  }, [deviceSource])

  // Completion summary
  const [backupSummary, setBackupSummary] = useState<any>(null)

  // Events
  useEffect(() => {
    const unsub = EventsOn('backup:progress', (data: any) => {
      setBackupProgress(prev => ({ ...prev, [data.device_id]: data }))
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = EventsOn('backup:complete', (data: any) => {
      setBackupSummary(data)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = EventsOn('terminal:output', (data: any) => {
      setTerminalLines(prev => [...prev, { text: data.line || '', error: !!data.error }])
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  const devices = deviceSource === 'last_scan' ? lastScanDevices : []

  const backupMutation = useMutation({
    mutationFn: async () => {
      const m = await getBackend()
      setBackupProgress({})
      if (deviceSource === 'manual') {
        const ipList = manualIpText.split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean)
        return m.RunBackup({
          device_ids: [],
          ip_list: ipList,
          config_type: configType,
          credential_id: globalCredId,
          username: globalCredId ? '' : inlineUsername,
          password: globalCredId ? '' : inlinePassword,
        })
      }
      return m.RunBackup({
        device_ids: selectedDevices,
        ip_list: [],
        config_type: configType,
        credential_id: globalCredId,
        username: globalCredId ? '' : inlineUsername,
        password: globalCredId ? '' : inlinePassword,
      })
    },
    onSuccess: () => {
      refetchBackups()
      setInlineUsername('')
      setInlinePassword('')
    },
  })

  const handleViewBackup = async (id: string) => {
    const m = await getBackend()
    const content = await m.GetBackupContent(id)
    setBackupContent(content)
    setViewBackup(id)
  }

  const handleOpenTerminal = (deviceId: string) => {
    setTerminalDevice(deviceId)
    setTerminalLines([])
    setTerminalCommand('show version')
    setTerminalOpen(true)
  }

  const handleRunTerminal = async () => {
    if (!terminalDevice || !terminalCommand.trim()) return
    setTerminalRunning(true)
    setTerminalLines([])
    try {
      const m = await getBackend()
      await m.RunTerminalCommand(terminalDevice, terminalCommand.trim(), globalCredId)
    } catch (e: any) {
      setTerminalLines(prev => [...prev, { text: `ERREUR: ${e?.message || e}`, error: true }])
    } finally {
      setTerminalRunning(false)
    }
  }

  const configTypeOptions = [
    { value: 'running', label: 'Running config' },
    { value: 'startup', label: 'Startup config' },
  ]

  const toggleDevice = (id: string) =>
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const terminalDeviceLabel = (knownDevices as any[]).find((d: any) => d.id === terminalDevice)

  const hasCredential = !!globalCredId || (inlineUsername.trim().length > 0 && inlinePassword.trim().length > 0)
  const canLaunch = hasCredential && (
    deviceSource === 'manual'
      ? manualIpText.trim().length > 0
      : selectedDevices.length > 0
  )

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Gestionnaire de backups" description="Sauvegarder les configurations réseau" />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Backup launcher */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Lancer un backup
            </h2>
            <div className="flex bg-slate-950/50 rounded-xl p-1 border border-white/[0.02]">
              {(['manual', 'last_scan'] as DeviceSource[]).map(mode => (
                <button key={mode} onClick={() => setDeviceSource(mode)}
                  className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${deviceSource === mode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                  {mode === 'manual' ? 'Saisie manuelle' : 'Dernier scan'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end relative z-10 mb-4">
            <Select label="Type de configuration" value={configType} options={configTypeOptions}
              onChange={e => setConfigType(e.target.value)} />
            
            {globalCredId ? (
              <div className="md:col-span-2 flex items-center">
                <p className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                  ✓ Credential global actif
                </p>
              </div>
            ) : (
              <>
                <Input label="Utilisateur SSH (fallback)" value={inlineUsername}
                  onChange={e => setInlineUsername(e.target.value)}
                  placeholder="admin" />
                <Input label="Mot de passe SSH" type="password" value={inlinePassword}
                  onChange={e => setInlinePassword(e.target.value)}
                  placeholder="••••••••" />
              </>
            )}
          </div>

          {/* Manual IP input */}
          {deviceSource === 'manual' && (
            <div className="space-y-2 relative z-10 w-full mb-4">
              <label className="text-xs font-semibold text-slate-300 tracking-wide block">
                Liste d'IPs cibles (une par ligne ou séparées par virgule)
              </label>
              <textarea value={manualIpText} onChange={e => setManualIpText(e.target.value)}
                placeholder={"192.168.1.1\n192.168.1.2\n192.168.1.3"}
                className="w-full bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 hover:border-slate-600 transition-all duration-200 resize-none shadow-inner"
                rows={4} />
            </div>
          )}

          {/* Last scan device list */}
          {deviceSource === 'last_scan' && (
            <div className="relative z-10 mb-4 pb-2 border-b border-white/[0.04]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-300 tracking-wide">
                  Sélection des équipements ({selectedDevices.length}/{devices.length})
                </p>
                <button onClick={() => setSelectedDevices(selectedDevices.length === devices.length ? [] : devices.map((d: any) => d.id))}
                  className="text-xs text-blue-400 font-medium hover:text-blue-300 transition-colors uppercase tracking-wider">
                  {selectedDevices.length === devices.length ? 'Désélectionner Tout' : 'Sélectionner Tout'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                {devices.map((d: any) => {
                  const prog = backupProgress[d.id]
                  return (
                    <button key={d.id} onClick={() => toggleDevice(d.id)}
                      className={`relative px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 shadow-sm ${selectedDevices.includes(d.id)
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : 'bg-slate-900 border-slate-700/60 text-slate-400 hover:bg-slate-800'}`}>
                      {d.hostname || d.ip}
                      {prog?.status === 'running' && <RefreshCw className="inline w-3 h-3 ml-1.5 animate-spin" />}
                      {prog?.status === 'success' && <span className="ml-1.5 text-emerald-400 font-bold">✓</span>}
                      {prog?.status === 'failed' && <span className="ml-1.5 text-red-400 font-bold">✗</span>}
                    </button>
                  )
                })}
                {devices.length === 0 && (
                  <p className="text-xs font-medium text-amber-500 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">Aucun scan récent. Lancez d'abord une découverte réseau sur la page Scan.</p>
                )}
              </div>
            </div>
          )}

          <div className="relative z-10 flex pt-2">
            <Button variant="primary" loading={backupMutation.isPending} className="shadow-blue-500/25 px-8"
              disabled={!canLaunch} onClick={() => backupMutation.mutate()}>
              <Play className="w-4 h-4" /> Démarrer les Backups
            </Button>
          </div>

          {/* Global progress bar */}
          {backupMutation.isPending && Object.keys(backupProgress).length > 0 && (() => {
            const entries = Object.values(backupProgress) as any[]
            const total = entries[0]?.total || entries.length
            const done = entries.filter((p: any) => p.status === 'success' || p.status === 'failed').length
            const pct = total > 0 ? Math.round(done * 100 / total) : 0
            return (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{done}/{total} equipements traites</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}

          {/* Completion summary */}
          {backupSummary && !backupMutation.isPending && (
            <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs">
              <span className="text-slate-300">Termine:</span>
              <span className="text-green-400">{backupSummary.success} succes</span>
              {backupSummary.failed > 0 && <span className="text-red-400">{backupSummary.failed} echecs</span>}
              <span className="text-slate-500">{backupSummary.duration}ms</span>
            </div>
          )}

          {/* Progress per device */}
          {Object.keys(backupProgress).length > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              {Object.entries(backupProgress).map(([id, prog]: any) => {
                const dev = devices.find((d: any) => d.id === id)
                const label = dev?.hostname || dev?.ip || prog.device_ip || id
                return (
                  <div key={id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${
                    prog.status === 'success' ? 'bg-green-900/20 border-green-800' :
                    prog.status === 'failed' ? 'bg-red-900/20 border-red-800' :
                    'bg-slate-800 border-slate-700'}`}>
                    {prog.status === 'running' && <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />}
                    {prog.status === 'success' && <span className="text-green-400">✓</span>}
                    {prog.status === 'failed' && <span className="text-red-400">✗</span>}
                    <span className="truncate text-slate-300">{label}</span>
                    {prog.error && <span className="text-red-400 truncate ml-1" title={prog.error}>⚠</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Historique */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-white/[0.04] bg-slate-950/40 flex justify-between items-center sticky top-0">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Historique des sauvegardes
            </h2>
            <Select value={selectedDevice} className="w-64"
              options={[{ value: '', label: 'Sélectionner un équipement...' }, ...(knownDevices as any[]).map((d: any) => ({ value: d.id, label: `${d.hostname || d.ip} (${d.ip})` }))]}
              onChange={e => setSelectedDevice(e.target.value)} />
          </div>
          {selectedDevice ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-white/[0.04] text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <th className="text-left py-3 px-5 font-bold">Date & Heure</th>
                    <th className="text-left py-3 px-5 font-bold">Type</th>
                    <th className="text-left py-3 px-5 font-bold">Statut</th>
                    <th className="text-left py-3 px-5 font-bold">Taille</th>
                    <th className="text-left py-3 px-5 font-bold">Durée</th>
                    <th className="text-right py-3 px-5 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {(backups as any[]).map((b: any) => (
                    <tr key={b.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-3 px-5 text-slate-300 font-medium tracking-wide">{formatDate(b.created_at)}</td>
                      <td className="py-3 px-5 text-slate-400 font-mono text-xs">{b.config_type}</td>
                      <td className="py-3 px-5">
                        <StatusBadge status={b.status} />
                        {b.error_message && <p className="text-[10px] text-red-400 mt-1 max-w-[200px] truncate" title={b.error_message}>{b.error_message}</p>}
                      </td>
                      <td className="py-3 px-5 text-slate-400 font-mono text-xs">{formatBytes(b.file_size_bytes)}</td>
                      <td className="py-3 px-5 text-slate-400 font-mono text-xs">{b.duration_ms}ms</td>
                      <td className="py-3 px-5 flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {b.status === 'success' && (
                          <Button size="icon" variant="ghost" onClick={() => handleViewBackup(b.id)} className="w-8 h-8 rounded bg-white/[0.02]">
                            <Eye className="w-4 h-4 text-emerald-400" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => handleOpenTerminal(selectedDevice)}
                          title="Ouvrir Terminal SSH" className="w-8 h-8 rounded bg-white/[0.02]">
                          <Terminal className="w-4 h-4 text-blue-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(backups as any[]).length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-16">
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
                            <Clock className="w-6 h-6 text-slate-400" />
                          </div>
                          <span className="font-medium text-slate-300">Aucun backup enregistré</span>
                          <span className="text-xs mt-1">Les sauvegardes pour cet équipement apparaîtront ici.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center h-48">
              <div className="w-16 h-16 rounded-full bg-slate-800/30 flex items-center justify-center mb-4 border border-slate-700/50">
                <Terminal className="w-8 h-8 text-slate-600" />
              </div>
              <span className="font-semibold text-slate-300">Sélectionnez un équipement</span>
              <span className="text-sm mt-1">Utilisez le menu déroulant ci-dessus pour consulter l'historique de ses configurations.</span>
            </div>
          )}
        </div>
      </div>

      {/* Modal contenu backup */}
      <Modal open={!!viewBackup} onClose={() => setViewBackup(null)} title="Contenu du backup" size="xl">
        <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg overflow-auto max-h-[60vh] font-mono">
          {backupContent}
        </pre>
      </Modal>

      {/* Terminal modal */}
      <Modal open={terminalOpen} onClose={() => setTerminalOpen(false)}
        title={`Terminal SSH — ${terminalDeviceLabel?.hostname || terminalDeviceLabel?.ip || '...'}`}
        size="xl">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={terminalCommand} onChange={e => setTerminalCommand(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !terminalRunning) handleRunTerminal() }}
              placeholder="Commande SSH (ex: show version)"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500" />
            <Button variant="primary" loading={terminalRunning} onClick={handleRunTerminal}>
              <Send className="w-4 h-4" /> Envoyer
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {['show version', 'show running-config', 'show interfaces', 'show vlan', 'show ip route', 'show arp'].map(cmd => (
              <button key={cmd} onClick={() => setTerminalCommand(cmd)}
                className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 font-mono transition-colors">
                {cmd}
              </button>
            ))}
          </div>
          <div className="bg-black rounded-lg p-3 h-80 overflow-y-auto font-mono text-xs">
            {terminalLines.length === 0 && !terminalRunning && (
              <p className="text-slate-600">Saisissez une commande et cliquez Envoyer...</p>
            )}
            {terminalRunning && terminalLines.length === 0 && (
              <p className="text-blue-400 animate-pulse">Connexion en cours...</p>
            )}
            {terminalLines.map((line, i) => (
              <pre key={i} className={`whitespace-pre-wrap break-words ${line.error ? 'text-red-400' : 'text-green-300'}`}>
                {line.text}
              </pre>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
