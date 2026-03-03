import { create } from 'zustand';

export interface Message {
  id: string;
  projectId: string;
  conversationId: string;
  fromAgent: string;
  toAgent?: string;
  content: string;
  messageType: string;
  metadata?: unknown;
  readAt?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  projectId: string;
  name?: string;
  participants: string[];
  lastMessageAt?: string;
  createdAt: string;
}

interface MessageStore {
  messages: Message[];
  conversations: Conversation[];
  activeConversationId: string | null;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  getUnreadCount: (agentId?: string) => number;
}

const MAX_MESSAGES = 500;

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  conversations: [],
  activeConversationId: null,

  setMessages: (messages) => set({ messages: messages.slice(-MAX_MESSAGES) }),

  addMessage: (message) => set((state) => {
    const messages = [...state.messages, message].slice(-MAX_MESSAGES);
    // Update conversation's lastMessageAt
    const conversations = state.conversations.map((c) =>
      c.id === message.conversationId
        ? { ...c, lastMessageAt: message.createdAt }
        : c
    );
    return { messages, conversations };
  }),

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  getUnreadCount: (agentId) => {
    const { messages } = get();
    if (!agentId) return 0;
    return messages.filter((m) => m.toAgent === agentId && !m.readAt).length;
  },
}));
