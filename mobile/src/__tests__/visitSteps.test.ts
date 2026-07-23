import { VISIT_STEPS, getVisitStep } from '../ui/visitSteps';

describe('visitSteps', () => {
  it('tem 4 passos', () => {
    expect(VISIT_STEPS).toHaveLength(4);
    expect(getVisitStep(3).id).toBe('stock');
    expect(getVisitStep(3).title).toBe('Estoque / QR');
  });
});
