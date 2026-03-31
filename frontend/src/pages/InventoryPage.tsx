import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, Plug, RefreshCw, Eraser } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Select from '../components/Select'
import { formatDate } from '../lib/utils'
import backend from '../lib/backend'
import { useToast } from '../components/Toast'

interface Device {
  id: string; ip: string; hostname: string; vendor: string; model: string
  os_version: string; location: string; ssh_port: number; credential_id: string
  last_seen_at: string; created_at: string
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => backend.GetDevices(),
  })

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => backend.GetCredentials(),
  })

  const saveMutation = useMutation({
    mutationFn: (device: Partial<Device>) => backend.SaveDevice(device as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setShowModal(false)
      setEditDevice(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => backend.DeleteDevice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  })

  const clearMutation = useMutation({
    mutationFn: () => backend.ClearInventory(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setConfirmClear(false)
    },
  })

  const handleTest = async (deviceId: string) => {
    setTesting(deviceId)
    const result = await backend.TestDeviceConnection(deviceId)
    setTesting(null)
    toast(result.success ? 'Connexion SSH réussie' : 'Échec: ' + result.error, result.success ? 'success' : 'error')
  }

  const filtered = (devices as Device[]).filter(d =>
    !search || d.ip?.includes(search) || d.hostname?.toLowerCase().includes(search.toLowerCase())
  )

  const credOptions = [
    { value: '', label: '— Aucune —' },
    ...(credentials as Credential[]).map(c => ({ value: c.id, label: c.name })),
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Inventaire"
        description={`${(devices as Device[]).length} équipements`}
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

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl shadow-xl overflow-hidden flex flex-col h-full max-h-[800px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-sm font-medium animate-pulse">Chargement de l'inventaire...</span>
            </div>
          ) : (
            <div className="overflow-x-auto flex-1 custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-white/[0.04] text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <th className="text-left py-3 px-5 font-bold">Adresse IP</th>
                    <th className="text-left py-3 px-5 font-bold">Hostname</th>
                    <th className="text-left py-3 px-5 font-bold">Système/Modèle</th>
                    <th className="text-left py-3 px-5 font-bold">Localisation</th>
                    <th className="text-left py-3 px-5 font-bold">Dernière Vue</th>
                    <th className="text-right py-3 px-5 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
              {filtered.map(device => (
                <tr key={device.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-3 px-5">
                    <span className="font-mono text-blue-400 font-medium bg-blue-500/5 px-2 py-1 rounded-md border border-blue-500/10 group-hover:border-blue-500/30 transition-colors">
                      {device.ip}
                    </span>
                  </td>
                  <td className="py-3 px-5 font-medium text-slate-200">
                    {device.hostname || <span className="text-slate-600 italic">Non défini</span>}
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                        {device.vendor || 'Unknown'}
                      </span>
                      <span className="text-xs text-slate-300">{device.model || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5 text-slate-400 text-sm">{device.location || '—'}</td>
                  <td className="py-3 px-5 text-slate-500 text-xs font-medium">{formatDate(device.last_seen_at)}</td>
                  <td className="py-3 px-5">
                    <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" onClick={() => { setEditDevice(device); setShowModal(true) }} className="w-8 h-8 rounded bg-white/[0.02]">
                        <Edit className="w-4 h-4 text-blue-400" />
                      </Button>
                      <Button size="icon" variant="ghost" loading={testing === device.id} onClick={() => handleTest(device.id)} className="w-8 h-8 rounded bg-white/[0.02]">
                        <Plug className="w-4 h-4 text-emerald-400" />
                      </Button>
                      {confirmDeleteId === device.id ? (
                        <div className="flex items-center bg-red-500/10 rounded border border-red-500/20 px-1">
                          <Button size="sm" variant="ghost" onClick={() => { deleteMutation.mutate(device.id); setConfirmDeleteId(null) }} className="text-red-400 hover:text-red-300 p-1 text-xs font-bold">OK</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)} className="text-slate-400 hover:text-slate-300 p-1 text-xs">X</Button>
                        </div>
                      ) : (
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDeleteId(device.id)} className="w-8 h-8 rounded bg-white/[0.02]">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2">
                       <span className="text-slate-500 font-medium">Aucun équipement correspondant.</span>
                       <span className="text-slate-600 text-sm">Ajoutez-en un ou lancez une découverte réseau.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        </div>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditDevice(null) }}
        title={editDevice?.id ? 'Modifier équipement' : 'Ajouter équipement'}>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editDevice!) }} className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <Input label="Adresse IP" value={editDevice?.ip || ''} required
              onChange={e => setEditDevice(d => ({ ...d, ip: e.target.value }))} />
            <Input label="Hostname" value={editDevice?.hostname || ''}
              onChange={e => setEditDevice(d => ({ ...d, hostname: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-5 border-t border-white/[0.04] pt-4">
            <Select label="Constructeur (Vendor)" value={editDevice?.vendor || 'unknown'} options={vendorOptions}
              onChange={e => setEditDevice(d => ({ ...d, vendor: e.target.value }))} />
            <Input label="Modèle exact" value={editDevice?.model || ''}
              onChange={e => setEditDevice(d => ({ ...d, model: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <Input label="Port SSH" type="number" value={editDevice?.ssh_port || 22}
              onChange={e => setEditDevice(d => ({ ...d, ssh_port: parseInt(e.target.value) }))} />
            <Input label="Emplacement (Location)" value={editDevice?.location || ''}
              onChange={e => setEditDevice(d => ({ ...d, location: e.target.value }))} />
          </div>
          <div className="bg-slate-950/30 p-4 rounded-xl border border-white/[0.02]">
            <Select label="Credentials SSH/SNMP Liés" value={editDevice?.credential_id || ''} options={credOptions}
              onChange={e => setEditDevice(d => ({ ...d, credential_id: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.04]">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending} className="px-6">Sauvegarder</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
