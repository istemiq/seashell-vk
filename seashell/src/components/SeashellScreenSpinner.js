import { SeashellShimmerLoader } from './SeashellShimmerLoader.js';

/** Полноэкранная загрузка вместо vkui ScreenSpinner. */
export function SeashellScreenSpinner() {
  return (
    <div className="seashell-screen-spinner" role="status" aria-live="polite" aria-label="Загрузка">
      <SeashellShimmerLoader />
    </div>
  );
}
