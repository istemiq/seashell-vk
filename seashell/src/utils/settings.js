const STORAGE_KEY = 'seashell_settings_v1';

export const DEFAULT_SETTINGS = {
  onboarded: false,
  ttsEnabled: true,
  ttsRate: 0.95,
};

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function loadSettings() {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...parsed };
}

export function saveSettings(next) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function updateSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  saveSettings(next);
  return next;
}

