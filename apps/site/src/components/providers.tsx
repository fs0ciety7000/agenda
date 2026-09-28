'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/** Animations coupées si le système demande moins de mouvement. */
export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
