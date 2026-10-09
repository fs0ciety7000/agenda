import illustrations from '@agenda/design-tokens/illustrations';
import { cn } from '@/lib/cn';

export type IllustrationName = keyof typeof illustrations.illustrations;

/**
 * Illustration au trait d'un état vide (même tracé que l'app Android, cf.
 * packages/design-tokens/illustrations.json), monochrome dans la couleur d'accent.
 */
export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  const [w, h] = illustrations.viewBox;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className={cn('text-accent', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={illustrations.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={illustrations.background} fill="currentColor" fillOpacity={0.08} stroke="none" />
      {illustrations.illustrations[name].paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
