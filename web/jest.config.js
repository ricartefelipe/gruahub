const nextJest = require('next/jest');

// Transformação TS/TSX via SWC do Next (sem dependência extra); mesma configuração de ambiente de antes.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/.next/'],
  modulePathIgnorePatterns: ['<rootDir>/e2e/'],
};

module.exports = createJestConfig(config);
