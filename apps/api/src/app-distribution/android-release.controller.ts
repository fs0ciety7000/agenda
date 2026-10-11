import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { Public } from '../common/request-context';
import { ANDROID_PACKAGE, androidFingerprints } from '../auth/passkeys.service';
import { env } from '../config/env';
import { AndroidReleaseService } from './android-release.service';

/**
 * Téléchargement et mises à jour de l'app Android, servis par le domaine de l'app :
 * - `version.json` : lu par l'app pour proposer une mise à jour ;
 * - `tandem.apk` : lien « Télécharger l'app Android » du site et mises à jour (`agenda-gn.apk`,
 *   ancien nom, reste servi pour les liens déjà partagés).
 * Publics : l'APK ne contient aucun secret (même contenu que la release GitHub).
 */
@ApiTags('app')
@Public()
@Controller({ path: 'app/android', version: '1' })
export class AndroidReleaseController {
  constructor(private readonly releases: AndroidReleaseService) {}

  /** Dernière version de l'app Android. */
  @Get('version.json')
  async version(@Res({ passthrough: true }) res: Response) {
    const release = await this.releases.latest();
    res.setHeader('cache-control', 'no-store');
    return {
      versionCode: release.versionCode,
      versionName: release.versionName,
      sha256: release.sha256,
      // Version dans l'adresse : un cache intermédiaire ne peut pas resservir un ancien APK.
      apkUrl: `${env().WEB_ORIGIN}/v1/app/android/tandem.apk?v=${release.versionCode}`,
    };
  }

  /**
   * Liens d'association de l'app Android (Digital Asset Links), servis par le site à
   * `/.well-known/assetlinks.json` : Android n'accepte une passkey du domaine dans l'app que si
   * ce fichier nomme l'app et l'empreinte de son certificat.
   */
  @Get('assetlinks.json')
  assetLinks(@Res({ passthrough: true }) res: Response) {
    res.setHeader('cache-control', 'public, max-age=3600');
    const fingerprints = androidFingerprints();
    if (!fingerprints.length) return [];
    return [
      {
        relation: ['delegate_permission/common.get_login_creds'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];
  }

  /** Télécharger l'APK Android. */
  @Get(['tandem.apk', 'agenda-gn.apk'])
  async apk(@Res() res: Response): Promise<void> {
    const upstream = await this.releases.download();
    res.status(200);
    res.setHeader('content-type', 'application/vnd.android.package-archive');
    res.setHeader('content-disposition', 'attachment; filename="tandem.apk"');
    // Jamais en cache (Cloudflare met les .apk en cache 4 h par défaut : l'app recevait l'ancien
    // APK, dont l'empreinte ne correspondait plus à version.json) ni recompressé.
    res.setHeader('cache-control', 'no-store, no-transform');
    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('content-length', length);
    Readable.fromWeb(upstream.body as unknown as ReadableStream).pipe(res);
  }
}
