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
}
