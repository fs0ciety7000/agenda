/** Emails transactionnels, FR/EN, texte + HTML minimal (lisible partout, sans suivi ni image). */
type Locale = 'fr' | 'en';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#FAF6F2;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#24181D">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<p style="font-size:14px;color:#6F5F66;margin:0 0 24px">Tandem</p>
<h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 16px">${escape(p)}</p>`).join('\n')}
${cta ? `<p style="margin:24px 0"><a href="${escape(cta.url)}" style="background:#7D4460;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${escape(cta.label)}</a></p><p style="font-size:13px;color:#6F5F66;word-break:break-all">${escape(cta.url)}</p>` : ''}
</div></body></html>`;
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
    text: `${t.title}\n\n${t.body.join('\n\n')}\n\n${t.cta} : ${url}\n`,
    html: layout(t.title, t.body, { label: t.cta, url }),
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
    text: `${t.title}\n\n${t.body.join('\n\n')}\n\n${t.cta} : ${url}\n`,
    html: layout(t.title, t.body, { label: t.cta, url }),
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
    text: `${body.join('\n\n')}\n\n${cta} : ${url}\n`,
    html: layout(subject, body, { label: cta, url }),
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
  return { subject: title, text: `${title}\n\n${body[0]}\n`, html: layout(title, body) };
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
    text: `${p.title}\n\n${lines.join('\n')}\n\n${cta} : ${p.url}\n`,
    html: layout(p.title, lines, { label: cta, url: p.url }),
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
    text: `${title}\n\n${body.join('\n\n')}\n`,
    html: layout(title, body),
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
    text: `${body.join('\n\n')}\n\n${cta} : ${p.url}\n`,
    html: layout(subject, body, { label: cta, url: p.url }),
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
    text: `${body.join('\n\n')}\n\n${cta} : ${p.url}\n`,
    html: layout(subject, body, { label: cta, url: p.url }),
  };
}
