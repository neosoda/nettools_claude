import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Input from '../components/Input'
import Select from '../components/Select'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'

async function getBackend() { return import('../../wailsjs/go/main/App') }

export default function SettingsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [settings, setSettings] = useState<any>(null)
  const [showCredModal, setShowCredModal] = useState(false)
  const [editCred, setEditCred] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data: fetchedSettings } = useQuery({ queryKey: ['settings'], queryFn: async () => { const m = await getBackend(); return m.GetSettings() } })
  const { data: credentials = [], refetch: refetchCreds } = useQuery({ queryKey: ['credentials'], queryFn: async () => { const m = await getBackend(); return m.GetCredentials() } })

  useEffect(() => { if (fetchedSettings && !settings) setSettings(fetchedSettings) }, [fetchedSettings])

  const saveMutation = useMutation({
    mutationFn: async (s: any) => { const m = await getBackend(); return m.SaveSettings(s) },
    onSuccess: () => toast('Paramètres sauvegardés', 'success'),
    onError: (e: any) => toast(`Erreur : ${e?.message || e}`, 'error'),
  })
  const saveCredMutation = useMutation({
    mutationFn: async (cred: any) => { const m = await getBackend(); return m.SaveCredential(cred) },
    onSuccess: () => { refetchCreds(); setShowCredModal(false); toast('Credential sauvegardé', 'success') },
    onError: (e: any) => toast(`Erreur : ${e?.message || e}`, 'error'),
  })
  const deleteCredMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeleteCredential(id) },
    onSuccess: () => { refetchCreds(); setConfirmDelete(null); toast('Credential supprimé', 'success') },
    onError: (e: any) => toast(`Erreur : ${e?.message || e}`, 'error'),
  })

  const themeOpts = [{ value: 'dark', label: 'Sombre' }, { value: 'light', label: 'Clair' }]
  const langOpts = [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]
  const snmpOpts = [{ value: 'v2c', label: 'SNMPv2c' }, { value: 'v3', label: 'SNMPv3' }]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Paramètres" />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
        {settings && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300">Général</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Thème" value={settings.theme} options={themeOpts} onChange={e => setSettings((s: any) => ({ ...s, theme: e.target.value }))} />
              <Select label="Langue" value={settings.language} options={langOpts} onChange={e => setSettings((s: any) => ({ ...s, language: e.target.value }))} />
              <Input label="Workers max" type="number" value={settings.max_workers} onChange={e => setSettings((s: any) => ({ ...s, max_workers: parseInt(e.target.value) }))} />
              <Input label="Rétention logs (j)" type="number" value={settings.log_retention_days} onChange={e => setSettings((s: any) => ({ ...s, log_retention_days: parseInt(e.target.value) }))} />
            </div>
            <Input label="Répertoire backups" value={settings.backup_dir} onChange={e => setSettings((s: any) => ({ ...s, backup_dir: e.target.value }))} />
            <Button variant="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate(settings)}><Save className="w-4 h-4" /> Sauvegarder</Button>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-300">Credentials ({(credentials as any[]).length})</h2>
            <Button size="sm" variant="primary" onClick={() => { setEditCred({ snmp_version: 'v2c' }); setShowCredModal(true) }}>+ Ajouter</Button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 border-b border-slate-800">
              <th className="text-left p-3">Nom</th><th className="text-left p-3">Utilisateur</th>
              <th className="text-left p-3">SSH</th><th className="text-left p-3">SNMP</th><th className="text-left p-3">Actions</th>
            </tr></thead>
            <tbody>
              {(credentials as any[]).map((c: any) => (
                <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-3 font-medium text-white">{c.name}</td>
                  <td className="p-3 text-slate-400">{c.username || '—'}</td>
                  <td className="p-3 text-xs">
                    {c.has_password && <span className="text-green-400">✓ Password</span>}
                    {c.has_private_key && <span className="text-green-400 ml-2">✓ Key</span>}
                    {!c.has_password && !c.has_private_key && <span className="text-slate-500">—</span>}
                  </td>
                  <td className="p-3 text-xs">{c.has_snmp_community ? <span className="text-green-400">✓ Community</span> : <span className="text-slate-500">—</span>}</td>
                  <td className="p-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditCred(c); setShowCredModal(true) }}>Éditer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(c.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showCredModal} onClose={() => setShowCredModal(false)} title="Credential" size="lg">
        <form onSubmit={e => { e.preventDefault(); saveCredMutation.mutate(editCred) }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nom *" value={editCred?.name || ''} required onChange={e => setEditCred((c: any) => ({ ...c, name: e.target.value }))} />
            <Input label="Utilisateur SSH" value={editCred?.username || ''} onChange={e => setEditCred((c: any) => ({ ...c, username: e.target.value }))} />
          </div>
          <Input label="Mot de passe SSH" type="password" value={editCred?.password || ''} placeholder={editCred?.has_password ? '(inchangé)' : ''} onChange={e => setEditCred((c: any) => ({ ...c, password: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="SNMP" value={editCred?.snmp_version || 'v2c'} options={snmpOpts} onChange={e => setEditCred((c: any) => ({ ...c, snmp_version: e.target.value }))} />
            <Input label="Community SNMP" type="password" value={editCred?.snmp_community || ''} placeholder={editCred?.has_snmp_community ? '(inchangée)' : ''} onChange={e => setEditCred((c: any) => ({ ...c, snmp_community: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setShowCredModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveCredMutation.isPending}>Sauvegarder</Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmer la suppression" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Voulez-vous vraiment supprimer ce credential ? Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button variant="danger" loading={deleteCredMutation.isPending}
              onClick={() => confirmDelete && deleteCredMutation.mutate(confirmDelete)}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
