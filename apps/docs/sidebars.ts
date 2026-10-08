import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

/** Deux parcours : utiliser l'app (Guide) et la faire tourner / évoluer (Technique). */
const sidebars: SidebarsConfig = {
  guide: [
    { type: 'doc', id: 'index', label: 'Bienvenue' },
    {
      type: 'category',
      label: 'Utiliser l’app',
      collapsed: false,
      items: [
        'guide/premiers-pas',
        'guide/taches',
        'guide/repetitions',
        'guide/calendrier',
        'guide/courses',
        'guide/depenses',
        'guide/notes',
        'guide/notifications',
        'guide/email',
        'guide/android',
        'guide/hors-ligne',
        'guide/compte',
      ],
    },
    { type: 'doc', id: 'guide/administration', label: 'Administration' },
    { type: 'doc', id: 'guide/faq', label: 'Questions fréquentes' },
    { type: 'doc', id: 'guide/aide', label: 'Aide et signalement' },
    { type: 'doc', id: 'rgpd', label: 'Confidentialité & RGPD' },
    { type: 'doc', id: 'changelog', label: 'Nouveautés' },
  ],
  technique: [
    { type: 'doc', id: 'stack', label: 'Stack technique' },
    {
      type: 'category',
      label: 'Conception',
      collapsed: false,
      items: [
        { type: 'doc', id: 'architecture', label: 'Architecture' },
        { type: 'doc', id: 'database', label: 'Base de données' },
        { type: 'doc', id: 'design-system', label: 'Design system' },
        { type: 'doc', id: 'audit-ui-ux', label: 'Audit UI/UX' },
        { type: 'doc', id: 'audits/2026-10-08', label: 'Audit du 8 octobre 2026' },
        { type: 'doc', id: 'api', label: 'API' },
      ],
    },
    {
      type: 'category',
      label: 'Fonctions',
      items: [
        { type: 'doc', id: 'android', label: 'Application Android' },
        { type: 'doc', id: 'google-calendar', label: 'Google Calendar' },
        { type: 'doc', id: 'email-to-task', label: 'Tâches par e-mail' },
      ],
    },
    {
      type: 'category',
      label: 'Exploitation',
      collapsed: false,
      items: [
        { type: 'doc', id: 'deployment', label: 'Déploiement' },
        { type: 'doc', id: 'monitoring', label: 'Surveillance' },
        { type: 'doc', id: 'play-store', label: 'Google Play' },
        { type: 'doc', id: 'google-oauth-verification', label: 'Vérification OAuth Google' },
      ],
    },
    {
      type: 'category',
      label: 'Projet',
      items: [
        { type: 'doc', id: 'contribuer', label: 'Contribuer' },
        { type: 'doc', id: 'product-requirements', label: 'Exigences produit' },
        { type: 'doc', id: 'roadmap', label: 'Roadmap' },
      ],
    },
  ],
};

export default sidebars;
