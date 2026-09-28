/** Textes du site vitrine (français, anglais). Reprend le ton de l'app et de sa fiche Play Store. */
export type Locale = 'fr' | 'en';

export type FeatureIcon =
  'sun' | 'sparkles' | 'repeat' | 'cart' | 'bell' | 'offline' | 'calendar' | 'widget';

export interface Content {
  meta: { title: string; description: string };
  nav: { features: string; how: string; privacy: string; faq: string; open: string; menu: string };
  lang: { label: string; other: string; href: string };
  hero: {
    badge: string;
    title: [string, string];
    text: string;
    primary: string;
    android: string;
    note: string;
  };
  mock: {
    greeting: string;
    date: string;
    today: string;
    tasks: { title: string; meta: string; who: 'n' | 'g' | 'both' }[];
    toast: string;
    added: string;
    addedMeta: string;
  };
  strip: string[];
  features: {
    eyebrow: string;
    title: string;
    text: string;
    items: { icon: FeatureIcon; title: string; text: string }[];
  };
  how: { eyebrow: string; title: string; steps: { title: string; text: string }[] };
  balance: {
    eyebrow: string;
    title: string;
    text: string;
    points: string[];
    card: string;
    rows: { name: string; detail: string; value: number; color: 'sage' | 'ocean' | 'plum' }[];
    footnote: string;
  };
  shots: {
    eyebrow: string;
    title: string;
    text: string;
    items: { file: string; caption: string }[];
  };
  privacy: {
    eyebrow: string;
    title: string;
    text: string;
    items: { title: string; text: string }[];
    link: string;
  };
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] };
  cta: { title: string; text: string; primary: string; secondary: string };
  footer: {
    tagline: string;
    product: string;
    help: string;
    legal: string;
    links: {
      app: string;
      android: string;
      docs: string;
      faq: string;
      status: string;
      report: string;
      privacy: string;
      contact: string;
    };
    rights: string;
  };
}

const fr: Content = {
  meta: {
    title: 'Tandem · L’équilibre parfait pour votre foyer',
    description:
      'Tandem répartit les tâches de la maison entre vous : tours de rôle, liste de courses partagée, rappels, hors ligne. Gratuit, sans publicité, sur le web et Android.',
  },
  nav: {
    features: 'Fonctionnalités',
    how: 'Comment ça marche',
    privacy: 'Confidentialité',
    faq: 'Questions',
    open: 'Ouvrir Tandem',
    menu: 'Menu',
  },
  lang: { label: 'Langue', other: 'English', href: '/en/' },
  hero: {
    badge: 'Gratuit · sans publicité · web et Android',
    title: ['L’équilibre parfait', 'pour votre foyer.'],
    text: 'Qui sort les poubelles cette semaine ? Qui fait les courses ? Tandem répartit les tâches de la maison entre vous, chacun son tour, sans avoir à se le redemander.',
    primary: 'Commencer gratuitement',
    android: 'Télécharger pour Android',
    note: 'Un compte, un foyer, et l’autre vous rejoint en un lien.',
  },
  mock: {
    greeting: 'Bonjour Grace',
    date: 'Mardi 29 septembre',
    today: 'Aujourd’hui',
    tasks: [
      { title: 'Arroser les plantes', meta: '08:30 · Grace', who: 'g' },
      { title: 'Sortir les poubelles', meta: '20:00 · Nicolas · chacun son tour', who: 'n' },
      { title: 'Courses de la semaine', meta: '18:00 · à deux', who: 'both' },
      { title: 'Changer les draps', meta: 'Cette semaine · Grace', who: 'g' },
    ],
    toast: 'Nicolas a coché « Sortir les poubelles »',
    added: 'Appeler le garage',
    addedMeta: 'demain 10:00 · Nicolas',
  },
  strip: [
    'Site web',
    'Application Android',
    'Hors ligne',
    'Temps réel',
    'Google Calendar',
    'Français · English',
  ],
  features: {
    eyebrow: 'Fonctionnalités',
    title: 'Tout ce qu’il faut pour que la maison tourne, rien de plus.',
    text: 'Pensé pour un couple ou une petite famille : simple au quotidien, précis quand il le faut.',
    items: [
      {
        icon: 'sun',
        title: 'Aujourd’hui en un coup d’œil',
        text: 'En retard, du jour, de la semaine : tout se coche d’un geste, sur le site comme sur le téléphone.',
      },
      {
        icon: 'sparkles',
        title: 'Ajout rapide, en langage naturel',
        text: '« Sortir les poubelles demain 19h Grace » : date, heure et personne sont reconnues. Aussi à la voix.',
      },
      {
        icon: 'repeat',
        title: 'Répétitions et tour de rôle',
        text: 'Chaque semaine, tous les 15 jours, dernier jour du mois… et surtout qui s’en occupe : à deux, chacun son tour, selon le jour.',
      },
      {
        icon: 'cart',
        title: 'Liste de courses partagée',
        text: 'L’un ajoute, l’autre coche au magasin, en temps réel. Quantités, rayons et articles habituels.',
      },
      {
        icon: 'bell',
        title: 'Rappels et notifications',
        text: 'Un rappel avant chaque tâche, une notification quand l’autre vous en confie une, un récap le matin.',
      },
      {
        icon: 'offline',
        title: 'Fonctionne hors ligne',
        text: 'Cochez et ajoutez sans réseau : tout se synchronise dès le retour de la connexion.',
      },
      {
        icon: 'calendar',
        title: 'Calendrier partagé',
        text: 'Vue jour, semaine, mois, glisser-déposer. Et si vous voulez, les tâches dans un Google Agenda commun.',
      },
      {
        icon: 'widget',
        title: 'Widgets Android',
        text: 'Aujourd’hui, la semaine et les courses sur l’écran d’accueil, à cocher sans ouvrir l’app.',
      },
    ],
  },
  how: {
    eyebrow: 'Comment ça marche',
    title: 'Prêt en trois minutes.',
    steps: [
      {
        title: 'Créez votre foyer',
        text: 'Un compte sur le site ou dans l’app, avec votre e-mail ou votre compte Google.',
      },
      {
        title: 'Invitez l’autre',
        text: 'Un lien d’invitation suffit : vous partagez les mêmes tâches, en temps réel.',
      },
      {
        title: 'Laissez tourner',
        text: 'Répétitions, tours de rôle et rappels : chacun sait ce qu’il a à faire, sans liste sur le frigo.',
      },
    ],
  },
  balance: {
    eyebrow: 'Équilibre',
    title: 'Voir qui fait quoi, sans compter les points.',
    text: 'La répartition de la semaine montre la charge de chacun, en nombre de tâches et en temps. Pas de classement, pas de compétition : juste de quoi en parler et rééquilibrer.',
    points: [
      'Suggestion de la personne la moins chargée',
      'Mode absence : les tâches passent à l’autre',
      'Historique « fait par » de chaque tâche',
    ],
    card: 'Répartition de la semaine',
    rows: [
      { name: 'Grace', detail: '6 tâches · 1 h 40', value: 52, color: 'ocean' },
      { name: 'Nicolas', detail: '5 tâches · 1 h 30', value: 48, color: 'sage' },
      { name: 'À deux', detail: '2 tâches · 1 h', value: 22, color: 'plum' },
    ],
    footnote: 'Tâches partagées du lundi au dimanche.',
  },
  shots: {
    eyebrow: 'L’application',
    title: 'La même maison, dans la poche.',
    text: 'L’app Android reprend tout le site, en mieux adaptée au téléphone : widgets, raccourcis, dictée et mode sombre.',
    items: [
      { file: '1_today', caption: 'Aujourd’hui' },
      { file: '2_repeat', caption: 'Répétitions et tour de rôle' },
      { file: '3_calendar', caption: 'Calendrier' },
      { file: '4_tasks', caption: 'Toutes les tâches' },
      { file: '5_dark', caption: 'Mode sombre' },
    ],
  },
  privacy: {
    eyebrow: 'Confidentialité',
    title: 'Vos affaires restent les vôtres.',
    text: 'Tandem est une application indépendante, sans modèle publicitaire. Vos données servent à une seule chose : faire fonctionner votre foyer.',
    items: [
      {
        title: 'Ni publicité, ni revente',
        text: 'Aucun traceur publicitaire, aucune donnée vendue ou partagée à des fins commerciales.',
      },
      {
        title: 'Sécurisé',
        text: 'HTTPS partout, mots de passe hachés (Argon2id), accès Google chiffrés (AES-256-GCM), foyers strictement cloisonnés.',
      },
      {
        title: 'Vous gardez la main',
        text: 'Export de toutes vos données et suppression du compte à tout moment, depuis les réglages.',
      },
      {
        title: 'Google, seulement si vous le voulez',
        text: 'La connexion et le calendrier Google sont facultatifs ; Tandem ne lit jamais vos autres événements.',
      },
    ],
    link: 'Lire la politique de confidentialité',
  },
  faq: {
    eyebrow: 'Questions',
    title: 'Questions fréquentes',
    items: [
      {
        q: 'Tandem est-il vraiment gratuit ?',
        a: 'Oui, sans publicité ni abonnement. C’est une application personnelle, développée pour un foyer et ouverte à ceux qui en ont l’usage.',
      },
      {
        q: 'Faut-il un téléphone Android ?',
        a: 'Non. Tout fonctionne depuis le site, sur ordinateur comme sur téléphone (iPhone compris, dans le navigateur). L’app Android ajoute les widgets, la dictée et les rappels hors ligne.',
      },
      {
        q: 'Combien de personnes par foyer ?',
        a: 'Pensé pour un couple ou une petite famille. Chacun a son compte et voit les tâches partagées ; les tâches personnelles restent privées.',
      },
      {
        q: 'Et sans connexion Internet ?',
        a: 'Vous pouvez consulter, cocher et ajouter des tâches hors ligne. Les changements sont envoyés dès que le réseau revient.',
      },
      {
        q: 'Comment récupérer ou supprimer mes données ?',
        a: 'Dans Réglages → Données & confidentialité : export complet en un clic, et suppression définitive du compte.',
      },
    ],
  },
  cta: {
    title: 'Et si la maison tournait toute seule ?',
    text: 'Créez votre foyer, invitez l’autre, et laissez Tandem se souvenir de tout.',
    primary: 'Créer mon foyer',
    secondary: 'Se connecter',
  },
  footer: {
    tagline: 'L’équilibre parfait pour votre foyer.',
    product: 'Produit',
    help: 'Aide',
    legal: 'Confidentialité',
    links: {
      app: 'Ouvrir Tandem',
      android: 'App Android',
      docs: 'Guide d’utilisation',
      faq: 'Questions fréquentes',
      status: 'État du service',
      report: 'Signaler un problème',
      privacy: 'Politique de confidentialité',
      contact: 'Contact',
    },
    rights: 'Application personnelle, gratuite et sans publicité.',
  },
};

const en: Content = {
  meta: {
    title: 'Tandem · The perfect balance for your household',
    description:
      'Tandem shares household chores between you: turn-taking, a shared shopping list, reminders, offline. Free, ad-free, on the web and Android.',
  },
  nav: {
    features: 'Features',
    how: 'How it works',
    privacy: 'Privacy',
    faq: 'FAQ',
    open: 'Open Tandem',
    menu: 'Menu',
  },
  lang: { label: 'Language', other: 'Français', href: '/' },
  hero: {
    badge: 'Free · ad-free · web and Android',
    title: ['The perfect balance', 'for your household.'],
    text: 'Who takes out the bins this week? Who does the shopping? Tandem shares the chores between you, taking turns, without having to ask twice.',
    primary: 'Get started for free',
    android: 'Download for Android',
    note: 'One account, one household, and the other joins with a link.',
  },
  mock: {
    greeting: 'Hello Grace',
    date: 'Tuesday, September 29',
    today: 'Today',
    tasks: [
      { title: 'Water the plants', meta: '8:30 · Grace', who: 'g' },
      { title: 'Take out the bins', meta: '8:00 pm · Nicolas · taking turns', who: 'n' },
      { title: 'Weekly shopping', meta: '6:00 pm · together', who: 'both' },
      { title: 'Change the sheets', meta: 'This week · Grace', who: 'g' },
    ],
    toast: 'Nicolas checked “Take out the bins”',
    added: 'Call the garage',
    addedMeta: 'tomorrow 10:00 · Nicolas',
  },
  strip: [
    'Website',
    'Android app',
    'Offline',
    'Real time',
    'Google Calendar',
    'English · Français',
  ],
  features: {
    eyebrow: 'Features',
    title: 'Everything to keep the house running, nothing more.',
    text: 'Made for a couple or a small family: simple every day, precise when it matters.',
    items: [
      {
        icon: 'sun',
        title: 'Today at a glance',
        text: 'Overdue, today, this week: check things off in one tap, on the web and on your phone.',
      },
      {
        icon: 'sparkles',
        title: 'Natural-language quick add',
        text: '“Take out the bins tomorrow 7pm Grace”: date, time and person are recognised. By voice too.',
      },
      {
        icon: 'repeat',
        title: 'Repeats and turn-taking',
        text: 'Every week, every other week, last day of the month… and who does it: together, taking turns, by weekday.',
      },
      {
        icon: 'cart',
        title: 'Shared shopping list',
        text: 'One adds, the other checks off in the store, in real time. Quantities, aisles and usual items.',
      },
      {
        icon: 'bell',
        title: 'Reminders and notifications',
        text: 'A reminder before each task, a notification when the other hands you one, a morning recap.',
      },
      {
        icon: 'offline',
        title: 'Works offline',
        text: 'Check and add tasks without a network: everything syncs as soon as you are back online.',
      },
      {
        icon: 'calendar',
        title: 'Shared calendar',
        text: 'Day, week and month views with drag and drop. And, if you like, tasks in a shared Google Calendar.',
      },
      {
        icon: 'widget',
        title: 'Android widgets',
        text: 'Today, the week and the shopping list on your home screen, checked without opening the app.',
      },
    ],
  },
  how: {
    eyebrow: 'How it works',
    title: 'Ready in three minutes.',
    steps: [
      {
        title: 'Create your household',
        text: 'An account on the website or in the app, with your email or your Google account.',
      },
      {
        title: 'Invite the other',
        text: 'An invitation link is all it takes: you share the same tasks, in real time.',
      },
      {
        title: 'Let it run',
        text: 'Repeats, turn-taking and reminders: everyone knows what to do, no list on the fridge.',
      },
    ],
  },
  balance: {
    eyebrow: 'Balance',
    title: 'See who does what, without keeping score.',
    text: 'The weekly split shows each person’s load, in tasks and in time. No ranking, no competition: just enough to talk about it and rebalance.',
    points: [
      'Suggests the least busy person',
      'Away mode: tasks move to the other',
      '“Done by” history for every task',
    ],
    card: 'This week’s split',
    rows: [
      { name: 'Grace', detail: '6 tasks · 1 h 40', value: 52, color: 'ocean' },
      { name: 'Nicolas', detail: '5 tasks · 1 h 30', value: 48, color: 'sage' },
      { name: 'Together', detail: '2 tasks · 1 h', value: 22, color: 'plum' },
    ],
    footnote: 'Shared tasks, Monday to Sunday.',
  },
  shots: {
    eyebrow: 'The app',
    title: 'The same home, in your pocket.',
    text: 'The Android app has everything the website does, tuned for the phone: widgets, shortcuts, dictation and dark mode.',
    items: [
      { file: '1_today', caption: 'Today' },
      { file: '2_repeat', caption: 'Repeats and turn-taking' },
      { file: '3_calendar', caption: 'Calendar' },
      { file: '4_tasks', caption: 'All tasks' },
      { file: '5_dark', caption: 'Dark mode' },
    ],
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Your business stays yours.',
    text: 'Tandem is an independent app with no advertising model. Your data is used for one thing only: running your household.',
    items: [
      {
        title: 'No ads, no reselling',
        text: 'No ad trackers, no data sold or shared for commercial purposes.',
      },
      {
        title: 'Secure',
        text: 'HTTPS everywhere, hashed passwords (Argon2id), encrypted Google access (AES-256-GCM), households strictly isolated.',
      },
      {
        title: 'You stay in control',
        text: 'Export all your data and delete your account at any time, from the settings.',
      },
      {
        title: 'Google, only if you want',
        text: 'Google sign-in and calendar are optional; Tandem never reads your other events.',
      },
    ],
    link: 'Read the privacy policy',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Frequently asked questions',
    items: [
      {
        q: 'Is Tandem really free?',
        a: 'Yes, with no ads and no subscription. It is a personal app, built for one household and open to anyone who finds it useful.',
      },
      {
        q: 'Do I need an Android phone?',
        a: 'No. Everything works from the website, on a computer or a phone (iPhone included, in the browser). The Android app adds widgets, dictation and offline reminders.',
      },
      {
        q: 'How many people per household?',
        a: 'Made for a couple or a small family. Everyone has their own account and sees shared tasks; personal tasks stay private.',
      },
      {
        q: 'What about without internet?',
        a: 'You can view, check and add tasks offline. Changes are sent as soon as the network is back.',
      },
      {
        q: 'How do I get or delete my data?',
        a: 'In Settings → Data & privacy: a full export in one click, and permanent account deletion.',
      },
    ],
  },
  cta: {
    title: 'What if the house ran itself?',
    text: 'Create your household, invite the other, and let Tandem remember everything.',
    primary: 'Create my household',
    secondary: 'Sign in',
  },
  footer: {
    tagline: 'The perfect balance for your household.',
    product: 'Product',
    help: 'Help',
    legal: 'Privacy',
    links: {
      app: 'Open Tandem',
      android: 'Android app',
      docs: 'User guide',
      faq: 'FAQ',
      status: 'Service status',
      report: 'Report a problem',
      privacy: 'Privacy policy',
      contact: 'Contact',
    },
    rights: 'A personal app, free and ad-free.',
  },
};

export const content: Record<Locale, Content> = { fr, en };
