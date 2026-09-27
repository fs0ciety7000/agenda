/** HTML d'e-mail → texte lisible (le texte brut est préféré quand il existe). */
export function htmlToText(html: string): string {
  let source = html;
  // Resend peut renvoyer le HTML sous forme d'URI `data:` (html_format = data_uri).
  const dataUri = /^data:[^,]*?(;base64)?,(.*)$/s.exec(source);
  if (dataUri) {
    source = dataUri[1]
      ? Buffer.from(dataUri[2]!, 'base64').toString('utf8')
      : decodeURIComponent(dataUri[2]!);
  }
  return source
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
