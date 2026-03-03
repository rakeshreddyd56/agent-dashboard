import {
  Blocks,
  Code,
  Search,
  FlaskConical,
  Shield,
  Container,
  Users,
  Bot,
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
};

export function RoleIcon({ role, className }: { role: AgentRole; className?: string }) {
  const Icon = iconMap[role] || Bot;
  const color = colorMap[role] || 'text-[#7fa393]';
  return <Icon className={`${color} ${className || 'h-4 w-4'}`} />;
}
