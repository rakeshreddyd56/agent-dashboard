'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useProjectStore } from '@/lib/store/project-store';
import {
  FolderOpen,
  Trash2,
  Plus,
  Palette,
  Eye,
  CheckCircle,
  XCircle,
  ChevronRight,
  ArrowUp,
  Folder,
  FileText,
  Download,
  Loader2,
  Monitor,
  Terminal,
} from 'lucide-react';

interface DirEntry {
  name: string;
  type: 'directory' | 'file';
  path: string;
}

interface PathMarkers {
  'claude.md': boolean;
  coordination: boolean;
  agents: boolean;
  scripts: boolean;
  launchScript: boolean;
  tasksMd: boolean;
  packageJson: boolean;
}

export default function SettingsPage() {
  const { projects, setProjects } = useProjectStore();
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newGitUrl, setNewGitUrl] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);
  // Pixel-agents state
  const [pixelStatus, setPixelStatus] = useState<{
    extension: { installed: boolean; location: string | null; version: string | null };
    cli: { available: boolean; path: string | null };
    activeSessions: { projectSlug: string; sessionId: string; lastModified: string }[];
    claudeDir: string;
  } | null>(null);
  const [pixelInstalling, setPixelInstalling] = useState(false);
  const [pixelInstallMsg, setPixelInstallMsg] = useState('');

  // Folder browser state
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [browseEntries, setBrowseEntries] = useState<DirEntry[]>([]);
  const [browseParent, setBrowseParent] = useState('');
  const [pathMarkers, setPathMarkers] = useState<PathMarkers | null>(null);

  // Fetch pixel-agents status
  const fetchPixelStatus = useCallback(() => {
    fetch('/api/pixel-agents?action=status')
      .then((r) => r.json())
      .then(setPixelStatus)
      .catch(() => setPixelStatus(null));
  }, []);

  useEffect(() => {
    fetchPixelStatus();
  }, [fetchPixelStatus]);

  const handlePixelInstall = async () => {
    setPixelInstalling(true);
    setPixelInstallMsg('');
    try {
      const res = await fetch('/api/pixel-agents', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPixelInstallMsg('Installed successfully! Restart VS Code to activate.');
        fetchPixelStatus();
      } else {
        setPixelInstallMsg(data.error || 'Install failed');
      }
    } catch {
      setPixelInstallMsg('Network error during install');
    } finally {
      setPixelInstalling(false);
    }
  };

  // Check path markers when path changes
  useEffect(() => {
    if (!newPath) {
      setPathMarkers(null);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/fs?path=${encodeURIComponent(newPath)}&action=exists`)
        .then((r) => r.json())
        .then((data) => {
          if (data.exists && data.isDir) {
            setPathMarkers(data.markers);
          } else {
            setPathMarkers(null);
          }
        })
        .catch(() => setPathMarkers(null));
    }, 500);
    return () => clearTimeout(timer);
  }, [newPath]);

  const browseDirectory = useCallback((dirPath: string) => {
    fetch(`/api/fs?path=${encodeURIComponent(dirPath)}&action=list`)
      .then((r) => r.json())
      .then((data) => {
        setBrowsePath(data.path);
        setBrowseParent(data.parent);
        setBrowseEntries(data.entries || []);
      })
      .catch(console.error);
  }, []);

  const openBrowser = () => {
    setBrowseOpen(true);
    browseDirectory(newPath || process.env.HOME || '/Users');
  };

  const selectPath = (dirPath: string) => {
    setNewPath(dirPath);
    setBrowseOpen(false);
  };

  const handleAddProject = async () => {
    if (!newName || !newPath || addingProject) return;
    setAddingProject(true);
    setAddResult(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, path: newPath, gitUrl: newGitUrl || undefined }),
      });
      const result = await res.json();
      if (res.ok) {
        const parts: string[] = ['Project added'];
        if (result.tablesCreated) parts.push('DB tables created');
        if (result.gitCreated) parts.push(`Git repo created: ${result.gitUrl}`);
        else if (result.gitUrl) parts.push(`Git: ${result.gitUrl}`);
        if (result.gitError) parts.push(`Git warning: ${result.gitError}`);
        setAddResult({ success: true, message: parts.join(' | ') });
        setNewName('');
        setNewPath('');
        setNewGitUrl('');
        setPathMarkers(null);
        const data = await fetch('/api/projects').then((r) => r.json());
        if (data.projects) setProjects(data.projects);
      } else {
        setAddResult({ success: false, message: result.error || 'Failed to add project' });
      }
    } catch {
      setAddResult({ success: false, message: 'Network error' });
    } finally {
      setAddingProject(false);
      setTimeout(() => setAddResult(null), 8000);
    }
  };

  const handleDeleteProject = async (id: string) => {
    await fetch(`/api/projects?id=${id}`, { method: 'DELETE' });
    const data = await fetch('/api/projects').then((r) => r.json());
    if (data.projects) setProjects(data.projects);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects" className="gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="pixel-agents" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Pixel-Agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm">Registered Projects</CardTitle>
              <CardDescription className="text-xs">
                Luffy&apos;s HQ projects monitored for agent activity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {p.isDemo && <Badge variant="outline" className="text-[10px]">Demo</Badge>}
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground">{p.path}</p>
                    {p.gitUrl && (
                      <p className="font-mono text-[10px] text-[#5ba3c9]">{p.gitUrl}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDeleteProject(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm">Add Project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Project Name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Project" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Project Path</label>
                <div className="flex gap-2">
                  <Input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/Users/..."
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={openBrowser}>
                    <FolderOpen className="mr-1 h-3.5 w-3.5" />
                    Browse
                  </Button>
                </div>

                {/* Path markers */}
                {pathMarkers && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pathMarkers['claude.md'] && (
                      <Badge variant="outline" className="gap-1 text-[9px] text-[#3dba8a] border-[#0d7a4a]/30">
                        <CheckCircle className="h-2.5 w-2.5" /> CLAUDE.md
                      </Badge>
                    )}
                    {pathMarkers.coordination && (
                      <Badge variant="outline" className="gap-1 text-[9px] text-[#3dba8a] border-[#0d7a4a]/30">
                        <CheckCircle className="h-2.5 w-2.5" /> coordination
                      </Badge>
                    )}
                    {pathMarkers.agents && (
                      <Badge variant="outline" className="gap-1 text-[9px] text-[#3dba8a] border-[#0d7a4a]/30">
                        <CheckCircle className="h-2.5 w-2.5" /> agents
                      </Badge>
                    )}
                    {pathMarkers.scripts && (
                      <Badge variant="outline" className="gap-1 text-[9px] text-[#3dba8a] border-[#0d7a4a]/30">
                        <CheckCircle className="h-2.5 w-2.5" /> scripts
                      </Badge>
                    )}
                    {pathMarkers.launchScript && (
                      <Badge variant="outline" className="gap-1 text-[9px] text-[#3dba8a] border-[#0d7a4a]/30">
                        <CheckCircle className="h-2.5 w-2.5" /> launch-agents.sh
                      </Badge>
                    )}
                    {pathMarkers.tasksMd && (
                      <Badge variant="outline" className="gap-1 text-[9px] text-[#3dba8a] border-[#0d7a4a]/30">
                        <CheckCircle className="h-2.5 w-2.5" /> TASKS.md
                      </Badge>
                    )}
                    {pathMarkers.packageJson && (
                      <Badge variant="outline" className="gap-1 text-[9px] text-[#5ba3c9] border-[#24556f]/30">
                        <FileText className="h-2.5 w-2.5" /> package.json
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Folder browser */}
              {browseOpen && (
                <div className="rounded-lg border border-border bg-card p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => browseDirectory(browseParent)}
                    >
                      <ArrowUp className="mr-1 h-3 w-3" />
                      Up
                    </Button>
                    <span className="flex-1 truncate font-mono text-[10px] text-muted-foreground">
                      {browsePath}
                    </span>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => selectPath(browsePath)}
                    >
                      Select this folder
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setBrowseOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {browseEntries
                      .filter((e) => e.type === 'directory')
                      .map((entry) => (
                        <button
                          key={entry.path}
                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                          onClick={() => browseDirectory(entry.path)}
                        >
                          <Folder className="h-3.5 w-3.5 text-[#5ba3c9]" />
                          <span className="flex-1 truncate">{entry.name}</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground">Git Repository URL (optional)</label>
                <Input
                  value={newGitUrl}
                  onChange={(e) => setNewGitUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Leave empty to auto-create a private repo under rakeshreddyd56
                </p>
              </div>

              <Button onClick={handleAddProject} disabled={!newName || !newPath || addingProject} size="sm">
                {addingProject ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}
                {addingProject ? 'Setting up...' : 'Add Project'}
              </Button>

              {addResult && (
                <div className={`rounded-lg p-2 text-xs ${
                  addResult.success ? 'bg-[#0d7a4a]/10 text-[#3dba8a]' : 'bg-[#a4312f]/10 text-[#e05252]'
                }`}>
                  {addResult.message}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm">Theme</CardTitle>
              <CardDescription className="text-xs">
                Luffy&apos;s HQ forest theme. Light mode coming soon.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-16 w-24 rounded-lg border-2 border-primary bg-[#0a1612]" />
                  <span className="text-[10px] font-medium">Forest</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 opacity-50">
                  <div className="h-16 w-24 rounded-lg border border-border bg-[#f4f8ee]" />
                  <span className="text-[10px] text-muted-foreground">Sage (soon)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pixel-agents" className="mt-4 space-y-4">
          {/* Status Card */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Eye className="h-4 w-4" />
                Pixel-Agents Extension
              </CardTitle>
              <CardDescription className="text-xs">
                Animated pixel art characters for your AI coding agents in VS Code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Installation status */}
              {pixelStatus ? (
                <div className={`flex items-center justify-between rounded-lg p-3 ${
                  pixelStatus.extension.installed ? 'bg-[#0d7a4a]/10' : 'bg-muted'
                }`}>
                  <div className="flex items-center gap-2">
                    {pixelStatus.extension.installed ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-[#3dba8a]" />
                        <div>
                          <span className="text-sm font-medium text-[#3dba8a]">Installed</span>
                          {pixelStatus.extension.version && (
                            <span className="ml-2 text-[10px] text-muted-foreground">v{pixelStatus.extension.version}</span>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            {pixelStatus.extension.location?.split('/').slice(-2).join('/')}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm text-muted-foreground">Not installed</span>
                          <p className="text-[10px] text-muted-foreground">
                            Checked: ~/.vscode/extensions, ~/.cursor/extensions
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {!pixelStatus.extension.installed && (
                    <div className="flex gap-2">
                      {pixelStatus.cli.available ? (
                        <Button
                          size="sm"
                          onClick={handlePixelInstall}
                          disabled={pixelInstalling}
                        >
                          {pixelInstalling ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Install Now
                        </Button>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-[#f5b942] border-[#8d5a0f]/30">
                          VS Code CLI not found
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
                  Checking installation status...
                </div>
              )}

              {/* Install result message */}
              {pixelInstallMsg && (
                <div className={`rounded-lg p-2 text-xs ${
                  pixelInstallMsg.includes('success') ? 'bg-[#0d7a4a]/10 text-[#3dba8a]' : 'bg-[#a4312f]/10 text-[#e05252]'
                }`}>
                  {pixelInstallMsg}
                </div>
              )}

              {/* Environment Info */}
              {pixelStatus && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">Environment</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-border/50 p-2">
                      <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] font-medium">VS Code CLI</p>
                        <p className="text-[10px] text-muted-foreground">
                          {pixelStatus.cli.available ? (
                            <span className="text-[#3dba8a]">{pixelStatus.cli.path}</span>
                          ) : (
                            <span className="text-muted-foreground">Not found</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-border/50 p-2">
                      <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] font-medium">JSONL Directory</p>
                        <p className="font-mono text-[10px] text-muted-foreground truncate" title={pixelStatus.claudeDir}>
                          ~/.claude/projects/
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Active Sessions */}
              {pixelStatus && pixelStatus.activeSessions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Active Claude Sessions ({pixelStatus.activeSessions.length})
                  </h3>
                  <div className="max-h-40 space-y-1 overflow-auto">
                    {pixelStatus.activeSessions.map((session) => (
                      <div key={session.sessionId} className="flex items-center gap-2 rounded border border-border/50 px-2 py-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#3dba8a] animate-pulse" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-mono text-[10px]">{session.sessionId}</p>
                          <p className="text-[10px] text-muted-foreground">{session.projectSlug}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(session.lastModified).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  {pixelStatus.extension.installed && (
                    <p className="text-[10px] text-[#3dba8a]/70">
                      Pixel Agents is monitoring these sessions in VS Code
                    </p>
                  )}
                </div>
              )}

              <Separator />

              {/* Security Assessment */}
              <div className="rounded-lg bg-[#0d7a4a]/10 p-3 text-sm">
                <p className="font-medium text-[#3dba8a]">Security Assessment: LOW RISK</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  MIT license, 2.4K+ stars, zero production backend deps, no network calls,
                  no data collection, no eval/dynamic code execution. Passive read-only observer.
                </p>
              </div>

              <Separator />

              {/* Manual Install */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Manual Installation</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <Badge variant="outline" className="h-5 w-5 shrink-0 justify-center p-0 text-[10px]">1</Badge>
                    <span>Open VS Code and go to Extensions (Cmd+Shift+X)</span>
                  </li>
                  <li className="flex gap-2">
                    <Badge variant="outline" className="h-5 w-5 shrink-0 justify-center p-0 text-[10px]">2</Badge>
                    <span>Search for &quot;Pixel Agents&quot; by pablodelucca</span>
                  </li>
                  <li className="flex gap-2">
                    <Badge variant="outline" className="h-5 w-5 shrink-0 justify-center p-0 text-[10px]">3</Badge>
                    <span>Click Install — no configuration needed</span>
                  </li>
                  <li className="flex gap-2">
                    <Badge variant="outline" className="h-5 w-5 shrink-0 justify-center p-0 text-[10px]">4</Badge>
                    <span>Open command palette (Cmd+Shift+P) → &quot;Pixel Agents: Open Office&quot;</span>
                  </li>
                </ol>
                <p className="text-[10px] text-[#f5b942]">
                  Note: Primarily tested on Windows 11. macOS support is experimental.
                </p>
              </div>

              <Separator />

              {/* How It Works */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">How It Works</h3>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li>- Watches ~/.claude/projects/ for JSONL transcript files</li>
                  <li>- Each Claude Code terminal spawns a pixel art character</li>
                  <li>- Characters animate based on tool usage: typing (Write), reading (Read), running (Bash)</li>
                  <li>- Speech bubbles show when agents are waiting for input</li>
                  <li>- Office layout is customizable — drag furniture and agents</li>
                  <li>- Complements this dashboard: pixel-agents = in-editor, dashboard = web analytics</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
