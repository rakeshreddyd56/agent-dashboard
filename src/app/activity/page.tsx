'use client';

import { EventStream } from '@/components/activity/event-stream';

export default function ActivityPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Activity</h1>
      <EventStream />
    </div>
  );
}
