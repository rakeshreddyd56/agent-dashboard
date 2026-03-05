'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/lib/store/project-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send, RefreshCw, Trash2, Sparkles, Bot,
  FlaskConical, Code2, Rocket,
} from 'lucide-react';

type FloorId = 1 | 2 | 3;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  from: string;
  createdAt: string;
}

const FLOOR_TABS: { id: FloorId; label: string; rataa: string; icon: typeof FlaskConical; color: string; bgColor: string }[] = [
  { id: 1, label: 'F1: Research', rataa: 'Robin', icon: FlaskConical, color: '#f59e0b', bgColor: 'rgba(245,158,11,0.1)' },
  { id: 2, label: 'F2: Dev', rataa: 'Nami & Franky', icon: Code2, color: '#3b82f6', bgColor: 'rgba(59,130,246,0.1)' },
  { id: 3, label: 'F3: Ops', rataa: 'Luffy', icon: Rocket, color: '#a855f7', bgColor: 'rgba(168,85,247,0.1)' },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function RataaChatPanel() {
  const projectId = useProjectStore((s) => s.activeProjectId);
  const [activeFloor, setActiveFloor] = useState<FloorId>(1);
  const [messages, setMessages] = useState<Map<FloorId, ChatMessage[]>>(new Map());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const floorMessages = messages.get(activeFloor) || [];
  const activeTab = FLOOR_TABS.find(t => t.id === activeFloor)!;

  // Load history on mount / floor change
  const loadHistory = useCallback(async (floor: FloorId) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/rataa-chat?projectId=${projectId}&floor=${floor}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => new Map(prev).set(floor, data.messages || []));
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    loadHistory(activeFloor);
  }, [activeFloor, loadHistory]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [floorMessages]);

  const sendMessage = async (content: string, action?: 'summary' | 'status') => {
    if (!projectId) return;
    if (!action && !content.trim()) return;

    setLoading(true);
    setLoadingAction(action || 'chat');

    // Add user message optimistically (unless action-only)
    if (!action && content.trim()) {
      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        from: 'dashboard',
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => {
        const updated = new Map(prev);
        updated.set(activeFloor, [...(updated.get(activeFloor) || []), userMsg]);
        return updated;
      });
      setInput('');
    }

    try {
      const res = await fetch('/api/rataa-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          floor: activeFloor,
          ...(action ? { action } : { message: content.trim() }),
        }),
      });

      const data = await res.json();

      if (data.response) {
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          from: activeTab.rataa,
          createdAt: new Date().toISOString(),
        };

        // For actions, add both a synthetic user message and the response
        if (action) {
          const actionMsg: ChatMessage = {
            id: `action-${Date.now()}`,
            role: 'user',
            content: action === 'summary' ? '/summary' : '/status',
            from: 'dashboard',
            createdAt: new Date().toISOString(),
          };
          setMessages(prev => {
            const updated = new Map(prev);
            updated.set(activeFloor, [...(updated.get(activeFloor) || []), actionMsg, assistantMsg]);
            return updated;
          });
        } else {
          setMessages(prev => {
            const updated = new Map(prev);
            updated.set(activeFloor, [...(updated.get(activeFloor) || []), assistantMsg]);
            return updated;
          });
        }
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Connection failed. Make sure OPENROUTER_API_KEY is set in .env.local.',
        from: 'system',
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => {
        const updated = new Map(prev);
        updated.set(activeFloor, [...(updated.get(activeFloor) || []), errorMsg]);
        return updated;
      });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const handleClear = async () => {
    if (!projectId) return;
    await fetch('/api/rataa-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, floor: activeFloor, action: 'clear' }),
    });
    setMessages(prev => {
      const updated = new Map(prev);
      updated.set(activeFloor, []);
      return updated;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <Card className="border-border/50 flex flex-col h-[600px]">
      <CardHeader className="pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Rataa Chat
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost" size="sm"
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => sendMessage('', 'status')}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loadingAction === 'status' ? 'animate-spin' : ''}`} />
              Status
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => sendMessage('', 'summary')}
              disabled={loading}
            >
              <Sparkles className={`h-3 w-3 ${loadingAction === 'summary' ? 'animate-spin' : ''}`} />
              Summary
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-6 text-[10px] px-1.5 text-muted-foreground"
              onClick={handleClear}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Floor tabs */}
        <div className="flex gap-1">
          {FLOOR_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFloor(tab.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                backgroundColor: activeFloor === tab.id ? tab.bgColor : 'transparent',
                color: activeFloor === tab.id ? tab.color : 'var(--muted-foreground)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: activeFloor === tab.id ? `${tab.color}30` : 'transparent',
              }}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages area */}
        <ScrollArea className="flex-1 px-4">
          <div ref={scrollRef} className="space-y-3 py-3">
            {floorMessages.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <activeTab.icon className="h-8 w-8 mx-auto" style={{ color: activeTab.color, opacity: 0.5 }} />
                <p className="text-sm text-muted-foreground">
                  Chat with <span className="font-medium" style={{ color: activeTab.color }}>{activeTab.rataa}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Ask about floor status, agents, tasks, or request a summary.
                </p>
              </div>
            ) : (
              floorMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-0.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium" style={{
                      color: msg.role === 'assistant' ? activeTab.color : 'var(--muted-foreground)',
                    }}>
                      {msg.role === 'user' ? 'You' : activeTab.rataa}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                  </div>
                  <div
                    className={`rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent/40 text-foreground'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-start gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium" style={{ color: activeTab.color }}>
                    {activeTab.rataa}
                  </span>
                </div>
                <div className="bg-accent/40 rounded-lg px-3 py-2 text-sm">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${activeTab.rataa}...`}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              rows={1}
              disabled={loading}
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{ backgroundColor: activeTab.color }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 mt-2">
            <Badge
              variant="outline"
              className="text-[9px] cursor-pointer hover:bg-accent/50"
              onClick={() => sendMessage('What are my agents working on right now?')}
            >
              Agent status
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] cursor-pointer hover:bg-accent/50"
              onClick={() => sendMessage('Are there any blockers or issues?')}
            >
              Blockers
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] cursor-pointer hover:bg-accent/50"
              onClick={() => sendMessage('What tasks are in progress and what\'s next?')}
            >
              Task pipeline
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
