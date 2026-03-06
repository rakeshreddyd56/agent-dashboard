'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/lib/store/project-store';
import {
  LayoutDashboard,
  Columns3,
  Bot,
  List,
  Activity,
  BarChart3,
  FileText,
  Settings,
  Shell,
  Rocket,
  Building2,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'HQ', icon: LayoutDashboard },
  { href: '/mission', label: 'Mission', icon: Rocket },
  { href: '/board', label: 'Board', icon: Columns3 },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/backlog', label: 'Backlog', icon: List },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/office', label: 'Office', icon: Building2 },
  { href: '/standup', label: 'Standup', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const projectName = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name || 'Agent Dashboard');

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Shell className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold tracking-tight truncate">{projectName}</span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground truncate">{projectName}</p>
        <p className="text-xs text-muted-foreground">Agent Command Center v1.0</p>
      </div>
    </aside>
  );
}
