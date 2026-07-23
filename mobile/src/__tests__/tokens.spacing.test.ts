import { spacing, radius, touchTarget, lightColors, darkColors } from '../theme/tokens';

describe('field tokens', () => {
  it('expõe spacing e touch target de campo', () => {
    expect(spacing.md).toBe(16);
    expect(touchTarget.min).toBeGreaterThanOrEqual(44);
    expect(radius.lg).toBeGreaterThan(0);
  });

  it('expõe cores de warning em light e dark', () => {
    expect(lightColors.warningBannerBg).toBeTruthy();
    expect(darkColors.warningBannerText).toBeTruthy();
  });
});
