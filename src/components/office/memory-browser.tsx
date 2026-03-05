'use client';

import { useEffect, useState } from 'react';
import type { FloorNumber } from '@/lib/types';

interface MemoryBrowserProps {
  projectId: string;
}

export function MemoryBrowser({ projectId }: MemoryBrowserProps) {
  const [floor, setFloor] = useState<FloorNumber>(1);
  const [dailyLog, setDailyLog] = useState<string | null>(null);
  const [longTermMemory, setLongTermMemory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ title: string; content: string; date: string; floor: number }[]>([]);

  useEffect(() => {
    if (!projectId) return;

    // Fetch daily log
    fetch(`/api/office/memory?projectId=${projectId}&floor=${floor}&type=daily_log`)
      .then((r) => r.json())
      .then((d) => setDailyLog(d.log))
      .catch(() => setDailyLog(null));

    // Fetch long-term memory
    fetch(`/api/office/memory?projectId=${projectId}&floor=${floor}&type=long_term`)
      .then((r) => r.json())
      .then((d) => setLongTermMemory(d.content))
      .catch(() => setLongTermMemory(null));
  }, [projectId, floor]);

  const handleSearch = async () => {
    if (!searchQuery || !projectId) return;
    const res = await fetch(`/api/office/memory?projectId=${projectId}&search=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();
    setSearchResults(data.results || []);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Memory Browser</h3>
        <div className="flex gap-1">
          {([1, 2, 3] as FloorNumber[]).map((f) => (
            <button
              key={f}
              onClick={() => setFloor(f)}
              className={`px-2 py-1 text-xs rounded ${
                floor === f ? 'bg-[#6366f1] text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              F{f}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search memory..."
          className="flex-1 text-xs px-2 py-1 border border-border rounded bg-background"
        />
        <button onClick={handleSearch} className="text-xs px-2 py-1 bg-muted rounded">
          Search
        </button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          <h4 className="text-xs font-semibold text-muted-foreground">Results</h4>
          {searchResults.map((r, i) => (
            <div key={i} className="text-xs p-2 bg-muted/50 rounded">
              <div className="font-medium">{r.title}</div>
              <div className="text-muted-foreground truncate">{r.content.slice(0, 100)}...</div>
              <div className="text-[10px] text-muted-foreground mt-1">Floor {r.floor} | {r.date}</div>
            </div>
          ))}
        </div>
      )}

      {/* Daily Log */}
      <div>
        <h4 className="text-xs font-semibold mb-1">Daily Log (Floor {floor})</h4>
        <div className="bg-muted/30 rounded p-2 max-h-48 overflow-y-auto">
          {dailyLog ? (
            <pre className="text-[10px] whitespace-pre-wrap text-muted-foreground">{dailyLog}</pre>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No logs for today</p>
          )}
        </div>
      </div>

      {/* Long-Term Memory */}
      <div>
        <h4 className="text-xs font-semibold mb-1">Long-Term Memory (Floor {floor})</h4>
        <div className="bg-muted/30 rounded p-2 max-h-48 overflow-y-auto">
          {longTermMemory ? (
            <pre className="text-[10px] whitespace-pre-wrap text-muted-foreground">{longTermMemory}</pre>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No long-term memory yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
