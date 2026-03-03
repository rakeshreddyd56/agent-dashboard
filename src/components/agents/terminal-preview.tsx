'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Terminal } from 'lucide-react';

interface TmuxSession {
  name: string;
  windows: number;
  created: string | null;
}

export function TerminalPreview({ sessionName }: { sessionName?: string }) {
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [content, setContent] = useState<string>('');
  const [activeSession, setActiveSession] = useState<string | null>(sessionName || null);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/tmux?action=list');
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
    } catch {
      setSessions([]);
    }
  }, []);

  const capturePane = useCallback(async (session: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tmux?action=capture&session=${encodeURIComponent(session)}&lines=100`);
      const data = await res.json();
      if (data.content) setContent(data.content);
      setActiveSession(session);
    } catch {
      setContent('[Failed to capture pane]');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (sessionName && sessions.some((s) => s.name === sessionName)) {
      capturePane(sessionName);
    }
  }, [sessionName, sessions, capturePane]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4" />
            Tmux Sessions
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchSessions}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active tmux sessions</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sessions.map((s) => (
              <Badge
                key={s.name}
                variant={activeSession === s.name ? 'default' : 'outline'}
                className="cursor-pointer text-[10px]"
                onClick={() => capturePane(s.name)}
              >
                {s.name} ({s.windows}w)
              </Badge>
            ))}
          </div>
        )}

        {activeSession && (
          <div className="rounded-md bg-[#0a1612] p-3">
            <div className="flex items-center justify-between pb-2">
              <span className="font-mono text-[10px] text-[#3dba8a]">{activeSession}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => capturePane(activeSession)}
                disabled={loading}
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <pre className="max-h-[300px] overflow-auto font-mono text-[11px] leading-tight text-[#e2ede6]">
              {content || 'Loading...'}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
