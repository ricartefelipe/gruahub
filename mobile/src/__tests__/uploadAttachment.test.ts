jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(async () => 'ZmFrZQ=='),
}));

const apiFetch = jest.fn(async () => ({ ok: true }));
jest.mock('../api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { uploadVisitAttachment } from '../api/uploadAttachment';

describe('uploadVisitAttachment', () => {
  beforeEach(() => {
    apiFetch.mockClear();
  });

  it('posta base64 no endpoint de anexos da visita', async () => {
    await uploadVisitAttachment(
      {
        visitId: '11111111-1111-1111-1111-111111111111',
        clientOperationId: '22222222-2222-2222-2222-222222222222',
        localUri: 'file:///tmp/a.jpg',
        kind: 'VISIT_EVIDENCE',
      },
      { accessToken: 'tok', tenantId: 'tenant' },
    );

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/v1/visits/11111111-1111-1111-1111-111111111111/attachments',
      expect.objectContaining({
        method: 'POST',
        accessToken: 'tok',
        tenantId: 'tenant',
      }),
    );
    const body = JSON.parse(apiFetch.mock.calls[0][1].body as string);
    expect(body.base64Data).toBe('ZmFrZQ==');
    expect(body.attachmentType).toBe('VISIT_EVIDENCE');
  });
});
