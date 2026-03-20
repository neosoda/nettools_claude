import { useState, useEffect, useRef } from 'react'
import { Radio, Play, Square, FileSpreadsheet, Network, Layers, Cpu } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Input from '../components/Input'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useGlobalCredential } from '../context/CredentialContext'

import backend from '../lib/backend'

function formatUptime(seconds: number) {
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
  const [prefix, setPrefix] = useState('10.113.76')  // base prefix for switches/full modes
  const [cidr, setCidr] = useState('10.113.76.0/24')
  const [community, setCommunity] = useState('TICE')
  const [workers, setWorkers] = useState('10')
  const [timeout, setTimeoutVal] = useState('3')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ ip: string; done: number; total: number; percent: number } | null>(null)
  const [results, setResults] = useState<any[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [error, setError] = useState('')
  const [testIp, setTestIp] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const resultDeviceIds = useRef<string[]>([])
  const [snmpVersion, setSnmpVersion] = useState<'v2c' | 'v3'>('v2c')

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

    let scanCidr = ''
    let ipList: string[] = []

    if (scanMode === 'switches') {
      if (!prefix.trim()) { setError('Préfixe réseau requis (ex: 10.113.76)'); setScanning(false); return }
      ipList = buildSwitchIPs(prefix.trim())
    } else if (scanMode === 'full') {
      if (!prefix.trim()) { setError('Préfixe réseau requis (ex: 10.113.76)'); setScanning(false); return }
      scanCidr = `${prefix.trim()}.0/24`
    } else {
      if (!cidr.trim()) { setError('CIDR requis'); setScanning(false); return }
      scanCidr = cidr.trim()
    }

    try {
      const discovered = await backend.ScanNetwork({
        cidr: scanCidr,
        ip_list: ipList,
        community: community.trim() || 'TICE',
        version: snmpVersion,
        credential_id: globalCredId,
        workers: parseInt(workers),
        timeout_sec: parseInt(timeout),
      })
      const devs = discovered || []
      setResults(devs)
      resultDeviceIds.current = devs.map((d: any) => d.id)
      setScanDone(true)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  const handleStop = async () => {
    await backend.StopAllTasks()
    setScanning(false)
    setProgress(null)
  }

  const handleTest = async () => {
    if (!testIp.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const r = await backend.TestSNMPHost(testIp.trim(), community.trim() || 'TICE', snmpVersion, parseInt(timeout))
      setTestResult(r)
    } finally {
      setTesting(false)
    }
  }

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const exportIDs = [...resultDeviceIds.current]
      await backend.ExportScanToExcel(exportIDs)
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Configuration du scan</h2>
            {/* Mode selector */}
            <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
              <button onClick={() => setScanMode('switches')}
                title="Espace switches : x.1-95 + x.254"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${scanMode === 'switches' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                <Cpu className="w-3.5 h-3.5" /> Switches
              </button>
              <button onClick={() => setScanMode('full')}
                title="Scan complet /24"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${scanMode === 'full' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                <Layers className="w-3.5 h-3.5" /> Complet
              </button>
              <button onClick={() => setScanMode('cidr')}
                title="CIDR personnalisé"
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${scanMode === 'cidr' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                <Network className="w-3.5 h-3.5" /> CIDR
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 items-end">
            {scanMode === 'cidr' ? (
              <Input label="CIDR / Plage IP" value={cidr} onChange={e => setCidr(e.target.value)}
                placeholder="10.0.0.0/24" />
            ) : (
              <div>
                <Input label="Préfixe réseau (3 octets)" value={prefix} onChange={e => setPrefix(e.target.value)}
                  placeholder="10.113.76" />
                <p className="text-xs text-slate-500 mt-1">{scanModeDesc[scanMode]}</p>
              </div>
            )}
            <div>
              <Input label="Communauté SNMP" value={community} onChange={e => setCommunity(e.target.value)}
              placeholder="TICE" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Version SNMP</label>
              <select value={snmpVersion} onChange={e => setSnmpVersion(e.target.value as 'v2c' | 'v3')} className="w-full h-10 rounded-md border border-slate-700 bg-slate-800 px-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500">
                <option value="v2c">SNMPv2c</option>
                <option value="v3">SNMPv3</option>
              </select>
            </div>
            <Input label="Timeout par IP (s)" type="number" min="1" max="30"
              value={timeout} onChange={e => setTimeoutVal(e.target.value)} />
            <Input label="Workers parallèles" type="number" min="1" max="200"
              value={workers} onChange={e => setWorkers(e.target.value)} />
          </div>

          {globalCredId && (
            <p className="text-xs text-blue-400">
              Credential actif depuis la barre latérale
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <Button variant="primary" loading={scanning} onClick={handleScan}>
              <Play className="w-4 h-4" /> {scanning ? 'Scan en cours...' : 'Lancer le scan'}
            </Button>
            {scanning && (
              <Button variant="secondary" onClick={handleStop}>
                <Square className="w-4 h-4" /> Arrêter
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {scanning && progress && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300">
                <Radio className="w-4 h-4 inline mr-1 text-blue-400" />
                Scan de {progress.ip}...
              </span>
              <span className="text-slate-400">{progress.done}/{progress.total} ({progress.percent}%)</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {/* Single IP test */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Tester une IP (diagnostic)</h2>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input label="IP à tester" value={testIp} onChange={e => setTestIp(e.target.value)}
                placeholder="10.113.76.1" />
            </div>
            <Button variant="secondary" loading={testing} onClick={handleTest}>Tester</Button>
          </div>
          {testResult && (
            <div className={`rounded-lg p-3 text-xs font-mono space-y-1 ${testResult.reachable ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800'}`}>
              <p className={testResult.reachable ? 'text-green-400' : 'text-red-400'}>
                {testResult.reachable ? '✓ Répond au SNMP' : '✗ Pas de réponse SNMP'}
              </p>
              {testResult.error && <p className="text-red-300">Erreur : {testResult.error}</p>}
              {testResult.reachable && Object.entries(testResult.data || {}).map(([k, v]: any) => (
                <p key={k} className="text-slate-300"><span className="text-slate-500">{k}:</span> {v}</p>
              ))}
            </div>
          )}
        </div>

        {/* No results */}
        {scanDone && results.length === 0 && (
          <div className="bg-slate-900 border border-amber-800/50 rounded-xl p-5 text-sm text-slate-400 space-y-1">
            <p>Scan terminé — aucun équipement SNMP découvert.</p>
            <p className="text-xs text-slate-500">Causes possibles : communauté incorrecte · UDP/161 bloqué · SNMP désactivé · réseau inaccessible.</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-300">{results.length} équipements découverts</h2>
              <Button variant="secondary" size="sm" loading={exporting} onClick={handleExportExcel}>
                <FileSpreadsheet className="w-4 h-4" /> Exporter Excel
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-left p-3 font-medium">IP</th>
                    <th className="text-left p-3 font-medium">Hostname</th>
                    <th className="text-left p-3 font-medium">MAC</th>
                    <th className="text-left p-3 font-medium">Fabricant</th>
                    <th className="text-left p-3 font-medium">Modèle</th>
                    <th className="text-left p-3 font-medium">Firmware</th>
                    <th className="text-left p-3 font-medium">Uptime</th>
                    <th className="text-left p-3 font-medium">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((d: any) => (
                    <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-blue-400">{d.ip}</td>
                      <td className="p-3 text-slate-200">{d.hostname || '—'}</td>
                      <td className="p-3 font-mono text-xs text-slate-400">{d.mac_address || '—'}</td>
                      <td className="p-3">
                        <span className="text-xs bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                          {d.vendor || 'unknown'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">{d.model || '—'}</td>
                      <td className="p-3 text-xs text-slate-400 font-mono">{d.os_version || '—'}</td>
                      <td className="p-3 text-xs text-slate-500">{formatUptime(d.uptime_seconds)}</td>
                      <td className="p-3 text-slate-500">{d.location || '—'}</td>
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
