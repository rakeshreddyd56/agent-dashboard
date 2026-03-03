import fs from 'fs';
import path from 'path';

export interface ReviewSummary {
  fileName: string;
  verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'BLOCK' | 'UNKNOWN';
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  reviewer?: string;
  timestamp?: string;
}

export function readReviews(projectPath: string): ReviewSummary[] {
  const reviewsDir = path.join(projectPath, 'reviews');

  if (!fs.existsSync(reviewsDir)) return [];

  const files = fs.readdirSync(reviewsDir).filter((f) =>
    f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.json')
  );

  const reviews: ReviewSummary[] = [];

  for (const file of files) {
    const filePath = path.join(reviewsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      if (file.endsWith('.json')) {
        const parsed = JSON.parse(content);
        reviews.push({
          fileName: file,
          verdict: normalizeVerdict(parsed.verdict || parsed.decision),
          criticalCount: Number(parsed.critical || parsed.criticalCount || 0),
          highCount: Number(parsed.high || parsed.highCount || 0),
          mediumCount: Number(parsed.medium || parsed.mediumCount || 0),
          lowCount: Number(parsed.low || parsed.lowCount || 0),
          reviewer: parsed.reviewer || parsed.agent,
          timestamp: parsed.timestamp || parsed.date,
        });
      } else {
        // Parse markdown/text reviews
        reviews.push(parseTextReview(file, content));
      }
    } catch {
      // Skip unreadable files
    }
  }

  return reviews;
}

function normalizeVerdict(raw: string | undefined): ReviewSummary['verdict'] {
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase().replace(/[_\s-]/g, '');
  if (upper.includes('APPROVE')) return 'APPROVE';
  if (upper.includes('REQUESTCHANGE')) return 'REQUEST_CHANGES';
  if (upper.includes('BLOCK')) return 'BLOCK';
  return 'UNKNOWN';
}

function parseTextReview(fileName: string, content: string): ReviewSummary {
  const lower = content.toLowerCase();

  // Extract verdict
  let verdict: ReviewSummary['verdict'] = 'UNKNOWN';
  if (/verdict[:\s]*approve/i.test(content)) verdict = 'APPROVE';
  else if (/verdict[:\s]*request.changes/i.test(content)) verdict = 'REQUEST_CHANGES';
  else if (/verdict[:\s]*block/i.test(content)) verdict = 'BLOCK';

  // Count severity mentions
  const criticalCount = (lower.match(/critical/g) || []).length;
  const highCount = (lower.match(/\bhigh\b/g) || []).length;
  const mediumCount = (lower.match(/\bmedium\b/g) || []).length;
  const lowCount = (lower.match(/\blow\b/g) || []).length;

  // Try to find reviewer
  const reviewerMatch = content.match(/reviewer[:\s]*(\w[\w-]*)/i);

  return {
    fileName,
    verdict,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    reviewer: reviewerMatch ? reviewerMatch[1] : undefined,
  };
}
