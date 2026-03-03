'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted/50 ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <Shimmer className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Shimmer className="h-32 w-full" />
        <div className="flex gap-2">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

export function SkeletonAnalyticsGrid() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-3 border-b border-border/30 px-3 py-2.5">
      <Shimmer className="h-4 w-16" />
      <Shimmer className="h-4 w-48 flex-1" />
      <Shimmer className="h-4 w-20" />
      <Shimmer className="h-4 w-16" />
      <Shimmer className="h-4 w-24" />
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border/50">
      <div className="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-3 py-2">
        <Shimmer className="h-3 w-12" />
        <Shimmer className="h-3 w-32 flex-1" />
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-3 w-12" />
        <Shimmer className="h-3 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonAgentCard() {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Shimmer className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-3 w-16" />
          </div>
          <Shimmer className="h-5 w-16 rounded-full" />
        </div>
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-3/4" />
      </CardContent>
    </Card>
  );
}

export function SkeletonAgentGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonAgentCard key={i} />
      ))}
    </div>
  );
}
