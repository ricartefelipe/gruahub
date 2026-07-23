export function formatOfflineBannerMessage(
  isOnline: boolean,
  pendingCount: number,
): string | null {
  if (!isOnline) {
    return pendingCount > 0
      ? `Sem rede · ${pendingCount} ops na fila`
      : 'Sem rede · ops serão enfileiradas';
  }
  if (pendingCount > 0) {
    return `${pendingCount} ops aguardando sync`;
  }
  return null;
}
