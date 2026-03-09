import type { AgentPermissions } from './types';

export interface ConstitutionDefault {
  agentRole: string;
  title: string;
  capabilities: string[];
  permissions: AgentPermissions;
  reportsTo: string | null;
  responsibilityScope: string[];
}

const LEAD_PERMISSIONS: AgentPermissions = {
  can_deploy: false,
  can_merge: true,
  can_launch_subagents: true,
  can_approve: true,
  can_override_budget: false,
  max_concurrent_tasks: 3,
};

const DEV_PERMISSIONS: AgentPermissions = {
  can_deploy: false,
  can_merge: false,
  can_launch_subagents: false,
  can_approve: false,
  can_override_budget: false,
  max_concurrent_tasks: 2,
};

const OPS_PERMISSIONS: AgentPermissions = {
  can_deploy: true,
  can_merge: true,
  can_launch_subagents: true,
  can_approve: true,
  can_override_budget: true,
  max_concurrent_tasks: 5,
};

export const CONSTITUTION_DEFAULTS: Record<string, ConstitutionDefault> = {
  // Floor 3 — Ops (Top of hierarchy)
  'rataa-ops': {
    agentRole: 'rataa-ops',
    title: 'Captain / Ops Lead',
    capabilities: ['deployment', 'infrastructure', 'orchestration', 'monitoring', 'incident-response'],
    permissions: OPS_PERMISSIONS,
    reportsTo: null,
    responsibilityScope: ['scripts/', 'docker/', '.github/', 'ops/'],
  },
  'supervisor': {
    agentRole: 'supervisor',
    title: 'Floor Supervisor',
    capabilities: ['task-coordination', 'agent-monitoring', 'relay', 'quality-assurance'],
    permissions: { ...OPS_PERMISSIONS, can_deploy: false },
    reportsTo: 'rataa-ops',
    responsibilityScope: ['.claude/coordination/'],
  },
  'supervisor-2': {
    agentRole: 'supervisor-2',
    title: 'Quality Supervisor',
    capabilities: ['code-review', 'quality-gates', 'testing-oversight', 'standards-enforcement'],
    permissions: { ...OPS_PERMISSIONS, can_deploy: false },
    reportsTo: 'rataa-ops',
    responsibilityScope: ['.claude/coordination/', 'tests/'],
  },

  // Floor 1 — Research
  'rataa-research': {
    agentRole: 'rataa-research',
    title: 'Research Lead / Archaeologist',
    capabilities: ['research', 'analysis', 'ideation', 'synthesis', 'council-coordination'],
    permissions: LEAD_PERMISSIONS,
    reportsTo: 'rataa-ops',
    responsibilityScope: ['docs/', 'research/', 'data/office/floor-1/'],
  },
  'researcher-1': {
    agentRole: 'researcher-1',
    title: 'Junior Researcher',
    capabilities: ['literature-review', 'data-collection', 'summarization'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'rataa-research',
    responsibilityScope: ['research/'],
  },
  'researcher-2': {
    agentRole: 'researcher-2',
    title: 'Senior Researcher',
    capabilities: ['deep-analysis', 'creative-writing', 'cross-domain-synthesis'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'rataa-research',
    responsibilityScope: ['research/'],
  },
  'researcher-3': {
    agentRole: 'researcher-3',
    title: 'Technical Researcher',
    capabilities: ['technical-analysis', 'benchmarking', 'feasibility-studies'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'rataa-research',
    responsibilityScope: ['research/'],
  },
  'researcher-4': {
    agentRole: 'researcher-4',
    title: 'Scout Researcher',
    capabilities: ['trend-analysis', 'market-research', 'rapid-prototyping'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'rataa-research',
    responsibilityScope: ['research/'],
  },

  // Floor 2 — Development
  'rataa-frontend': {
    agentRole: 'rataa-frontend',
    title: 'Frontend Lead / Navigator',
    capabilities: ['react', 'next.js', 'tailwind', 'ui-design', 'accessibility', 'performance'],
    permissions: LEAD_PERMISSIONS,
    reportsTo: 'rataa-ops',
    responsibilityScope: ['src/components/', 'src/app/', 'public/'],
  },
  'rataa-backend': {
    agentRole: 'rataa-backend',
    title: 'Backend Lead / Shipwright',
    capabilities: ['node.js', 'api-design', 'database', 'sqlite', 'system-architecture'],
    permissions: LEAD_PERMISSIONS,
    reportsTo: 'rataa-ops',
    responsibilityScope: ['src/lib/', 'src/app/api/'],
  },
  'architect': {
    agentRole: 'architect',
    title: 'System Architect',
    capabilities: ['architecture', 'design-patterns', 'schema-design', 'api-contracts', 'documentation'],
    permissions: { ...DEV_PERMISSIONS, can_approve: true },
    reportsTo: 'rataa-backend',
    responsibilityScope: ['src/lib/db/', 'src/lib/types.ts', 'docs/'],
  },
  'frontend': {
    agentRole: 'frontend',
    title: 'Frontend Developer',
    capabilities: ['react', 'css', 'components', 'animations', 'responsive-design'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'rataa-frontend',
    responsibilityScope: ['src/components/'],
  },
  'backend-1': {
    agentRole: 'backend-1',
    title: 'Senior Backend Developer',
    capabilities: ['typescript', 'api-routes', 'database-queries', 'performance', 'security'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'rataa-backend',
    responsibilityScope: ['src/app/api/', 'src/lib/'],
  },
  'backend-2': {
    agentRole: 'backend-2',
    title: 'Backend Developer',
    capabilities: ['typescript', 'api-routes', 'integrations', 'data-modeling'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'rataa-backend',
    responsibilityScope: ['src/app/api/', 'src/lib/'],
  },
  'tester-1': {
    agentRole: 'tester-1',
    title: 'Senior QA Engineer',
    capabilities: ['testing', 'e2e-tests', 'security-audit', 'performance-testing'],
    permissions: { ...DEV_PERMISSIONS, can_approve: true },
    reportsTo: 'supervisor-2',
    responsibilityScope: ['tests/', 'src/**/*.test.*'],
  },
  'tester-2': {
    agentRole: 'tester-2',
    title: 'QA Engineer',
    capabilities: ['testing', 'unit-tests', 'integration-tests', 'bug-reporting'],
    permissions: DEV_PERMISSIONS,
    reportsTo: 'supervisor-2',
    responsibilityScope: ['tests/', 'src/**/*.test.*'],
  },
};

/** Get the reporting chain from an agent up to the root (rataa-ops) */
export function getReportingChain(agentRole: string): string[] {
  const chain: string[] = [agentRole];
  let current = CONSTITUTION_DEFAULTS[agentRole];
  while (current?.reportsTo) {
    chain.push(current.reportsTo);
    current = CONSTITUTION_DEFAULTS[current.reportsTo];
  }
  return chain;
}

/** Get all direct reports for an agent */
export function getDirectReports(agentRole: string): string[] {
  return Object.values(CONSTITUTION_DEFAULTS)
    .filter(c => c.reportsTo === agentRole)
    .map(c => c.agentRole);
}
