import { isDeferredSyncOperation } from '../sync/deferredOperations';

describe('isDeferredSyncOperation', () => {
  it('não defere UPLOAD_PHOTO após API de anexos', () => {
    expect(isDeferredSyncOperation('UPLOAD_PHOTO')).toBe(false);
  });

  it('não defere operações com API', () => {
    expect(isDeferredSyncOperation('COMPLETE_VISIT')).toBe(false);
    expect(isDeferredSyncOperation('START_VISIT')).toBe(false);
  });
});
