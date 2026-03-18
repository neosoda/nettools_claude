import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Play, Eye, Terminal, RefreshCw, Send, Clock } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import { formatDate, formatBytes } from '../lib/utils'
import { EventsOn } from '../../wailsjs/runtime/runtime'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export default function BackupPage() {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [configType, setConfigType] = useState('running')
  const [viewBackup, setViewBackup] = useState<string | null>(null)
  const [backupContent, setBackupContent] = useState('')
  const [selectedDevice, setSelectedDevice] = useState('')
  const [useLastScan, setUseLastScan] = useState(false)
  const [lastScanDevices, setLastScanDevices] = useState<any[]>([])
  const [backupProgress, setBackupProgress] = useState<Record<string, any>>({})

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalDevice, setTerminalDevice] = useState('')
  const [terminalCommand, setTerminalCommand] = useState('show version')
  const [terminalLines, setTerminalLines] = useState<Array<{text: string; error: boolean}>>([])
  const [terminalRunning, setTerminalRunning] = useState(false)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const { data: allDevices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })

  const { data: backups = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backups', selectedDevice],
    enabled: !!selectedDevice,
    queryFn: async () => { const m = await getBackend(); return m.GetBackups(selectedDevice) },
  })

  // Load last scan devices when toggle is enabled
  useEffect(() => {
    if (useLastScan) {
      getBackend().then(m => m.GetLastScanDevices()).then(devs => {
        setLastScanDevices(devs || [])
        setSelectedDevices((devs || []).map((d: any) => d.id))
      })
    }
  }, [useLastScan])

  // Listen to backup progress events
  useEffect(() => {
    const unsub = EventsOn('backup:progress', (data: any) => {
      setBackupProgress(prev => ({ ...prev, [data.device_id]: data }))
    })
    return () => unsub()
  }, [])

  // Listen to terminal output events
  useEffect(() => {
    const unsub = EventsOn('terminal:output', (data: any) => {
      setTerminalLines(prev => [...prev, { text: data.line || '', error: !!data.error }])
    })
    return () => unsub()
  }, [])

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  const devices = useLastScan ? lastScanDevices : (allDevices as any[])

  const backupMutation = useMutation({
    mutationFn: async () => {
      const m = await getBackend()
      setBackupProgress({})
      return m.RunBackup({ device_ids: selectedDevices, config_type: configType })
    },
    onSuccess: () => refetchBackups(),
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
      await m.RunTerminalCommand(terminalDevice, terminalCommand.trim())
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

  const terminalDeviceLabel = devices.find((d: any) => d.id === terminalDevice)

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Gestionnaire de backups" description="Sauvegarder et exporter les configurations" />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Backup launcher */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Lancer un backup</h2>
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <div onClick={() => setUseLastScan(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${useLastScan ? 'bg-blue-600' : 'bg-slate-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useLastScan ? 'left-4' : 'left-0.5'}`} />
              </div>
              Utiliser le dernier scan
              {useLastScan && lastScanDevices.length > 0 && (
                <span className="text-blue-400">({lastScanDevices.length} équipements)</span>
              )}
              {useLastScan && lastScanDevices.length === 0 && (
                <span className="text-amber-400">(aucun scan récent)</span>
              )}
            </label>
          </div>

          <div className="flex gap-4 items-end">
            <Select label="Type de config" value={configType} options={configTypeOptions}
              onChange={e => setConfigType(e.target.value)} />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-slate-400">
                  Équipements ({selectedDevices.length}/{devices.length} sélectionnés)
                </p>
                <button onClick={() => setSelectedDevices(selectedDevices.length === devices.length ? [] : devices.map((d: any) => d.id))}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  {selectedDevices.length === devices.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {devices.map((d: any) => {
                  const prog = backupProgress[d.id]
                  return (
                    <button key={d.id} onClick={() => toggleDevice(d.id)}
                      className={`relative px-2 py-1 rounded text-xs border transition-colors ${selectedDevices.includes(d.id)
                        ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                      {d.hostname || d.ip}
                      {prog?.status === 'running' && <RefreshCw className="inline w-3 h-3 ml-1 animate-spin" />}
                      {prog?.status === 'success' && <span className="ml-1 text-green-400">✓</span>}
                      {prog?.status === 'failed' && <span className="ml-1 text-red-400">✗</span>}
                    </button>
                  )
                })}
                {devices.length === 0 && (
                  <p className="text-xs text-slate-500 italic">
                    {useLastScan ? 'Lancez un scan réseau d\'abord.' : 'Aucun équipement en inventaire.'}
                  </p>
                )}
              </div>
            </div>
            <Button variant="primary" loading={backupMutation.isPending}
              disabled={selectedDevices.length === 0} onClick={() => backupMutation.mutate()}>
              <Play className="w-4 h-4" /> Lancer
            </Button>
          </div>

          {/* Progress summary */}
          {Object.keys(backupProgress).length > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              {Object.entries(backupProgress).map(([id, prog]: any) => {
                const dev = devices.find((d: any) => d.id === id)
                return (
                  <div key={id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${
                    prog.status === 'success' ? 'bg-green-900/20 border-green-800' :
                    prog.status === 'failed' ? 'bg-red-900/20 border-red-800' :
                    'bg-slate-800 border-slate-700'}`}>
                    {prog.status === 'running' && <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />}
                    {prog.status === 'success' && <span className="text-green-400">✓</span>}
                    {prog.status === 'failed' && <span className="text-red-400">✗</span>}
                    <span className="truncate text-slate-300">{dev?.hostname || dev?.ip || id}</span>
                    {prog.error && <span className="text-red-400 truncate">{prog.error}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* History */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-300">Historique & Terminal</h2>
            <Select value={selectedDevice} className="w-48 py-1"
              options={[{ value: '', label: 'Sélectionner...' }, ...(allDevices as any[]).map((d: any) => ({ value: d.id, label: d.hostname || d.ip }))]}
              onChange={e => setSelectedDevice(e.target.value)} />
          </div>
          {selectedDevice ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Statut</th>
                  <th className="text-left p-3 font-medium">Taille</th>
                  <th className="text-left p-3 font-medium">Durée</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(backups as any[]).map((b: any) => (
                  <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-3 text-slate-300 text-xs">{formatDate(b.created_at)}</td>
                    <td className="p-3 text-slate-400">{b.config_type}</td>
                    <td className="p-3">
                      <StatusBadge status={b.status} />
                      {b.error_message && <p className="text-xs text-red-400 mt-0.5">{b.error_message}</p>}
                    </td>
                    <td className="p-3 text-slate-400">{formatBytes(b.file_size_bytes)}</td>
                    <td className="p-3 text-slate-400">{b.duration_ms}ms</td>
                    <td className="p-3 flex gap-1">
                      {b.status === 'success' && (
                        <Button size="sm" variant="ghost" onClick={() => handleViewBackup(b.id)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleOpenTerminal(selectedDevice)}
                        title="Ouvrir un terminal SSH">
                        <Terminal className="w-3.5 h-3.5 text-green-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {(backups as any[]).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Aucun backup pour cet équipement
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Sélectionnez un équipement pour voir l'historique
            </div>
          )}
        </div>
      </div>

      {/* Backup content modal */}
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
          {/* Command input */}
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                value={terminalCommand}
                onChange={e => setTerminalCommand(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !terminalRunning) handleRunTerminal() }}
                placeholder="Commande SSH (ex: show version)"
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <Button variant="primary" loading={terminalRunning} onClick={handleRunTerminal}>
              <Send className="w-4 h-4" /> Envoyer
            </Button>
          </div>

          {/* Suggestions rapides */}
          <div className="flex flex-wrap gap-1">
            {['show version', 'show running-config', 'show interfaces', 'show vlan', 'show ip route', 'show arp'].map(cmd => (
              <button key={cmd} onClick={() => setTerminalCommand(cmd)}
                className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 font-mono transition-colors">
                {cmd}
              </button>
            ))}
          </div>

          {/* Terminal output */}
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
