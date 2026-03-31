import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Trash2, FileCode, BookOpen, ChevronDown, ChevronRight, Copy, Terminal, Code } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import { getBackend } from '../lib/backend'
import { useGlobalCredential } from '../context/CredentialContext'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

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
  - name: Collecte ARP
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

// Convert simple commands to YAML playbook format
function commandsToYaml(name: string, description: string, commands: string): string {
  const cmds = commands.split('\n').map(s => s.trim()).filter(Boolean)
  if (cmds.length === 0) return ''
  const steps = cmds.map((cmd, i) => `  - name: Commande ${i + 1}
    command: ${cmd}
    on_error: continue`).join('\n\n')
  return `name: ${name || 'Playbook'}
description: ${description || ''}
timeout: 60s
steps:
${steps}
`
}

// Extract commands from YAML content (for switching to simple mode)
function yamlToCommands(yamlContent: string): string {
  const lines = yamlContent.split('\n')
  const commands: string[] = []
  for (const line of lines) {
    const match = line.match(/^\s+command:\s*(.+)$/)
    if (match) commands.push(match[1].trim())
  }
  return commands.join('\n')
}

type TermLine =
  | { type: 'device'; label: string; ip: string; index: number; total: number }
  | { type: 'step_start'; name: string; command: string; index: number; total: number }
  | { type: 'output'; text: string }
  | { type: 'step_ok'; name: string }
  | { type: 'step_err'; name: string; error: string }
  | { type: 'device_done'; label: string; status: string }

export default function PlaybookPage() {
  const qc = useQueryClient()
  const { globalCredId } = useGlobalCredential()
  const [showModal, setShowModal] = useState(false)
  const [editPb, setEditPb] = useState<any>(null)
  const [runModal, setRunModal] = useState<any>(null)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [results, setResults] = useState<any[]>([])
  const [termLines, setTermLines] = useState<TermLine[]>([])
  const [activeTab, setActiveTab] = useState<'playbooks' | 'guide'>('playbooks')
  const [openSection, setOpenSection] = useState<number | null>(0)
  const [copied, setCopied] = useState<string | null>(null)
  const termRef = useRef<HTMLDivElement>(null)

  // Simple vs Advanced mode for the editor
  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>('simple')
  const [simpleCommands, setSimpleCommands] = useState('')

  // Real-time playbook step events
  useEffect(() => {
    const handler = (data: any) => {
      if (data.type === 'device_start') {
        setTermLines(prev => [...prev, {
          type: 'device', label: data.device_label, ip: data.device_ip, index: 0, total: 0,
        }])
        return
      }
      if (!data.done) {
        // Step starting
        setTermLines(prev => [...prev, {
          type: 'step_start', name: data.step_name, command: data.command,
          index: data.step_index + 1, total: data.total_steps,
        }])
      } else {
        // Step done: output then status
        if (data.output?.trim()) {
          setTermLines(prev => [...prev, { type: 'output', text: data.output.trim() }])
        }
        if (data.passed) {
          setTermLines(prev => [...prev, { type: 'step_ok', name: data.step_name }])
        } else {
          setTermLines(prev => [...prev, { type: 'step_err', name: data.step_name, error: data.error || 'Échec' }])
        }
      }
    }
    EventsOn('playbook:step', handler)
    return () => { EventsOff('playbook:step') }
  }, [])

  // Listen for per-device completion events
  useEffect(() => {
    const handler = (data: any) => {
      setTermLines(prev => [...prev, { type: 'device_done', label: data.device_label || data.device_ip, status: data.status }])
    }
    EventsOn('playbook:progress', handler)
    return () => { EventsOff('playbook:progress') }
  }, [])

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [termLines])

  const { data: playbooks = [] } = useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => { const m = await getBackend(); return m.GetPlaybooks() },
  })
  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => { const m = await getBackend(); return m.GetDevices() },
  })

  const saveMutation = useMutation({
    mutationFn: async (pb: any) => {
      // In simple mode, convert commands to YAML before saving
      let content = pb.content
      if (editorMode === 'simple' && simpleCommands.trim()) {
        content = commandsToYaml(pb.name, pb.description, simpleCommands)
      }
      const m = await getBackend()
      return m.SavePlaybook({ ...pb, content })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['playbooks'] }); setShowModal(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const m = await getBackend(); return m.DeletePlaybook(id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbooks'] }),
  })
  const runMutation = useMutation({
    mutationFn: async () => {
      setTermLines([])
      setResults([])
      const m = await getBackend()
      return m.RunPlaybook({ playbook_id: runModal.id, device_ids: selectedDevices, credential_id: globalCredId })
    },
    onSuccess: (data: any) => setResults(data || []),
  })

  const handleCopyTemplate = (template: typeof PLAYBOOK_TEMPLATES[0]) => {
    setCopied(template.name)
    setEditPb({ name: template.name, description: template.description, content: template.content })
    setEditorMode('advanced')
    setShowModal(true)
    setTimeout(() => setCopied(null), 2000)
  }

  const openNewSimple = () => {
    setEditorMode('simple')
    setSimpleCommands('')
    setEditPb({ name: '', description: '', content: '' })
    setShowModal(true)
  }

  const openNewAdvanced = () => {
    setEditorMode('advanced')
    setSimpleCommands('')
    setEditPb({ content: PLAYBOOK_TEMPLATES[0].content })
    setShowModal(true)
  }

  const openEdit = (pb: any) => {
    const cmds = yamlToCommands(pb.content || '')
    setSimpleCommands(cmds)
    // Default to simple mode if it looks like a simple playbook (all on_error: continue, no expect)
    const hasExpect = (pb.content || '').includes('expect:')
    setEditorMode(hasExpect ? 'advanced' : 'simple')
    setEditPb(pb)
    setShowModal(true)
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
              <div className="flex gap-1">
                <Button variant="primary" onClick={openNewSimple}>
                  <Terminal className="w-4 h-4" /> Commandes rapides
                </Button>
                <Button variant="secondary" onClick={openNewAdvanced}>
                  <Code className="w-4 h-4" /> YAML avancé
                </Button>
              </div>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'playbooks' ? (
          <div className="space-y-4">
            {/* Playbook grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 content-start">
              {(playbooks as any[]).map((pb: any) => (
                <div key={pb.id} className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:bg-slate-900/60 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />
                  
                  <div className="relative z-10">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                        <FileCode className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <h3 className="font-bold text-slate-200 truncate">{pb.name}</h3>
                        {pb.description && <p className="text-xs text-slate-500 truncate mt-0.5" title={pb.description}>{pb.description}</p>}
                      </div>
                    </div>
                    
                    <pre className="text-[10px] text-slate-400 bg-slate-950/60 border border-slate-800/60 p-3 rounded-xl overflow-hidden max-h-28 font-mono shadow-inner custom-scrollbar mb-5 relative">
                      <div className="absolute top-0 right-0 px-2 py-0.5 bg-slate-800/80 rounded-bl-lg text-[9px] uppercase tracking-wider font-bold text-slate-500">YAML</div>
                      {pb.content}
                    </pre>
                    
                    <div className="flex justify-between items-center pt-4 border-t border-white/[0.04]">
                      <Button size="sm" variant="primary" onClick={() => { setRunModal(pb); setResults([]) }} className="shadow-indigo-500/20 px-4">
                        <Play className="w-3.5 h-3.5" /> Exécuter
                      </Button>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(pb)} className="hover:bg-blue-500/10 hover:text-blue-400 w-8 h-8 rounded-lg" title="Éditer">
                          <Code className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(pb.id)} className="hover:bg-red-500/10 hover:text-red-400 w-8 h-8 rounded-lg" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {(playbooks as any[]).length === 0 && (
                <div className="col-span-full md:col-span-2 lg:col-span-3">
                  <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl py-16 text-center shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                    <FileCode className="w-16 h-16 mx-auto mb-4 text-slate-600 drop-shadow-md" />
                    <p className="text-lg font-bold text-slate-300 mb-1">Aucun playbook trouvé</p>
                    <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">Automatisez vos tâches réseau en créant des playbooks. Utilisez le mode simple ou écrivez directement en YAML.</p>
                    <div className="flex justify-center gap-3 relative z-10">
                      <Button variant="primary" onClick={openNewSimple} className="shadow-blue-500/25">
                        <Terminal className="w-4 h-4" /> Créer en mode Simple
                      </Button>
                      <Button variant="secondary" onClick={openNewAdvanced}>
                        <Code className="w-4 h-4" /> Créer en mode Avancé
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Guide sections */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-1 shadow-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04] bg-slate-950/40">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Guide des playbooks
                </h2>
              </div>
              <div className="divide-y divide-white/[0.02]">
                {GUIDE_SECTIONS.map((section, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setOpenSection(openSection === i ? null : i)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors group">
                      <span className={`text-sm font-medium transition-colors ${openSection === i ? 'text-blue-400' : 'text-slate-300 group-hover:text-white'}`}>{section.title}</span>
                      {openSection === i ? <ChevronDown className="w-4 h-4 text-blue-400" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />}
                    </button>
                    {openSection === i && (
                      <div className="px-6 pb-5 pt-1">
                        <pre className="text-sm text-slate-400 whitespace-pre-wrap font-sans leading-relaxed bg-slate-950/30 p-4 rounded-xl border border-white/[0.02]">
                          {section.content}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Exemple YAML complet */}
              <div className="lg:col-span-1 bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-lg h-max">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Exemple Commenté
                </h3>
                <pre className="text-[11px] text-slate-400 bg-slate-950/80 p-4 rounded-xl font-mono leading-relaxed border border-white/[0.02] custom-scrollbar overflow-x-auto shadow-inner">{`name: Mon playbook
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
    expect: Clock is synchronized
    on_error: continue`}
                </pre>
              </div>

              {/* Templates */}
              <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-md border border-white/[0.05] rounded-2xl p-1 shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-white/[0.04] bg-slate-950/40 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Modèles prêts à l'emploi
                  </h2>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Créer à partir d'un modèle</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
                  {PLAYBOOK_TEMPLATES.map((t) => (
                    <div key={t.name} className="bg-slate-950/30 border border-white/[0.04] rounded-xl p-5 hover:border-slate-700 transition-colors group">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">{t.name}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.description}</p>
                        </div>
                        <Button size="icon" variant="secondary" onClick={() => handleCopyTemplate(t)} className="w-8 h-8 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Utiliser ce modèle">
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <pre className="text-[10px] text-slate-500 bg-slate-950/80 p-3 rounded-lg font-mono overflow-y-auto max-h-32 custom-scrollbar shadow-inner">
                        {t.content}
                      </pre>
                      {copied === t.name && (
                        <p className="text-xs text-emerald-400 font-bold tracking-wide mt-2 animate-in fade-in">Copié dans l'éditeur !</p>
                      )}
                    </div>
                  ))}
                </div>
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

          {/* Mode toggle */}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
            <button type="button" onClick={() => {
              if (editorMode === 'advanced' && editPb?.content) {
                setSimpleCommands(yamlToCommands(editPb.content))
              }
              setEditorMode('simple')
            }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${editorMode === 'simple' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Terminal className="w-3.5 h-3.5" /> Mode simple
            </button>
            <button type="button" onClick={() => {
              if (editorMode === 'simple' && simpleCommands.trim()) {
                setEditPb((p: any) => ({ ...p, content: commandsToYaml(p?.name || '', p?.description || '', simpleCommands) }))
              }
              setEditorMode('advanced')
            }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${editorMode === 'advanced' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Code className="w-3.5 h-3.5" /> Mode avancé (YAML)
            </button>
          </div>

          {editorMode === 'simple' ? (
            <div>
              <label className="text-xs font-medium text-slate-400">
                Commandes SSH (une par ligne) *
              </label>
              <p className="text-xs text-slate-500 mb-1">
                Saisissez les commandes à exécuter, une par ligne. Le playbook YAML sera généré automatiquement.
              </p>
              <textarea value={simpleCommands} onChange={e => setSimpleCommands(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md p-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                rows={8} required={!editPb?.content}
                placeholder={"show version\nshow running-config\nshow interfaces brief\nshow vlan brief"} />
              {simpleCommands.trim() && (
                <div className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-500">
                  {simpleCommands.split('\n').filter(s => s.trim()).length} commande(s) configurée(s)
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-400">Contenu YAML *</label>
              <textarea value={editPb?.content || ''} onChange={e => setEditPb((p: any) => ({ ...p, content: e.target.value }))}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                rows={14} required />
            </div>
          )}

          {saveMutation.error && (
            <p className="text-xs text-red-400">Erreur : {(saveMutation.error as any)?.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowModal(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={saveMutation.isPending}>Sauvegarder</Button>
          </div>
        </form>
      </Modal>

      {/* Run modal */}
      <Modal open={!!runModal} onClose={() => { setRunModal(null); setTermLines([]); setResults([]) }} title={`Exécuter : ${runModal?.name}`} size="lg">
        <div className="space-y-3">
          {/* Device selector — hidden while running */}
          {!runMutation.isPending && termLines.length === 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">{selectedDevices.length}/{(devices as any[]).length} équipements sélectionnés</p>
                <button onClick={() => setSelectedDevices(selectedDevices.length === (devices as any[]).length ? [] : (devices as any[]).map((d: any) => d.id))}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  {selectedDevices.length === (devices as any[]).length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(devices as any[]).map((d: any) => (
                  <button key={d.id}
                    onClick={() => setSelectedDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${selectedDevices.includes(d.id) ? 'bg-blue-600/20 border-blue-600 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                    {d.hostname || d.ip}
                  </button>
                ))}
              </div>
            </>
          )}

          <Button variant="primary" loading={runMutation.isPending}
            disabled={selectedDevices.length === 0} onClick={() => runMutation.mutate()}>
            <Play className="w-4 h-4" />
            {runMutation.isPending ? 'Exécution en cours…' : `Exécuter (${selectedDevices.length})`}
          </Button>

          {/* Terminal temps réel */}
          {(runMutation.isPending || termLines.length > 0) && (
            <div ref={termRef}
              className="bg-slate-950 border border-slate-800 rounded-lg p-3 h-80 overflow-y-auto font-mono text-xs space-y-0.5">
              {termLines.map((line, i) => {
                if (line.type === 'device') return (
                  <div key={i} className="text-cyan-400 mt-2 first:mt-0">
                    ── {line.label} ({line.ip}) — device {line.index}/{line.total} ──
                  </div>
                )
                if (line.type === 'step_start') return (
                  <div key={i} className="text-slate-400 mt-1">
                    <span className="text-slate-600">[{line.index}/{line.total}]</span>{' '}
                    <span className="text-slate-300">{line.name}</span>
                    {' '}<span className="text-blue-400">$ {line.command}</span>
                  </div>
                )
                if (line.type === 'output') return (
                  <pre key={i} className="text-slate-400 pl-4 whitespace-pre-wrap break-all leading-relaxed">
                    {line.text}
                  </pre>
                )
                if (line.type === 'step_ok') return (
                  <div key={i} className="text-green-400 pl-4">✓ {line.name}</div>
                )
                if (line.type === 'step_err') return (
                  <div key={i} className="text-red-400 pl-4">✗ {line.name} — {line.error}</div>
                )
                if (line.type === 'device_done') return (
                  <div key={i} className={`mt-1 font-medium ${line.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {line.status === 'success' ? '✓' : '✗'} {line.label} terminé ({line.status})
                  </div>
                )
                return null
              })}
              {runMutation.isPending && (
                <div className="text-slate-500 animate-pulse">▌</div>
              )}
            </div>
          )}

          {/* Résumé final (après exécution complète) */}
          {!runMutation.isPending && results.length > 0 && (
            <div className="text-xs text-slate-500 border-t border-slate-800 pt-2">
              {results.filter((r: any) => r.Status === 'success').length}/{results.length} équipements OK
              {results.some((r: any) => r.Status !== 'success') && (
                <span className="text-red-400 ml-2">
                  — Échecs : {results.filter((r: any) => r.Status !== 'success').map((r: any) => r.DeviceIP).join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
