import {
  colorsForTheme,
  darkColors,
  lightColors,
  parseStoredTheme,
} from '../theme/tokens';

describe('parseStoredTheme', () => {
  it('aceita light e dark', () => {
    expect(parseStoredTheme('light')).toBe('light');
    expect(parseStoredTheme('dark')).toBe('dark');
  });

  it('volta para light em valores inválidos', () => {
    expect(parseStoredTheme(null)).toBe('light');
    expect(parseStoredTheme('')).toBe('light');
    expect(parseStoredTheme('system')).toBe('light');
  });
});

describe('colorsForTheme', () => {
  it('retorna paleta clara e escura distintas', () => {
    expect(colorsForTheme('light')).toBe(lightColors);
    expect(colorsForTheme('dark')).toBe(darkColors);
    expect(darkColors.background).not.toBe(lightColors.background);
    expect(darkColors.surface).not.toBe(lightColors.surface);
  });
});
