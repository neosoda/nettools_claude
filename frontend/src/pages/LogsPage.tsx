import { useState, Fragment, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, FileText, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Input from '../components/Input'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import Button from '../components/Button'
import { formatDate } from '../lib/utils'

async function getBackend() { return import('../../wailsjs/go/main/App') }

function tryParseJson(s: string) {
  try { return JSON.parse(s) } catch { return null }
}

function actionColor(action: string) {
  if (action.includes('scan')) return 'text-blue-400'
  if (action.includes('backup')) return 'text-purple-400'
  if (action.includes('audit')) return 'text-yellow-400'
  if (action.includes('terminal')) return 'text-green-400'
  if (action.includes('error') || action.includes('fail')) return 'text-red-400'
  if (action.includes('device')) return 'text-cyan-400'
  if (action.includes('playbook')) return 'text-orange-400'
  if (action.includes('scheduler') || action.includes('scheduled')) return 'text-indigo-400'
  return 'text-slate-400'
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function LogsPage() {
  const [filterInput, setFilterInput] = useState('')
  const actionFilter = useDebouncedValue(filterInput, 300)
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'files'>('events')
  const [selectedFile, setSelectedFile] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', actionFilter],
    queryFn: async () => {
      const m = await getBackend()
      return m.GetAuditLogs({ limit: 500, offset: 0, action: actionFilter })
    },
    refetchInterval: 10000,
  })

  const { data: logFiles = [] } = useQuery({
    queryKey: ['log-files'],
    queryFn: async () => { const m = await getBackend(); return m.GetLogFiles() },
  })

  const handleLoadFile = async (filename: string) => {
    setSelectedFile(filename)
    setLoadingFile(true)
    try {
      const m = await getBackend()
      const content = await m.GetLogFileContent(filename)
      setFileContent(content)
    } catch (e: any) {
      setFileContent(`Erreur lors de la lecture : ${e?.message || e}`)
    } finally {
      setLoadingFile(false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedDetails(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Journaux d'activité"
        actions={
          <div className="flex gap-2 items-center">
            <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
              <button onClick={() => setActiveTab('events')}
                className={`px-3 py-1 rounded-md text-xs transition-colors ${activeTab === 'events' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                Événements
              </button>
              <button onClick={() => setActiveTab('files')}
                className={`px-3 py-1 rounded-md text-xs transition-colors ${activeTab === 'files' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                Fichiers journaux
              </button>
            </div>
            {activeTab === 'events' && (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={filterInput} onChange={e => setFilterInput(e.target.value)}
                    placeholder="Filtrer..."
                    className="pl-7 pr-6 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 w-40 focus:outline-none focus:border-blue-500" />
                  {filterInput && (
                    <button onClick={() => setFilterInput('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                      <X className="w-3 h-3 text-slate-500" />
                    </button>
                  )}
                </div>
                <button onClick={() => refetch()} className="text-slate-400 hover:text-white" title="Rafraîchir">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        {activeTab === 'events' ? (
          isLoading ? (
            <div className="flex items-center justify-center h-32 text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 z-10 border-b border-slate-800">
                <tr className="text-slate-400">
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Action</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Statut</th>
                  <th className="text-left p-3">Durée</th>
                  <th className="text-left p-3">Détails</th>
                </tr>
              </thead>
              <tbody>
                {(logs as any[]).map((log: any) => {
                  const parsed = tryParseJson(log.details)
                  const isExpanded = expandedDetails.has(log.id)
                  return (
                    <Fragment key={log.id}>
                      <tr
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                        onClick={() => setSelectedLog(log)}>
                        <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="p-3">
                          <span className={`font-mono text-xs ${actionColor(log.action)}`}>{log.action}</span>
                        </td>
                        <td className="p-3 text-xs text-slate-400">{log.entity_type}</td>
                        <td className="p-3"><StatusBadge status={log.status || 'unknown'} /></td>
                        <td className="p-3 text-xs text-slate-500">
                          {log.duration_ms ? (log.duration_ms >= 1000 ? `${(log.duration_ms/1000).toFixed(1)}s` : `${log.duration_ms}ms`) : '—'}
                        </td>
                        <td className="p-3 text-xs text-slate-500">
                          <div className="flex items-center gap-2">
                            <span className="max-w-xs truncate">
                              {parsed ? Object.entries(parsed).map(([k,v]) => `${k}:${v}`).join(' · ') : log.details}
                            </span>
                            {log.details && (
                              <button onClick={e => { e.stopPropagation(); toggleExpand(log.id) }}
                                className="text-slate-600 hover:text-slate-400">
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-900/50">
                          <td colSpan={6} className="px-6 py-3">
                            <pre className="text-xs text-slate-300 font-mono bg-slate-950 p-3 rounded-lg">
                              {parsed ? JSON.stringify(parsed, null, 2) : log.details}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {(logs as any[]).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-500">
                      Aucun log{filterInput ? ` pour "${filterInput}"` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )
        ) : (
          /* Log files viewer */
          <div className="flex h-full">
            <div className="w-56 border-r border-slate-800 p-3 space-y-1 overflow-y-auto">
              <p className="text-xs font-medium text-slate-500 mb-2 px-1">Fichiers journaux</p>
              {(logFiles as string[]).length === 0 && (
                <p className="text-xs text-slate-600 italic px-1">Aucun fichier</p>
              )}
              {(logFiles as string[]).map((file) => (
                <button key={file} onClick={() => handleLoadFile(file)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                    selectedFile === file ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}>
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{file}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {!selectedFile ? (
                <div className="flex items-center justify-center h-full text-slate-600">
                  <div className="text-center">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Sélectionnez un fichier journal</p>
                  </div>
                </div>
              ) : loadingFile ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
                </div>
              ) : (
                <pre className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                  {fileContent || 'Fichier vide'}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Log detail modal */}
      <Modal open={!!selectedLog} onClose={() => setSelectedLog(null)}
        title={`Détail — ${selectedLog?.action}`} size="lg">
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-1">Date</p>
                <p className="text-slate-200">{formatDate(selectedLog.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Statut</p>
                <StatusBadge status={selectedLog.status || 'unknown'} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Type d'entité</p>
                <p className="text-slate-200">{selectedLog.entity_type || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">ID entité</p>
                <p className="text-slate-400 font-mono text-xs truncate">{selectedLog.entity_id || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Durée</p>
                <p className="text-slate-200">
                  {selectedLog.duration_ms
                    ? (selectedLog.duration_ms >= 1000
                      ? `${(selectedLog.duration_ms/1000).toFixed(2)} secondes`
                      : `${selectedLog.duration_ms} ms`)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Action</p>
                <p className={`font-mono text-xs ${actionColor(selectedLog.action)}`}>{selectedLog.action}</p>
              </div>
            </div>

            {selectedLog.details && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Détails</p>
                {tryParseJson(selectedLog.details) ? (
                  <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg font-mono overflow-auto max-h-60">
                    {JSON.stringify(tryParseJson(selectedLog.details), null, 2)}
                  </pre>
                ) : (
                  <div className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg whitespace-pre-wrap">
                    {selectedLog.details}
                  </div>
                )}
              </div>
            )}

            {/* Analyse contextuelle */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-400 mb-2">Analyse</p>
              <p className="text-xs text-slate-400">
                {selectedLog.status === 'failed' || selectedLog.status === 'failure' ? (
                  <>
                    <span className="text-red-400">⚠ Échec détecté.</span>{' '}
                    {selectedLog.action.includes('backup') && "Vérifiez les credentials SSH et que l'équipement est joignable sur le port 22."}
                    {selectedLog.action.includes('scan') && "Vérifiez la communauté SNMP et que le port UDP 161 est accessible."}
                    {selectedLog.action.includes('terminal') && "Connexion SSH échouée. Vérifiez l'IP, le port, les credentials."}
                    {selectedLog.action.includes('audit') && "L'audit nécessite un backup réussi. Effectuez d'abord un backup."}
                  </>
                ) : selectedLog.status === 'success' ? (
                  <span className="text-green-400">✓ Opération réussie.</span>
                ) : (
                  "Statut intermédiaire ou en cours d'exécution."
                )}
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setSelectedLog(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
