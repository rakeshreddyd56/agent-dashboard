'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useProjectStore } from '@/lib/store/project-store';
import { useTaskStore } from '@/lib/store/task-store';
import {
  Rocket,
  Save,
  Play,
  Square,
  Terminal,
  CheckCircle,
  Circle,
  Loader2,
  AlertCircle,
  FolderOpen,
  FileText,
  Users,
  RefreshCw,
} from 'lucide-react';
import type { Mission } from '@/lib/types';

interface AgentScript {
  role: string;
  script: string;
  running: boolean;
}

interface LaunchInfo {
  prefix: string;
  activeSessions: string[];
  agentScripts: AgentScript[];
  agentTemplates: string[];
  launchScriptExists: boolean;
}

const AVAILABLE_ROLES = [
  { id: 'architect', label: 'Architect', desc: 'System design & planning' },
  { id: 'coder', label: 'Coder', desc: 'Implementation' },
  { id: 'coder-1', label: 'Coder-1', desc: 'Backend implementation' },
  { id: 'coder-2', label: 'Coder-2', desc: 'Frontend implementation' },
  { id: 'reviewer', label: 'Reviewer', desc: 'Code review & quality' },
  { id: 'tester', label: 'Tester', desc: 'Testing & validation' },
  { id: 'security', label: 'Security', desc: 'Security auditing' },
  { id: 'devops', label: 'DevOps', desc: 'Infrastructure & CI/CD' },
  { id: 'coordinator', label: 'Coordinator', desc: 'Team orchestration' },
];

const POLL_INTERVAL = 5000;

export default function MissionPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const tasks = useTaskStore((s) => s.tasks);

  const [mission, setMission] = useState<Mission | null>(null);
  const [missionExists, setMissionExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchInfo, setLaunchInfo] = useState<LaunchInfo | null>(null);

  // Form state
  const [goal, setGoal] = useState('');
  const [techStack, setTechStack] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());

  // Terminal preview
  const [terminalOutput, setTerminalOutput] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectTasks = tasks.filter((t) => t.projectId === activeProjectId);

  // Fetch mission
  const fetchMission = useCallback(() => {
    if (!activeProjectId) return;
    fetch(`/api/mission?projectId=${activeProjectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.mission) {
          setMission(data.mission);
          setMissionExists(data.exists);
          setGoal(data.mission.goal || '');
          setTechStack(data.mission.techStack || '');
          setDeliverables((data.mission.deliverables || []).join('\n'));
          setSelectedRoles(new Set(data.mission.agentTeam || []));
        }
      })
      .catch(console.error);
  }, [activeProjectId]);

  // Fetch launch info
  const fetchLaunchInfo = useCallback(() => {
    if (!activeProjectId) return;
    fetch(`/api/agents/launch?projectId=${activeProjectId}`)
      .then((r) => r.json())
      .then(setLaunchInfo)
      .catch(console.error);
  }, [activeProjectId]);

  useEffect(() => {
    fetchMission();
    fetchLaunchInfo();
  }, [fetchMission, fetchLaunchInfo]);

  // Poll for terminal output of running sessions
  useEffect(() => {
    if (!launchInfo?.activeSessions?.length) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = () => {
      for (const session of launchInfo.activeSessions) {
        fetch(`/api/tmux?action=capture&session=${session}&lines=15`)
          .then((r) => r.json())
          .then((data) => {
            if (data.content) {
              setTerminalOutput((prev) => ({ ...prev, [session]: data.content }));
            }
          })
          .catch(() => {});
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [launchInfo?.activeSessions]);

  // Save mission
  const handleSave = async () => {
    if (!activeProjectId) return;
    setSaving(true);

    const method = missionExists ? 'PUT' : 'POST';
    const body = {
      projectId: activeProjectId,
      goal,
      techStack,
      deliverables: deliverables.split('\n').map((d) => d.trim()).filter(Boolean),
      agentTeam: Array.from(selectedRoles),
    };

    try {
      const res = await fetch('/api/mission', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.saved) {
        setMission(data.mission);
        setMissionExists(true);
      }
    } catch (err) {
      console.error('Failed to save mission:', err);
    } finally {
      setSaving(false);
    }
  };

  // Launch agents
  const handleLaunchAll = async () => {
    if (!activeProjectId) return;
    setLaunching(true);

    try {
      await fetch('/api/agents/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, launchAll: true }),
      });
      // Refresh launch info after a short delay
      setTimeout(fetchLaunchInfo, 2000);
    } catch (err) {
      console.error('Failed to launch agents:', err);
    } finally {
      setLaunching(false);
    }
  };

  const handleLaunchSelected = async () => {
    if (!activeProjectId || selectedRoles.size === 0) return;
    setLaunching(true);

    try {
      await fetch('/api/agents/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, agents: Array.from(selectedRoles) }),
      });
      setTimeout(fetchLaunchInfo, 2000);
    } catch (err) {
      console.error('Failed to launch agents:', err);
    } finally {
      setLaunching(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  if (!activeProjectId) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Rocket className="h-12 w-12 opacity-50" />
        <p className="text-lg font-medium">No project selected</p>
        <p className="text-sm">Select a project in Settings to define your mission</p>
      </div>
    );
  }

  // Task status breakdown for mini board
  const taskBreakdown = {
    backlog: projectTasks.filter((t) => t.status === 'BACKLOG' || t.status === 'TODO').length,
    active: projectTasks.filter((t) => ['IN_PROGRESS', 'ASSIGNED', 'REVIEW', 'TESTING'].includes(t.status)).length,
    done: projectTasks.filter((t) => t.status === 'DONE' || t.status === 'TESTED').length,
    total: projectTasks.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mission Briefing</h1>
          {activeProject && (
            <p className="text-sm text-muted-foreground">
              {activeProject.name} &middot; <span className="font-mono text-xs">{activeProject.path}</span>
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => { fetchMission(); fetchLaunchInfo(); }}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Section 1: Mission Definition */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Rocket className="h-4 w-4" />
                Define Your Mission
              </CardTitle>
              <CardDescription className="text-xs">
                Set the goal and vision for your multi-agent team. This gets saved to the project&apos;s coordination directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Goal & Vision</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={4}
                  placeholder="What are you building? What's the end goal? Describe the vision for your project..."
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tech Stack & Constraints</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={2}
                  placeholder="TypeScript, React, Node.js, PostgreSQL..."
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Key Deliverables (one per line)</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                  placeholder={"API gateway with auth\nWeb frontend with role-based access\nTest coverage > 80%"}
                  value={deliverables}
                  onChange={(e) => setDeliverables(e.target.value)}
                />
              </div>

              <Separator />

              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  <Users className="mr-1 inline h-3 w-3" />
                  Agent Team
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_ROLES.map((role) => {
                    const isSelected = selectedRoles.has(role.id);
                    const hasScript = launchInfo?.agentScripts.some((s) => s.role === role.id);
                    return (
                      <button
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {isSelected ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                        {role.label}
                        {hasScript && <Badge variant="outline" className="ml-1 px-1 text-[8px]">script</Badge>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving || !goal.trim()} size="sm">
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  {missionExists ? 'Update Mission' : 'Save Mission'}
                </Button>
                {missionExists && (
                  <Badge variant="outline" className="text-[10px] text-[#3dba8a] border-[#0d7a4a]/30">
                    <CheckCircle className="mr-1 h-2.5 w-2.5" />
                    Saved to coordination dir
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Agent Launch Controls */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Play className="h-4 w-4" />
                Launch Agents
              </CardTitle>
              <CardDescription className="text-xs">
                Start agent tmux sessions. Agents will read the mission and begin working.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!launchInfo ? (
                <p className="text-xs text-muted-foreground">Loading agent info...</p>
              ) : (
                <>
                  {/* Active sessions */}
                  {launchInfo.activeSessions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-[#3dba8a]">
                        {launchInfo.activeSessions.length} active session{launchInfo.activeSessions.length !== 1 ? 's' : ''}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {launchInfo.activeSessions.map((s) => (
                          <Badge key={s} variant="outline" className="gap-1 text-[10px] text-[#3dba8a] border-[#0d7a4a]/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#3dba8a] animate-pulse" />
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Available scripts */}
                  {launchInfo.agentScripts.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {launchInfo.agentScripts.length} agent script{launchInfo.agentScripts.length !== 1 ? 's' : ''} found
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {launchInfo.agentScripts.map((script) => (
                          <div
                            key={script.role}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                              script.running ? 'border-[#0d7a4a]/30 bg-[#3dba8a]/5' : 'border-border'
                            }`}
                          >
                            {script.running ? (
                              <span className="h-2 w-2 rounded-full bg-[#3dba8a] animate-pulse" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-[#476256]" />
                            )}
                            <span className="font-medium">{script.role}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {script.running ? 'running' : 'ready'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/50 p-4 text-center">
                      <AlertCircle className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        No agent scripts found in <span className="font-mono">scripts/run-*.sh</span>
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Create runner scripts to launch agents from the dashboard
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {launchInfo.launchScriptExists && (
                      <Button onClick={handleLaunchAll} disabled={launching} size="sm" variant="default">
                        {launching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                        Launch All Agents
                      </Button>
                    )}
                    {selectedRoles.size > 0 && launchInfo.agentScripts.length > 0 && (
                      <Button onClick={handleLaunchSelected} disabled={launching} size="sm" variant="outline">
                        {launching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                        Launch Selected ({selectedRoles.size})
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Terminal preview for running agents */}
          {Object.keys(terminalOutput).length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Terminal className="h-4 w-4" />
                  Agent Terminal Output
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(terminalOutput).map(([session, output]) => (
                  <div key={session} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#3dba8a] animate-pulse" />
                      <span className="text-xs font-medium">{session}</span>
                    </div>
                    <pre className="max-h-32 overflow-auto rounded-lg bg-[#0a1612] p-3 font-mono text-[10px] leading-relaxed text-[#3dba8a]">
                      {output.trim() || '(waiting for output...)'}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Section 3: Right sidebar — project info & live task summary */}
        <div className="space-y-4">
          {/* Project info */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <FolderOpen className="h-4 w-4" />
                Project
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm font-medium">{activeProject?.name || 'Unknown'}</div>
              <div className="font-mono text-[10px] text-muted-foreground break-all">
                {activeProject?.path || ''}
              </div>
              {launchInfo && (
                <div className="mt-2 space-y-1">
                  {launchInfo.agentTemplates.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <CheckCircle className="h-3 w-3 text-[#3dba8a]" />
                      {launchInfo.agentTemplates.length} agent template{launchInfo.agentTemplates.length !== 1 ? 's' : ''}
                    </div>
                  )}
                  {launchInfo.launchScriptExists && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <CheckCircle className="h-3 w-3 text-[#3dba8a]" />
                      launch-agents.sh found
                    </div>
                  )}
                  {launchInfo.agentScripts.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <CheckCircle className="h-3 w-3 text-[#3dba8a]" />
                      {launchInfo.agentScripts.length} runner scripts
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live task summary */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" />
                Live Task Summary
              </CardTitle>
              <CardDescription className="text-xs">
                Updates in realtime as agents create tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {taskBreakdown.total === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tasks yet. Launch agents to see tasks appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{taskBreakdown.total} total tasks</span>
                      <span>{taskBreakdown.done > 0 ? `${Math.round((taskBreakdown.done / taskBreakdown.total) * 100)}%` : '0%'} done</span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-[#1a2e26]">
                      {taskBreakdown.done > 0 && (
                        <div
                          className="bg-[#0d7a4a] transition-all"
                          style={{ width: `${(taskBreakdown.done / taskBreakdown.total) * 100}%` }}
                        />
                      )}
                      {taskBreakdown.active > 0 && (
                        <div
                          className="bg-[#8d5a0f] transition-all"
                          style={{ width: `${(taskBreakdown.active / taskBreakdown.total) * 100}%` }}
                        />
                      )}
                      {taskBreakdown.backlog > 0 && (
                        <div
                          className="bg-[#24556f] transition-all"
                          style={{ width: `${(taskBreakdown.backlog / taskBreakdown.total) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#24556f]" />
                        Backlog
                      </span>
                      <span className="font-medium">{taskBreakdown.backlog}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#8d5a0f]" />
                        Active
                      </span>
                      <span className="font-medium">{taskBreakdown.active}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#0d7a4a]" />
                        Done
                      </span>
                      <span className="font-medium">{taskBreakdown.done}</span>
                    </div>
                  </div>

                  {/* Recent tasks */}
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground">Recent Tasks</p>
                    {projectTasks.slice(0, 8).map((task) => (
                      <div key={task.id} className="flex items-center gap-2 text-[10px]">
                        <Badge
                          variant="outline"
                          className={`px-1 text-[8px] ${
                            task.status === 'DONE' || task.status === 'TESTED'
                              ? 'text-[#3dba8a] border-[#0d7a4a]/30'
                              : task.status === 'IN_PROGRESS' || task.status === 'ASSIGNED'
                              ? 'text-[#f5b942] border-[#8d5a0f]/30'
                              : 'text-muted-foreground border-border'
                          }`}
                        >
                          {task.status}
                        </Badge>
                        <span className="truncate text-muted-foreground">{task.title}</span>
                        {task.priority === 'P0' && (
                          <Badge variant="outline" className="ml-auto px-1 text-[8px] text-[#e05252] border-[#a4312f]/30">
                            P0
                          </Badge>
                        )}
                      </div>
                    ))}
                    {projectTasks.length > 8 && (
                      <p className="text-[10px] text-muted-foreground">
                        +{projectTasks.length - 8} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
