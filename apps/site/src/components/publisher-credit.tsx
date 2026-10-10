import type { Content } from '@/lib/content';

/**
 * Crédit de l'éditeur : « OCC Interactive — Une division de Cardor Media ». Emblèmes repris de
 * la marque (dépôt mons-corp, `static/brand`) : monochromes au repos, couleurs et mouvement
 * signature au survol ou au focus (glitch du dragon, tour de la roue), rien avec
 * `prefers-reduced-motion`. Décoratifs : le nom est écrit à côté.
 */
export function PublisherCredit({ t }: { t: Content }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      <a href="https://interactive.cardormedia.com/" className="brand-link">
        <span aria-hidden className="brand-glitch relative inline-block h-5 w-[1.55rem]">
          <span className="brand-mono absolute inset-0 bg-current [mask:url(/brand/interactive.svg)_center/contain_no-repeat]" />
          {/* eslint-disable-next-line @next/next/no-img-element -- export statique */}
          <img
            src="/brand/interactive.svg"
            alt=""
            width={25}
            height={20}
            className="brand-color absolute inset-0 size-full"
          />
        </span>
        <span className="underline underline-offset-4">OCC Interactive</span>
      </a>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        — {t.footer.division}
        <a href="https://cardormedia.com/marque" className="brand-link">
          <svg aria-hidden viewBox="0 0 100 100" className="brand-wheel size-5">
            <g fill="var(--logo-t1, #D4A84B)">
              <path
                fillRule="evenodd"
                d="M0 50a50 50 0 1 0 100 0a50 50 0 1 0 -100 0ZM3.399 50a46.6 46.6 0 1 1 93.2 0a46.6 46.6 0 1 1 -93.2 0Z"
              />
              <path d="M51.10 42.00 L50.65 3.00 L49.35 3.00 L48.90 42.00ZM54.46 43.27 L70.98 7.94 L69.81 7.37 L52.48 42.31ZM56.94 45.87 L87.15 21.20 L86.34 20.19 L55.57 44.15ZM58.04 49.29 L95.97 40.18 L95.68 38.91 L57.55 47.15ZM57.55 52.85 L95.68 61.09 L95.97 59.82 L58.04 50.71ZM55.57 55.85 L86.34 79.81 L87.15 78.80 L56.94 54.13ZM52.48 57.69 L69.81 92.63 L70.98 92.06 L54.46 56.73ZM48.90 58.00 L49.35 97.00 L50.65 97.00 L51.10 58.00ZM45.54 56.73 L29.02 92.06 L30.19 92.63 L47.52 57.69ZM43.06 54.13 L12.85 78.80 L13.66 79.81 L44.43 55.85ZM41.96 50.71 L4.03 59.82 L4.32 61.09 L42.45 52.85ZM42.45 47.15 L4.32 38.91 L4.03 40.18 L41.96 49.29ZM44.43 44.15 L13.66 20.19 L12.85 21.20 L43.06 45.87ZM47.52 42.31 L30.19 7.37 L29.02 7.94 L45.54 43.27Z" />
            </g>
            <circle cx="50" cy="50" r="8.4" fill="var(--logo-t2, #EDE8DF)" />
            <circle cx="50" cy="50" r="2.4" fill="var(--logo-t3, #FF3B1F)" />
          </svg>
          <span className="underline underline-offset-4">Cardor Media</span>
        </a>
      </span>
    </p>
  );
}
