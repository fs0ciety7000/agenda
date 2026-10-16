import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

/** Délai par essai : Open Food Facts répond parfois en plusieurs secondes. */
const TIMEOUT_MS = 8_000;
/** Un second essai après une panne (délai, réseau, 5xx, 429), jamais après « inconnu ». */
const ATTEMPTS = 2;

/** État du service depuis le démarrage, montré dans l'administration. */
const health = {
  lastSuccessAt: null as Date | null,
  lastFailureAt: null as Date | null,
  lastError: null as string | null,
};

/** Dernière réponse (produit trouvé ou inconnu) et dernière panne d'Open Food Facts. */
export function openFoodFactsHealth() {
  return {
    enabled: env().OPEN_FOOD_FACTS_URL !== 'off',
    lastSuccessAt: health.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: health.lastFailureAt?.toISOString() ?? null,
    lastError: health.lastError,
  };
}

/**
 * Nom d'un produit dans Open Food Facts (base ouverte et collaborative). Seul le code-barres est
 * envoyé, par le serveur : ni le foyer ni l'utilisateur ne sont connus du service.
 */
@Injectable()
export class OpenFoodFactsClient {
  private readonly logger = new Logger(OpenFoodFactsClient.name);

  /**
   * Nom du produit ; null s'il est inconnu (ou la recherche coupée par « off ») ; undefined si
   * le service n'a pas répondu, même après un second essai.
   */
  async productName(code: string, locale: string): Promise<string | null | undefined> {
    const base = env().OPEN_FOOD_FACTS_URL;
    if (base === 'off') return null;
    const lang = locale.slice(0, 2);
    const fields = `product_name_${lang},product_name,brands`;
    const url = `${base}/api/v2/product/${code}.json?fields=${fields}`;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const name = await this.fetchName(url, lang);
        health.lastSuccessAt = new Date();
        return name;
      } catch (e) {
        health.lastFailureAt = new Date();
        health.lastError = (e as Error).message.slice(0, 200);
        this.logger.warn(
          `Open Food Facts unavailable (attempt ${attempt}/${ATTEMPTS}): ${(e as Error).message}`,
        );
      }
    }
    return undefined;
  }

  private async fetchName(url: string, lang: string): Promise<string | null> {
    const res = await fetch(url, {
      // Demandé par Open Food Facts : une application identifiable.
      headers: { 'User-Agent': `Tandem/1.0 (${env().WEB_ORIGIN})` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      status?: number;
      product?: Record<string, unknown>;
    };
    if (body.status === 0 || !body.product) return null;
    const p = body.product;
    const pick = (k: string) => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
    const name = pick(`product_name_${lang}`) || pick('product_name') || pick('brands');
    return name ? name.slice(0, 200) : null;
  }
}
