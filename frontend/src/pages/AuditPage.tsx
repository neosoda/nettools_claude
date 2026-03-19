import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Plus, Trash2, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import { useToast } from '../components/Toast'

async function getBackend() { return import('../../wailsjs/go/main/App') }

type DeviceSource = 'last_scan' | 'manual'

export default function AuditPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data: rules = [] } = useQuery({
    queryKey: ['audit-rules'],
    queryFn: async () => { const m = await getBackend(); return m.GetAuditRules() },
  } as any)

  // Auto-select all rules on load
  useEffect(() => {
    const ruleList = rules as any[]
    if (ruleList.length > 0 && selectedRules.length === 0) {
      setSelectedRules(ruleList.map((r: any) => r.id))
    }
  }, [rules])

  // Load last scan devices
  useEffect(() => {
    if (deviceSource === 'last_scan') {
      getBackend().then(m => m.GetLastScanDevices()).then(devs => {
        setLastScanDevices(devs || [])
        setSelectedDevices((devs || []).map((d: any) => d.id))
      })
    } else {
      setLastScanDevices([])
      setSelectedDevices([])
    }
  }, [deviceSource])

  // For manual mode: build ephemeral device list from IPs
  const manualIPs = manualIpText.split(/[\n,;]+/).map((s: string) => s.trim()).filter(Boolean)

  const auditMutation = useMutation({
    mutationFn: async () => {
      const m = await getBackend()
      const allRuleIDs = (rules as any[]).map((r: any) => r.id)
      const useFiltered = selectedRules.length < allRuleIDs.length

      let deviceIDs = selectedDevices
      if (deviceSource === 'manual') {
        // Resolve IPs to device IDs (auto-created by previous backups/scans)
        const found = await m.GetDevicesByIPs(manualIPs)
        deviceIDs = (found || []).map((d: any) => d.id)
      }

      if (useFiltered) return m.RunAuditFiltered(deviceIDs, selectedRules)
      return m.RunAudit(deviceIDs)
    },
    onSuccess: (data: any) => {
      setReports(data || [])
      const count = (data || []).length
      if (count > 0) toast(`Audit terminé pour ${count} équipement(s)`, 'success')
      else toast('Aucun résultat d\'audit', 'warning')
    },
    onError: (e: any) => toast(`Erreur audit: ${e?.message || e}`, 'error'),
  })

  const saveRuleMutation = useMutation({
    mutationFn: async (rule: any) => { const m = await getBackend(); return m.SaveAuditRule(rule) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-rules'] }); setShowRuleModal(false) },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeleteAuditRule(id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-rules'] }),
  })

  const severityOpts = [
    { value: 'critical', label: 'Critique' }, { value: 'high', label: 'Élevé' },
    { value: 'medium', label: 'Moyen' }, { value: 'low', label: 'Faible' },
  ]
  const vendorOpts = [
    { value: '', label: 'Tous' }, { value: 'cisco', label: 'Cisco' },
    { value: 'aruba', label: 'Aruba' }, { value: 'allied', label: 'Allied' },
  ]

  const allRulesSelected = selectedRules.length === (rules as any[]).length
  const canAudit = deviceSource === 'manual' ? manualIPs.length > 0 : selectedDevices.length > 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Audit de conformité"
        actions={<div className="flex gap-2">
          <Button size="sm" variant={activeTab === 'run' ? 'primary' : 'secondary'} onClick={() => setActiveTab('run')}>Audit</Button>
          <Button size="sm" variant={activeTab === 'rules' ? 'primary' : 'secondary'} onClick={() => setActiveTab('rules')}>Règles</Button>
        </div>}
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {activeTab === 'run' ? (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              {/* Device source selector */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Équipements à auditer</h2>
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
                    <p className="text-xs text-slate-500">{selectedDevices.length} équipement(s) sélectionné(s)</p>
                    <button onClick={() => setSelectedDevices(selectedDevices.length === lastScanDevices.length ? [] : lastScanDevices.map((d: any) => d.id))}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      {selectedDevices.length === lastScanDevices.length ? 'Tout désélectionner' : 'Tout sélectionner'}
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
                      <p className="text-xs text-amber-400">Aucun équipement dans le dernier scan. Lancez une découverte réseau d'abord.</p>
                    )}
                  </div>
                </div>
              )}

              {deviceSource === 'manual' && (
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">
                    Liste d'IPs (une par ligne ou séparées par virgule)
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
                    <span className={`transition-transform ${showRuleFilter ? 'rotate-90' : ''}`}>▶</span>
                    Règles appliquées ({selectedRules.length}/{(rules as any[]).length})
                    {!allRulesSelected && (
                      <span className="ml-1 px-1.5 py-0.5 bg-amber-900/30 border border-amber-700 rounded text-amber-400 text-xs">
                        Filtrées
                      </span>
                    )}
                  </button>
                  {showRuleFilter && (
                    <button onClick={() => setSelectedRules(allRulesSelected ? [] : (rules as any[]).map((r: any) => r.id))}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      {allRulesSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
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
                      <p className="text-xs text-slate-500 italic">Aucune règle configurée. Créez des règles dans l'onglet "Règles".</p>
                    )}
                  </div>
                )}
              </div>

              <Button variant="primary" loading={auditMutation.isPending}
                disabled={!canAudit || selectedRules.length === 0}
                onClick={() => auditMutation.mutate()}>
                <Play className="w-4 h-4" /> Auditer
                {!allRulesSelected && ` — ${selectedRules.length} règles`}
              </Button>
            </div>

            {reports.map((report: any) => (
              <div key={report.device_id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-white">{report.device_ip}</span>
                    {report.total_rules > 0
                      ? <span className="ml-3 text-sm text-slate-400">{report.passed}/{report.total_rules} règles</span>
                      : <span className="ml-3 text-sm text-amber-400">Aucun backup disponible</span>
                    }
                  </div>
                  {report.total_rules > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${report.score >= 80 ? 'bg-green-500' : report.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${report.score}%` }} />
                      </div>
                      <span className={`text-lg font-bold ${report.score >= 80 ? 'text-green-400' : report.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {Math.round(report.score)}%
                      </span>
                    </div>
                  )}
                </div>
                {report.total_rules === 0 ? (
                  <div className="p-4 text-sm text-slate-500">
                    Aucune configuration sauvegardée pour cet équipement. Effectuez un backup avant de lancer l'audit.
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    {(report.results || []).map((r: any) => (
                      <div key={r.id} className={`flex items-center gap-3 p-2 rounded ${r.passed ? 'bg-green-900/10' : 'bg-red-900/10'}`}>
                        <span className={r.passed ? 'text-green-400' : 'text-red-400'}>{r.passed ? '✓' : '✗'}</span>
                        <div className="flex-1">
                          <p className="text-sm text-slate-200">{r.rule_name}</p>
                          {r.details && <p className="text-xs text-slate-500">{r.details}</p>}
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${
                          r.severity === 'critical' ? 'bg-red-900/30 border-red-800 text-red-400' :
                          r.severity === 'high' ? 'bg-orange-900/30 border-orange-800 text-orange-400' :
                          'bg-slate-800 border-slate-700 text-slate-400'}`}>
                          {r.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-300">Règles ({(rules as any[]).length})</h2>
              <Button size="sm" variant="primary" onClick={() => { setEditRule({ must_match: true, severity: 'high', enabled: true }); setShowRuleModal(true) }}>
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left p-3">Nom</th><th className="text-left p-3">Pattern</th>
                  <th className="text-left p-3">Type</th><th className="text-left p-3">Sévérité</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rules as any[]).map((rule: any) => (
                  <tr key={rule.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-3 text-slate-200">{rule.name}</td>
                    <td className="p-3 font-mono text-xs text-slate-400">{rule.pattern}</td>
                    <td className="p-3 text-slate-400 text-xs">{rule.must_match ? '✓ Doit contenir' : '✗ Ne doit pas contenir'}</td>
                    <td className="p-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${rule.severity === 'critical' ? 'bg-red-900/30 border-red-800 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="p-3 flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditRule(rule); setShowRuleModal(true) }}>Éditer</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(rule.id)}>
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

      {/* Confirm delete */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmer la suppression" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-300">Voulez-vous vraiment supprimer cette règle d'audit ?</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button variant="danger" loading={deleteRuleMutation.isPending}
              onClick={() => { if (confirmDelete) { deleteRuleMutation.mutate(confirmDelete); setConfirmDelete(null) } }}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showRuleModal} onClose={() => setShowRuleModal(false)} title="Règle d'audit">
        <form onSubmit={e => { e.preventDefault(); saveRuleMutation.mutate(editRule) }} className="space-y-3">
          <Input label="Nom *" value={editRule?.name || ''} required
            onChange={e => setEditRule((r: any) => ({ ...r, name: e.target.value }))} />
          <Input label="Pattern (regex) *" value={editRule?.pattern || ''} required
            onChange={e => setEditRule((r: any) => ({ ...r, pattern: e.target.value }))} />
          <Input label="Description" value={editRule?.description || ''}
            onChange={e => setEditRule((r: any) => ({ ...r, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Sévérité" value={editRule?.severity || 'high'} options={severityOpts}
              onChange={e => setEditRule((r: any) => ({ ...r, severity: e.target.value }))} />
            <Select label="Vendor" value={editRule?.vendor || ''} options={vendorOpts}
              onChange={e => setEditRule((r: any) => ({ ...r, vendor: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="must_match" checked={editRule?.must_match ?? true}
              onChange={e => setEditRule((r: any) => ({ ...r, must_match: e.target.checked }))} />
            <label htmlFor="must_match" className="text-sm text-slate-300">La configuration doit contenir ce pattern</label>
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
