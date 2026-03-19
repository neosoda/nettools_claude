import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Trash2, FileCode, BookOpen, ChevronDown, ChevronRight, Copy, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'

async function getBackend() { return import('../../wailsjs/go/main/App') }

// ── Exemples de playbooks prêts à l'emploi ──────────────────────────────────
const PLAYBOOK_TEMPLATES = [
  {
    name: 'Inventaire rapide',
    description: 'Collecte version, uptime et interfaces',
    content: `name: Inventaire rapide
description: Collecte les informations de base de l'équipement
timeout: 60s
steps:
  - name: Version du système
    command: show version
    on_error: continue

  - name: Uptime
    command: show uptime
    on_error: continue

  - name: Interfaces
    command: show interfaces brief
    on_error: continue
`,
  },
  {
    name: 'Vérification sécurité',
    description: 'Contrôle SSH, Telnet, banner, NTP',
    content: `name: Vérification sécurité
description: Vérifie la configuration de sécurité
timeout: 90s
steps:
  - name: Version SSH
    command: show ip ssh
    on_error: continue

  - name: Lignes VTY
    command: show line vty 0 4
    on_error: continue

  - name: Banner
    command: show banner login
    on_error: continue

  - name: NTP
    command: show ntp status
    on_error: continue

  - name: Journalisation
    command: show logging
    on_error: continue
`,
  },
  {
    name: 'Sauvegarde VLAN',
    description: 'Exporte la configuration VLAN',
    content: `name: Sauvegarde VLAN
description: Collecte la configuration VLAN de l'équipement
timeout: 60s
steps:
  - name: Liste des VLANs
    command: show vlan brief
    on_error: continue

  - name: Détail VLANs
    command: show vlan
    on_error: continue

  - name: Interfaces trunk
    command: show interfaces trunk
    on_error: continue
`,
  },
  {
    name: 'Diagnostic réseau',
    description: 'Table ARP, routes, voisins',
    content: `name: Diagnostic réseau
description: Collecte les tables de routage et voisinage
timeout: 90s
steps:
  - name: Table ARP
    command: show arp
    on_error: continue

  - name: Table de routage
    command: show ip route
    on_error: continue

  - name: Voisins CDP/LLDP
    command: show cdp neighbors
    on_error: continue

  - name: Statistiques interfaces
    command: show interfaces counters errors
    on_error: continue
`,
  },
]

const GUIDE_SECTIONS = [
  {
    title: "Qu'est-ce qu'un playbook ?",
    content: `Un playbook est une séquence de commandes SSH à exécuter automatiquement sur un ou plusieurs équipements réseau. Il permet d'automatiser des tâches répétitives comme :

• La collecte d'informations (versions, configurations, statistiques)
• Les vérifications de conformité
• L'application de modifications de configuration
• La génération de rapports

Le playbook est défini en YAML, un format texte simple et lisible.`,
  },
  {
    title: 'Structure d\'un playbook',
    content: `Un playbook YAML contient :

name: Nom du playbook (obligatoire)
description: Description optionnelle
timeout: Délai maximum (ex: 60s, 2m)
steps:
  - name: Nom de l'étape
    command: commande SSH à exécuter
    expect: texte attendu dans la réponse (optionnel)
    on_error: continue | abort

• on_error: continue → passe à l'étape suivante en cas d'échec
• on_error: abort → stoppe le playbook en cas d'échec
• expect → vérifie que la sortie contient un texte précis`,
  },
  {
    title: 'Bonnes pratiques',
    content: `✓ Commencer par "show version" pour confirmer la connexion
✓ Utiliser on_error: continue pour les playbooks de collecte
✓ Utiliser on_error: abort pour les playbooks de configuration
✓ Tester sur un seul équipement avant de lancer en masse
✓ Nommer clairement chaque étape pour faciliter la lecture des résultats
✓ Fixer un timeout adapté (60s pour collecte, 120s pour config)`,
  },
]

export default function PlaybookPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editPb, setEditPb] = useState<any>(null)
  const [runModal, setRunModal] = useState<any>(null)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [results, setResults] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'playbooks' | 'guide'>('playbooks')
  const [openSection, setOpenSection] = useState<number | null>(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data: playbooks = [] } = useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => { const m = await getBackend(); return m.GetPlaybooks() },
  })
  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })

  const saveMutation = useMutation({
    mutationFn: async (pb: any) => { const m = await getBackend(); return m.SavePlaybook(pb) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['playbooks'] }); setShowModal(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeletePlaybook(id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbooks'] }),
  })
  const runMutation = useMutation({
    mutationFn: async () => {
      const m = await getBackend()
      return m.RunPlaybook({ playbook_id: runModal.id, device_ids: selectedDevices })
    },
    onSuccess: (data: any) => setResults(data || []),
  })

  const handleCopyTemplate = (template: typeof PLAYBOOK_TEMPLATES[0]) => {
    setCopied(template.name)
    setEditPb({ name: template.name, description: template.description, content: template.content })
    setShowModal(true)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Playbooks SSH"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant={activeTab === 'playbooks' ? 'primary' : 'secondary'} onClick={() => setActiveTab('playbooks')}>
              <FileCode className="w-3.5 h-3.5" /> Mes playbooks
            </Button>
            <Button size="sm" variant={activeTab === 'guide' ? 'primary' : 'secondary'} onClick={() => setActiveTab('guide')}>
              <BookOpen className="w-3.5 h-3.5" /> Guide & Exemples
            </Button>
            {activeTab === 'playbooks' && (
              <Button variant="primary" onClick={() => { setEditPb({ content: PLAYBOOK_TEMPLATES[0].content }); setShowModal(true) }}>
                <Plus className="w-4 h-4" /> Nouveau
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'playbooks' ? (
          <div className="space-y-4">
            {/* Playbook grid */}
            <div className="grid grid-cols-3 gap-4 content-start">
              {(playbooks as any[]).map((pb: any) => (
                <div key={pb.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div>
                    <FileCode className="w-4 h-4 text-blue-400 mb-1" />
                    <h3 className="font-medium text-white">{pb.name}</h3>
                    {pb.description && <p className="text-xs text-slate-500 mt-0.5">{pb.description}</p>}
                  </div>
                  <pre className="text-xs text-slate-500 bg-slate-950 p-2 rounded overflow-hidden max-h-24 font-mono">
                    {pb.content}
                  </pre>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => { setRunModal(pb); setResults([]) }}>
                      <Play className="w-3.5 h-3.5" /> Run
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditPb(pb); setShowModal(true) }}>Éditer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(pb.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
              {(playbooks as any[]).length === 0 && (
                <div className="col-span-3 text-center py-16 text-slate-500">
                  <FileCode className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Aucun playbook. Créez-en un ou utilisez un exemple du Guide.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl">
            {/* Guide sections */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300">Guide des playbooks</h2>
              </div>
              <div className="divide-y divide-slate-800">
                {GUIDE_SECTIONS.map((section, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setOpenSection(openSection === i ? null : i)}
                      className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-800/50 transition-colors">
                      <span className="text-sm font-medium text-slate-200">{section.title}</span>
                      {openSection === i ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </button>
                    {openSection === i && (
                      <div className="px-5 pb-4">
                        <pre className="text-sm text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
                          {section.content}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Exemple YAML complet */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Exemple complet commenté</h3>
              <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-lg font-mono leading-relaxed">{`name: Mon playbook
description: Description de ce que fait ce playbook
timeout: 120s        # Délai max total

steps:
  - name: Vérification connexion
    command: show version
    on_error: abort  # Arrête si pas de connexion

  - name: Collecte VLANs
    command: show vlan brief
    on_error: continue  # Continue même si erreur

  - name: Vérification NTP
    command: show ntp status
    expect: Clock is synchronized  # Vérifie la présence de ce texte
    on_error: continue`}
              </pre>
            </div>

            {/* Templates */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300">Modèles prêts à l'emploi</h2>
                <p className="text-xs text-slate-500 mt-0.5">Cliquez sur "Utiliser" pour créer un playbook à partir du modèle</p>
              </div>
              <div className="grid grid-cols-2 gap-4 p-4">
                {PLAYBOOK_TEMPLATES.map((t) => (
                  <div key={t.name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-medium text-white">{t.name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => handleCopyTemplate(t)}>
                        <Copy className="w-3.5 h-3.5" />
                        {copied === t.name ? 'Copié !' : 'Utiliser'}
                      </Button>
                    </div>
                    <pre className="text-xs text-slate-500 bg-slate-950 p-2 rounded font-mono overflow-y-auto max-h-48">
                      {t.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Playbook" size="lg">
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editPb) }} className="space-y-3">
          <Input label="Nom *" value={editPb?.name || ''} required
            onChange={e => setEditPb((p: any) => ({ ...p, name: e.target.value }))} />
          <Input label="Description" value={editPb?.description || ''}
            onChange={e => setEditPb((p: any) => ({ ...p, description: e.target.value }))} />
          <div>
            <label className="text-xs font-medium text-slate-400">Contenu YAML *</label>
            <textarea value={editPb?.content || ''} onChange={e => setEditPb((p: any) => ({ ...p, content: e.target.value }))}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
              rows={14} required />
          </div>
          {saveMutation.error && (
            <p className="text-xs text-red-400">Erreur : {(saveMutation.error as any)?.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>Sauvegarder</Button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmer la suppression" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-300">Voulez-vous vraiment supprimer ce playbook ? Cette action est irréversible.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button variant="danger" loading={deleteMutation.isPending}
              onClick={() => { if (confirmDelete) { deleteMutation.mutate(confirmDelete); setConfirmDelete(null) } }}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Run modal */}
      <Modal open={!!runModal} onClose={() => setRunModal(null)} title={`Exécuter : ${runModal?.name}`} size="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-400">{selectedDevices.length}/{(devices as any[]).length} équipements</p>
            <button onClick={() => setSelectedDevices(selectedDevices.length === (devices as any[]).length ? [] : (devices as any[]).map((d: any) => d.id))}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              {selectedDevices.length === (devices as any[]).length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(devices as any[]).map((d: any) => (
              <button key={d.id}
                onClick={() => setSelectedDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                className={`px-2 py-1 rounded text-xs border ${selectedDevices.includes(d.id) ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {d.hostname || d.ip}
              </button>
            ))}
          </div>
          <Button variant="primary" loading={runMutation.isPending}
            disabled={selectedDevices.length === 0} onClick={() => runMutation.mutate()}>
            <Play className="w-4 h-4" /> Exécuter ({selectedDevices.length})
          </Button>
          {results.map((r: any, i: number) => (
            <div key={i} className="bg-slate-950 rounded-lg p-3">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-white">{r.DeviceIP}</span>
                <span className={r.Status === 'success' ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>{r.Status}</span>
              </div>
              {(r.Steps || []).map((s: any, j: number) => (
                <div key={j} className="mb-2 border-l-2 border-slate-700 pl-3">
                  <p className="text-xs text-slate-400">
                    {s.passed ? '✓' : '✗'} <span className="text-slate-300">{s.name}</span>
                    {' '}<code className="text-blue-400 font-mono">{s.command}</code>
                  </p>
                  {s.output && (
                    <pre className="text-xs text-slate-400 pl-2 mt-1 max-h-24 overflow-y-auto font-mono bg-slate-900 p-2 rounded">
                      {s.output}
                    </pre>
                  )}
                  {s.error && <p className="text-xs text-red-400 pl-2">{s.error}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
