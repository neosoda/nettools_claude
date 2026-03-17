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
  const [cidr, setCidr] = useState('10.113.0.0/16')
  const [credId, setCredId] = useState('')
  const [workers, setWorkers] = useState('50')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ ip: string; done: number; total: number; percent: number } | null>(null)
  const [results, setResults] = useState<any[]>([])
  const [error, setError] = useState('')

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
    setResults([])
    try {
      const m = await getBackend()
      const discovered = await m.ScanNetwork({ cidr, credential_id: credId, workers: parseInt(workers) })
      setResults(discovered || [])
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setScanning(false)
      setProgress(null)
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
            <Select label="Credentials SNMP" value={credId} options={credOptions}
              onChange={e => setCredId(e.target.value)} />
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
