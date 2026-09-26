import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadTestEnv } from './env';

/** Recrée la base de test jetable puis applique les migrations (comme en production). */
export default async function setup(): Promise<void> {
  const url = new URL(loadTestEnv());
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const prisma = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await prisma.$disconnect();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'ignore',
  });
}
