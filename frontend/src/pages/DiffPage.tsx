import { useState, useRef, useCallback, DragEvent } from 'react'
import { GitCompare, Upload, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'

async function getBackend() { return import('../../wailsjs/go/main/App') }

interface DiffLine {
  type: 'equal' | 'insert' | 'delete'
  content: string
  line_a: number
  line_b: number
}

export default function DiffPage() {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [fileNameA, setFileNameA] = useState('')
  const [fileNameB, setFileNameB] = useState('')
  const [diffs, setDiffs] = useState<DiffLine[]>([])
  const [stats, setStats] = useState<{ added: number; removed: number; unchanged: number; summary: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // Options
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [trimTrailing, setTrimTrailing] = useState(true)
  const [ignorePatterns, setIgnorePatterns] = useState('')

  // Filter display
  const [showOnlyChanges, setShowOnlyChanges] = useState(false)

  const fileRefA = useRef<HTMLInputElement>(null)
  const fileRefB = useRef<HTMLInputElement>(null)

  const readFile = useCallback((file: File, setter: (v: string) => void, nameSetter: (v: string) => void) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setter(e.target?.result as string || '')
      nameSetter(file.name)
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((side: 'a' | 'b') => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const setter = side === 'a' ? setTextA : setTextB
      const nameSetter = side === 'a' ? setFileNameA : setFileNameB
      readFile(files[0], setter, nameSetter)
    }
  }, [readFile])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleFileInput = useCallback((side: 'a' | 'b') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const setter = side === 'a' ? setTextA : setTextB
      const nameSetter = side === 'a' ? setFileNameA : setFileNameB
      readFile(file, setter, nameSetter)
    }
  }, [readFile])

  const handleCompare = async () => {
    setLoading(true)
    try {
      const m = await getBackend()
      const patterns = ignorePatterns
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)

      const result = await m.CompareDiff({
        text_a: textA,
        text_b: textB,
        ignore_patterns: patterns,
        ignore_case: ignoreCase,
        ignore_whitespace: ignoreWhitespace,
        trim_trailing: trimTrailing,
      })
      if (result) {
        setDiffs(result.diffs || [])
        setStats({
          added: result.added,
          removed: result.removed,
          unchanged: result.unchanged,
          summary: result.summary || '',
        })
      }
    } finally { setLoading(false) }
  }

  const displayDiffs = showOnlyChanges
    ? diffs.filter(d => d.type !== 'equal')
    : diffs

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Comparateur de configurations" description="Diff texte ligne a ligne"
        actions={
          <div className="flex items-center gap-3">
            {stats && (
              <div className="flex gap-3 text-xs">
                <span className="text-green-400">+{stats.added}</span>
                <span className="text-red-400">-{stats.removed}</span>
                <span className="text-slate-500">={stats.unchanged}</span>
              </div>
            )}
            <Button variant="primary" loading={loading} onClick={handleCompare}
              disabled={!textA.trim() || !textB.trim()}>
              <GitCompare className="w-4 h-4" /> Comparer
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Options bar */}
        <div className="flex items-center gap-4 px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs">
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={ignoreCase}
              onChange={e => setIgnoreCase(e.target.checked)} />
            Ignorer casse
          </label>
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={ignoreWhitespace}
              onChange={e => setIgnoreWhitespace(e.target.checked)} />
            Ignorer espaces
          </label>
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={trimTrailing}
              onChange={e => setTrimTrailing(e.target.checked)} />
            Trim trailing
          </label>
          <div className="h-4 w-px bg-slate-700" />
          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
            <input type="checkbox" className="w-3 h-3 accent-blue-500" checked={showOnlyChanges}
              onChange={e => setShowOnlyChanges(e.target.checked)} />
            Changements uniquement
          </label>
          <div className="flex-1" />
          <div className="relative group">
            <button className="text-slate-500 hover:text-slate-300 transition-colors text-xs">
              Filtres regex...
            </button>
            <div className="absolute right-0 top-full mt-1 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <label className="text-xs text-slate-400 block mb-1">Lignes a ignorer (regex, une par ligne)</label>
              <textarea value={ignorePatterns} onChange={e => setIgnorePatterns(e.target.value)}
                placeholder={"^!.*timestamp.*\n^ntp clock-period"}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-slate-200 resize-none focus:outline-none focus:border-blue-500"
                rows={3} />
            </div>
          </div>
        </div>

        {/* Input areas with drag & drop */}
        <div className="grid grid-cols-2 gap-0 border-b border-slate-800 h-48">
          <div className="flex flex-col border-r border-slate-800"
            onDrop={handleDrop('a')} onDragOver={handleDragOver}>
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Configuration A {fileNameA && <span className="text-blue-400 ml-1">({fileNameA})</span>}
              </span>
              <div className="flex items-center gap-1">
                {textA && (
                  <button onClick={() => { setTextA(''); setFileNameA('') }}
                    className="text-slate-600 hover:text-slate-300 transition-colors p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => fileRefA.current?.click()}
                  className="text-slate-500 hover:text-blue-400 transition-colors p-0.5" title="Charger un fichier">
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <input ref={fileRefA} type="file" className="hidden" accept=".txt,.cfg,.conf,.log"
              onChange={handleFileInput('a')} />
            <textarea value={textA} onChange={e => { setTextA(e.target.value); setFileNameA('') }}
              className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
              placeholder="Coller ou glisser-deposer la configuration A ici..." />
          </div>
          <div className="flex flex-col"
            onDrop={handleDrop('b')} onDragOver={handleDragOver}>
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Configuration B {fileNameB && <span className="text-blue-400 ml-1">({fileNameB})</span>}
              </span>
              <div className="flex items-center gap-1">
                {textB && (
                  <button onClick={() => { setTextB(''); setFileNameB('') }}
                    className="text-slate-600 hover:text-slate-300 transition-colors p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => fileRefB.current?.click()}
                  className="text-slate-500 hover:text-blue-400 transition-colors p-0.5" title="Charger un fichier">
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <input ref={fileRefB} type="file" className="hidden" accept=".txt,.cfg,.conf,.log"
              onChange={handleFileInput('b')} />
            <textarea value={textB} onChange={e => { setTextB(e.target.value); setFileNameB('') }}
              className="flex-1 bg-slate-950 text-slate-300 text-xs font-mono p-3 resize-none focus:outline-none"
              placeholder="Coller ou glisser-deposer la configuration B ici..." />
          </div>
        </div>

        {/* Diff output */}
        <div className="flex-1 overflow-auto">
          {displayDiffs.length > 0 ? (
            <pre className="text-xs font-mono">
              {displayDiffs.map((line, i) => (
                <div key={i} className={`px-4 py-0.5 flex gap-4 ${
                  line.type === 'insert' ? 'bg-green-900/15 border-l-2 border-green-500' :
                  line.type === 'delete' ? 'bg-red-900/15 border-l-2 border-red-500' :
                  'border-l-2 border-transparent'}`}>
                  <span className="w-10 text-slate-600 select-none text-right shrink-0">
                    {line.type !== 'insert' ? line.line_a : ''}
                  </span>
                  <span className="w-10 text-slate-600 select-none text-right shrink-0">
                    {line.type !== 'delete' ? line.line_b : ''}
                  </span>
                  <span className={`mr-2 font-bold ${
                    line.type === 'insert' ? 'text-green-400' :
                    line.type === 'delete' ? 'text-red-400' : 'text-slate-700'}`}>
                    {line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}
                  </span>
                  <span className={
                    line.type === 'insert' ? 'text-green-300' :
                    line.type === 'delete' ? 'text-red-300' : 'text-slate-500'}>{line.content}</span>
                </div>
              ))}
            </pre>
          ) : (
            <div className="text-center py-16 text-slate-600">
              {diffs.length > 0 && showOnlyChanges
                ? 'Aucune difference trouvee — les configurations sont identiques.'
                : 'Collez deux configurations et cliquez Comparer'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
