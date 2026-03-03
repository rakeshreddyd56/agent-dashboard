'use client';

import { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '@/lib/store/project-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Calendar, Users, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface AgentReport {
  agentId: string;
  role: string;
  status: string;
  completed: string[];
  inProgress: string[];
  blocked: string[];
  eventCount: number;
}

interface StandupReport {
  id: string;
  date: string;
  report: {
    date: string;
    summary: {
      totalTasks: number;
      byStatus: Record<string, number>;
      activeAgents: number;
      totalAgents: number;
      todayEvents: number;
      overdueCritical: { id: string; title: string; status: string }[];
    };
    agents: AgentReport[];
  };
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  working: '#0d7a4a',
  idle: '#8d5a0f',
  offline: '#476256',
  blocked: '#a4312f',
  reviewing: '#d5601d',
};

export default function StandupPage() {
  const projectId = useProjectStore((s) => s.activeProjectId);
  const [report, setReport] = useState<StandupReport | null>(null);
  const [history, setHistory] = useState<StandupReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const fetchReport = useCallback(async (date: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/standup?projectId=${projectId}&date=${date}`);
      if (res.ok) {
        const data = await res.json();
        if (data.report) setReport(data.report);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  const fetchHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/standup?projectId=${projectId}&limit=7`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.reports || []);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchReport(selectedDate);
    fetchHistory();
  }, [selectedDate, fetchReport, fetchHistory]);

  const generateReport = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/standup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, date: selectedDate }),
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        fetchHistory();
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Standup</h1>
          <p className="text-sm text-muted-foreground">Automated daily summary of team progress</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <Button onClick={generateReport} disabled={loading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Generate
          </Button>
        </div>
      </div>

      {/* History chips */}
      {history.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {history.map((h) => (
            <Button
              key={h.date}
              variant={h.date === selectedDate ? 'default' : 'outline'}
              size="sm"
              className="text-xs"
              onClick={() => { setSelectedDate(h.date); setReport(h); }}
            >
              <Calendar className="h-3 w-3 mr-1" />
              {h.date}
            </Button>
          ))}
        </div>
      )}

      {!report ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No standup report for {selectedDate}.</p>
            <p className="text-sm mt-1">Click &quot;Generate&quot; to create one.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Active Agents
                </div>
                <div className="text-2xl font-bold mt-1">
                  {report.report.summary.activeAgents}/{report.report.summary.totalAgents}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4" />
                  Tasks Done
                </div>
                <div className="text-2xl font-bold mt-1">
                  {report.report.summary.byStatus['DONE'] || 0}/{report.report.summary.totalTasks}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  In Progress
                </div>
                <div className="text-2xl font-bold mt-1">
                  {report.report.summary.byStatus['IN_PROGRESS'] || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  Critical Overdue
                </div>
                <div className="text-2xl font-bold mt-1 text-[#a4312f]">
                  {report.report.summary.overdueCritical.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overdue critical */}
          {report.report.summary.overdueCritical.length > 0 && (
            <Card className="border-[#a4312f]/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#a4312f] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Critical Overdue Tasks (P0)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {report.report.summary.overdueCritical.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                      {t.title}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Per-agent reports */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {report.report.agents.map((agent) => (
              <Card key={agent.agentId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{agent.agentId}</CardTitle>
                    <Badge
                      style={{
                        backgroundColor: `${STATUS_COLORS[agent.status] || '#476256'}20`,
                        color: STATUS_COLORS[agent.status] || '#476256',
                      }}
                      className="text-[10px] border-0"
                    >
                      {agent.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{agent.role} · {agent.eventCount} events today</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {agent.completed.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#0d7a4a] uppercase">Completed</p>
                      <ul className="text-xs text-muted-foreground">
                        {agent.completed.map((t, i) => <li key={i}>✓ {t}</li>)}
                      </ul>
                    </div>
                  )}
                  {agent.inProgress.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#8d5a0f] uppercase">In Progress</p>
                      <ul className="text-xs text-muted-foreground">
                        {agent.inProgress.map((t, i) => <li key={i}>→ {t}</li>)}
                      </ul>
                    </div>
                  )}
                  {agent.blocked.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#a4312f] uppercase">Blocked/Failed</p>
                      <ul className="text-xs text-muted-foreground">
                        {agent.blocked.map((t, i) => <li key={i}>✗ {t}</li>)}
                      </ul>
                    </div>
                  )}
                  {agent.completed.length === 0 && agent.inProgress.length === 0 && agent.blocked.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No task activity</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
