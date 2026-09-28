import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';

// Adresse publique du site de documentation (domaine attribué dans Coolify).
const url = process.env.DOCS_URL ?? 'https://docs.tandem-agenda.app';
const appUrl = process.env.APP_URL ?? 'https://tandem-agenda.app';

const config: Config = {
  title: 'Tandem',
  tagline: 'L’équilibre parfait pour votre foyer — documentation',
  favicon: 'img/favicon.png',
  url,
  baseUrl: '/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',
  markdown: {
    // Les .md du dépôt restent du Markdown standard (pas de MDX) : lisibles aussi sur GitHub.
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  i18n: { defaultLocale: 'fr', locales: ['fr'] },
  customFields: { appUrl },

  presets: [
    [
      'classic',
      {
        docs: {
          // Source unique : le dossier docs/ à la racine du dépôt.
          path: '../../docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          exclude: ['**/screenshots/**', '**/brand/**'],
          showLastUpdateTime: false,
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['fr', 'en'],
        docsRouteBasePath: '/',
        docsDir: '../../docs',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'Tandem',
      logo: { alt: 'Tandem', src: 'img/logo.png' },
      items: [
        { type: 'docSidebar', sidebarId: 'guide', position: 'left', label: 'Guide' },
        { type: 'docSidebar', sidebarId: 'technique', position: 'left', label: 'Technique' },
        { to: '/rgpd', label: 'Confidentialité', position: 'left' },
        {
          type: 'dropdown',
          label: 'API',
          position: 'left',
          items: [
            { to: '/api', label: 'Guide de l’API' },
            { to: '/api-reference', label: 'Référence (Swagger)' },
          ],
        },
        { to: '/changelog', label: 'Nouveautés', position: 'left' },
        { href: appUrl, label: 'Ouvrir l’app', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Utiliser',
          items: [
            { label: 'Premiers pas', to: '/guide/premiers-pas' },
            { label: 'Questions fréquentes', to: '/guide/faq' },
            { label: 'Signaler un problème', to: '/guide/aide' },
          ],
        },
        {
          title: 'Développer',
          items: [
            { label: 'Architecture', to: '/architecture' },
            { label: 'Référence de l’API', to: '/api-reference' },
            { label: 'Contribuer', to: '/contribuer' },
          ],
        },
        {
          title: 'Service',
          items: [
            { label: 'État du service', href: `${appUrl}/status` },
            { label: 'Politique de confidentialité', href: `${appUrl}/privacy` },
            { label: 'Nouveautés', to: '/changelog' },
          ],
        },
      ],
      copyright: `Tandem — application privée et non commerciale.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'kotlin', 'yaml', 'nginx'],
    },
    tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
  } satisfies Preset.ThemeConfig,
};

export default config;
