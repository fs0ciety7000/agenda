import {
  type CipherGCM,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  type ScryptOptions,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

/**
 * Sauvegarde chiffrée par une phrase de passe (fichier `.tandem`) :
 * `TNDMENC1` · log2(N) de scrypt (1 octet) · sel (16) · IV (12) · archive .zip chiffrée en
 * AES-256-GCM · étiquette d'authenticité (16). La phrase n'est gardée nulle part.
 */
export const ENCRYPTED_MAGIC = Buffer.from('TNDMENC1');
const LOG_N = 17; // scrypt N = 131 072, r = 8 : ~128 Mo et une fraction de seconde par tirage
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = ENCRYPTED_MAGIC.length + 1 + SALT_BYTES + IV_BYTES;

/** Phrase de passe absente ou fausse, fichier tronqué ou modifié. */
export class BackupPassphraseError extends Error {}

function deriveKey(passphrase: string, salt: Buffer, logN: number): Promise<Buffer> {
  const options: ScryptOptions = { N: 2 ** logN, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scrypt(passphrase.normalize('NFC'), salt, 32, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** En-tête à écrire d'abord, puis le flux chiffrant ; l'étiquette suit à la fin (`getAuthTag`). */
export async function encrypting(
  passphrase: string,
): Promise<{ header: Buffer; cipher: CipherGCM }> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, LOG_N);
  const header = Buffer.concat([ENCRYPTED_MAGIC, Buffer.from([LOG_N]), salt, iv]);
  return { header, cipher: createCipheriv('aes-256-gcm', key, iv) };
}

/** Le fichier commence-t-il par l'en-tête d'une sauvegarde chiffrée ? */
export async function isEncrypted(path: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(ENCRYPTED_MAGIC.length);
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    return bytesRead === head.length && head.equals(ENCRYPTED_MAGIC);
  } finally {
    await file.close();
  }
}

/**
 * Déchiffre `src` dans `dest`. L'étiquette est vérifiée à la fin : `dest` n'est utilisable que
 * si la promesse aboutit (sinon BackupPassphraseError, et `dest` est à jeter).
 */
export async function decryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const { size } = await stat(src);
  if (size < HEADER_BYTES + TAG_BYTES) throw new BackupPassphraseError('Truncated file');
  const file = await open(src, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await file.read(header, 0, HEADER_BYTES, 0);
    await file.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await file.close();
  }
  const logN = header[ENCRYPTED_MAGIC.length]!;
  // Un en-tête forgé ne doit pas imposer un calcul démesuré au serveur.
  if (logN < 14 || logN > 20) throw new BackupPassphraseError('Unsupported parameters');
  const salt = header.subarray(ENCRYPTED_MAGIC.length + 1, ENCRYPTED_MAGIC.length + 1 + SALT_BYTES);
  const iv = header.subarray(HEADER_BYTES - IV_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', await deriveKey(passphrase, salt, logN), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(src, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(dest),
    );
  } catch {
    throw new BackupPassphraseError('Wrong passphrase or damaged file');
  }
}
