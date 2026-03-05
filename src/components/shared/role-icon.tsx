import {
  Blocks,
  Code,
  Search,
  FlaskConical,
  Shield,
  Container,
  Users,
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
  architect: Blocks,
  coder: Code,
  'coder-2': Code,
  reviewer: Search,
  tester: FlaskConical,
  'security-auditor': Shield,
  devops: Container,
  coordinator: Users,
  supervisor: Eye,
  'supervisor-2': Eye,
  'rataa-research': FlaskRound,
  'rataa-frontend': MonitorSmartphone,
  'rataa-backend': Server,
  'rataa-ops': Rocket,
  frontend: Palette,
  'backend-1': Database,
  'backend-2': Database,
  'tester-1': TestTube,
  'tester-2': TestTube,
  'researcher-1': BookOpen,
  'researcher-2': BookOpen,
  'researcher-3': BookOpen,
  'researcher-4': BookOpen,
};

const colorMap: Record<AgentRole, string> = {
  architect: 'text-[#146b4e]',
  coder: 'text-[#3dba8a]',
  'coder-2': 'text-[#5ba3c9]',
  reviewer: 'text-[#e8823e]',
  tester: 'text-[#0d7a4a]',
  'security-auditor': 'text-[#e05252]',
  devops: 'text-[#f5b942]',
  coordinator: 'text-[#24556f]',
  supervisor: 'text-[#9333ea]',
  'supervisor-2': 'text-[#7c3aed]',
  'rataa-research': 'text-[#6366f1]',
  'rataa-frontend': 'text-[#8b5cf6]',
  'rataa-backend': 'text-[#7c3aed]',
  'rataa-ops': 'text-[#a855f7]',
  frontend: 'text-[#06b6d4]',
  'backend-1': 'text-[#0891b2]',
  'backend-2': 'text-[#0891b2]',
  'tester-1': 'text-[#10b981]',
  'tester-2': 'text-[#10b981]',
  'researcher-1': 'text-[#f59e0b]',
  'researcher-2': 'text-[#f59e0b]',
  'researcher-3': 'text-[#f59e0b]',
  'researcher-4': 'text-[#f59e0b]',
};

export function RoleIcon({ role, className }: { role: AgentRole; className?: string }) {
  const Icon = iconMap[role] || Bot;
  const color = colorMap[role] || 'text-[#7fa393]';
  return <Icon className={`${color} ${className || 'h-4 w-4'}`} />;
}
