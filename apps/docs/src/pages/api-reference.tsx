import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Head from '@docusaurus/Head';
import Layout from '@theme/Layout';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    SwaggerUIBundle?: (options: Record<string, unknown>) => unknown;
  }
}

/**
 * Référence interactive de l'API (Swagger UI), générée depuis le code : routes NestJS et schémas
 * Zod de @agenda/contracts (`pnpm --filter @agenda/api openapi`).
 */
export default function ApiReference() {
  const spec = useBaseUrl('/openapi.json');
  const script = useBaseUrl('/swagger/swagger-ui-bundle.js');
  const css = useBaseUrl('/swagger/swagger-ui.css');
  const target = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const render = () =>
      window.SwaggerUIBundle?.({
        domNode: target.current,
        url: spec,
        docExpansion: 'none',
        defaultModelsExpandDepth: 0,
        deepLinking: true,
        // Lecture seule : pas d'appel réel depuis la doc.
        supportedSubmitMethods: [],
      });
    if (window.SwaggerUIBundle) {
      render();
      return;
    }
    const tag = document.createElement('script');
    tag.src = script;
    tag.onload = render;
    tag.onerror = () => setFailed(true);
    document.body.appendChild(tag);
  }, [spec, script]);

  return (
    <Layout
      title="Référence de l’API"
      description="Toutes les routes de l’API Agenda G & N, avec leurs paramètres et schémas."
    >
      <Head>
        <link rel="stylesheet" href={css} />
      </Head>
      <main className="container api-reference">
        <h1>Référence de l’API</h1>
        <p>
          Générée depuis le code à chaque modification de l’API. Pour l’authentification, les
          erreurs, l’idempotence et le temps réel, voir le <Link to="/api">guide de l’API</Link>.
          Fichier brut : <a href={spec}>openapi.json</a> (OpenAPI 3).
        </p>
        {failed ? <p>La référence n’a pas pu être chargée.</p> : <div ref={target} />}
      </main>
    </Layout>
  );
}
