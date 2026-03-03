'use client';

import { useEffect, useState } from 'react';

function formatTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TimeAgo({ date }: { date: string }) {
  const [text, setText] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setText(formatTimeAgo(date));
    const interval = setInterval(() => {
      setText(formatTimeAgo(date));
    }, 30000);
    return () => clearInterval(interval);
  }, [date]);

  if (!mounted) return <span className="text-xs text-muted-foreground">&mdash;</span>;

  return <span className="text-xs text-muted-foreground">{text}</span>;
}
