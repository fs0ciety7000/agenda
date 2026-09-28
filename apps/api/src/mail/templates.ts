import { env } from '../config/env';

/**
 * Emails transactionnels, FR/EN, texte + HTML. Mise en page en tableaux et styles en ligne
 * (Gmail, Outlook, Apple Mail) ; aucun pixel de suivi : seul le logo est chargé, depuis le site.
 */
type Locale = 'fr' | 'en';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Couleurs de l'app (packages/design-tokens, thème clair). */
const C = {
  bg: '#FAF6F2',
  card: '#FFFFFF',
  border: '#EFE0D6',
  text: '#24181D',
  muted: '#6F5F66',
  accent: '#7D4460',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";

const FOOTER = {
  fr: {
    slogan: 'L’équilibre parfait pour votre foyer.',
    automatic: 'E-mail automatique envoyé par Tandem : merci de ne pas y répondre.',
    contact: 'Une question ? Écrivez-nous :',
    links: {
      privacy: 'Confidentialité',
      help: 'Aide',
      report: 'Signaler un problème',
      settings: 'Réglages',
    },
  },
  en: {
    slogan: 'The perfect balance for your household.',
    automatic: 'Automatic email sent by Tandem: please do not reply.',
    contact: 'A question? Write to us:',
    links: { privacy: 'Privacy', help: 'Help', report: 'Report a problem', settings: 'Settings' },
  },
} as const;

function footerLinks(locale: Locale) {
  const { WEB_ORIGIN: web, DOCS_URL: docs } = env();
  const l = FOOTER[locale].links;
  return [
    { label: l.privacy, url: `${web}/privacy` },
    { label: l.help, url: `${docs}/guide/faq` },
    { label: l.report, url: `${web}/report` },
    { label: l.settings, url: `${web}/settings` },
  ];
}

/** Pied de la version texte (mêmes liens que la version HTML). */
function textFooter(locale: Locale): string {
  const f = FOOTER[locale];
  const contact = env().PRIVACY_CONTACT_EMAIL;
  return [
    '—',
    `Tandem · ${f.slogan}`,
    ...footerLinks(locale).map((l) => `${l.label} : ${l.url}`),
    ...(contact ? [`${f.contact} ${contact}`] : []),
    f.automatic,
  ].join('\n');
}

/** Corps texte commun : paragraphes, bouton (lien en clair), pied. */
function textBody(locale: Locale, paragraphs: string[], cta?: { label: string; url: string }) {
  return (
    [...paragraphs, ...(cta ? [`${cta.label} : ${cta.url}`] : []), textFooter(locale)].join(
      '\n\n',
    ) + '\n'
  );
}

function layout(
  locale: Locale,
  title: string,
  paragraphs: string[],
  cta?: { label: string; url: string },
): string {
  const web = env().WEB_ORIGIN;
  const f = FOOTER[locale];
  const contact = env().PRIVACY_CONTACT_EMAIL;
  const link = (l: { label: string; url: string }) =>
    `<a href="${escape(l.url)}" style="color:${C.accent};text-decoration:underline">${escape(l.label)}</a>`;
  // Texte d'aperçu (liste de la boîte de réception), invisible dans le message.
  const preheader = paragraphs[0] ?? title;
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.text};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 8px 20px">
<a href="${escape(web)}" style="text-decoration:none;color:${C.text}">
<img src="${escape(web)}/icons/icon-192.png" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px">
<span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:700;color:${C.text}">Tandem</span>
</a></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:32px 28px">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:700;color:${C.text}">${escape(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.text};white-space:pre-line">${escape(p)}</p>`).join('\n')}
${
  cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr><td style="background:${C.accent};border-radius:10px">
<a href="${escape(cta.url)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px">${escape(cta.label)}</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${C.muted};word-break:break-all">${escape(cta.url)}</p>`
    : ''
}
</td></tr>
<tr><td style="padding:24px 8px 0;font-size:12px;line-height:1.7;color:${C.muted}">
<p style="margin:0 0 8px"><strong style="color:${C.text}">Tandem</strong> · ${escape(f.slogan)}</p>
<p style="margin:0 0 8px">${footerLinks(locale).map(link).join(' &nbsp;·&nbsp; ')}</p>
${contact ? `<p style="margin:0 0 8px">${escape(f.contact)} ${link({ label: contact, url: `mailto:${contact}` })}</p>` : ''}
<p style="margin:0">${escape(f.automatic)}</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function passwordResetEmail(locale: Locale, name: string, url: string) {
  const t =
    locale === 'en'
      ? {
          subject: 'Reset your password',
          title: `Hello ${name},`,
          body: [
            'Someone (hopefully you) asked to reset your Tandem password.',
            'This link is valid for 30 minutes and can be used once. If you did not ask for it, ignore this email: your password stays the same.',
          ],
          cta: 'Choose a new password',
        }
      : {
          subject: 'Réinitialisation de votre mot de passe',
          title: `Bonjour ${name},`,
          body: [
            'Une demande de réinitialisation du mot de passe de votre compte Tandem a été faite.',
            "Ce lien est valable 30 minutes et utilisable une seule fois. Si vous n'êtes pas à l'origine de la demande, ignorez cet email : votre mot de passe reste inchangé.",
          ],
          cta: 'Choisir un nouveau mot de passe',
        };
  return {
    subject: t.subject,
    text: textBody(locale, [t.title, ...t.body], { label: t.cta, url }),
    html: layout(locale, t.title, t.body, { label: t.cta, url }),
  };
}

/** Compte créé par un administrateur : choisir son mot de passe (lien valable 7 jours). */
export function welcomeEmail(locale: Locale, name: string, url: string) {
  const t =
    locale === 'en'
      ? {
          subject: 'Your Tandem account',
          title: `Hello ${name},`,
          body: [
            'An account has been created for you on Tandem, the shared household task list.',
            'Choose your password to sign in. This link is valid for 7 days and can be used once.',
          ],
          cta: 'Choose my password',
        }
      : {
          subject: 'Votre compte Tandem',
          title: `Bonjour ${name},`,
          body: [
            'Un compte a été créé pour vous sur Tandem, les tâches du foyer partagées.',
            'Choisissez votre mot de passe pour vous connecter. Ce lien est valable 7 jours et utilisable une seule fois.',
          ],
          cta: 'Choisir mon mot de passe',
        };
  return {
    subject: t.subject,
    text: textBody(locale, [t.title, ...t.body], { label: t.cta, url }),
    html: layout(locale, t.title, t.body, { label: t.cta, url }),
  };
}

const COMPONENT_NAMES: Record<string, { fr: string; en: string }> = {
  api: { fr: 'API', en: 'API' },
  database: { fr: 'Base de données', en: 'Database' },
  redis: { fr: 'Redis', en: 'Redis' },
  calendar: { fr: 'Synchronisation Google Calendar', en: 'Google Calendar sync' },
  email: { fr: "Envoi d'e-mails", en: 'Email delivery' },
  backups: { fr: 'Sauvegardes', en: 'Backups' },
};

/** Alerte de surveillance aux administrateurs (incident ouvert / résolu). */
export function incidentEmail(
  locale: Locale,
  kind: 'opened' | 'resolved',
  component: string,
  detail: string | null,
  since: Date,
  url: string,
) {
  const name = COMPONENT_NAMES[component]?.[locale] ?? component;
  const minutes = Math.max(1, Math.round((Date.now() - since.getTime()) / 60_000));
  const en = locale === 'en';
  const subject =
    kind === 'opened'
      ? en
        ? `🔴 Incident: ${name}`
        : `🔴 Incident : ${name}`
      : en
        ? `✅ Resolved: ${name}`
        : `✅ Résolu : ${name}`;
  const body =
    kind === 'opened'
      ? [
          en ? `${name} is failing.` : `${name} ne répond plus correctement.`,
          ...(detail ? [(en ? 'Detail: ' : 'Détail : ') + detail] : []),
          en
            ? 'You will get another email when it is back.'
            : 'Un autre e-mail vous préviendra du retour à la normale.',
        ]
      : [
          en
            ? `${name} is working again (after about ${minutes} min).`
            : `${name} fonctionne de nouveau (après environ ${minutes} min).`,
        ];
  const cta = en ? 'Open monitoring' : 'Ouvrir la surveillance';
  return {
    subject,
    text: textBody(locale, body, { label: cta, url }),
    html: layout(locale, subject, body, { label: cta, url }),
  };
}

/** Vérification de la configuration SMTP depuis l'administration. */
export function testEmail(locale: Locale) {
  const title = locale === 'en' ? 'Test email' : 'E-mail de test';
  const body = [
    locale === 'en'
      ? 'Tandem can send emails: password reset, invitations and acknowledgements will arrive.'
      : 'Tandem sait envoyer des e-mails : réinitialisations, invitations et accusés de réception arriveront.',
  ];
  return {
    subject: title,
    text: textBody(locale, [title, ...body]),
    html: layout(locale, title, body),
  };
}

/** Accusé de réception d'une tâche créée par e-mail. */
export function inboundTaskCreatedEmail(
  locale: Locale,
  p: { title: string; when: string | null; assignees: string | null; files: string[]; url: string },
) {
  const fr = locale !== 'en';
  const subject = `${fr ? '✓ Tâche créée' : '✓ Task created'} : ${p.title}`;
  const lines = [
    p.when ? `${fr ? 'Quand' : 'When'} : ${p.when}` : fr ? 'Sans date' : 'No date',
    p.assignees ? `${fr ? 'Qui' : 'Who'} : ${p.assignees}` : null,
    p.files.length ? `${fr ? 'Pièces jointes' : 'Attachments'} : ${p.files.join(', ')}` : null,
  ].filter((l): l is string => l !== null);
  const cta = fr ? 'Ouvrir la tâche' : 'Open the task';
  return {
    subject,
    text: textBody(locale, [p.title, lines.join('\n')], { label: cta, url: p.url }),
    html: layout(locale, p.title, lines, { label: cta, url: p.url }),
  };
}

/** E-mail reçu mais sans rien pour faire un titre (sujet et message vides). */
export function inboundTaskEmptyEmail(locale: Locale) {
  const fr = locale !== 'en';
  const title = fr ? 'Aucune tâche créée' : 'No task created';
  const body = [
    fr
      ? "L'e-mail transféré n'avait ni sujet ni texte : impossible d'en faire une tâche. Écrivez la tâche dans le sujet (par exemple « Payer la facture vendredi »)."
      : 'The forwarded e-mail had neither subject nor text, so no task could be created. Write the task in the subject (e.g. “Pay the bill friday”).',
  ];
  return {
    subject: title,
    text: textBody(locale, [title, ...body]),
    html: layout(locale, title, body),
  };
}

const REPORT_KINDS: Record<string, Record<Locale, string>> = {
  BUG: { fr: 'Bug', en: 'Bug' },
  IDEA: { fr: 'Idée', en: 'Idea' },
  QUESTION: { fr: 'Question', en: 'Question' },
  OTHER: { fr: 'Autre', en: 'Other' },
};

/** Nouveau signalement, aux administrateurs. */
export function reportNewEmail(
  locale: Locale,
  p: { kind: string; title: string; description: string; author: string; url: string },
) {
  const en = locale === 'en';
  const kind = REPORT_KINDS[p.kind]?.[locale] ?? p.kind;
  const subject = `${p.kind === 'BUG' ? '🐞' : '💬'} ${kind} : ${p.title}`;
  const body = [
    en ? `New report from ${p.author}.` : `Nouveau signalement de ${p.author}.`,
    p.description.length > 1500 ? `${p.description.slice(0, 1500)}…` : p.description,
  ];
  const cta = en ? 'Open reports' : 'Ouvrir les signalements';
  return {
    subject,
    text: textBody(locale, body, { label: cta, url: p.url }),
    html: layout(locale, subject, body, { label: cta, url: p.url }),
  };
}

/** Réponse de l'administrateur à un signalement (si l'auteur a accepté d'être recontacté). */
export function reportReplyEmail(
  locale: Locale,
  p: { title: string; reply: string; status: string; url: string },
) {
  const en = locale === 'en';
  const subject = en
    ? `Reply to your report: ${p.title}`
    : `Réponse à votre signalement : ${p.title}`;
  const status: Record<string, Record<Locale, string>> = {
    OPEN: { fr: 'ouvert', en: 'open' },
    IN_PROGRESS: { fr: 'en cours', en: 'in progress' },
    RESOLVED: { fr: 'résolu', en: 'resolved' },
    CLOSED: { fr: 'fermé', en: 'closed' },
  };
  const body = [
    p.reply,
    en
      ? `Status: ${status[p.status]?.en ?? p.status}.`
      : `État : ${status[p.status]?.fr ?? p.status}.`,
    en
      ? 'You receive this email because you agreed to be contacted about this report.'
      : 'Vous recevez cet e-mail car vous avez accepté d’être recontacté·e à propos de ce signalement.',
  ];
  const cta = en ? 'See my reports' : 'Voir mes signalements';
  return {
    subject,
    text: textBody(locale, body, { label: cta, url: p.url }),
    html: layout(locale, subject, body, { label: cta, url: p.url }),
  };
}
