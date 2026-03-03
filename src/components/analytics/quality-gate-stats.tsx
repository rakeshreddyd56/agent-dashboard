'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock, BarChart3 } from 'lucide-react';

interface QualityReview {
  id: string;
  taskId: string;
  reviewer: string;
  status: string;
  createdAt: string;
}

interface QualityGateStatsProps {
  projectId: string;
  loading?: boolean;
}

export function QualityGateStats({ projectId, loading }: QualityGateStatsProps) {
  const [reviews, setReviews] = useState<QualityReview[]>([]);

  const fetchReviews = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/quality-reviews?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const total = reviews.length;
  const approved = reviews.filter((r) => r.status === 'approved').length;
  const rejected = reviews.filter((r) => r.status === 'rejected' || r.status === 'needs_changes').length;
  const pending = reviews.filter((r) => r.status === 'pending').length;
  const rate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const stats = [
    { label: 'Approval Rate', value: `${rate}%`, icon: BarChart3, color: '#4ade80' },
    { label: 'Approved', value: approved, icon: CheckCircle, color: '#0d7a4a' },
    { label: 'Rejected', value: rejected, icon: XCircle, color: '#a4312f' },
    { label: 'Pending', value: pending, icon: Clock, color: '#f5b942' },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quality Gate</CardTitle>
        <p className="text-[10px] text-muted-foreground">{total} reviews total</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md"
                style={{ backgroundColor: `${stat.color}20` }}
              >
                <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
