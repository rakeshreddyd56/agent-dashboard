'use client';

import { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store/project-store';
import { useOfficeStore } from '@/lib/store/office-store';
import { FloorStack } from '@/components/office/floor-stack';
import { FloorStateStepper } from '@/components/office/floor-state-stepper';
import { CouncilVotesChart } from '@/components/office/council-votes-chart';
import { IdeaCard } from '@/components/office/idea-card';
import { MemoryBrowser } from '@/components/office/memory-browser';
import { CommunicationTimeline } from '@/components/office/communication-timeline';
import { SoulEditor } from '@/components/office/soul-editor';
import type { OfficeState, FloorNumber, ResearchIdea, CouncilVote } from '@/lib/types';

const TABS = ['Floors', 'Research', 'Memory', 'Communications'] as const;
type Tab = typeof TABS[number];

export default function OfficePage() {
  const [activeTab, setActiveTab] = useState<Tab>('Floors');
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const store = useOfficeStore();

  useEffect(() => {
    if (!activeProjectId) return;
    store.setLoading(true);

    fetch(`/api/office?projectId=${activeProjectId}`)
      .then((r) => r.json())
      .then((data) => {
        store.setOfficeData({
          state: data.state,
          activeFloor: data.activeFloor,
          currentSession: data.currentSession,
          recentSessions: data.recentSessions,
          floorStatuses: data.floorStatuses,
          councilMembers: data.councilMembers,
        });
      })
      .catch(console.error)
      .finally(() => store.setLoading(false));

    fetch(`/api/office/communications?projectId=${activeProjectId}`)
      .then((r) => r.json())
      .then((data) => store.setCommunications(data.communications || []))
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const handleTriggerResearch = async () => {
    if (!activeProjectId) return;
    const res = await fetch('/api/office', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProjectId, action: 'trigger_research' }),
    });
    const data = await res.json();
    if (data.ok) {
      store.setOfficeState('CLONING');
    }
  };

  // Parse ideas and votes from current session
  let selectedIdeas: ResearchIdea[] = [];
  let votes: CouncilVote[] = [];
  try {
    if (store.currentSession?.selectedIdea) {
      selectedIdeas = JSON.parse(store.currentSession.selectedIdea);
    }
    if (store.currentSession?.votes) {
      votes = JSON.parse(store.currentSession.votes);
    }
  } catch { /* ignore */ }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">3-Floor Office</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Research → Development → Deploy
          </p>
        </div>
        <button
          onClick={handleTriggerResearch}
          disabled={store.officeState !== 'IDLE' && store.officeState !== 'COMPLETE'}
          className="px-4 py-2 bg-[#6366f1] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#5558e6] transition-colors"
        >
          Start Ideation
        </button>
      </div>

      {/* State Stepper */}
      <FloorStateStepper state={store.officeState} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#6366f1] text-[#6366f1]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Floors' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <FloorStack
              floorStatuses={store.floorStatuses}
              activeFloor={store.activeFloor}
              officeState={store.officeState}
            />
          </div>
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Council Members</h3>
              {store.councilMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No council members yet. Start ideation to auto-seed.</p>
              ) : (
                <div className="space-y-2">
                  {store.councilMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground">{m.role === 'chairman' ? '👑' : '🔬'} {m.provider}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Current State</h3>
              <div className="text-2xl font-bold text-[#6366f1]">{store.officeState}</div>
              {store.activeFloor && (
                <p className="text-xs text-muted-foreground mt-1">Active Floor: {store.activeFloor}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Research' && (
        <div className="space-y-4">
          {selectedIdeas.length > 0 ? (
            <>
              <h3 className="text-lg font-semibold">Selected Ideas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedIdeas.map((idea, i) => (
                  <IdeaCard key={i} idea={idea} index={i} />
                ))}
              </div>
              {votes.length > 0 && (
                <>
                  <h3 className="text-lg font-semibold mt-6">Council Votes</h3>
                  <CouncilVotesChart votes={votes} ideas={selectedIdeas} />
                </>
              )}
              {store.currentSession?.ideationPlan && (
                <div className="bg-card border border-border rounded-lg p-4">
                  <h3 className="text-sm font-semibold mb-2">Ideation Plan</h3>
                  <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                    {store.currentSession.ideationPlan}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No research sessions yet.</p>
              <p className="text-sm mt-1">Click &quot;Start Ideation&quot; to begin.</p>
            </div>
          )}

          {/* Recent Sessions */}
          {store.recentSessions.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-3">Session History</h3>
              <div className="space-y-2">
                {store.recentSessions.map((s) => (
                  <div key={s.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{s.date}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.state}</span>
                    </div>
                    {s.topic && <span className="text-xs text-muted-foreground">{s.topic}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Memory' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MemoryBrowser projectId={activeProjectId || ''} />
          <SoulEditor />
        </div>
      )}

      {activeTab === 'Communications' && (
        <CommunicationTimeline
          communications={store.communications}
          projectId={activeProjectId || ''}
        />
      )}
    </div>
  );
}
