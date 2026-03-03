'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMessageStore, type Message, type Conversation } from '@/lib/store/message-store';
import { useProjectStore } from '@/lib/store/project-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, ArrowLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessagePanel() {
  const projectId = useProjectStore((s) => s.activeProjectId);
  const {
    messages, conversations, activeConversationId,
    setMessages, setConversations, setActiveConversation, addMessage,
  } = useMessageStore();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/conversations?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch { /* ignore */ }
  }, [projectId, setConversations]);

  const fetchMessages = useCallback(async (convId: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/messages?projectId=${projectId}&conversationId=${convId}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch { /* ignore */ }
  }, [projectId, setMessages]);

  useEffect(() => {
    if (open) fetchConversations();
  }, [open, fetchConversations]);

  useEffect(() => {
    if (activeConversationId) fetchMessages(activeConversationId);
  }, [activeConversationId, fetchMessages]);

  const handleSend = async () => {
    if (!input.trim() || !projectId || !activeConversationId) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const fromAgent = 'dashboard';
    const toAgent = activeConv?.participants?.find((p: string) => p !== 'dashboard') || undefined;

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fromAgent,
          toAgent,
          content: input.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        addMessage({
          id: data.id,
          projectId,
          conversationId: activeConversationId,
          fromAgent,
          toAgent,
          content: input.trim(),
          messageType: 'text',
          createdAt: new Date().toISOString(),
        });
        setInput('');
      }
    } catch { /* ignore */ }
  };

  const activeMessages = activeConversationId
    ? messages.filter((m) => m.conversationId === activeConversationId)
    : [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MessageSquare className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {activeConversationId && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setActiveConversation(null)}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <SheetTitle className="text-sm">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.name || 'Messages'
                : 'Conversations'}
            </SheetTitle>
          </div>
        </SheetHeader>

        {!activeConversationId ? (
          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No conversations yet. Agents will create conversations when they message each other.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {conversations.map((conv: Conversation) => (
                  <button
                    key={conv.id}
                    className="w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                    onClick={() => setActiveConversation(conv.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{conv.name || conv.id}</span>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {conv.participants.map((p: string) => (
                        <Badge key={p} variant="outline" className="text-[10px] px-1 py-0">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        ) : (
          <>
            <ScrollArea className="flex-1 px-4 py-2">
              {activeMessages.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No messages yet
                </div>
              ) : (
                <div className="space-y-3">
                  {activeMessages.map((msg: Message) => (
                    <div key={msg.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{msg.fromAgent}</span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground bg-accent/30 rounded px-2.5 py-1.5">
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="border-t border-border p-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="text-sm"
                />
                <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
