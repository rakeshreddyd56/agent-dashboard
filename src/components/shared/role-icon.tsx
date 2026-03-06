import {
  Blocks,
  Eye,
  Bot,
  FlaskRound,
  MonitorSmartphone,
  Server,
  Rocket,
  Palette,
  Database,
  TestTube,
  BookOpen,
} from 'lucide-react';
import type { AgentRole } from '@/lib/types';

const iconMap: Record<AgentRole, React.ComponentType<{ className?: string }>> = {
  // Floor 1 — Research
  'rataa-research': FlaskRound,
  'researcher-1': BookOpen,
  'researcher-2': BookOpen,
  'researcher-3': BookOpen,
  'researcher-4': BookOpen,
  // Floor 2 — Development
  'rataa-frontend': MonitorSmartphone,
  'rataa-backend': Server,
  architect: Blocks,
  frontend: Palette,
  'backend-1': Database,
  'backend-2': Database,
  'tester-1': TestTube,
  'tester-2': TestTube,
  // Floor 3 — Ops
  'rataa-ops': Rocket,
  supervisor: Eye,
  'supervisor-2': Eye,
};

const colorMap: Record<AgentRole, string> = {
  // Floor 1 — Research
  'rataa-research': 'text-[#6366f1]',
  'researcher-1': 'text-[#f59e0b]',
  'researcher-2': 'text-[#f59e0b]',
  'researcher-3': 'text-[#f59e0b]',
  'researcher-4': 'text-[#f59e0b]',
  // Floor 2 — Development
  'rataa-frontend': 'text-[#8b5cf6]',
  'rataa-backend': 'text-[#7c3aed]',
  architect: 'text-[#146b4e]',
  frontend: 'text-[#06b6d4]',
  'backend-1': 'text-[#0891b2]',
  'backend-2': 'text-[#0891b2]',
  'tester-1': 'text-[#10b981]',
  'tester-2': 'text-[#10b981]',
  // Floor 3 — Ops
  'rataa-ops': 'text-[#a855f7]',
  supervisor: 'text-[#9333ea]',
  'supervisor-2': 'text-[#7c3aed]',
};

export function RoleIcon({ role, className }: { role: AgentRole; className?: string }) {
  const Icon = iconMap[role] || Bot;
  const color = colorMap[role] || 'text-[#7fa393]';
  return <Icon className={`${color} ${className || 'h-4 w-4'}`} />;
}
