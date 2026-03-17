import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio, Play } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Input from '../components/Input'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import { EventsOn } from '../../wailsjs/runtime/runtime'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export default function ScanPage() {
  const [cidr, setCidr] = useState('10.113.0.0/24')
  const [community, setCommunity] = useState('TICE')
  const [credId, setCredId] = useState('')
  const [workers, setWorkers] = useState('10')
  const [timeout, setTimeout] = useState('3')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ ip: string; done: number; total: number; percent: number } | null>(null)
  const [results, setResults] = useState<any[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [error, setError] = useState('')
  const [testIp, setTestIp] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: async () => { const m = await getBackend(); return m.GetCredentials() },
  })

  useEffect(() => {
    const unsub1 = EventsOn('scan:progress', (data: any) => setProgress(data))
    const unsub2 = EventsOn('scan:complete', (data: any) => {
      setScanning(false)
      setProgress(null)
    })
    return () => { unsub1(); unsub2() }
  }, [])

  const handleScan = async () => {
    if (!cidr.trim()) { setError('CIDR requis'); return }
    setError('')
    setScanning(true)
    setScanDone(false)
    setResults([])
    try {
      const m = await getBackend()
      const discovered = await m.ScanNetwork({ cidr, community, credential_id: credId, workers: parseInt(workers), timeout_sec: parseInt(timeout) })
      setResults(discovered || [])
      setScanDone(true)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  const handleTest = async () => {
    if (!testIp.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const m = await getBackend()
      const r = await m.TestSNMPHost(testIp.trim(), community, 'v2c', parseInt(timeout))
      setTestResult(r)
    } finally {
      setTesting(false)
    }
  }

  const credOptions = [
    { value: '', label: '— Community TICE (défaut) —' },
    ...(credentials as any[]).map((c: any) => ({ value: c.id, label: c.name })),
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Découverte réseau" description="Scan SNMP v2c/v3 de plages IP" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Config */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Configuration du scan</h2>
          <div className="grid grid-cols-3 gap-4">
            <Input label="CIDR / Plage IP" value={cidr} onChange={e => setCidr(e.target.value)}
              placeholder="10.0.0.0/24" />
            <Input label="Communauté SNMP" value={community} onChange={e => setCommunity(e.target.value)}
              placeholder="TICE" />
            <Select label="Credential (optionnel)" value={credId} options={credOptions}
              onChange={e => setCredId(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Timeout par IP (secondes)" type="number" min="1" max="30"
              value={timeout} onChange={e => setTimeout(e.target.value)} />
            <Input label="Workers parallèles" type="number" min="1" max="200"
              value={workers} onChange={e => setWorkers(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button variant="primary" loading={scanning} onClick={handleScan}>
            <Play className="w-4 h-4" /> {scanning ? 'Scan en cours...' : 'Lancer le scan'}
          </Button>
        </div>

        {/* Progress */}
        {scanning && progress && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-300">
                <Radio className="w-4 h-4 inline mr-1 text-blue-400 pulse-dot" />
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
            <Button variant="secondary" loading={testing} onClick={handleTest}>
              Tester
            </Button>
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
            <p>Scan terminé — aucun équipement SNMP découvert sur <span className="font-mono text-slate-300">{cidr}</span>.</p>
            <p className="text-xs text-slate-500">Causes possibles : communauté incorrecte · UDP/161 bloqué par ACL/pare-feu · SNMP désactivé sur les équipements · réseau inaccessible depuis cette machine.</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-300">{results.length} équipements découverts</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left p-3 font-medium">IP</th>
                  <th className="text-left p-3 font-medium">Hostname</th>
                  <th className="text-left p-3 font-medium">MAC</th>
                  <th className="text-left p-3 font-medium">Vendor</th>
                  <th className="text-left p-3 font-medium">Modèle</th>
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
                    <td className="p-3 text-slate-500">{d.location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
