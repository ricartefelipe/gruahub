import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { apiFetch } from './apiClient';

export type UploadAttachmentPayload = {
  visitId: string;
  clientOperationId: string;
  localUri: string;
  kind?: string;
  contentType?: string;
  filename?: string;
  machineId?: string;
};

/**
 * Lê a foto local e envia JSON base64 para POST /api/v1/visits/{visitId}/attachments.
 */
export async function uploadVisitAttachment(
  payload: UploadAttachmentPayload,
  opts: { accessToken: string; tenantId?: string },
): Promise<void> {
  const base64 = await readAsStringAsync(payload.localUri, {
    encoding: EncodingType.Base64,
  });

  const contentType = payload.contentType ?? 'image/jpeg';
  const filename = payload.filename ?? `visit-${payload.visitId.slice(0, 8)}.jpg`;

  await apiFetch(`/api/v1/visits/${payload.visitId}/attachments`, {
    method: 'POST',
    accessToken: opts.accessToken,
    tenantId: opts.tenantId,
    operationId: payload.clientOperationId,
    body: JSON.stringify({
      clientOperationId: payload.clientOperationId,
      base64Data: base64,
      contentType,
      filename,
      attachmentType: payload.kind ?? 'VISIT_EVIDENCE',
      machineId: payload.machineId ?? null,
    }),
  });
}
