import { apiGet } from '../api/apiClient';
import { pageContent } from './stockMovement';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMachineQrPayload(data: string): string {
  const raw = data.trim();
  try {
    const url = new URL(raw);
    if (url.protocol === 'gruahub:') {
      if (url.pathname.startsWith('//machine/')) {
        return url.pathname.replace('//machine/', '');
      }
      if (url.hostname === 'machine' && url.pathname.length > 1) {
        return url.pathname.replace(/^\//, '');
      }
    }
  } catch {
    // not a URL
  }
  return raw;
}

export function isMachineUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

interface MachineListItem {
  id: string;
  assetNumber?: string;
  qrCode?: string;
}

export async function resolveMachineId(
  scanned: string,
  accessToken: string,
  tenantId?: string | null
): Promise<{ machineId: string } | { error: string }> {
  const token = parseMachineQrPayload(scanned);
  if (isMachineUuid(token)) {
    return { machineId: token };
  }

  if (!accessToken) {
    return {
      error:
        'QR não é UUID e não há sessão para resolver por patrimônio/código. Faça login e tente online.',
    };
  }

  try {
    const res = await apiGet('/api/v1/machines?page=0&size=100', {
      accessToken,
      tenantId: tenantId || undefined,
    });
    const body = await res.json();
    const machines = pageContent<MachineListItem>(body);
    const needle = token.toLowerCase();
    const match = machines.find(
      (m) =>
        (m.qrCode && m.qrCode.toLowerCase() === needle) ||
        (m.assetNumber && m.assetNumber.toLowerCase() === needle) ||
        m.id === token
    );
    if (!match) {
      return {
        error: `Nenhuma máquina encontrada para "${token.slice(0, 40)}". Use UUID, patrimônio (MAQUINA-001) ou qr_code do seed.`,
      };
    }
    return { machineId: match.id };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'erro de rede';
    return {
      error: `Não foi possível resolver a máquina online: ${message}`,
    };
  }
}
