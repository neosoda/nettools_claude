import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export default function AuditPage() {
  const qc = useQueryClient()
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editRule, setEditRule] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'run' | 'rules'>('run')
  const [useLastScan, setUseLastScan] = useState(false)
  const [lastScanDevices, setLastScanDevices] = useState<any[]>([])

  const { data: allDevices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })
  const { data: rules = [] } = useQuery({
    queryKey: ['audit-rules'],
    queryFn: async () => { const m = await getBackend(); return m.GetAuditRules() },
  })

  // Load last scan devices
  useEffect(() => {
    if (useLastScan) {
      getBackend().then(m => m.GetLastScanDevices()).then(devs => {
        setLastScanDevices(devs || [])
        setSelectedDevices((devs || []).map((d: any) => d.id))
      })
    } else {
      setLastScanDevices([])
      setSelectedDevices([])
    }
  }, [useLastScan])

  const devices = useLastScan ? lastScanDevices : (allDevices as any[])

  const auditMutation = useMutation({
    mutationFn: async () => { const m = await getBackend(); return m.RunAudit(selectedDevices) },
    onSuccess: (data: any) => setReports(data || []),
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
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-300">
                  Équipements à auditer ({selectedDevices.length}/{devices.length})
                </h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <div onClick={() => setUseLastScan(v => !v)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${useLastScan ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useLastScan ? 'left-4' : 'left-0.5'}`} />
                    </div>
                    Dernier scan
                    {useLastScan && lastScanDevices.length > 0 && (
                      <span className="text-blue-400">({lastScanDevices.length})</span>
                    )}
                  </label>
                  <button
                    onClick={() => setSelectedDevices(selectedDevices.length === devices.length ? [] : devices.map((d: any) => d.id))}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    {selectedDevices.length === devices.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {devices.map((d: any) => (
                  <button key={d.id}
                    onClick={() => setSelectedDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                    className={`px-3 py-1.5 rounded-md text-xs border ${selectedDevices.includes(d.id) ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                    {d.hostname || d.ip}
                  </button>
                ))}
                {devices.length === 0 && (
                  <p className="text-xs text-slate-500 italic">
                    {useLastScan ? 'Aucun équipement dans le dernier scan. Lancez d\'abord un scan réseau.' : 'Aucun équipement en inventaire.'}
                  </p>
                )}
              </div>
              <Button variant="primary" loading={auditMutation.isPending}
                disabled={selectedDevices.length === 0} onClick={() => auditMutation.mutate()}>
                <Play className="w-4 h-4" /> Auditer ({selectedDevices.length})
              </Button>
            </div>

            {reports.map((report: any) => (
              <div key={report.device_id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-white">{report.device_ip}</span>
                    <span className="ml-3 text-sm text-slate-400">{report.passed}/{report.total_rules} règles</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Progress bar */}
                    <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${report.score >= 80 ? 'bg-green-500' : report.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${report.score}%` }} />
                    </div>
                    <span className={`text-lg font-bold ${report.score >= 80 ? 'text-green-400' : report.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {Math.round(report.score)}%
                    </span>
                  </div>
                </div>
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
