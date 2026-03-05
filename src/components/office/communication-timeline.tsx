'use client';

import { useState } from 'react';
import type { FloorCommunication, FloorMessageType } from '@/lib/types';

interface CommunicationTimelineProps {
  communications: FloorCommunication[];
  projectId: string;
}

const TYPE_COLORS: Record<string, string> = {
  ideation_handoff: '#6366f1',
  architecture_proposal: '#0891b2',
  architecture_feedback: '#f59e0b',
  plan_finalized: '#0d7a4a',
  tickets_created: '#3dba8a',
  build_request: '#a855f7',
  deploy_status: '#8b5cf6',
  daily_summary: '#7fa393',
};

export function CommunicationTimeline({ communications, projectId }: CommunicationTimelineProps) {
  const [showForm, setShowForm] = useState(false);

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    await fetch('/api/office/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        fromFloor: parseInt(formData.get('fromFloor') as string),
        toFloor: parseInt(formData.get('toFloor') as string),
        fromAgent: formData.get('fromAgent'),
        toAgent: formData.get('toAgent'),
        messageType: formData.get('messageType'),
        content: formData.get('content'),
      }),
    });

    setShowForm(false);
    form.reset();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Floor Communications</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1 bg-muted rounded hover:bg-muted/80"
        >
          {showForm ? 'Cancel' : 'Send Message'}
        </button>
      </div>

      {/* Manual message form */}
      {showForm && (
        <form onSubmit={handleSendMessage} className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">From Floor</label>
              <select name="fromFloor" className="w-full text-xs px-2 py-1 border border-border rounded bg-background mt-1">
                <option value="1">Floor 1</option>
                <option value="2">Floor 2</option>
                <option value="3">Floor 3</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">To Floor</label>
              <select name="toFloor" className="w-full text-xs px-2 py-1 border border-border rounded bg-background mt-1">
                <option value="1">Floor 1</option>
                <option value="2">Floor 2</option>
                <option value="3">Floor 3</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">From Agent</label>
              <input name="fromAgent" className="w-full text-xs px-2 py-1 border border-border rounded bg-background mt-1" placeholder="rataa-research" />
            </div>
            <div>
              <label className="text-xs font-medium">To Agent</label>
              <input name="toAgent" className="w-full text-xs px-2 py-1 border border-border rounded bg-background mt-1" placeholder="rataa-frontend" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Type</label>
            <select name="messageType" className="w-full text-xs px-2 py-1 border border-border rounded bg-background mt-1">
              <option value="daily_summary">Daily Summary</option>
              <option value="ideation_handoff">Ideation Handoff</option>
              <option value="architecture_proposal">Architecture Proposal</option>
              <option value="architecture_feedback">Architecture Feedback</option>
              <option value="plan_finalized">Plan Finalized</option>
              <option value="build_request">Build Request</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Content</label>
            <textarea name="content" rows={3} className="w-full text-xs px-2 py-1 border border-border rounded bg-background mt-1" placeholder="Message content..." />
          </div>
          <button type="submit" className="px-3 py-1 bg-[#6366f1] text-white text-xs rounded">
            Send
          </button>
        </form>
      )}

      {/* Timeline */}
      {communications.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No communications yet
        </div>
      ) : (
        <div className="space-y-2">
          {communications.map((comm) => {
            const color = TYPE_COLORS[comm.messageType] || '#7fa393';
            const isUp = comm.fromFloor < comm.toFloor;
            let content = '';
            try {
              const parsed = JSON.parse(comm.content);
              content = typeof parsed === 'string' ? parsed : (parsed.summary || parsed.message || JSON.stringify(parsed).slice(0, 200));
            } catch {
              content = comm.content.slice(0, 200);
            }

            return (
              <div key={comm.id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{isUp ? '↑' : '↓'}</span>
                  <span className="text-xs font-medium">{comm.fromAgent}</span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <span className="text-xs font-medium">{comm.toAgent}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {comm.messageType.replace(/_/g, ' ')}
                  </span>
                  {comm.acknowledged && (
                    <span className="text-[10px] text-[#3dba8a]">✓ ACK</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{content}</p>
                <div className="text-[10px] text-muted-foreground mt-1">
                  F{comm.fromFloor} → F{comm.toFloor} | {new Date(comm.createdAt).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
