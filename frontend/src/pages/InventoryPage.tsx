import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, Plug, RefreshCw, Eraser, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import StatusBadge from '../components/StatusBadge'
import { formatDate } from '../lib/utils'
import { useToast } from '../components/Toast'

// We use dynamic import to avoid issues at startup if wailsjs not generated yet
async function getBackend() {
  const m = await import('../../wailsjs/go/main/App')
  return m
}

interface Device {
  id: string; ip: string; hostname: string; vendor: string; model: string
  os_version: string; location: string; ssh_port: number; credential_id: string
  last_seen_at?: string; created_at: string
}

interface Credential {
  id: string; name: string; username: string
}

const vendorOptions = [
  { value: 'cisco', label: 'Cisco' },
  { value: 'aruba', label: 'Aruba/HP' },
  { value: 'allied', label: 'Allied Telesis' },
  { value: 'unknown', label: 'Inconnu' },
]

export default function InventoryPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [editDevice, setEditDevice] = useState<Partial<Device> | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const m = await getBackend()
      return m.GetDevices()
    },
  })

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: async () => {
      const m = await getBackend()
      return m.GetCredentials()
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (device: Partial<Device>) => {
      const m = await getBackend()
      return m.SaveDevice(device as any)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setShowModal(false)
      setEditDevice(null)
      toast('Équipement sauvegardé', 'success')
    },
    onError: (e: any) => toast(`Erreur: ${e?.message || e}`, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const m = await getBackend()
      return m.DeleteDevice(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setConfirmDelete(null)
      toast('Équipement supprimé', 'success')
    },
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const m = await getBackend()
      return m.ClearInventory()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setConfirmClear(false)
      toast('Inventaire vidé', 'success')
    },
  })

  const handleTest = async (deviceId: string) => {
    setTesting(deviceId)
    try {
      const m = await getBackend()
      const result = await m.TestDeviceConnection(deviceId)
      setTesting(null)
      if (result.success) {
        toast('Connexion SSH réussie', 'success')
      } else {
        toast(`Échec SSH: ${result.error}`, 'error')
      }
    } catch (e: any) {
      setTesting(null)
      toast(`Erreur: ${e?.message || e}`, 'error')
    }
  }

  const filtered = devices.filter((d: Device) =>
    !search || d.ip?.includes(search) || d.hostname?.toLowerCase().includes(search.toLowerCase())
  )

  const credOptions = [
    { value: '', label: '— Aucune —' },
    ...(credentials as Credential[]).map((c: Credential) => ({ value: c.id, label: c.name })),
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Inventaire"
        description={`${devices.length} équipements`}
        actions={
          <div className="flex gap-2">
            <Input
              placeholder="Rechercher IP/hostname..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-48 py-1.5"
            />
            {!confirmClear ? (
              <Button variant="ghost" onClick={() => setConfirmClear(true)} title="Vider l'inventaire">
                <Eraser className="w-4 h-4 text-red-400" />
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-400 mr-1">Vider tout ?</span>
                <Button size="sm" variant="ghost" onClick={() => clearMutation.mutate()} loading={clearMutation.isPending}>
                  <span className="text-red-400">Oui</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Non</Button>
              </div>
            )}
            <Button
              variant="primary"
              onClick={() => { setEditDevice({ ssh_port: 22, vendor: 'cisco' }); setShowModal(true) }}
            >
              <Plus className="w-4 h-4" /> Ajouter
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left pb-2 pl-2 font-medium">IP</th>
                <th className="text-left pb-2 font-medium">Hostname</th>
                <th className="text-left pb-2 font-medium">Vendor</th>
                <th className="text-left pb-2 font-medium">Modèle</th>
                <th className="text-left pb-2 font-medium">Location</th>
                <th className="text-left pb-2 font-medium">Vu le</th>
                <th className="text-left pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((device: Device) => (
                <tr key={device.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pl-2 font-mono text-blue-400">{device.ip}</td>
                  <td className="py-2.5 text-slate-200">{device.hostname || '—'}</td>
                  <td className="py-2.5">
                    <span className="text-xs bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                      {device.vendor || 'unknown'}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-400">{device.model || '—'}</td>
                  <td className="py-2.5 text-slate-400">{device.location || '—'}</td>
                  <td className="py-2.5 text-slate-500 text-xs">{formatDate(device.last_seen_at || '')}</td>
                  <td className="py-2.5">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditDevice(device); setShowModal(true) }}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" loading={testing === device.id} onClick={() => handleTest(device.id)}>
                        <Plug className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(device.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Aucun équipement. Ajoutez-en un ou lancez une découverte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm delete */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmer la suppression" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-300">Voulez-vous vraiment supprimer cet équipement ?</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button variant="danger" loading={deleteMutation.isPending}
              onClick={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete) }}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditDevice(null) }}
        title={editDevice?.id ? 'Modifier équipement' : 'Ajouter équipement'}>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editDevice!) }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Adresse IP *" value={editDevice?.ip || ''} required
              onChange={e => setEditDevice(d => ({ ...d, ip: e.target.value }))} />
            <Input label="Hostname" value={editDevice?.hostname || ''}
              onChange={e => setEditDevice(d => ({ ...d, hostname: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Vendor" value={editDevice?.vendor || 'unknown'} options={vendorOptions}
              onChange={e => setEditDevice(d => ({ ...d, vendor: e.target.value }))} />
            <Input label="Modèle" value={editDevice?.model || ''}
              onChange={e => setEditDevice(d => ({ ...d, model: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Port SSH" type="number" value={editDevice?.ssh_port || 22}
              onChange={e => setEditDevice(d => ({ ...d, ssh_port: parseInt(e.target.value) }))} />
            <Input label="Location" value={editDevice?.location || ''}
              onChange={e => setEditDevice(d => ({ ...d, location: e.target.value }))} />
          </div>
          <Select label="Credentials SSH/SNMP" value={editDevice?.credential_id || ''} options={credOptions}
            onChange={e => setEditDevice(d => ({ ...d, credential_id: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>Sauvegarder</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
