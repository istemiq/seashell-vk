import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/** Серебряный перелив + точки после каждого цикла анимации (seashell → seashell.). */
export function SeashellShimmerLoader() {
  const [dots, setDots] = useState(0);
  const lockRef = useRef(false);
  const spanRef = useRef(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;
    const el = spanRef.current;
    if (!el) return undefined;

    const onIteration = () => {
      if (lockRef.current) return;
      lockRef.current = true;
      setDots((d) => (d >= 3 ? 0 : d + 1));
      window.setTimeout(() => {
        lockRef.current = false;
      }, 50);
    };

    el.addEventListener('animationiteration', onIteration);
    return () => el.removeEventListener('animationiteration', onIteration);
  }, [reduced]);

  return (
    <span
      ref={spanRef}
      className={reduced ? 'seashell-shimmer seashell-shimmer--static' : 'seashell-shimmer'}
      aria-hidden="true"
    >
      seashell{'.'.repeat(dots)}
    </span>
  );
}
