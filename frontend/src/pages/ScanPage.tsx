import { useState, useEffect, useRef } from 'react'
import { Radio, Play, Square, FileSpreadsheet, Network, Layers, Cpu } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Input from '../components/Input'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useGlobalCredential } from '../context/CredentialContext'
import { callBackend } from '../lib/api'
import { getBackend } from '../lib/backend'
import { Device } from '../types/models'


function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}j ${hours}h${String(minutes).padStart(2,'0')}m`
  return `${hours}h${String(minutes).padStart(2,'0')}m`
}

// Build IP list for switch range: x.1-95 + x.254
function buildSwitchIPs(prefix: string): string[] {
  const ips: string[] = []
  for (let i = 1; i <= 95; i++) ips.push(`${prefix}.${i}`)
  ips.push(`${prefix}.254`)
  return ips
}

type ScanMode = 'switches' | 'full' | 'cidr'

export default function ScanPage() {
  const { globalCredId } = useGlobalCredential()
  const [scanMode, setScanMode] = useState<ScanMode>('switches')
  const [prefix, setPrefix] = useState('192.168.1')  // base prefix for switches/full modes
  const [cidr, setCidr] = useState('192.168.1.0/24')
  const [community, setCommunity] = useState('public')
  const [workers, setWorkers] = useState('10')
  const [timeout, setTimeoutVal] = useState('3')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ ip: string; done: number; total: number; percent: number } | null>(null)
  const [results, setResults] = useState<Device[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [error, setError] = useState('')
  const [testIp, setTestIp] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const resultDeviceIds = useRef<string[]>([])

  useEffect(() => {
    const unsub1 = EventsOn('scan:progress', (data: any) => setProgress(data))
    const unsub2 = EventsOn('scan:complete', () => { setScanning(false); setProgress(null) })
    const unsub3 = EventsOn('tasks:stopped', () => { setScanning(false); setProgress(null) })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  const handleScan = async () => {
    setError('')
    setScanning(true)
    setScanDone(false)
    setResults([])
    resultDeviceIds.current = []

    // Enforce a safe upper bound for workers to avoid OOM
    const safeWorkers = Math.min(parseInt(workers), 50)
    let scanCidr = ''
    let ipList: string[] = []

    if (scanMode === 'switches') {
      if (!prefix.trim()) { setError('Préfixe réseau requis (ex: 192.168.1)'); setScanning(false); return }
      ipList = buildSwitchIPs(prefix.trim())
    } else if (scanMode === 'full') {
      if (!prefix.trim()) { setError('Préfixe réseau requis (ex: 192.168.1)'); setScanning(false); return }
      scanCidr = `${prefix.trim()}.0/24`
    } else {
      if (!cidr.trim()) { setError('CIDR requis'); setScanning(false); return }
      scanCidr = cidr.trim()
    }

    try {
      const m = await getBackend()
      const discovered = await callBackend(() => m.ScanNetwork({
        cidr: scanCidr,
        ip_list: ipList,
        community: community.trim() || 'public',
        credential_id: globalCredId,
        workers: safeWorkers,
        timeout_sec: parseInt(timeout),
      }))
      const devs = (discovered || []) as Device[];
    setResults(devs);
    resultDeviceIds.current = devs.map(d => d.id);
    setScanDone(true);
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  const handleStop = async () => {
    const m = await getBackend()
    await callBackend(() => m.StopAllTasks())
    setScanning(false)
    setProgress(null)
  }

  const handleTest = async () => {
    if (!testIp.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const m = await getBackend()
      const r = await callBackend(() => m.TestSNMPHost(testIp.trim(), community.trim() || 'public', 'v2c', parseInt(timeout)))
      setTestResult(r)
    } finally {
      setTesting(false)
    }
  }

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const m = await getBackend()
      await callBackend(() => m.ExportScanToExcel(resultDeviceIds.current))
    } catch (e: any) {
      setError('Export Excel : ' + (e?.message || String(e)))
    } finally {
      setExporting(false)
    }
  }

  const scanModeDesc: Record<ScanMode, string> = {
    switches: `Switches : ${prefix}.1-95 + ${prefix}.254 (${96} IPs)`,
    full: `Complet : ${prefix}.0/24 (256 IPs)`,
    cidr: 'Plage CIDR personnalisée',
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Découverte réseau" description="Scan SNMP v2c/v3 de plages IP" />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Config */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Configuration du scan
            </h2>
            {/* Mode selector */}
            <div className="flex bg-slate-950/50 rounded-xl p-1 border border-white/[0.02]">
              <button onClick={() => setScanMode('switches')}
                title="Espace switches : x.1-95 + x.254"
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${scanMode === 'switches' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                <Cpu className="w-3.5 h-3.5" /> Switches
              </button>
              <button onClick={() => setScanMode('full')}
                title="Scan complet /24"
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${scanMode === 'full' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                <Layers className="w-3.5 h-3.5" /> Complet
              </button>
              <button onClick={() => setScanMode('cidr')}
                title="CIDR personnalisé"
                className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${scanMode === 'cidr' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                <Network className="w-3.5 h-3.5" /> CIDR
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-5 items-end relative z-10 w-full">
            {scanMode === 'cidr' ? (
              <Input label="CIDR / Plage IP" value={cidr} onChange={e => setCidr(e.target.value)}
                placeholder="10.0.0.0/24" className="w-full" />
            ) : (
              <div className="w-full">
                <Input label="Préfixe réseau (3 octets)" value={prefix} onChange={e => setPrefix(e.target.value)}
                  placeholder="192.168.1" className="w-full" />
                <p className="text-[11px] font-medium text-slate-500 mt-1.5 ml-1">{scanModeDesc[scanMode]}</p>
              </div>
            )}
            <Input label="Communauté SNMP" value={community} onChange={e => setCommunity(e.target.value)}
              placeholder="public" className="w-full" />
            <Input label="Timeout (s)" type="number" min="1" max="30"
              value={timeout} onChange={e => setTimeoutVal(e.target.value)} className="w-full" />
            <Input label="Workers" type="number" min="1" max="200"
              value={workers} onChange={e => setWorkers(e.target.value)} className="w-full" />
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/[0.04] relative z-10">
            <div>
              {globalCredId ? (
                <p className="text-xs font-medium text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                  Credential actif utilisé pour l'authentification
                </p>
              ) : <div />}
              {error && <p className="text-sm font-medium text-red-400 mt-2 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500" />{error}</p>}
            </div>
            <div className="flex gap-3">
              {scanning && (
                <Button variant="danger" onClick={handleStop}>
                  <Square className="w-4 h-4" /> Arrêter
                </Button>
              )}
              <Button variant="primary" loading={scanning} onClick={handleScan} className="px-8 shadow-blue-500/25">
                <Play className="w-4 h-4" /> {scanning ? 'Scan en cours...' : 'Lancer le scan'}
              </Button>
            </div>
          </div>
        </div>

        {/* Progress */}
        {scanning && progress && (
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/[0.02] animate-pulse" />
            <div className="flex items-center justify-between text-sm mb-3 relative z-10">
              <span className="text-slate-300 font-medium flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
                Dernière cible : <span className="text-blue-400 font-mono tracking-wider">{progress.ip}</span>
              </span>
              <span className="text-slate-400 font-mono text-xs">{progress.done} / {progress.total} <span className="text-blue-400 ml-2 font-bold">{progress.percent}%</span></span>
            </div>
            <div className="h-1.5 bg-slate-950/50 rounded-full overflow-hidden shadow-inner relative z-10">
              <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-300 relative"
                style={{ width: `${progress.percent}%` }}>
                <div className="absolute inset-0 bg-white/20" />
              </div>
            </div>
          </div>
        )}

        {/* Single IP test */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-lg">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Test unitaire & Diagnostic
          </h2>
          <div className="flex gap-4 items-end max-w-2xl">
            <div className="flex-1">
              <Input label="Tester une IP spécifique" value={testIp} onChange={e => setTestIp(e.target.value)}
                placeholder="192.168.1.1" />
            </div>
            <Button variant="outline" loading={testing} onClick={handleTest} className="px-6 mb-1">
              Test ciblé
            </Button>
          </div>
          {testResult && (
            <div className={`mt-4 rounded-xl p-4 text-xs font-mono space-y-1.5 shadow-inner ${testResult.reachable ? 'bg-emerald-950/20 border border-emerald-500/20' : 'bg-red-950/20 border border-red-500/20'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${testResult.reachable ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                <p className={`font-bold tracking-wide ${testResult.reachable ? 'text-emerald-400' : 'text-red-400'}`}>
                  {testResult.reachable ? 'RÉPONSE SNMP REÇUE' : 'ÉCHEC DE RÉPONSE SNMP'}
                </p>
              </div>
              {testResult.error && <p className="text-red-300 pl-4 border-l-2 border-red-500/30">Détails : {testResult.error}</p>}
              {testResult.reachable && Object.entries(testResult.data || {}).map(([k, v]: any) => (
                <div key={k} className="flex flex-col pl-4 border-l border-emerald-500/10">
                  <span className="text-slate-500 uppercase tracking-wider text-[10px]">{k}</span>
                  <span className="text-slate-200">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* No results */}
        {scanDone && results.length === 0 && (
          <div className="bg-slate-900/60 backdrop-blur-md border border-amber-500/20 rounded-2xl p-8 text-center text-slate-400 shadow-lg flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <Network className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-lg font-semibold text-slate-200 mb-2">Aucun équipement SNMP découvert</p>
            <p className="text-sm text-slate-500 max-w-md">Vérifiez les causes éventuelles : communauté incorrecte, blocage du port UDP/161, SNMP désactivé sur les cibles, ou inaccessibilité réseau.</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[600px]">
            <div className="px-6 py-4 border-b border-white/[0.04] flex justify-between items-center bg-slate-950/40 sticky top-0">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold tracking-wider">
                  {results.length} SYSTÈMES
                </div>
                <h2 className="text-sm font-semibold text-slate-200">Découverts et analysés</h2>
              </div>
              <Button variant="outline" size="sm" loading={exporting} onClick={handleExportExcel} className="h-8">
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Exporter le rapport
              </Button>
            </div>
            <div className="overflow-x-auto flex-1 custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-white/[0.04] text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <th className="text-left py-3 px-5 font-bold">Adresse IP</th>
                    <th className="text-left py-3 px-5 font-bold">Hostname</th>
                    <th className="text-left py-3 px-5 font-bold">Info Matériel</th>
                    <th className="text-left py-3 px-5 font-bold">OS / Firmware</th>
                    <th className="text-left py-3 px-5 font-bold">Uptime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {results.map((d: Device) => (
                    <tr key={d.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-3 px-5">
                        <span className="font-mono text-blue-400 font-medium bg-blue-500/5 px-2 py-1 rounded-md border border-blue-500/10 group-hover:border-blue-500/30 transition-colors">
                          {d.ip}
                        </span>
                      </td>
                      <td className="py-3 px-5 font-medium text-slate-200">
                        {d.hostname || <span className="text-slate-600 italic">Non défini</span>}
                        {d.location && <div className="text-[11px] text-slate-500 font-normal mt-0.5 max-w-[200px] truncate" title={d.location}>{d.location}</div>}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs tracking-wide bg-slate-800 text-slate-300 border border-slate-700 w-max px-2 py-0.5 rounded shadow-sm">
                            {d.vendor || 'Unknown'} <span className="opacity-50 mx-1">/</span> {d.model || 'N/A'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">{d.mac_address || 'Pas de MAC'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-xs text-slate-400 font-mono tracking-tight max-w-[250px] truncate" title={d.os_version}>
                        {d.os_version || '—'}
                      </td>
                      <td className="py-3 px-5">
                        <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/10">
                          {formatUptime(d.uptime_seconds)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
