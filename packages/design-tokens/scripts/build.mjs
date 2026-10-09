// Génère dist/tokens.css + dist/index.{js,d.ts} ; avec --android, écrit aussi Tokens.kt.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const vars = (mode) =>
  [
    ...Object.entries(tokens.color[mode]).map(([k, v]) => `  --gn-color-${k}: ${v};`),
    ...Object.entries(tokens.member[mode]).map(([k, v]) => `  --gn-member-${k}: ${v};`),
  ].join('\n');

const shared = [
  ...Object.entries(tokens.radius).map(([k, v]) => `  --gn-radius-${k}: ${v}px;`),
  `  --gn-motion-fast: ${tokens.motion.fast}ms;`,
  `  --gn-motion-base: ${tokens.motion.base}ms;`,
  `  --gn-motion-slow: ${tokens.motion.slow}ms;`,
  `  --gn-motion-easing: ${tokens.motion.easing};`,
].join('\n');

// Le mode sombre suit le système, sauf si <html data-theme> force un thème.
const css = `/* Généré par @agenda/design-tokens — ne pas éditer. */
:root {
${vars('light')}
${shared}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${vars('dark')}
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
${vars('dark')}
  color-scheme: dark;
}
`;
writeFileSync(join(dist, 'tokens.css'), css);
writeFileSync(
  join(dist, 'index.js'),
  `"use strict";\nmodule.exports = ${JSON.stringify(tokens, null, 2)};\n`,
);
writeFileSync(
  join(dist, 'index.d.ts'),
  `declare const tokens: ${JSON.stringify(tokens, null, 2)};\nexport = tokens;\n`,
);

// Illustrations des états vides (tracés au trait, viewBox commune) : même source pour le web et Android.
const illustrations = JSON.parse(readFileSync(join(root, 'illustrations.json'), 'utf8'));
writeFileSync(
  join(dist, 'illustrations.js'),
  `"use strict";\nmodule.exports = ${JSON.stringify(illustrations, null, 2)};\n`,
);
writeFileSync(
  join(dist, 'illustrations.d.ts'),
  `declare const illustrations: {\n  viewBox: [number, number];\n  strokeWidth: number;\n  background: string;\n  illustrations: Record<${Object.keys(
    illustrations.illustrations,
  )
    .map((k) => `'${k}'`)
    .join(' | ')}, { paths: string[] }>;\n};\nexport = illustrations;\n`,
);

if (process.argv.includes('--android')) {
  const hex = (v) => `Color(0xFF${v.slice(1).toUpperCase()})`;
  const camel = (k) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const palette = (name, obj) =>
    `    object ${name} {\n${Object.entries(obj)
      .map(([k, v]) => `        val ${camel(k)} = ${hex(v)}`)
      .join('\n')}\n    }`;
  const kt = `// Généré par packages/design-tokens (pnpm --filter @agenda/design-tokens gen:android) — ne pas éditer.
package app.tandem.foyer.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object Tokens {
${palette('Light', tokens.color.light)}
${palette('Dark', tokens.color.dark)}
${palette('MemberLight', tokens.member.light)}
${palette('MemberDark', tokens.member.dark)}
    object Radius {
${Object.entries(tokens.radius)
  .map(([k, v]) => `        val ${k} = ${v}.dp`)
  .join('\n')}
    }
    object Motion {
        const val FAST = ${tokens.motion.fast}
        const val BASE = ${tokens.motion.base}
        const val SLOW = ${tokens.motion.slow}
    }
}
`;
  const out = join(
    root,
    '../../apps/android/app/src/main/java/app/tandem/foyer/ui/theme/Tokens.kt',
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, kt);
  console.warn(`Tokens.kt écrit dans ${out}`);

  // Une illustration = un vecteur ; le fond (disque à 8 %) garde son alpha une fois teinté.
  const [w, h] = illustrations.viewBox;
  const drawable = join(root, '../../apps/android/app/src/main/res/drawable');
  for (const [name, { paths }] of Object.entries(illustrations.illustrations)) {
    const strokes = paths
      .map(
        (d) => `    <path
        android:pathData="${d}"
        android:strokeWidth="${illustrations.strokeWidth}"
        android:strokeColor="#FF000000"
        android:strokeLineCap="round"
        android:strokeLineJoin="round" />`,
      )
      .join('\n');
    writeFileSync(
      join(drawable, `ill_empty_${name}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>
<!-- Généré par packages/design-tokens (illustrations.json) — ne pas éditer. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${w}dp"
    android:height="${h}dp"
    android:viewportWidth="${w}"
    android:viewportHeight="${h}">
    <path
        android:pathData="${illustrations.background}"
        android:fillAlpha="0.08"
        android:fillColor="#FF000000" />
${strokes}
</vector>
`,
    );
  }
  console.warn(`Illustrations écrites dans ${drawable}`);
}
