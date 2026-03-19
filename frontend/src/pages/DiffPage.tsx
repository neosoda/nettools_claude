import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, Upload, ArrowDown } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Select from '../components/Select'

async function getBackend() { return import('../../wailsjs/go/main/App') }

interface DiffLine {
  type: string
  content: string
  line_a: number
  line_b: number
}

export default function DiffPage() {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [diffs, setDiffs] = useState<DiffLine[]>([])
  const [stats, setStats] = useState<{ added: number; removed: number; unchanged: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)

  // Backup loader state
  const [selectedDeviceA, setSelectedDeviceA] = useState('')
  const [selectedDeviceB, setSelectedDeviceB] = useState('')
  const [selectedBackupA, setSelectedBackupA] = useState('')
  const [selectedBackupB, setSelectedBackupB] = useState('')

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })

  const { data: backupsA = [] } = useQuery({
    queryKey: ['backups-diff-a', selectedDeviceA],
    enabled: !!selectedDeviceA,
    queryFn: async () => { const m = await getBackend(); return m.GetBackups(selectedDeviceA) },
  })

  const { data: backupsB = [] } = useQuery({
    queryKey: ['backups-diff-b', selectedDeviceB],
    enabled: !!selectedDeviceB,
    queryFn: async () => { const m = await getBackend(); return m.GetBackups(selectedDeviceB) },
  })

  const handleCompare = async () => {
    setLoading(true)
    try {
      const m = await getBackend()
      const result = await m.CompareDiff({ text_a: textA, text_b: textB, ignore_patterns: [], ignore_case: ignoreCase })
      if (result) {
        setDiffs(result.diffs || [])
        setStats({ added: result.added, removed: result.removed, unchanged: result.unchanged })
      }
    } finally { setLoading(false) }
  }

  const loadBackup = async (backupId: string, side: 'a' | 'b') => {
    if (!backupId) return
    const m = await getBackend()
    const content = await m.GetBackupContent(backupId)
    if (side === 'a') setTextA(content)
    else setTextB(content)
  }

  const formatBackupLabel = (b: any) => {
    const date = new Date(b.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    return `${b.config_type} — ${date}`
  }

  const deviceOptions = [
    { value: '', label: 'Choisir un équipement...' },
    ...(devices as any[]).map((d: any) => ({ value: d.id, label: `${d.hostname || d.ip} (${d.ip})` }))
  ]

  const backupOptsA = [
    { value: '', label: 'Choisir un backup...' },
    ...(backupsA as any[]).filter((b: any) => b.status === 'success').map((b: any) => ({ value: b.id, label: formatBackupLabel(b) }))
  ]
  const backupOptsB = [
    { value: '', label: 'Choisir un backup...' },
    ...(backupsB as any[]).filter((b: any) => b.status === 'success').map((b: any) => ({ value: b.id, label: formatBackupLabel(b) }))
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Comparateur de configurations" description="Diff texte ligne à ligne"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" checked={ignoreCase} onChange={e => setIgnoreCase(e.target.checked)} className="accent-blue-500" />
              Ignorer la casse
            </label>
            <Button variant="primary" loading={loading} onClick={handleCompare}>
              <GitCompare className="w-4 h-4" /> Comparer
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Backup loaders */}
        <div className="grid grid-cols-2 gap-0 border-b border-slate-800">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-r border-slate-800">
            <Upload className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select value={selectedDeviceA} onChange={e => { setSelectedDeviceA(e.target.value); setSelectedBackupA('') }}
              className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 px-2 py-1 flex-1 focus:outline-none">
              {deviceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {selectedDeviceA && (
              <>
                <select value={selectedBackupA} onChange={e => setSelectedBackupA(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 px-2 py-1 flex-1 focus:outline-none">
                  {backupOptsA.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => loadBackup(selectedBackupA, 'a')} disabled={!selectedBackupA}
                  className="text-blue-400 hover:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed" title="Charger dans A">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80">
            <Upload className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select value={selectedDeviceB} onChange={e => { setSelectedDeviceB(e.target.value); setSelectedBackupB('') }}
              className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 px-2 py-1 flex-1 focus:outline-none">
              {deviceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {selectedDeviceB && (
              <>
                <select value={selectedBackupB} onChange={e => setSelectedBackupB(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 px-2 py-1 flex-1 focus:outline-none">
                  {backupOptsB.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => loadBackup(selectedBackupB, 'b')} disabled={!selectedBackupB}
                  className="text-blue-400 hover:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed" title="Charger dans B">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Text areas */}
        <div className="grid grid-cols-2 gap-0 border-b border-slate-800 h-48">
          <div className="flex flex-col border-r border-slate-800">
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>Configuration A</span>
              {textA && <span className="text-slate-600">{textA.split('\n').length} lignes</span>}
            </div>
            <textarea value={textA} onChange={e => setTextA(e.target.value)}
              className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
              placeholder="Coller la configuration A ici ou charger un backup ci-dessus..." />
          </div>
          <div className="flex flex-col">
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>Configuration B</span>
              {textB && <span className="text-slate-600">{textB.split('\n').length} lignes</span>}
            </div>
            <textarea value={textB} onChange={e => setTextB(e.target.value)}
              className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
              placeholder="Coller la configuration B ici ou charger un backup ci-dessus..." />
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex gap-4 px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
            <span className="text-green-400">+{stats.added} ajoutées</span>
            <span className="text-red-400">-{stats.removed} supprimées</span>
            <span className="text-slate-500">={stats.unchanged} identiques</span>
            {stats.added === 0 && stats.removed === 0 && (
              <span className="text-green-400 ml-auto">Les configurations sont identiques</span>
            )}
          </div>
        )}

        {/* Diff output */}
        <div className="flex-1 overflow-auto">
          <pre className="text-xs font-mono">
            {diffs.map((line, i) => (
              <div key={i} className={`px-4 py-0.5 flex gap-4 ${line.type === 'insert' ? 'diff-added' : line.type === 'delete' ? 'diff-removed' : 'diff-equal'}`}>
                <span className="w-10 text-slate-600 select-none text-right shrink-0">
                  {line.type === 'insert' ? line.line_b : line.type === 'delete' ? line.line_a : line.line_a}
                </span>
                <span className={`mr-2 ${line.type === 'insert' ? 'text-green-400' : line.type === 'delete' ? 'text-red-400' : 'text-slate-600'}`}>
                  {line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}
                </span>
                <span className={line.type === 'equal' ? 'text-slate-500' : 'text-slate-200'}>{line.content}</span>
              </div>
            ))}
          </pre>
          {diffs.length === 0 && !stats && (
            <div className="text-center py-16 text-slate-600">
              <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>Collez deux configurations ou chargez des backups, puis cliquez Comparer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
