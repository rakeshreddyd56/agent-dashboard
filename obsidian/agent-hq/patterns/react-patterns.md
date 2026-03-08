---
tags: [pattern, react, frontend, next-js, zustand]
created: 2026-03-07
updated: 2026-03-07
---

# React Patterns (Agent Dashboard)

## Component Structure
- Use `'use client'` directive for interactive components
- Card-based layout with `Card/CardContent/CardHeader/CardTitle` from shadcn/ui
- Loading states via `loading?: boolean` prop or Zustand `isLoading`
- Icons from `lucide-react` — never install other icon libraries

## State Management (Zustand)
- Stores in `src/lib/store/` — one per domain (project, task, agent, office)
- Selective subscriptions: `useXStore((s) => s.field)`
- SSE updates → store mutations → React re-renders
- Example:
```typescript
const activeProjectId = useProjectStore((s) => s.activeProjectId);
const tasks = useTaskStore((s) => s.tasks);
```

## SSE Real-Time Updates
- Provider: `src/components/layout/sse-provider.tsx`
- Events mapped: `agent:update`, `task:update`, `event:new`, etc.
- Auto-reconnect on disconnect
- Stale flag triggers full re-fetch

## Charts (Recharts)
- Always wrap in `<ResponsiveContainer width="100%" height={300}>`
- Dark theme: `backgroundColor: '#18181b'`, `border: '1px solid #3f3f46'`
- Consistent tooltip via `TOOLTIP_STYLE` constant
- Colors: use Moltbook pill-tone palette from `constants.ts`

## Data Fetching Pattern
```typescript
const fetchData = useCallback(async () => {
  if (!activeProjectId) return;
  const res = await fetch(`/api/endpoint?projectId=${activeProjectId}`);
  const data = await res.json();
  store.setData(data);
}, [activeProjectId]);

useEffect(() => { fetchData(); }, [fetchData]);
```

## Color Palette (Moltbook)
| Use | Hex | Tailwind |
|-----|-----|----------|
| Success/OK | `#0d7a4a` / `#3dba8a` | `bg-[#0d7a4a]/15 text-[#3dba8a]` |
| Info | `#24556f` / `#5ba3c9` | `bg-[#24556f]/15 text-[#5ba3c9]` |
| Warning | `#8d5a0f` / `#f5b942` | `bg-[#8d5a0f]/15 text-[#f5b942]` |
| Error | `#a4312f` / `#e05252` | `bg-[#a4312f]/15 text-[#e05252]` |
| Primary | `#6366f1` | `bg-[#6366f1]/10 text-[#6366f1]` |
| Muted | `#7fa393` | `bg-[#7fa393]/15 text-[#7fa393]` |

## Drag & Drop (dnd-kit)
- Used on Board page for task column reordering
- `DndContext` → `SortableContext` → `useSortable` per item
- Updates `columnOrder` via PATCH /api/tasks

## Key UI Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `FloorStack` | `components/office/floor-stack.tsx` | 3-floor office visualization |
| `AgentChip` | Inside floor-stack | Live agent status chips |
| `BoardColumn` | `components/board/` | Kanban column with tasks |
| `AnalyticsCharts` | `components/analytics/` | Cost, token, progress charts |
| `RataaChatPanel` | `components/office/rataa-chat-panel.tsx` | Chat with supervisors |
