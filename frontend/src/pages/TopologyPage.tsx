import { useEffect, useState } from 'react'
import ReactFlow, { Node, Edge, Controls, MiniMap, Background, useNodesState, useEdgesState, BackgroundVariant, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Radio } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'
import { getBackend } from '../lib/backend'

function vendorColor(vendor: string) {
  switch (vendor) {
    case 'cisco': return '#2563eb'
    case 'aruba': return '#7c3aed'
    case 'allied': return '#059669'
    default: return '#475569'
  }
}

function edgeStyle(linkType: string) {
  switch (linkType) {
    case 'trunk':
      return { stroke: '#f59e0b', strokeWidth: 3 }
    case 'access':
      return { stroke: '#334155', strokeWidth: 1.5 }
    case 'subnet':
      return { stroke: '#1e3a5f', strokeWidth: 1, strokeDasharray: '5 4' }
    default:
      return { stroke: '#334155', strokeWidth: 1.5 }
  }
}

export default function TopologyPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [lldpLoading, setLldpLoading] = useState(false)
  const [lldpError, setLldpError] = useState<string | null>(null)

  const { data: graph, isLoading, refetch } = useQuery({
    queryKey: ['topology'],
    queryFn: async () => { const m = await getBackend(); return m.GetTopology() },
  })

  useEffect(() => {
    if (!graph) return
    const flowNodes: Node[] = (graph.nodes || []).map((n: any, i: number) => ({
      id: n.id,
      position: { x: (i % 5) * 220 + 50, y: Math.floor(i / 5) * 160 + 50 },
      data: {
        label: (
          <div className="text-center p-1">
            <div className="text-xs font-mono font-bold" style={{ color: vendorColor(n.vendor) }}>{n.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{n.ip}</div>
            {n.hint?.show_poe_icon && (
              <div className="text-xs mt-0.5" style={{ color: n.hint.terminal_color === 'green' ? '#22c55e' : '#3b82f6' }}>⚡PoE</div>
            )}
          </div>
        ),
      },
      style: { background: '#1e293b', border: `1.5px solid ${vendorColor(n.vendor)}`, borderRadius: '8px', padding: '4px', width: 140 },
    }))
    setNodes(flowNodes)
    setEdges((graph.edges || []).map((e: any) => {
      const lt: string = e.link_type || 'unknown'
      const style = edgeStyle(lt)
      const label = e.label || undefined
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label,
        style,
        markerEnd: lt === 'subnet' ? undefined : { type: MarkerType.Arrow, color: style.stroke },
        labelStyle: { fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
      }
    }))
  }, [graph])

  async function handleCollectLLDP() {
    setLldpLoading(true)
    setLldpError(null)
    try {
      const m = await getBackend()
      await m.CollectLLDP()
      await refetch()
    } catch (err: any) {
      setLldpError(err?.message || 'Erreur lors de la collecte LLDP')
    } finally {
      setLldpLoading(false)
    }
  }

  // Legend items
  const legend = [
    { color: '#f59e0b', width: 3, label: 'Trunk / Switch-to-switch', dashed: false },
    { color: '#334155', width: 1.5, label: 'Accès', dashed: false },
    { color: '#1e3a5f', width: 1, label: 'Heuristique sous-réseau', dashed: true },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Topologie réseau"
        actions={
          <div className="flex items-center gap-2">
            {lldpError && (
              <span className="text-xs text-red-400">{lldpError}</span>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCollectLLDP}
              disabled={lldpLoading}
              title="Interroger les équipements via LLDP et reconstruire la topologie"
            >
              {lldpLoading
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Radio className="w-3.5 h-3.5" />}
              <span className="ml-1 text-xs">LLDP</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => refetch()} title="Rafraîchir la topologie">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
          </div>
        ) : (
          <>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              style={{ background: '#0f172a' }}
            >
              <Controls style={{ background: '#1e293b', border: '1px solid #334155' }} />
              <MiniMap style={{ background: '#0f172a', border: '1px solid #334155' }} nodeColor={(n) => vendorColor(n.data?.vendor || '')} />
              <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={20} />
            </ReactFlow>
            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 flex flex-col gap-1.5 text-xs text-slate-300">
              {legend.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <svg width="28" height="10">
                    <line
                      x1="0" y1="5" x2="28" y2="5"
                      stroke={item.color}
                      strokeWidth={item.width}
                      strokeDasharray={item.dashed ? '5 3' : undefined}
                    />
                  </svg>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
