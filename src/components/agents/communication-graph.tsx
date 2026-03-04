'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AGENT_ROLES } from '@/lib/constants';

interface Conversation {
  id: string;
  participants: string[];
  lastMessageAt?: string;
}

interface CommunicationGraphProps {
  projectId: string;
}

const ROLE_COLOR_MAP: Record<string, string> = {};
for (const r of AGENT_ROLES) ROLE_COLOR_MAP[r.role] = r.color;

export function CommunicationGraph({ projectId }: CommunicationGraphProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const fetchConversations = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/conversations?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Re-fetch when new messages arrive via SSE
  useEffect(() => {
    const handler = () => fetchConversations();
    window.addEventListener('message-new', handler);
    return () => window.removeEventListener('message-new', handler);
  }, [fetchConversations]);

  const { nodes, edges } = useMemo(() => {
    const agentSet = new Set<string>();
    const edgeMap = new Map<string, number>();

    for (const conv of conversations) {
      if (!conv.participants || conv.participants.length < 2) continue;
      for (const p of conv.participants) agentSet.add(p);
      // Create edges between all pairs
      for (let i = 0; i < conv.participants.length; i++) {
        for (let j = i + 1; j < conv.participants.length; j++) {
          const key = [conv.participants[i], conv.participants[j]].sort().join(':');
          edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
        }
      }
    }

    const agents = Array.from(agentSet);
    const cx = 140;
    const cy = 100;
    const radius = Math.min(80, agents.length > 1 ? 80 : 0);

    const nodes = agents.map((id, idx) => {
      const angle = (idx / Math.max(1, agents.length)) * Math.PI * 2 - Math.PI / 2;
      return {
        id,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        color: ROLE_COLOR_MAP[id] || '#5ba3c9',
      };
    });

    const edges = Array.from(edgeMap.entries()).map(([key, count]) => {
      const [a, b] = key.split(':');
      return { from: a, to: b, count };
    });

    return { nodes, edges };
  }, [conversations]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Communication Graph</CardTitle>
        <p className="text-[10px] text-muted-foreground">
          {edges.length} connections between {nodes.length} agents
        </p>
      </CardHeader>
      <CardContent>
        {nodes.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <svg width="280" height="200" className="w-full" viewBox="0 0 280 200">
            {/* Edges */}
            {edges.map((edge) => {
              const fromNode = nodes.find((n) => n.id === edge.from);
              const toNode = nodes.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke="#3f3f46"
                  strokeWidth={Math.min(4, 1 + edge.count)}
                  strokeOpacity={0.6}
                />
              );
            })}
            {/* Nodes */}
            {nodes.map((node) => (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={16}
                  fill={`${node.color}30`}
                  stroke={node.color}
                  strokeWidth={2}
                />
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={node.color}
                  fontSize={8}
                  fontWeight="bold"
                >
                  {node.id.slice(0, 3).toUpperCase()}
                </text>
                <text
                  x={node.x}
                  y={node.y + 28}
                  textAnchor="middle"
                  fill="#a1a1aa"
                  fontSize={7}
                >
                  {node.id}
                </text>
              </g>
            ))}
          </svg>
        )}
      </CardContent>
    </Card>
  );
}
