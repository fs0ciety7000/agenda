import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

const TIMEOUT_MS = 5_000;

/**
 * Nom d'un produit dans Open Food Facts (base ouverte et collaborative). Seul le code-barres est
 * envoyé, par le serveur : ni le foyer ni l'utilisateur ne sont connus du service.
 */
@Injectable()
export class OpenFoodFactsClient {
  private readonly logger = new Logger(OpenFoodFactsClient.name);

  /** Nom du produit ; null s'il est inconnu ; undefined si le service n'a pas répondu. */
  async productName(code: string, locale: string): Promise<string | null | undefined> {
    const base = env().OPEN_FOOD_FACTS_URL;
    if (base === 'off') return undefined;
    const lang = locale.slice(0, 2);
    const fields = `product_name_${lang},product_name,brands`;
    try {
      const res = await fetch(`${base}/api/v2/product/${code}.json?fields=${fields}`, {
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
    } catch (e) {
      this.logger.warn(`Open Food Facts unavailable: ${(e as Error).message}`);
      return undefined;
    }
  }
}
