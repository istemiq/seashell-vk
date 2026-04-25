import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';

const REST_LINES = [
  { t: 'Интерфейс … готов', ok: true },
  { t: 'Подсистема «Словарь» … в режиме ожидания', ok: true },
  { t: 'Подсистема «Практика» … в режиме ожидания', ok: true },
  { t: 'Память сессии … зарезервирована (0 КБ, условно)', ok: true },
  { t: 'Состояние: готов к работе', ok: true },
];

const CHAR_MS = 14;
const LINE_PAUSE_MS = 220;
const CYCLE_PAUSE_MS = 1800;

function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * Декоративные строки в стиле старых ПК; первая строка подставляет имя из VK, если уже известно.
 */
export function SeashellBootlog({ userDisplayName }) {
  const trimmed = typeof userDisplayName === 'string' ? userDisplayName.trim() : '';
  const allLines = useMemo(() => {
    const line1 = trimmed
      ? { t: `Пользователь «${trimmed}» … инициализирован`, ok: true }
      : { t: 'Пользователь … ожидание профиля', ok: false };
    return [line1, ...REST_LINES];
  }, [trimmed]);

  const [step, setStep] = useState({ line: 0, ch: 0, cycle: 0 });

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let timer = null;
    const current = allLines[step.line];
    const base = current?.t ?? '';
    const suffix = current?.ok ? ' … OK' : '';
    const full = `${base}${suffix}`;

    const atEndOfLine = step.ch >= full.length;
    const atLastLine = step.line >= allLines.length - 1;

    const schedule = () => {
      if (!atEndOfLine) {
        timer = setTimeout(
          () => setStep((s) => ({ ...s, ch: Math.min(s.ch + 1, full.length) })),
          CHAR_MS,
        );
        return;
      }
      if (!atLastLine) {
        timer = setTimeout(() => setStep((s) => ({ ...s, line: s.line + 1, ch: 0 })), LINE_PAUSE_MS);
        return;
      }
      timer = setTimeout(() => setStep((s) => ({ line: 0, ch: 0, cycle: s.cycle + 1 })), CYCLE_PAUSE_MS);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [allLines, step]);

  const reduced = prefersReducedMotion();

  return (
    <div className="seashell-bootlog" aria-hidden="true">
      {allLines.map((line, i) => {
        const prefix = `[${String(i + 1).padStart(2, '0')}]`;
        const suffix = line.ok ? ' … OK' : '';
        const full = `${line.t}${suffix}`;

        const visible =
          reduced
            ? full
            : i < step.line
              ? full
              : i > step.line
                ? ''
                : full.slice(0, step.ch);

        const showCursor = !reduced && i === step.line && step.ch < full.length;
        return (
          <div key={`${i}-${step.cycle}`}>
            <strong>{prefix}</strong> {visible}
            {showCursor ? '▌' : ''}
          </div>
        );
      })}
    </div>
  );
}

SeashellBootlog.propTypes = {
  userDisplayName: PropTypes.string,
};
