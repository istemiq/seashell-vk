import { timingSafeEqualString } from './securityHelpers.js';

/**
 * Token for GET /api/admin/stats (set ADMIN_STATS_TOKEN on VPS).
 * Header: Authorization: Bearer <token>  OR  X-Admin-Stats-Token: <token>
 */
export function adminStatsToken() {
  return String(process.env.ADMIN_STATS_TOKEN ?? '').trim();
}

export function verifyAdminStatsToken(req) {
  const expected = adminStatsToken();
  if (!expected) return false;

  const auth = String(req.headers.authorization ?? '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) {
    const got = auth.slice(7).trim();
    if (got && timingSafeEqualString(got, expected)) return true;
  }

  const header = String(req.headers['x-admin-stats-token'] ?? '').trim();
  return Boolean(header && timingSafeEqualString(header, expected));
}
