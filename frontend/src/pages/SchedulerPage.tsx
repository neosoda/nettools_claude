import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CalendarClock, Info, Play } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/utils'

import backend from '../lib/backend'

// Convert UI form to cron expression (second-precision: "SEC MIN HOUR DOM MON DOW")
function buildCronExpression(freq: string, hour: string, minute: string, dayOfWeek: string, dayOfMonth: string, onceDate: string, onceTime: string): string {
  const h = parseInt(hour) || 0
  const m = parseInt(minute) || 0
  switch (freq) {
    case 'hourly':  return `0 ${m} * * * *`
    case 'daily':   return `0 ${m} ${h} * * *`
    case 'weekly':  return `0 ${m} ${h} * * ${dayOfWeek}`
    case 'monthly': return `0 ${m} ${h} ${dayOfMonth} * *`
    case 'once': {
      // Generate a cron expression for the specific date/time
      if (onceDate && onceTime) {
        const [year, mon, day] = onceDate.split('-').map(Number)
        const [oh, om] = onceTime.split(':').map(Number)
        // Cron format: SEC MIN HOUR DOM MON DOW (month is 1-12 in robfig/cron)
        void year // year not supported in cron, but the job will auto-disable after execution
        return `0 ${om} ${oh} ${day} ${mon} *`
      }
      // Fallback: execute at next minute (essentially "now")
      const now = new Date()
      return `0 ${now.getMinutes() + 1} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`
    }
    default: return '0 0 2 * * *'
  }
}

function describeFreq(freq: string, hour: string, minute: string, dow: string, dom: string, onceDate: string, onceTime: string): string {
  const h = parseInt(hour) || 0
  const m = parseInt(minute) || 0
  const time = `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  switch (freq) {
    case 'hourly':  return `Toutes les heures à :${String(m).padStart(2,'0')}`
    case 'daily':   return `Tous les jours à ${time}`
    case 'weekly':  return `Chaque ${days[parseInt(dow)] || '?'} à ${time}`
    case 'monthly': return `Le ${dom} du mois à ${time}`
    case 'once': {
      if (onceDate && onceTime) {
        const [y, mo, d] = onceDate.split('-')
        return `Tâche unique le ${d}/${mo}/${y} à ${onceTime}`
      }
      return 'Tâche unique (exécution manuelle)'
    }
    default: return 'Personnalisé'
  }
}

export default function SchedulerPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editJob, setEditJob] = useState<any>(null)
  const [advancedCron, setAdvancedCron] = useState(false)

  // UI form state
  const [freq, setFreq] = useState('daily')
  const [hour, setHour] = useState('2')
  const [minute, setMinute] = useState('0')
  const [dayOfWeek, setDayOfWeek] = useState('1') // Monday
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [customCron, setCustomCron] = useState('0 0 2 * * *')
  const [onceDate, setOnceDate] = useState('')
  const [onceTime, setOnceTime] = useState('08:00')

  // Payload mode: simple vs advanced
  const [payloadMode, setPayloadMode] = useState<'simple' | 'advanced'>('simple')

  // Simple payload fields
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [simpleConfigType, setSimpleConfigType] = useState('running')
  const [simpleCidr, setSimpleCidr] = useState('')
  const [simplePlaybookId, setSimplePlaybookId] = useState('')
  const [simpleCommands, setSimpleCommands] = useState('')
  const [simpleCredentialId, setSimpleCredentialId] = useState('')

  const { data: jobs = [] } = useQuery({
    queryKey: ['scheduled-jobs'],
    queryFn: () => backend.GetScheduledJobs(),
  })
  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => backend.GetDevices(),
  })
  const { data: playbooks = [] } = useQuery({
    queryKey: ['playbooks'],
    queryFn: () => backend.GetPlaybooks(),
  })
  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => backend.GetCredentials(),
  })

  const saveMutation = useMutation({
    mutationFn: (job: any) => backend.SaveScheduledJob(job),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }); setShowModal(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => backend.DeleteScheduledJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const m = backend; return m.ToggleScheduledJob(id, enabled)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })
  const runNowMutation = useMutation({
    mutationFn: (id: string) => backend.RunScheduledJobNow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })

  const openNewModal = () => {
    setFreq('daily'); setHour('2'); setMinute('0'); setDayOfWeek('1'); setDayOfMonth('1')
    setCustomCron('0 0 2 * * *'); setAdvancedCron(false)
    setOnceDate(''); setOnceTime('08:00')
    setPayloadMode('simple'); setSelectedDevices([]); setSimpleConfigType('running')
    setSimpleCidr(''); setSimplePlaybookId(''); setSimpleCommands(''); setSimpleCredentialId('')
    setEditJob({ enabled: true, job_type: 'backup', payload: '' })
    setShowModal(true)
  }

  const buildPayload = (): string => {
    if (payloadMode === 'advanced') return editJob?.payload || '{}'
    const jobType = editJob?.job_type || 'backup'
    const payload: any = {}

    if (freq === 'once') { payload.once = true; if (onceDate && onceTime) payload.once_at = new Date(`${onceDate}T${onceTime}:00`).toISOString() }

    switch (jobType) {
      case 'backup':
        payload.device_ids = selectedDevices
        payload.config_type = simpleConfigType
        if (simpleCredentialId) payload.credential_id = simpleCredentialId
        break
      case 'scan':
        payload.cidr = simpleCidr
        if (simpleCredentialId) payload.credential_id = simpleCredentialId
        break
      case 'playbook':
        payload.playbook_id = simplePlaybookId
        payload.device_ids = selectedDevices
        break
      case 'ssh_command':
        payload.device_ids = selectedDevices
        payload.commands = simpleCommands.split('\n').map(s => s.trim()).filter(Boolean)
        break
    }
    return JSON.stringify(payload)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const cron = advancedCron ? customCron : buildCronExpression(freq, hour, minute, dayOfWeek, dayOfMonth, onceDate, onceTime)
    const payload = buildPayload()
    saveMutation.mutate({ ...editJob, cron_expression: cron, payload })
  }

  const jobType = editJob?.job_type || 'backup'
  const needsDevices = ['backup', 'playbook', 'ssh_command'].includes(jobType)

  const jobTypeOptions = [
    { value: 'backup', label: 'Backup de configuration' },
    { value: 'scan', label: 'Scan réseau' },
    { value: 'playbook', label: 'Exécuter un playbook' },
    { value: 'ssh_command', label: 'Commande SSH simple' },
  ]
  const freqOptions = [
    { value: 'once', label: 'Tâche unique' },
    { value: 'hourly', label: 'Toutes les heures' },
    { value: 'daily', label: 'Tous les jours' },
    { value: 'weekly', label: 'Chaque semaine' },
    { value: 'monthly', label: 'Chaque mois' },
  ]
  const dowOptions = [
    { value: '0', label: 'Dimanche' }, { value: '1', label: 'Lundi' },
    { value: '2', label: 'Mardi' }, { value: '3', label: 'Mercredi' },
    { value: '4', label: 'Jeudi' }, { value: '5', label: 'Vendredi' },
    { value: '6', label: 'Samedi' },
  ]

  const hours = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2,'0')}h` }))
  const minutes = Array.from({ length: 60 }, (_, i) => ({ value: String(i), label: String(i).padStart(2,'0') }))

  const jobTypeLabel = (type: string) => {
    switch (type) {
      case 'backup': return 'Backup'
      case 'scan': return 'Scan réseau'
      case 'playbook': return 'Playbook'
      case 'ssh_command': return 'Commande SSH'
      default: return type
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Planificateur"
        actions={<Button variant="primary" onClick={openNewModal}><Plus className="w-4 h-4" /> Nouvelle tâche</Button>}
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Info box */}
        <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 space-y-1">
            <p>Le planificateur exécute automatiquement des tâches réseau selon la planification définie.</p>
            <p>Les tâches s'exécutent en arrière-plan même sans interaction. Consultez les Journaux pour voir l'historique.</p>
          </div>
        </div>

        {/* Jobs table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left p-4">Nom</th>
                <th className="text-left p-4">Type</th>
                <th className="text-left p-4">Planification</th>
                <th className="text-left p-4">Dernière exéc.</th>
                <th className="text-left p-4">Statut</th>
                <th className="text-left p-4">Actif</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(jobs as any[]).map((job: any) => (
                <tr key={job.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-4 text-white font-medium">{job.name}</td>
                  <td className="p-4 text-slate-400">{jobTypeLabel(job.job_type)}</td>
                  <td className="p-4">
                    <span className="font-mono text-xs text-blue-400 bg-blue-950/30 px-2 py-0.5 rounded">
                      {job.cron_expression}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-500">{formatDate(job.last_run_at)}</td>
                  <td className="p-4">{job.last_status && <StatusBadge status={job.last_status} />}</td>
                  <td className="p-4">
                    <button onClick={() => toggleMutation.mutate({ id: job.id, enabled: !job.enabled })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${job.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${job.enabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="p-4 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => runNowMutation.mutate(job.id)}
                      loading={runNowMutation.isPending} title="Exécuter maintenant">
                      <Play className="w-3.5 h-3.5 text-green-400" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(job.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(jobs as any[]).length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-500">
                    <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    Aucune tâche planifiée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New/Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvelle tâche planifiée" size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Nom de la tâche *" value={editJob?.name || ''} required
            onChange={e => setEditJob((j: any) => ({ ...j, name: e.target.value }))} />

          <Select label="Type de tâche" value={editJob?.job_type || 'backup'} options={jobTypeOptions}
            onChange={e => setEditJob((j: any) => ({ ...j, job_type: e.target.value }))} />

          {/* Scheduler UI */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Planification</h3>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={advancedCron} onChange={e => setAdvancedCron(e.target.checked)} />
                Mode avancé (cron)
              </label>
            </div>

            {!advancedCron ? (
              <div className="space-y-3">
                <Select label="Fréquence" value={freq} options={freqOptions}
                  onChange={e => setFreq(e.target.value)} />

                {freq === 'once' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Date" type="date" value={onceDate}
                      onChange={e => setOnceDate(e.target.value)} />
                    <Input label="Heure" type="time" value={onceTime}
                      onChange={e => setOnceTime(e.target.value)} />
                  </div>
                )}

                {freq !== 'once' && (
                  <div className="grid grid-cols-2 gap-3">
                    {freq !== 'hourly' && (
                      <Select label="Heure" value={hour} options={hours}
                        onChange={e => setHour(e.target.value)} />
                    )}
                    <Select label="Minute" value={minute} options={minutes}
                      onChange={e => setMinute(e.target.value)} />
                  </div>
                )}

                {freq === 'weekly' && (
                  <Select label="Jour de la semaine" value={dayOfWeek} options={dowOptions}
                    onChange={e => setDayOfWeek(e.target.value)} />
                )}

                {freq === 'monthly' && (
                  <Input label="Jour du mois (1-28)" type="number" min="1" max="28"
                    value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} />
                )}

                {/* Preview */}
                <div className="bg-slate-900 rounded-lg p-3 text-xs">
                  <p className="text-slate-400 mb-1">Résumé :</p>
                  <p className="text-blue-400 font-medium">
                    {describeFreq(freq, hour, minute, dayOfWeek, dayOfMonth, onceDate, onceTime)}
                  </p>
                  {freq !== 'once' && (
                    <p className="text-slate-600 font-mono mt-1">
                      cron: {buildCronExpression(freq, hour, minute, dayOfWeek, dayOfMonth, onceDate, onceTime)}
                    </p>
                  )}
                  {freq === 'once' && (
                    <p className="text-slate-500 mt-1">
                      Cette tâche sera automatiquement désactivée après son exécution.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input label="Expression cron (secondes incluses)" value={customCron}
                  placeholder="0 0 2 * * *" onChange={e => setCustomCron(e.target.value)} />
                <p className="text-xs text-slate-500">
                  Format : SEC MIN HEURE JOUR MOIS JOUR_SEMAINE<br/>
                  Exemple : <code className="text-blue-400">0 30 8 * * 1</code> = chaque lundi à 08h30
                </p>
              </div>
            )}
          </div>

          {/* Payload configuration */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Paramètres de la tâche</h3>
              <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
                <button type="button" onClick={() => setPayloadMode('simple')}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${payloadMode === 'simple' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  Simple
                </button>
                <button type="button" onClick={() => setPayloadMode('advanced')}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${payloadMode === 'advanced' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  Avancé (JSON)
                </button>
              </div>
            </div>

            {payloadMode === 'simple' ? (
              <div className="space-y-3">
                {/* Credential selector for backup/scan */}
                {(jobType === 'backup' || jobType === 'scan') && (
                  <Select label="Credential"
                    value={simpleCredentialId}
                    options={[{ value: '', label: 'Sélectionner un credential...' }, ...(credentials as any[]).map((c: any) => ({ value: c.id, label: c.name }))]}
                    onChange={e => setSimpleCredentialId(e.target.value)} />
                )}

                {/* Device selector for backup/playbook/ssh_command */}
                {needsDevices && (
                  <div>
                    <label className="text-xs font-medium text-slate-400 block mb-1">
                      Équipements ({selectedDevices.length} sélectionnés)
                    </label>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500">{selectedDevices.length}/{(devices as any[]).length}</span>
                      <button type="button" onClick={() => setSelectedDevices(selectedDevices.length === (devices as any[]).length ? [] : (devices as any[]).map((d: any) => d.id))}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        {selectedDevices.length === (devices as any[]).length ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto bg-slate-900 rounded p-2">
                      {(devices as any[]).map((d: any) => (
                        <button type="button" key={d.id}
                          onClick={() => setSelectedDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                          className={`px-2 py-0.5 rounded text-xs border ${selectedDevices.includes(d.id) ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                          {d.hostname || d.ip}
                        </button>
                      ))}
                      {(devices as any[]).length === 0 && (
                        <p className="text-xs text-slate-500">Aucun équipement. Lancez d'abord un scan réseau.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Backup: config type */}
                {jobType === 'backup' && (
                  <Select label="Type de configuration" value={simpleConfigType}
                    options={[{ value: 'running', label: 'Running config' }, { value: 'startup', label: 'Startup config' }]}
                    onChange={e => setSimpleConfigType(e.target.value)} />
                )}

                {/* Scan: CIDR */}
                {jobType === 'scan' && (
                  <Input label="Plage CIDR *" value={simpleCidr} placeholder="10.0.0.0/24"
                    onChange={e => setSimpleCidr(e.target.value)} />
                )}

                {/* Playbook: select playbook */}
                {jobType === 'playbook' && (
                  <Select label="Playbook à exécuter *" value={simplePlaybookId}
                    options={[{ value: '', label: 'Sélectionner un playbook...' }, ...(playbooks as any[]).map((p: any) => ({ value: p.id, label: p.name }))]}
                    onChange={e => setSimplePlaybookId(e.target.value)} />
                )}

                {/* SSH Command: commands textarea */}
                {jobType === 'ssh_command' && (
                  <div>
                    <label className="text-xs font-medium text-slate-400 block mb-1">
                      Commandes SSH (une par ligne) *
                    </label>
                    <textarea value={simpleCommands} onChange={e => setSimpleCommands(e.target.value)}
                      placeholder={"show version\nshow interfaces brief\nshow vlan"}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                      rows={4} />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Payload JSON (paramètres de la tâche)
                </label>
                <textarea value={editJob?.payload || ''}
                  onChange={e => setEditJob((j: any) => ({ ...j, payload: e.target.value }))}
                  placeholder={
                    jobType === 'backup' ? '{"device_ids": ["id1"], "config_type": "running"}' :
                    jobType === 'scan' ? '{"cidr": "10.0.0.0/24", "credential_id": ""}' :
                    jobType === 'playbook' ? '{"playbook_id": "id", "device_ids": ["id1"]}' :
                    '{"device_ids": ["id1"], "commands": ["show version"]}'
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                  rows={3} />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
