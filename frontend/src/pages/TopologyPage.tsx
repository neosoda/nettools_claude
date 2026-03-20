import { useEffect } from 'react'
import ReactFlow, { Node, Edge, Controls, MiniMap, Background, useNodesState, useEdgesState, BackgroundVariant } from 'reactflow'
import 'reactflow/dist/style.css'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Button from '../components/Button'

import backend from '../lib/backend'

function vendorColor(vendor: string) {
  switch (vendor) {
    case 'cisco': return '#2563eb'
    case 'aruba': return '#7c3aed'
    case 'allied': return '#059669'
    default: return '#475569'
  }
}

export default function TopologyPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const { data: graph, isLoading, refetch } = useQuery({
    queryKey: ['topology'],
    queryFn: () => backend.GetTopology(),
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
    setEdges((graph.edges || []).map((e: any) => ({ id: e.id, source: e.source, target: e.target, label: e.label, style: { stroke: '#334155' } })))
  }, [graph])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Topologie réseau"
        actions={<Button size="sm" variant="secondary" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5" /></Button>}
      />
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView style={{ background: '#0f172a' }}>
            <Controls style={{ background: '#1e293b', border: '1px solid #334155' }} />
            <MiniMap style={{ background: '#0f172a', border: '1px solid #334155' }} nodeColor={(n) => vendorColor(n.data?.vendor || '')} />
            <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={20} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
