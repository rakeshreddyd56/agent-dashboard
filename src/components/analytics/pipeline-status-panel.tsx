'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PipelineStep {
  templateId: string;
  taskId?: string;
}

interface PipelineRun {
  id: string;
  pipelineId: string;
  status: string;
  currentStep: number;
  stepsSnapshot: PipelineStep[];
  triggeredBy: string;
  startedAt?: string;
  completedAt?: string;
}

interface PipelineStatusPanelProps {
  projectId: string;
  loading?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  running: '#f5b942',
  completed: '#4ade80',
  failed: '#e05252',
  cancelled: '#a1a1aa',
  pending: '#71717a',
};

export function PipelineStatusPanel({ projectId, loading }: PipelineStatusPanelProps) {
  const [runs, setRuns] = useState<PipelineRun[]>([]);

  const fetchRuns = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/pipelines/runs?projectId=${projectId}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 30_000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Pipeline Runs</CardTitle>
        <p className="text-[10px] text-muted-foreground">{runs.length} recent runs</p>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No pipeline runs
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <div key={run.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{run.pipelineId.slice(0, 20)}</span>
                  <Badge
                    style={{
                      backgroundColor: `${STATUS_COLORS[run.status] || '#71717a'}20`,
                      color: STATUS_COLORS[run.status] || '#71717a',
                    }}
                    className="text-[10px] border-0"
                  >
                    {run.status}
                  </Badge>
                </div>
                {/* Step progress indicator */}
                <div className="flex items-center gap-1">
                  {run.stepsSnapshot.map((_step, idx) => {
                    const isCompleted = idx < run.currentStep;
                    const isCurrent = idx === run.currentStep && run.status === 'running';
                    const isPending = idx > run.currentStep;
                    return (
                      <div key={idx} className="flex items-center">
                        {idx > 0 && (
                          <div
                            className="w-4 h-0.5"
                            style={{
                              backgroundColor: isCompleted ? '#4ade80' : '#3f3f46',
                            }}
                          />
                        )}
                        <div
                          className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                            isCurrent ? 'animate-pulse' : ''
                          }`}
                          style={{
                            borderColor: isCompleted ? '#4ade80' : isCurrent ? '#f5b942' : '#3f3f46',
                            backgroundColor: isCompleted ? '#4ade80' : 'transparent',
                          }}
                          title={`Step ${idx + 1}${isCompleted ? ' (done)' : isCurrent ? ' (active)' : ' (pending)'}`}
                        >
                          {isCompleted && (
                            <span className="text-[6px] text-black font-bold">{'\u2713'}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Step {Math.min(run.currentStep + 1, run.stepsSnapshot.length)} of {run.stepsSnapshot.length}
                  {run.triggeredBy && ` · by ${run.triggeredBy}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
