import { FlatCompat } from '@eslint/eslintrc';
import base from '@agenda/config/eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...base,
  ...compat.extends('next/core-web-vitals'),
  { ignores: ['.next/**', 'out/**', 'next-env.d.ts'] },
];
