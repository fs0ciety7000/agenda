import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/app-exception';
import { env } from '../config/env';

const TAG = 'android-latest';
const CACHE_MS = 5 * 60_000;
/** Absence de release (republication en cours, jeton manquant) : revérifiée vite. */
const MISS_CACHE_MS = 30_000;

export interface AndroidRelease {
  versionCode: number;
  versionName: string;
  sha256: string;
  /** URL API GitHub de l'asset APK (téléchargeable avec le jeton si le dépôt est privé). */
  apkAssetUrl: string;
}

interface GithubAsset {
  name: string;
  url: string;
}

/**
 * Relais vers la release GitHub `android-latest` : l'app (et le site) téléchargent depuis
 * tandem-agenda.app, que le dépôt soit public ou privé (jeton `GITHUB_RELEASES_TOKEN`).
 */
@Injectable()
export class AndroidReleaseService {
  private readonly logger = new Logger(AndroidReleaseService.name);
  private cache?: { at: number; release: AndroidRelease | null };
  /** Dernière release valide : servie pendant une republication (fichiers absents un instant). */
  private lastGood?: AndroidRelease;

  private headers(accept: string): Record<string, string> {
    const token = env().GITHUB_RELEASES_TOKEN;
    return {
      accept,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'tandem',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  private unavailable(reason: string) {
    this.logger.warn(`Android release unavailable: ${reason}`);
    return new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, 'No Android release');
  }

  async latest(fresh = false): Promise<AndroidRelease> {
    const ttl = this.cache?.release ? CACHE_MS : MISS_CACHE_MS;
    if (!fresh && this.cache && Date.now() - this.cache.at < ttl) {
      if (!this.cache.release) throw this.unavailable('cached miss');
      return this.cache.release;
    }
    const release = await this.fetchLatest().catch((e: Error) => {
      this.logger.warn(`GitHub release lookup failed: ${e.message}`);
      return null;
    });
    if (release) this.lastGood = release;
    // Republication en cours (release supprimée ou fichiers pas encore envoyés) : on continue de
    // servir la dernière version connue plutôt que « aucune mise à jour ».
    const served = release ?? this.lastGood ?? null;
    this.cache = { at: Date.now(), release: release ?? null };
    if (!served) throw this.unavailable('no release');
    return served;
  }

  private async fetchLatest(): Promise<AndroidRelease | null> {
    const res = await fetch(
      `https://api.github.com/repos/${env().ANDROID_RELEASE_REPO}/releases/tags/${TAG}`,
      { headers: this.headers('application/vnd.github+json'), signal: AbortSignal.timeout(15_000) },
    );
    if (res.status === 404) return null; // pas de release, ou dépôt privé sans jeton
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const { assets } = (await res.json()) as { assets: GithubAsset[] };
    const manifest = assets.find((a) => a.name === 'version.json');
    if (!manifest) return null;
    const meta = await fetch(manifest.url, {
      headers: this.headers('application/octet-stream'),
      signal: AbortSignal.timeout(15_000),
    });
    if (!meta.ok) throw new Error(`GitHub asset ${meta.status}`);
    const json = (await meta.json()) as Omit<AndroidRelease, 'apkAssetUrl'> & {
      apkAsset?: string;
    };
    // APK propre à la version (« tandem-46.apk ») : jamais remplacé pendant qu'on le télécharge,
    // donc toujours cohérent avec le sha256 annoncé. Anciennes releases : nom fixe.
    const apk =
      assets.find((a) => a.name === json.apkAsset) ??
      assets.find((a) => a.name === 'tandem.apk') ??
      assets.find((a) => a.name === 'agenda-gn.apk');
    if (!apk) return null;
    return {
      versionCode: json.versionCode,
      versionName: json.versionName,
      sha256: json.sha256,
      apkAssetUrl: apk.url,
    };
  }

  /** Flux de l'APK (redirection GitHub suivie). */
  async download(): Promise<Response> {
    const get = (release: AndroidRelease) =>
      fetch(release.apkAssetUrl, {
        headers: this.headers('application/octet-stream'),
        signal: AbortSignal.timeout(120_000),
      });
    let res = await get(await this.latest());
    // Fichier disparu (release republiée depuis la mise en cache) : on relit la release une fois.
    if (res.status === 404) res = await get(await this.latest(true));
    if (!res.ok || !res.body) throw this.unavailable(`asset download ${res.status}`);
    return res;
  }
}
