import { zodResolver } from '@hookform/resolvers/zod';
import { LoginInput, RegisterInput } from '@agenda/contracts';
import type { Resolver } from 'react-hook-form';

/** Champs des formulaires de connexion et d'inscription. */
export type AuthFormValues = { email: string; password: string; displayName?: string };

const RegisterForm = RegisterInput.pick({ email: true, password: true, displayName: true });

/**
 * Validation des formulaires d'accès, avec les schémas des contrats (mêmes règles que l'API).
 * Chargé à la demande par `AuthForm` : Zod pèse plus lourd que la page de connexion elle-même.
 */
export function authResolver(mode: 'login' | 'register'): Resolver<AuthFormValues> {
  return zodResolver(mode === 'login' ? LoginInput : RegisterForm) as Resolver<AuthFormValues>;
}
