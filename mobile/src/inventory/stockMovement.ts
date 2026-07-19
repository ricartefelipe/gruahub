export const STOCK_MOVEMENT_TYPES = {
  STOCK_IN: 'STOCK_IN',
  PRIZE_GIVEN: 'PRIZE_GIVEN',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;

export type StockMovementType =
  (typeof STOCK_MOVEMENT_TYPES)[keyof typeof STOCK_MOVEMENT_TYPES];

export interface StockBalanceItem {
  machineId: string;
  machineAssetNumber?: string;
  prizeId: string;
  prizeName: string;
  sku?: string;
  currentQuantity: number;
  capacity?: number;
  occupancyPct?: number;
}

export interface ReplenishLineInput {
  prizeId: string;
  quantityDelta: number;
  notes?: string;
}

export interface StockMovementPayload {
  machineId: string;
  prizeId: string;
  movementType: StockMovementType;
  quantityDelta: number;
  notes?: string;
}

export function buildReplenishPayloads(
  machineId: string,
  lines: ReplenishLineInput[]
): StockMovementPayload[] {
  return lines
    .filter((line) => Number.isFinite(line.quantityDelta) && line.quantityDelta > 0)
    .map((line) => ({
      machineId,
      prizeId: line.prizeId,
      movementType: STOCK_MOVEMENT_TYPES.STOCK_IN,
      quantityDelta: Math.floor(line.quantityDelta),
      ...(line.notes?.trim() ? { notes: line.notes.trim() } : {}),
    }));
}

export function pageContent<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && Array.isArray((body as { content?: unknown }).content)) {
    return (body as { content: T[] }).content;
  }
  return [];
}
