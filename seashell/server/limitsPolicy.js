/** Free-tier batch limits: usage since last rewarded ad (no daily reset). */
export const FREE_WORDS_BATCH = 2;
/** One rewarded video unlocks this many practice turns. */
export const FREE_PRACTICE_BATCH = 2;
export const FREE_WORDS_PER_AD = 2;
export const FREE_PRACTICE_PER_AD = 2;

/** @deprecated alias */
export const FREE_WORDS_BASE = FREE_WORDS_BATCH;
/** @deprecated alias */
export const FREE_PRACTICE_BASE = FREE_PRACTICE_BATCH;

export function wordsBatchLimit() {
  return FREE_WORDS_BATCH;
}

export function practiceBatchLimit() {
  return FREE_PRACTICE_BATCH;
}

/** @deprecated use wordsBatchLimit */
export function wordsDailyLimit() {
  return wordsBatchLimit();
}

/** @deprecated use practiceBatchLimit */
export function practiceDailyLimit() {
  return practiceBatchLimit();
}

export const QUOTA_LIMIT_ERROR = 'Free limit reached. Watch an ad or upgrade to Premium.';
/** @deprecated */
export const DAILY_LIMIT_ERROR = QUOTA_LIMIT_ERROR;
