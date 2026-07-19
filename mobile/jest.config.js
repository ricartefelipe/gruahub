/** @type {import('jest').Config} */
module.exports = {
  // Não usar preset: 'jest-expo' — ele conflita com moduleNameMapper dos mocks in-memory.
  // Para testes unitários da fila offline, usamos ts-jest diretamente.
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // diagnostics: false evita erros de tipo do TypeScript ao importar mocks
      // (os módulos nativos não têm @types instalados no node_modules)
      diagnostics: false,
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020', 'DOM'],
        strict: false,
        esModuleInterop: true,
        moduleResolution: 'node',
        skipLibCheck: true,
      },
    }],
  },
  moduleNameMapper: {
    '^expo-notifications$': '<rootDir>/src/__mocks__/expo-notifications.ts',
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    '^expo-secure-store$': '<rootDir>/src/__mocks__/expo-secure-store.ts',
    '^expo-network$': '<rootDir>/src/__mocks__/expo-network.ts',
    '^expo-constants$': '<rootDir>/src/__mocks__/expo-constants.ts',
    '^expo-location$': '<rootDir>/src/__mocks__/expo-location.ts',
  },
};
