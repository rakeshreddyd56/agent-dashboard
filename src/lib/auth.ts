import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Simple shared-secret auth for internal API endpoints.
 *
 * Set DASHBOARD_API_SECRET in .env.local to enable auth.
 * When set, requests must include `Authorization: Bearer <secret>` header.
 * When not set, auth is disabled (localhost-only development mode).
 */

const API_SECRET = process.env.DASHBOARD_API_SECRET || '';

/**
 * Validate the request has a valid auth token.
 * Returns null if valid, or a NextResponse error if invalid.
 */
export function validateAuth(req: NextRequest): NextResponse | null {
  if (!API_SECRET) {
    // No secret configured — auth disabled (dev mode)
    return null;
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authorization required. Set Authorization: Bearer <token> header.' },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(API_SECRET))) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  return null;
}

/**
 * Generate a cryptographically secure ID.
 * Replaces Date.now() + Math.random() pattern.
 */
export function secureId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}
