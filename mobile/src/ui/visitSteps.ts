export type VisitStepId = 'checkin' | 'checklist' | 'stock' | 'complete';

export const VISIT_STEPS: ReadonlyArray<{
  step: 1 | 2 | 3 | 4;
  id: VisitStepId;
  title: string;
}> = [
  { step: 1, id: 'checkin', title: 'Check-in' },
  { step: 2, id: 'checklist', title: 'Checklist' },
  { step: 3, id: 'stock', title: 'Estoque / QR' },
  { step: 4, id: 'complete', title: 'Sangria e concluir' },
];

export function getVisitStep(step: 1 | 2 | 3 | 4) {
  return VISIT_STEPS[step - 1];
}
