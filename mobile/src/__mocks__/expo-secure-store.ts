/**
 * Mock de expo-secure-store para testes unitários.
 * Armazena em um Map em memória — sem Keychain/Keystore.
 */

const store = new Map<string, string>();

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Utilitário de teste — limpa o store entre casos. */
export function __clearAll(): void {
  store.clear();
}
