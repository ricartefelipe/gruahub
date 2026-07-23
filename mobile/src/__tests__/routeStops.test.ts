import { splitRouteStops } from '../ui/routeStops';

describe('splitRouteStops', () => {
  it('lista vazia', () => {
    expect(splitRouteStops([])).toEqual({ next: null, rest: [] });
  });

  it('uma parada', () => {
    const stops = [{ id: '1' }];
    expect(splitRouteStops(stops)).toEqual({ next: stops[0], rest: [] });
  });

  it('separa próxima e restante', () => {
    const stops = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(splitRouteStops(stops)).toEqual({ next: stops[0], rest: [stops[1], stops[2]] });
  });
});
