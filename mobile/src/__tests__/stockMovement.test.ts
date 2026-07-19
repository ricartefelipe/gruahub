import {
  STOCK_MOVEMENT_TYPES,
  buildReplenishPayloads,
  pageContent,
} from '../inventory/stockMovement';

describe('buildReplenishPayloads', () => {
  test('gera STOCK_IN apenas para quantidades positivas', () => {
    const payloads = buildReplenishPayloads('machine-1', [
      { prizeId: 'p1', quantityDelta: 5, notes: '  visita  ' },
      { prizeId: 'p2', quantityDelta: 0 },
      { prizeId: 'p3', quantityDelta: -2 },
      { prizeId: 'p4', quantityDelta: 1.9 },
    ]);

    expect(payloads).toEqual([
      {
        machineId: 'machine-1',
        prizeId: 'p1',
        movementType: STOCK_MOVEMENT_TYPES.STOCK_IN,
        quantityDelta: 5,
        notes: 'visita',
      },
      {
        machineId: 'machine-1',
        prizeId: 'p4',
        movementType: STOCK_MOVEMENT_TYPES.STOCK_IN,
        quantityDelta: 1,
      },
    ]);
  });

  test('retorna vazio quando nada a repor', () => {
    expect(buildReplenishPayloads('m', [{ prizeId: 'p', quantityDelta: 0 }])).toEqual([]);
  });
});

describe('pageContent', () => {
  test('aceita array direto ou PageResponse.content', () => {
    expect(pageContent<number>([1, 2])).toEqual([1, 2]);
    expect(pageContent<number>({ content: [3] })).toEqual([3]);
    expect(pageContent<number>({})).toEqual([]);
  });
});
