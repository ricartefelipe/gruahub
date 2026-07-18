/**
 * Mock de expo-network para testes unitários.
 */

let _isConnected = true;

export function __setConnected(v: boolean): void {
  _isConnected = v;
}

export async function getNetworkStateAsync() {
  return { isConnected: _isConnected, isInternetReachable: _isConnected };
}
