import { useEffect, useState } from 'react';

const SHIMMER_CYCLE_MS = 2600;

function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/** Серебряный перелив + точки после каждого цикла анимации (seashell → seashell.). */
export function SeashellShimmerLoader() {
  const [dots, setDots] = useState(0);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;

    const id = window.setInterval(() => {
      setDots((d) => (d >= 3 ? 0 : d + 1));
    }, SHIMMER_CYCLE_MS);

    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <span
      className={reduced ? 'seashell-shimmer seashell-shimmer--static' : 'seashell-shimmer'}
      aria-hidden="true"
    >
      seashell{'.'.repeat(dots)}
    </span>
  );
}
