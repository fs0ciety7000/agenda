import type { DeviceKind } from '@agenda/contracts';

export interface DeviceInfo {
  kind: DeviceKind;
  browser: string | null;
  os: string | null;
  appVersion: string | null;
}

/**
 * Lecture simple de l'en-tête User-Agent pour « Appareils connectés » : assez pour reconnaître
 * un appareil, sans empreinte. L'app Android s'annonce « Tandem-Android/1.4.0 (Android 14) ».
 */
export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? '';
  const app = /Tandem-Android\/([\w.-]+)(?:\s*\((Android [\d.]+)\))?/.exec(s);
  if (app)
    return { kind: 'ANDROID_APP', browser: null, os: app[2] ?? 'Android', appVersion: app[1]! };
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /SamsungBrowser\//.test(s)
        ? 'Samsung Internet'
        : /Firefox\//.test(s)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(s)
            ? 'Chrome'
            : /Safari\//.test(s)
              ? 'Safari'
              : null;
  const android = /Android ([\d.]+)/.exec(s);
  const os = android
    ? `Android ${android[1]!.split('.')[0]}`
    : /iPhone|iPad|iPod/.test(s)
      ? 'iOS'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /CrOS/.test(s)
            ? 'ChromeOS'
            : /Linux/.test(s)
              ? 'Linux'
              : null;
  return { kind: browser ? 'BROWSER' : 'OTHER', browser, os, appVersion: null };
}
