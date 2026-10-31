/** Textes du site vitrine (français, anglais, néerlandais). Reprend le ton de l'app et de sa fiche Play Store. */
export type Locale = 'fr' | 'en' | 'nl';

/** Langues du site : chemin et nom dans la langue elle-même (jamais traduit). */
export const LANGS: { locale: Locale; href: string; name: string }[] = [
  { locale: 'fr', href: '/', name: 'Français' },
  { locale: 'en', href: '/en/', name: 'English' },
  { locale: 'nl', href: '/nl/', name: 'Nederlands' },
];

export type FeatureIcon =
  'sun' | 'sparkles' | 'repeat' | 'cart' | 'bell' | 'offline' | 'calendar' | 'widget';

export interface Content {
  meta: {
    /** Titre de l'onglet et des résultats de recherche (mots-clés d'abord, ~60 caractères). */
    title: string;
    description: string;
    /** Titre des aperçus de partage (Open Graph, X) : le slogan. */
    ogTitle: string;
    /** Texte alternatif de l'image de partage (public/img/og/<langue>.png). */
    ogAlt: string;
  };
  nav: {
    features: string;
    week: string;
    privacy: string;
    faq: string;
    open: string;
    login: string;
    start: string;
    menu: string;
  };
  lang: { label: string; current: Locale };
  /** Animations qui tournent seules : bouton pour les arrêter (WCAG 2.2.2). */
  motion: { pause: string; play: string; next: string };
  hero: {
    badge: string;
    /** Deuxième ligne en italique (Instrument Serif), couleur d'action. */
    title: [string, string];
    text: string;
    primary: string;
    android: string;
    note: string;
    already: string;
    login: string;
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
  features: {
    eyebrow: string;
    title: string;
    text: string;
    items: { icon: FeatureIcon; title: string; text: string }[];
  };
  /** La semaine : une tâche (ou deux) par jour, qui s'allume l'une après l'autre. */
  week: {
    eyebrow: string;
    title: [string, string];
    text: string;
    /** Du lundi au dimanche : [tâche, qui], qui = 'e' (Emma), 't' (Tom) ou 'both'. */
    days: [string, 'e' | 't' | 'both'][][];
  };
  /** Trois chiffres vrais (pas de statistique inventée). */
  numbers: { value: string; unit: string; text: string }[];
  privacy: {
    eyebrow: string;
    title: string;
    text: string;
    items: { title: string; text: string }[];
    link: string;
  };
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] };
  /** Appel final, en tête du pied de page : la seconde partie du titre est en italique. */
  cta: { title: [string, string]; text: string; primary: string; secondary: string };
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
    /** Texte alternatif de la gravure du pied de page. */
    gravure: string;
    /** Crédit de l'éditeur : « OCC Interactive — Une division de Cardor Media ». */
    division: string;
  };
  /** Page « introuvable » (out/404.html, servie par nginx pour toute adresse inconnue). */
  notFound: { code: string; title: string; text: string; home: string; docs: string };
}

const fr: Content = {
  meta: {
    title: 'Tandem · Partager les tâches ménagères à tour de rôle',
    ogTitle: 'Tandem · Deux vies, un seul rythme',
    ogAlt:
      'Tandem, l’agenda partagé du foyer : deux roues entrelacées et « Chacun son tour, c’est mieux à deux ». Tâches à tour de rôle, courses en direct, calendrier commun. Gratuit, sans publicité, web et Android.',
    description:
      'Tandem répartit les tâches de la maison entre vous : tours de rôle, courses partagées, rappels, hors ligne. Gratuit, sans publicité, sur le web et Android.',
  },
  nav: {
    features: 'Fonctionnalités',
    week: 'La semaine',
    privacy: 'Confidentialité',
    faq: 'Questions',
    open: 'Ouvrir Tandem',
    login: 'Se connecter',
    start: 'Commencer',
    menu: 'Menu',
  },
  lang: { label: 'Langue', current: 'fr' },
  motion: {
    pause: 'Mettre l’animation en pause',
    play: 'Relancer l’animation',
    next: 'Carte suivante',
  },
  hero: {
    badge: 'Gratuit · sans publicité · web et Android',
    title: ['Chacun son tour,', 'c’est mieux à deux.'],
    text: 'Tandem tient le fil de la maison : qui fait quoi, quand, et à qui le tour la prochaine fois. Les courses et le calendrier suivent, sur le web et sur Android.',
    primary: 'Commencer gratuitement',
    android: 'Télécharger pour Android',
    note: 'Un compte, un foyer, et l’autre vous rejoint en un lien.',
    already: 'Déjà un compte ?',
    login: 'Se connecter',
  },
  mock: {
    greeting: 'Bonjour Emma',
    date: 'Mardi 29 septembre',
    today: 'Aujourd’hui',
    tasks: [
      { title: 'Arroser les plantes', meta: '08:30 · Emma', who: 'g' },
      { title: 'Sortir les poubelles', meta: '20:00 · Tom · chacun son tour', who: 'n' },
      { title: 'Courses de la semaine', meta: '18:00 · à deux', who: 'both' },
      { title: 'Changer les draps', meta: 'Cette semaine · Emma', who: 'g' },
    ],
    toast: 'Tom a coché « Sortir les poubelles »',
    added: 'Appeler le garage',
    addedMeta: 'demain 10:00 · Tom',
  },
  features: {
    eyebrow: 'Fonctionnalités',
    title: 'Tout ce qu’il faut pour que la maison tourne, rien de plus.',
    text: 'Pensé pour un couple ou une petite famille : simple au quotidien, précis quand il le faut.',
    items: [
      {
        icon: 'sun',
        title: 'Aujourd’hui en un coup d’œil',
        text: 'À rattraper, du jour, de la semaine : tout se coche d’un geste, sur le site comme sur le téléphone.',
      },
      {
        icon: 'sparkles',
        title: 'Ajout rapide, en langage naturel',
        text: '« Sortir les poubelles demain 19h Emma » : date, heure et personne sont reconnues. Aussi à la voix.',
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
  week: {
    eyebrow: 'La semaine',
    title: ['Une semaine,', 'sans tableau sur le frigo.'],
    text: 'Chaque tâche qui revient choisit seule la bonne personne. Vous n’avez plus qu’à cocher.',
    days: [
      [['Lessive', 'e']],
      [
        ['Poubelles', 't'],
        ['Plantes', 'e'],
      ],
      [['Vaisselle', 't']],
      [['Courses', 'both']],
      [['Aspirateur', 'e']],
      [
        ['Draps', 'e'],
        ['Vélos', 't'],
      ],
      [['Repas', 't']],
    ],
  },
  numbers: [
    { value: '3', unit: 'min', text: 'pour créer le foyer et inviter l’autre' },
    { value: '0', unit: 'pub', text: 'ni traceur publicitaire, ni données revendues' },
    { value: '3', unit: 'langues', text: 'français, English, Nederlands' },
  ],
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
    title: ['Ce soir,', 'c’est qui ?'],
    text: 'Tandem s’en souvient. Créez votre foyer en trois minutes.',
    primary: 'Créer mon foyer',
    secondary: 'Se connecter',
  },
  footer: {
    gravure:
      'Gravure : un village la nuit, sous les étoiles ; deux fenêtres allumées sont reliées par un fil.',
    tagline: 'Deux vies, un seul rythme.',
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
    division: 'Une division de',
  },
  notFound: {
    code: 'Erreur 404',
    title: 'Cette page est introuvable',
    text: 'L’adresse est peut-être mal saisie, ou la page a changé de place. Tout le reste est là où vous l’avez laissé.',
    home: 'Retour à l’accueil',
    docs: 'Guide d’utilisation',
  },
};

const en: Content = {
  meta: {
    title: 'Tandem · Share household chores, taking turns',
    ogTitle: 'Tandem · Two lives, one rhythm',
    ogAlt:
      'Tandem, the shared household planner: two interlaced wheels and “Taking turns is better together”. Chores in turns, live shopping list, shared calendar. Free, ad-free, web and Android.',
    description:
      'Tandem shares household chores between you: turn-taking, a shared shopping list, reminders, offline. Free, ad-free, on the web and Android.',
  },
  nav: {
    features: 'Features',
    week: 'The week',
    privacy: 'Privacy',
    faq: 'FAQ',
    open: 'Open Tandem',
    login: 'Sign in',
    start: 'Get started',
    menu: 'Menu',
  },
  lang: { label: 'Language', current: 'en' },
  motion: { pause: 'Pause the animation', play: 'Play the animation', next: 'Next card' },
  hero: {
    badge: 'Free · ad-free · web and Android',
    title: ['Taking turns', 'is better together.'],
    text: 'Tandem keeps track of the house: who does what, when, and whose turn it is next time. Shopping and the calendar follow, on the web and Android.',
    primary: 'Get started for free',
    android: 'Download for Android',
    note: 'One account, one household, and the other joins with a link.',
    already: 'Already have an account?',
    login: 'Sign in',
  },
  mock: {
    greeting: 'Hello Emma',
    date: 'Tuesday, September 29',
    today: 'Today',
    tasks: [
      { title: 'Water the plants', meta: '8:30 · Emma', who: 'g' },
      { title: 'Take out the bins', meta: '8:00 pm · Tom · taking turns', who: 'n' },
      { title: 'Weekly shopping', meta: '6:00 pm · together', who: 'both' },
      { title: 'Change the sheets', meta: 'This week · Emma', who: 'g' },
    ],
    toast: 'Tom checked “Take out the bins”',
    added: 'Call the garage',
    addedMeta: 'tomorrow 10:00 · Tom',
  },
  features: {
    eyebrow: 'Features',
    title: 'Everything to keep the house running, nothing more.',
    text: 'Made for a couple or a small family: simple every day, precise when it matters.',
    items: [
      {
        icon: 'sun',
        title: 'Today at a glance',
        text: 'To catch up, today, this week: check things off in one tap, on the web and on your phone.',
      },
      {
        icon: 'sparkles',
        title: 'Natural-language quick add',
        text: '“Take out the bins tomorrow 7pm Emma”: date, time and person are recognised. By voice too.',
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
  week: {
    eyebrow: 'The week',
    title: ['A week', 'without a chart on the fridge.'],
    text: 'Every recurring chore picks the right person on its own. All that’s left is ticking it off.',
    days: [
      [['Laundry', 'e']],
      [
        ['Bins', 't'],
        ['Plants', 'e'],
      ],
      [['Dishes', 't']],
      [['Groceries', 'both']],
      [['Vacuuming', 'e']],
      [
        ['Sheets', 'e'],
        ['Bikes', 't'],
      ],
      [['Dinner', 't']],
    ],
  },
  numbers: [
    { value: '3', unit: 'min', text: 'to set up the household and invite the other' },
    { value: '0', unit: 'ads', text: 'no ad trackers, no data sold' },
    { value: '3', unit: 'languages', text: 'français, English, Nederlands' },
  ],
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
    title: ['Tonight,', 'whose turn?'],
    text: 'Tandem remembers. Set up your household in three minutes.',
    primary: 'Create my household',
    secondary: 'Sign in',
  },
  footer: {
    gravure: 'Engraving: a village at night under the stars; two lit windows joined by a thread.',
    tagline: 'Two lives, one rhythm.',
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
    division: 'A division of',
  },
  notFound: {
    code: 'Error 404',
    title: 'This page can’t be found',
    text: 'The address may be mistyped, or the page has moved. Everything else is right where you left it.',
    home: 'Back to home',
    docs: 'User guide',
  },
};

const nl: Content = {
  meta: {
    title: 'Tandem · Huishoudelijke klusjes om de beurt verdelen',
    ogTitle: 'Tandem · Twee levens, één ritme',
    ogAlt:
      'Tandem, de gedeelde agenda voor het huishouden: twee verweven wielen en “Om de beurt, samen gaat het beter”. Taken om de beurt, live boodschappen, gedeelde agenda. Gratis, zonder advertenties, web en Android.',
    description:
      'Tandem verdeelt de klusjes in huis: om de beurt, een gedeelde boodschappenlijst, herinneringen, offline. Gratis, zonder advertenties, op het web en Android.',
  },
  nav: {
    features: 'Functies',
    week: 'De week',
    privacy: 'Privacy',
    faq: 'FAQ',
    open: 'Tandem openen',
    login: 'Aanmelden',
    start: 'Aan de slag',
    menu: 'Menu',
  },
  lang: { label: 'Taal', current: 'nl' },
  motion: { pause: 'Animatie pauzeren', play: 'Animatie hervatten', next: 'Volgende kaart' },
  hero: {
    badge: 'Gratis · zonder advertenties · web en Android',
    title: ['Om de beurt,', 'samen gaat het beter.'],
    text: 'Tandem houdt het huis bij: wie wat doet, wanneer, en wie de volgende keer aan de beurt is. Boodschappen en agenda doen mee, op het web en op Android.',
    primary: 'Gratis beginnen',
    android: 'Downloaden voor Android',
    note: 'Eén account, één huishouden, en de ander komt erbij met een link.',
    already: 'Heb je al een account?',
    login: 'Aanmelden',
  },
  mock: {
    greeting: 'Hallo Emma',
    date: 'Dinsdag 29 september',
    today: 'Vandaag',
    tasks: [
      { title: 'Planten water geven', meta: '8.30 u · Emma', who: 'g' },
      { title: 'Vuilnisbakken buitenzetten', meta: '20.00 u · Tom · om de beurt', who: 'n' },
      { title: 'Wekelijkse boodschappen', meta: '18.00 u · samen', who: 'both' },
      { title: 'Lakens verversen', meta: 'Deze week · Emma', who: 'g' },
    ],
    toast: 'Tom heeft “Vuilnisbakken buitenzetten” afgevinkt',
    added: 'Garage bellen',
    addedMeta: 'morgen 10.00 u · Tom',
  },
  features: {
    eyebrow: 'Functies',
    title: 'Alles om het huishouden te laten draaien, niets meer.',
    text: 'Gemaakt voor een koppel of een klein gezin: eenvoudig in het dagelijks leven, nauwkeurig wanneer het ertoe doet.',
    items: [
      {
        icon: 'sun',
        title: 'Vandaag in één oogopslag',
        text: 'Nog in te halen, vandaag, deze week: afvinken met één tik, op het web en op je telefoon.',
      },
      {
        icon: 'sparkles',
        title: 'Snel toevoegen in gewone taal',
        text: '“Vuilnis buitenzetten morgen 19u Emma”: datum, uur en persoon worden herkend. Ook met je stem.',
      },
      {
        icon: 'repeat',
        title: 'Herhalingen en beurtrol',
        text: 'Elke week, om de week, de laatste dag van de maand… en wie het doet: samen, om de beurt, per weekdag.',
      },
      {
        icon: 'cart',
        title: 'Gedeelde boodschappenlijst',
        text: 'De een voegt toe, de ander vinkt af in de winkel, live. Hoeveelheden, afdelingen en vaste producten.',
      },
      {
        icon: 'bell',
        title: 'Herinneringen en meldingen',
        text: 'Een herinnering vóór elke taak, een melding als de ander je er een geeft, een ochtendoverzicht.',
      },
      {
        icon: 'offline',
        title: 'Werkt offline',
        text: 'Taken afvinken en toevoegen zonder netwerk: alles wordt gesynchroniseerd zodra je weer online bent.',
      },
      {
        icon: 'calendar',
        title: 'Gedeelde agenda',
        text: 'Dag-, week- en maandweergave met slepen en neerzetten. En als je wilt, de taken in een gedeelde Google Agenda of via iCal.',
      },
      {
        icon: 'widget',
        title: 'Android-widgets',
        text: 'Vandaag, de week en de boodschappenlijst op je beginscherm, afgevinkt zonder de app te openen.',
      },
    ],
  },
  week: {
    eyebrow: 'De week',
    title: ['Een week', 'zonder schema op de koelkast.'],
    text: 'Elke terugkerende taak kiest zelf de juiste persoon. Jij hoeft alleen nog af te vinken.',
    days: [
      [['Was', 'e']],
      [
        ['Vuilnis', 't'],
        ['Planten', 'e'],
      ],
      [['Afwas', 't']],
      [['Boodschappen', 'both']],
      [['Stofzuigen', 'e']],
      [
        ['Lakens', 'e'],
        ['Fietsen', 't'],
      ],
      [['Koken', 't']],
    ],
  },
  numbers: [
    { value: '3', unit: 'min', text: 'om het huishouden te maken en de ander uit te nodigen' },
    { value: '0', unit: 'advertenties', text: 'geen advertentietrackers, geen data verkocht' },
    { value: '3', unit: 'talen', text: 'français, English, Nederlands' },
  ],
  privacy: {
    eyebrow: 'Privacy',
    title: 'Jullie zaken blijven van jullie.',
    text: 'Tandem is een onafhankelijke app zonder advertentiemodel. Je gegevens dienen maar voor één ding: je huishouden laten draaien.',
    items: [
      {
        title: 'Geen advertenties, geen doorverkoop',
        text: 'Geen advertentietrackers, geen gegevens verkocht of gedeeld voor commerciële doeleinden.',
      },
      {
        title: 'Veilig',
        text: 'Overal HTTPS, gehashte wachtwoorden (Argon2id), versleutelde Google-toegang (AES-256-GCM), strikt gescheiden huishoudens, aanmelden met een toegangssleutel.',
      },
      {
        title: 'Jij houdt de controle',
        text: 'Exporteer al je gegevens en verwijder je account op elk moment, vanuit de instellingen.',
      },
      {
        title: 'Google, alleen als je wilt',
        text: 'Aanmelden met Google en de agenda zijn optioneel; Tandem leest nooit je andere afspraken.',
      },
    ],
    link: 'Lees het privacybeleid',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Veelgestelde vragen',
    items: [
      {
        q: 'Is Tandem echt gratis?',
        a: 'Ja, zonder advertenties en zonder abonnement. Het is een persoonlijke app, gemaakt voor één huishouden en open voor iedereen die er iets aan heeft.',
      },
      {
        q: 'Heb ik een Android-telefoon nodig?',
        a: 'Nee. Alles werkt via de website, op een computer of een telefoon (ook iPhone, in de browser). De Android-app voegt widgets, dicteren en offline herinneringen toe.',
      },
      {
        q: 'Hoeveel mensen per huishouden?',
        a: 'Gemaakt voor een koppel of een klein gezin. Iedereen heeft een eigen account en ziet de gedeelde taken; persoonlijke taken blijven privé.',
      },
      {
        q: 'En zonder internet?',
        a: 'Je kunt taken offline bekijken, afvinken en toevoegen. Wijzigingen worden verzonden zodra het netwerk terug is.',
      },
      {
        q: 'Hoe krijg of verwijder ik mijn gegevens?',
        a: 'In Instellingen → Gegevens en privacy: een volledige export met één klik, en je account definitief verwijderen.',
      },
    ],
  },
  cta: {
    title: ['Vanavond,', 'wie is er aan de beurt?'],
    text: 'Tandem onthoudt het. Maak je huishouden in drie minuten.',
    primary: 'Mijn huishouden aanmaken',
    secondary: 'Aanmelden',
  },
  footer: {
    gravure:
      "Gravure: een dorp 's nachts onder de sterren; twee verlichte ramen verbonden door een draad.",
    tagline: 'Twee levens, één ritme.',
    product: 'Product',
    help: 'Hulp',
    legal: 'Privacy',
    links: {
      app: 'Tandem openen',
      android: 'Android-app',
      docs: 'Handleiding',
      faq: 'FAQ',
      status: 'Status van de dienst',
      report: 'Een probleem melden',
      privacy: 'Privacybeleid',
      contact: 'Contact',
    },
    rights: 'Een persoonlijke app, gratis en zonder advertenties.',
    division: 'Een divisie van',
  },
  notFound: {
    code: 'Fout 404',
    title: 'Deze pagina bestaat niet',
    text: 'Misschien is het adres verkeerd getypt, of is de pagina verhuisd. Al de rest staat nog waar je het liet.',
    home: 'Terug naar de startpagina',
    docs: 'Handleiding',
  },
};

export const content: Record<Locale, Content> = { fr, en, nl };
