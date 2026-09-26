import base from '@agenda/config/eslint';

export default [
  ...base,
  {
    rules: {
      // NestJS s'appuie sur les métadonnées de types des constructeurs : pas d'`import type` forcé.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
