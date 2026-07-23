import { formatOfflineBannerMessage } from '../ui/offlineBannerMessage';

describe('formatOfflineBannerMessage', () => {
  it('retorna null quando online e sem pendências', () => {
    expect(formatOfflineBannerMessage(true, 0)).toBeNull();
  });

  it('mostra offline com contagem', () => {
    expect(formatOfflineBannerMessage(false, 3)).toBe('Sem rede · 3 ops na fila');
  });

  it('mostra offline sem pendências', () => {
    expect(formatOfflineBannerMessage(false, 0)).toBe('Sem rede · ops serão enfileiradas');
  });

  it('mostra pendências mesmo online', () => {
    expect(formatOfflineBannerMessage(true, 2)).toBe('2 ops aguardando sync');
  });
});
