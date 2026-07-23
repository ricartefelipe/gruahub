export function splitRouteStops<T>(stops: T[]): { next: T | null; rest: T[] } {
  if (stops.length === 0) return { next: null, rest: [] };
  return { next: stops[0], rest: stops.slice(1) };
}
