import { getDb } from './offlineQueue';

export interface CachedRouteStop {
  id: string;
  operatingPointId: string;
  pointName: string;
  address: string;
  score: number;
  reason: string;
  latitude?: number | null;
  longitude?: number | null;
}

const CACHE_TTL_HOURS = 24;

export async function saveCachedRoute(
  dateKey: string,
  stops: CachedRouteStop[]
): Promise<void> {
  const database = await getDb();
  const expires = new Date(Date.now() + CACHE_TTL_HOURS * 3600_000).toISOString();
  await database.runAsync(
    `INSERT OR REPLACE INTO cached_route (id, data, cached_at, expires_at)
     VALUES (?, ?, datetime('now'), ?)`,
    [dateKey, JSON.stringify(stops), expires]
  );
}

export async function loadCachedRoute(dateKey: string): Promise<CachedRouteStop[] | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ data: string; expires_at: string }>(
    `SELECT data, expires_at FROM cached_route WHERE id = ?`,
    [dateKey]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  try {
    const parsed = JSON.parse(row.data) as CachedRouteStop[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
