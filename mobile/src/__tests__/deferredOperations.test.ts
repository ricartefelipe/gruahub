import { isDeferredSyncOperation } from '../sync/deferredOperations';

describe('isDeferredSyncOperation', () => {
  it('marca UPLOAD_PHOTO como deferido', () => {
    expect(isDeferredSyncOperation('UPLOAD_PHOTO')).toBe(true);
  });

  it('não defere operações com API', () => {
    expect(isDeferredSyncOperation('COMPLETE_VISIT')).toBe(false);
    expect(isDeferredSyncOperation('START_VISIT')).toBe(false);
  });
});
