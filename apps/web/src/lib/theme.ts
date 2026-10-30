export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'gn-theme';

/** Thèmes de couleur : seule la couleur d'action change (tokens `themes`), « ink » par défaut. */
export const ACCENTS = ['ink', 'coral', 'ocean', 'lagoon'] as const;
export type Accent = (typeof ACCENTS)[number];
export const ACCENT_STORAGE_KEY = 'gn-accent';

/** Script inline exécuté avant le rendu : évite le flash de thème et de couleur. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}var a=localStorage.getItem('${ACCENT_STORAGE_KEY}');if(${JSON.stringify(
  ACCENTS.filter((a) => a !== 'ink'),
)}.indexOf(a)>=0){document.documentElement.dataset.accent=a}}catch(e){}})();`;

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* stockage indisponible : le thème reste appliqué pour la session */
  }
}

export function readTheme(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyAccent(accent: Accent): void {
  const root = document.documentElement;
  if (accent === 'ink') delete root.dataset.accent;
  else root.dataset.accent = accent;
  try {
    if (accent === 'ink') localStorage.removeItem(ACCENT_STORAGE_KEY);
    else localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    /* stockage indisponible : la couleur reste appliquée pour la session */
  }
}

export function readAccent(): Accent {
  try {
    const a = localStorage.getItem(ACCENT_STORAGE_KEY);
    return (ACCENTS as readonly string[]).includes(a ?? '') ? (a as Accent) : 'ink';
  } catch {
    return 'ink';
  }
}
