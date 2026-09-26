/** Emails transactionnels, FR/EN, texte + HTML minimal (lisible partout, sans suivi ni image). */
type Locale = 'fr' | 'en';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#FAF6F2;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#24181D">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<p style="font-size:14px;color:#6F5F66;margin:0 0 24px">Agenda G &amp; N</p>
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
            'Someone (hopefully you) asked to reset your Agenda G & N password.',
            'This link is valid for 30 minutes and can be used once. If you did not ask for it, ignore this email: your password stays the same.',
          ],
          cta: 'Choose a new password',
        }
      : {
          subject: 'Réinitialisation de votre mot de passe',
          title: `Bonjour ${name},`,
          body: [
            'Une demande de réinitialisation du mot de passe de votre compte Agenda G & N a été faite.',
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
