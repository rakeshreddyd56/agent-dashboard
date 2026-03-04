'use client';

import { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '@/lib/store/project-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Rocket } from 'lucide-react';
import type { Mission } from '@/lib/types';

export function MissionPanel() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [mission, setMission] = useState<Mission | null>(null);

  const fetchMission = useCallback(() => {
    if (!activeProjectId) return;
    fetch(`/api/mission?projectId=${activeProjectId}`)
      .then((r) => r.json())
      .then((d) => setMission(d.mission || null))
      .catch(() => {});
  }, [activeProjectId]);

  useEffect(() => {
    fetchMission();
  }, [fetchMission]);

  // Listen for SSE mission updates
  useEffect(() => {
    const handler = () => fetchMission();
    window.addEventListener('mission-updated', handler);
    return () => window.removeEventListener('mission-updated', handler);
  }, [fetchMission]);

  if (!mission) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Rocket className="h-4 w-4" />
          Current Mission
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{mission.goal}</p>
        {mission.techStack && (
          <p className="text-[10px] text-muted-foreground">{mission.techStack}</p>
        )}
        {mission.deliverables && mission.deliverables.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {mission.deliverables.slice(0, 5).map((d, i) => (
              <Badge key={i} variant="outline" className="text-[9px]">
                {d}
              </Badge>
            ))}
            {mission.deliverables.length > 5 && (
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                +{mission.deliverables.length - 5} more
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
