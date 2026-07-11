/** Max persisted turns per session (each row ≈ one user+assistant exchange). */
export const PRACTICE_MAX_STORED_TURNS = 14;

/** Max chars per message line in DB and LLM recent block. */
export const PRACTICE_MAX_MESSAGE_CHARS = 1200;

/** Max user input chars per turn. */
export const PRACTICE_MAX_USER_TEXT_CHARS = 4000;

/** Max chars for recent verbatim block in the practice prompt. */
export const PRACTICE_MAX_RECENT_HISTORY_CHARS = 16000;

/** Verbatim recent messages sent to the model (older context → summary). */
export const PRACTICE_RECENT_MESSAGES_FOR_LLM = 8;

/** Max stored summary length (chars). */
export const PRACTICE_MAX_SUMMARY_CHARS = 900;

/** Max sessions listed per user. */
export const PRACTICE_MAX_SESSIONS_LIST = 30;
