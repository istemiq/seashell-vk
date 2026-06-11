class GigaChatQueueFullError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GigaChatQueueFullError';
    this.statusCode = 429;
  }
}

const queue = [];
let active = 0;
let pumpTimer = null;
let lastStartedAt = 0;

function intEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = parseInt(String(process.env[name] ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function maxConcurrent() {
  return intEnv('GIGACHAT_QUEUE_CONCURRENCY', 1, { min: 1, max: 10 });
}

function minIntervalMs() {
  return intEnv('GIGACHAT_QUEUE_MIN_INTERVAL_MS', 1500, { min: 0, max: 60_000 });
}

function maxQueueSize() {
  return intEnv('GIGACHAT_QUEUE_MAX_SIZE', 50, { min: 1, max: 500 });
}

function schedulePump(delay = 0) {
  if (pumpTimer) return;
  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    pump();
  }, delay);
}

function pump() {
  if (active >= maxConcurrent()) return;
  const next = queue.shift();
  if (!next) return;

  const waitMs = Math.max(0, minIntervalMs() - (Date.now() - lastStartedAt));
  if (waitMs > 0) {
    queue.unshift(next);
    schedulePump(waitMs);
    return;
  }

  active += 1;
  lastStartedAt = Date.now();

  Promise.resolve()
    .then(next.task)
    .then(next.resolve, next.reject)
    .finally(() => {
      active -= 1;
      schedulePump(0);
    });
}

export function enqueueGigaChat(task, { label = 'gigachat' } = {}) {
  if (queue.length >= maxQueueSize()) {
    throw new GigaChatQueueFullError(
      `GigaChat queue is full (${label}). Please try again later.`,
    );
  }

  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject, label, enqueuedAt: Date.now() });
    schedulePump(0);
  });
}

export function gigaChatQueueStats() {
  return {
    active,
    queued: queue.length,
    concurrency: maxConcurrent(),
    minIntervalMs: minIntervalMs(),
    maxQueueSize: maxQueueSize(),
  };
}
