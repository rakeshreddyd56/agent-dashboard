import { watch, type FSWatcher } from 'chokidar';
import { syncProject } from './sync-engine';
import type { Project } from '@/lib/types';

const DEBOUNCE_MS = 500;
const RESTART_DELAY_MS = 5000;

class FileWatcherManager {
  private watchers: Map<string, FSWatcher> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private projects: Map<string, Project> = new Map();

  async startWatching(project: Project) {
    // Stop existing watcher for this project
    this.stopWatching(project.id);
    this.projects.set(project.id, project);

    // Do initial sync before registering watcher
    try {
      await syncProject(project);
    } catch (err) {
      console.error(`Initial sync failed for ${project.name}:`, err);
    }

    const watchPath = project.coordinationPath;

    const watcher = watch(watchPath, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    watcher.on('all', (_event, _path) => {
      // Debounce syncs
      const existing = this.debounceTimers.get(project.id);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(
        project.id,
        setTimeout(() => {
          syncProject(project).catch(console.error);
          this.debounceTimers.delete(project.id);
        }, DEBOUNCE_MS)
      );
    });

    watcher.on('error', (error) => {
      console.error(`Watcher error for ${project.name}:`, error);
      // Stop and restart after delay
      this.stopWatching(project.id);
      setTimeout(() => {
        const savedProject = this.projects.get(project.id);
        if (savedProject) {
          this.startWatching(savedProject).catch(console.error);
        }
      }, RESTART_DELAY_MS);
    });

    this.watchers.set(project.id, watcher);
    // Heartbeat checking is handled by the scheduler (5-min interval)
  }

  stopWatching(projectId: string) {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectId);
    }
    const timer = this.debounceTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectId);
    }
  }

  stopAll() {
    for (const [id] of this.watchers) {
      this.stopWatching(id);
    }
    this.projects.clear();
  }

  isWatching(projectId: string): boolean {
    return this.watchers.has(projectId);
  }
}

// globalThis singleton to survive HMR
const key = '__file_watcher_manager__';
const g = globalThis as unknown as Record<string, FileWatcherManager>;
if (!g[key]) {
  g[key] = new FileWatcherManager();
}

export const fileWatcher: FileWatcherManager = g[key];
