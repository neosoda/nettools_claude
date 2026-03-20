import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Plus, Trash2, Copy, CheckCircle, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'

import backend from '../lib/backend'

type DeviceSource = 'last_scan' | 'manual'

export default function AuditPage() {
  const qc = useQueryClient()
  const [deviceSource, setDeviceSource] = useState<DeviceSource>('last_scan')
  const [lastScanDevices, setLastScanDevices] = useState<any[]>([])
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [manualIpText, setManualIpText] = useState('')
  const [selectedRules, setSelectedRules] = useState<string[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editRule, setEditRule] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'run' | 'rules'>('run')
  const [showRuleFilter, setShowRuleFilter] = useState(true)
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({})
  const [showRemediation, setShowRemediation] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: rules = [] } = useQuery({
    queryKey: ['audit-rules'],
    queryFn: () => backend.GetAuditRules(),
  } as any)

  useEffect(() => {
    const saved = sessionStorage.getItem('audit:selectedRules')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[]
        if (parsed.length > 0) {
          setSelectedRules(parsed)
          return
        }
      } catch {}
    }
    const ruleList = rules as any[]
    if (ruleList.length > 0 && selectedRules.length === 0) {
      setSelectedRules(ruleList.map((r: any) => r.id))
    }
  }, [rules])

  useEffect(() => {
    sessionStorage.setItem('audit:selectedRules', JSON.stringify(selectedRules))
  }, [selectedRules])

  useEffect(() => {
    if (deviceSource === 'last_scan') {
      Promise.resolve(backend.GetLastScanDevices()).then(devs => {
        setLastScanDevices(devs || [])
        setSelectedDevices((devs || []).map((d: any) => d.id))
      })
    } else {
      setLastScanDevices([])
      setSelectedDevices([])
    }
  }, [deviceSource])

  const manualIPs = manualIpText.split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean)

  const auditMutation = useMutation({
    mutationFn: async () => {
      const m = backend
      const allRuleIDs = (rules as any[]).map((r: any) => r.id)
      const useFiltered = selectedRules.length < allRuleIDs.length

      let deviceIDs = selectedDevices
      if (deviceSource === 'manual') {
        const found = await m.GetDevicesByIPs(manualIPs)
        deviceIDs = (found || []).map((d: any) => d.id)
      }

      if (useFiltered) return m.RunAuditFiltered(deviceIDs, selectedRules)
      return m.RunAudit(deviceIDs)
    },
    onSuccess: (data: any) => setReports(data || []),
  })

  const saveRuleMutation = useMutation({
    mutationFn: (rule: any) => backend.SaveAuditRule(rule),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-rules'] }); setShowRuleModal(false) },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => backend.DeleteAuditRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-rules'] }),
  })

  const handleCopyRemediation = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Fallback for Wails
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const severityOpts = [
    { value: 'critical', label: 'Critique' }, { value: 'high', label: 'Eleve' },
    { value: 'medium', label: 'Moyen' }, { value: 'low', label: 'Faible' },
  ]
  const vendorOpts = [
    { value: '', label: 'Tous' }, { value: 'cisco', label: 'Cisco' },
    { value: 'aruba', label: 'Aruba' }, { value: 'hp', label: 'HP' },
    { value: 'hpe', label: 'HPE' }, { value: 'allied', label: 'Allied Telesis' },
  ]

  const allRulesSelected = selectedRules.length === (rules as any[]).length
  const canAudit = deviceSource === 'manual' ? manualIPs.length > 0 : selectedDevices.length > 0

  const toggleReport = (id: string) => setExpandedReports(prev => ({ ...prev, [id]: !prev[id] }))

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'bg-red-900/30 border-red-800 text-red-400'
      case 'high': return 'bg-orange-900/30 border-orange-800 text-orange-400'
      case 'medium': return 'bg-yellow-900/30 border-yellow-800 text-yellow-400'
      default: return 'bg-slate-800 border-slate-700 text-slate-400'
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Audit de conformite"
        actions={<div className="flex gap-2">
          <Button size="sm" variant={activeTab === 'run' ? 'primary' : 'secondary'} onClick={() => setActiveTab('run')}>Audit</Button>
          <Button size="sm" variant={activeTab === 'rules' ? 'primary' : 'secondary'} onClick={() => setActiveTab('rules')}>Regles</Button>
        </div>}
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {activeTab === 'run' ? (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Equipements a auditer</h2>
                <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
                  {(['last_scan', 'manual'] as DeviceSource[]).map(mode => (
                    <button key={mode} onClick={() => setDeviceSource(mode)}
                      className={`px-3 py-1 rounded-md text-xs transition-colors ${deviceSource === mode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                      {mode === 'last_scan' ? 'Dernier scan' : 'Saisie manuelle'}
                    </button>
                  ))}
                </div>
              </div>

              {deviceSource === 'last_scan' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500">{selectedDevices.length} equipement(s) selectionne(s)</p>
                    <button onClick={() => setSelectedDevices(selectedDevices.length === lastScanDevices.length ? [] : lastScanDevices.map((d: any) => d.id))}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      {selectedDevices.length === lastScanDevices.length ? 'Tout deselectionner' : 'Tout selectionner'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lastScanDevices.map((d: any) => (
                      <button key={d.id}
                        onClick={() => setSelectedDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                        className={`px-3 py-1.5 rounded-md text-xs border ${selectedDevices.includes(d.id) ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                        {d.hostname || d.ip}
                      </button>
                    ))}
                    {lastScanDevices.length === 0 && (
                      <p className="text-xs text-amber-400">Aucun equipement dans le dernier scan. Lancez une decouverte reseau d'abord.</p>
                    )}
                  </div>
                </div>
              )}

              {deviceSource === 'manual' && (
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    Liste d'IPs (une par ligne ou separees par virgule)
                  </label>
                  <textarea value={manualIpText} onChange={e => setManualIpText(e.target.value)}
                    placeholder={"10.113.76.1\n10.113.76.2"}
                    className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                    rows={3} />
                  <p className="text-xs text-slate-500 mt-1">
                    L'audit analysera les backups existants pour ces IPs.
                  </p>
                </div>
              )}

              {/* Rule filter */}
              <div className="border-t border-slate-800 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setShowRuleFilter(v => !v)}
                    className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                    <span className={`transition-transform ${showRuleFilter ? 'rotate-90' : ''}`}>&#9654;</span>
                    Regles appliquees ({selectedRules.length}/{(rules as any[]).length})
                    {!allRulesSelected && (
                      <span className="ml-1 px-1.5 py-0.5 bg-amber-900/30 border border-amber-700 rounded text-amber-400 text-xs">
                        Filtrees
                      </span>
                    )}
                  </button>
                  {showRuleFilter && (
                    <button onClick={() => setSelectedRules(allRulesSelected ? [] : (rules as any[]).map((r: any) => r.id))}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      {allRulesSelected ? 'Tout deselectionner' : 'Tout selectionner'}
                    </button>
                  )}
                </div>
                {showRuleFilter && (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {(rules as any[]).map((rule: any) => (
                      <label key={rule.id}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border cursor-pointer transition-colors ${
                          selectedRules.includes(rule.id)
                            ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                            : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                        <input type="checkbox" className="w-3 h-3 accent-blue-500"
                          checked={selectedRules.includes(rule.id)}
                          onChange={e => setSelectedRules(prev =>
                            e.target.checked ? [...prev, rule.id] : prev.filter(id => id !== rule.id)
                          )} />
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          rule.severity === 'critical' ? 'bg-red-500' :
                          rule.severity === 'high' ? 'bg-orange-500' :
                          rule.severity === 'medium' ? 'bg-yellow-500' : 'bg-slate-500'}`} />
                        {rule.name}
                      </label>
                    ))}
                    {(rules as any[]).length === 0 && (
                      <p className="text-xs text-slate-500 italic">Aucune regle configuree. Creez des regles dans l'onglet "Regles".</p>
                    )}
                  </div>
                )}
              </div>

              <Button variant="primary" loading={auditMutation.isPending}
                disabled={!canAudit || selectedRules.length === 0}
                onClick={() => auditMutation.mutate()}>
                <Play className="w-4 h-4" /> Auditer
                {!allRulesSelected && ` — ${selectedRules.length} regles`}
              </Button>
            </div>

            {/* Audit reports */}
            {reports.map((report: any) => {
              const isExpanded = expandedReports[report.device_id] !== false
              const hasRemediation = report.remediation && report.remediation.length > 0
              const failedResults = (report.results || []).filter((r: any) => !r.passed)

              return (
                <div key={report.device_id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                    onClick={() => toggleReport(report.device_id)}>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                      <div>
                        <span className="font-medium text-white">{report.device_hostname || report.device_ip}</span>
                        <span className="text-xs text-slate-500 ml-2">{report.device_ip}</span>
                        {report.total_rules > 0
                          ? <span className="ml-3 text-sm text-slate-400">{report.passed}/{report.total_rules} regles</span>
                          : <span className="ml-3 text-sm text-amber-400">Aucun backup disponible</span>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {hasRemediation && (
                        <Button size="sm" variant="ghost" onClick={(e: React.MouseEvent) => {
                          e.stopPropagation()
                          setShowRemediation(report.device_id)
                        }} title="Script de remediation">
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                        </Button>
                      )}
                      {report.total_rules > 0 && (
                        <>
                          <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${report.score >= 80 ? 'bg-green-500' : report.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${report.score}%` }} />
                          </div>
                          <span className={`text-lg font-bold tabular-nums ${report.score >= 80 ? 'text-green-400' : report.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {Math.round(report.score)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <>
                      {report.total_rules === 0 ? (
                        <div className="p-4 text-sm text-slate-500">
                          Aucune configuration sauvegardee pour cet equipement. Effectuez un backup avant de lancer l'audit.
                        </div>
                      ) : (
                        <div className="p-4 space-y-2">
                          {(report.results || []).map((r: any) => (
                            <div key={r.id} className={`flex items-start gap-3 p-3 rounded-lg ${r.passed ? 'bg-green-900/10' : 'bg-red-900/10'}`}>
                              <span className={`mt-0.5 ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                                {r.passed ? <CheckCircle className="w-4 h-4" /> : '✗'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-200">{r.rule_name}</p>
                                {r.details && <p className="text-xs text-slate-500 mt-0.5">{r.details}</p>}
                                {/* Inline remediation for individual failed rules */}
                                {!r.passed && r.remediation && (
                                  <div className="mt-2 bg-slate-800/50 rounded p-2 border border-slate-700/50">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs text-amber-400 font-medium">Remediation suggeree:</span>
                                      <button onClick={() => handleCopyRemediation(r.remediation, r.id)}
                                        className="text-xs text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1">
                                        {copiedId === r.id ? <><CheckCircle className="w-3 h-3 text-green-400" /> Copie!</> : <><Copy className="w-3 h-3" /> Copier</>}
                                      </button>
                                    </div>
                                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{r.remediation}</pre>
                                  </div>
                                )}
                              </div>
                              <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${severityColor(r.severity)}`}>
                                {r.severity}
                              </span>
                            </div>
                          ))}

                          {/* Summary: failed rules count */}
                          {failedResults.length > 0 && (
                            <div className="pt-2 border-t border-slate-800 text-xs text-slate-500">
                              {failedResults.length} non-conformite(s) detectee(s) — {failedResults.filter((r: any) => r.severity === 'critical').length} critique(s)
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {/* Full remediation script modal */}
            {reports.map((report: any) => (
              <Modal key={`rem-${report.device_id}`}
                open={showRemediation === report.device_id}
                onClose={() => setShowRemediation(null)}
                title={`Script de remediation — ${report.device_hostname || report.device_ip}`}
                size="xl">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                      Script CLI pret a l'emploi pour corriger les {report.failed} manquements detectes
                    </p>
                    <Button size="sm" variant="secondary"
                      onClick={() => handleCopyRemediation(report.remediation, `full-${report.device_id}`)}>
                      {copiedId === `full-${report.device_id}`
                        ? <><CheckCircle className="w-3.5 h-3.5 text-green-400" /> Copie!</>
                        : <><Copy className="w-3.5 h-3.5" /> Copier le script</>}
                    </Button>
                  </div>
                  <pre className="text-xs text-green-300 bg-black p-4 rounded-lg overflow-auto max-h-[60vh] font-mono border border-slate-800">
                    {report.remediation}
                  </pre>
                </div>
              </Modal>
            ))}
          </>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-300">Regles ({(rules as any[]).length})</h2>
              <Button size="sm" variant="primary" onClick={() => { setEditRule({ must_match: true, severity: 'high', enabled: true, remediation: '' }); setShowRuleModal(true) }}>
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left p-3">Nom</th><th className="text-left p-3">Pattern</th>
                  <th className="text-left p-3">Type</th><th className="text-left p-3">Severite</th>
                  <th className="text-left p-3">Remediation</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rules as any[]).map((rule: any) => (
                  <tr key={rule.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-3 text-slate-200">{rule.name}</td>
                    <td className="p-3 font-mono text-xs text-slate-400 max-w-xs truncate">{rule.pattern}</td>
                    <td className="p-3 text-slate-400 text-xs">{rule.must_match ? 'Doit contenir' : 'Interdit'}</td>
                    <td className="p-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${severityColor(rule.severity)}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="p-3">
                      {rule.remediation
                        ? <span className="text-xs text-green-400">Oui</span>
                        : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="p-3 flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditRule(rule); setShowRuleModal(true) }}>Editer</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteRuleMutation.mutate(rule.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rule edit modal with remediation field */}
      <Modal open={showRuleModal} onClose={() => setShowRuleModal(false)} title="Regle d'audit">
        <form onSubmit={e => { e.preventDefault(); saveRuleMutation.mutate(editRule) }} className="space-y-3">
          <Input label="Nom *" value={editRule?.name || ''} required
            onChange={e => setEditRule((r: any) => ({ ...r, name: e.target.value }))} />
          <div>
            <Input label="Pattern (regex) *" value={editRule?.pattern || ''} required
              onChange={e => setEditRule((r: any) => ({ ...r, pattern: e.target.value }))} />
            <p className="text-xs text-slate-500 mt-1">
              Supporte "pattern1 AND pattern2" pour verification multi-blocs (ex: "ntp server AND ntp authenticate")
            </p>
          </div>
          <Input label="Description" value={editRule?.description || ''}
            onChange={e => setEditRule((r: any) => ({ ...r, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Severite" value={editRule?.severity || 'high'} options={severityOpts}
              onChange={e => setEditRule((r: any) => ({ ...r, severity: e.target.value }))} />
            <Select label="Vendor" value={editRule?.vendor || ''} options={vendorOpts}
              onChange={e => setEditRule((r: any) => ({ ...r, vendor: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="must_match" checked={editRule?.must_match ?? true}
              onChange={e => setEditRule((r: any) => ({ ...r, must_match: e.target.checked }))} />
            <label htmlFor="must_match" className="text-sm text-slate-300">La configuration doit contenir ce pattern</label>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Script de remediation (CLI)
            </label>
            <textarea value={editRule?.remediation || ''}
              onChange={e => setEditRule((r: any) => ({ ...r, remediation: e.target.value }))}
              placeholder={"ntp server 10.0.0.1\nntp authenticate"}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
              rows={4} />
            <p className="text-xs text-slate-500 mt-1">
              Variables: {"{{hostname}}"}, {"{{ip}}"}, {"{{vendor}}"}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setShowRuleModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveRuleMutation.isPending}>Sauvegarder</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
