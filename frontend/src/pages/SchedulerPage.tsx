import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CalendarClock, Info } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/utils'

async function getBackend() { return import('../../wailsjs/go/main/App') }

// Convert UI form to cron expression (second-precision: "SEC MIN HOUR DOM MON DOW")
function buildCronExpression(freq: string, hour: string, minute: string, dayOfWeek: string, dayOfMonth: string): string {
  const h = parseInt(hour) || 0
  const m = parseInt(minute) || 0
  switch (freq) {
    case 'hourly':  return `0 ${m} * * * *`
    case 'daily':   return `0 ${m} ${h} * * *`
    case 'weekly':  return `0 ${m} ${h} * * ${dayOfWeek}`
    case 'monthly': return `0 ${m} ${h} ${dayOfMonth} * *`
    default:        return '0 0 2 * * *'
  }
}

function describeFreq(freq: string, hour: string, minute: string, dow: string, dom: string): string {
  const h = parseInt(hour) || 0
  const m = parseInt(minute) || 0
  const time = `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  switch (freq) {
    case 'hourly':  return `Toutes les heures à :${String(m).padStart(2,'0')}`
    case 'daily':   return `Tous les jours à ${time}`
    case 'weekly':  return `Chaque ${days[parseInt(dow)] || '?'} à ${time}`
    case 'monthly': return `Le ${dom} du mois à ${time}`
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

  const { data: jobs = [] } = useQuery({
    queryKey: ['scheduled-jobs'],
    queryFn: async () => { const m = await getBackend(); return m.GetScheduledJobs() },
  })

  const saveMutation = useMutation({
    mutationFn: async (job: any) => { const m = await getBackend(); return m.SaveScheduledJob(job) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }); setShowModal(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeleteScheduledJob(id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const m = await getBackend(); return m.ToggleScheduledJob(id, enabled)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })

  const openNewModal = () => {
    setFreq('daily'); setHour('2'); setMinute('0'); setDayOfWeek('1'); setDayOfMonth('1')
    setCustomCron('0 0 2 * * *'); setAdvancedCron(false)
    setEditJob({ enabled: true, job_type: 'backup', payload: '{"device_ids":[]}' })
    setShowModal(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const cron = advancedCron ? customCron : buildCronExpression(freq, hour, minute, dayOfWeek, dayOfMonth)
    saveMutation.mutate({ ...editJob, cron_expression: cron })
  }

  const jobTypeOptions = [
    { value: 'backup', label: 'Backup de configuration' },
    { value: 'scan', label: 'Scan réseau' },
  ]
  const freqOptions = [
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
                  <td className="p-4 text-slate-400">
                    {job.job_type === 'backup' ? 'Backup' : 'Scan réseau'}
                  </td>
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
                  <td className="p-4">
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

                <div className="grid grid-cols-2 gap-3">
                  {freq !== 'hourly' && (
                    <Select label="Heure" value={hour} options={hours}
                      onChange={e => setHour(e.target.value)} />
                  )}
                  <Select label="Minute" value={minute} options={minutes}
                    onChange={e => setMinute(e.target.value)} />
                </div>

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
                    {describeFreq(freq, hour, minute, dayOfWeek, dayOfMonth)}
                  </p>
                  <p className="text-slate-600 font-mono mt-1">
                    cron: {buildCronExpression(freq, hour, minute, dayOfWeek, dayOfMonth)}
                  </p>
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

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Payload JSON (paramètres de la tâche)
            </label>
            <textarea value={editJob?.payload || ''}
              onChange={e => setEditJob((j: any) => ({ ...j, payload: e.target.value }))}
              placeholder={editJob?.job_type === 'backup'
                ? '{"device_ids": ["id1", "id2"], "config_type": "running"}'
                : '{"cidr": "10.0.0.0/24", "credential_id": ""}'}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
              rows={3} />
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
