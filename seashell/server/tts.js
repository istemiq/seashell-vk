import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import express from 'express';
import { assertAllowedUserContent } from './contentPolicy.js';

function envBool(name, def = false) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return def;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function cacheRootDir() {
  const fromEnv = String(process.env.TTS_CACHE_DIR ?? '').trim();
  if (fromEnv) return fromEnv;
  // Dev on Windows may not have /var/lib.
  if (process.platform === 'win32') return path.join(os.tmpdir(), 'seashell-tts-cache');
  return '/var/lib/seashell-tts';
}

function piperBinaryPath() {
  const fromEnv = String(process.env.TTS_PIPER_BIN ?? '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform === 'win32') return 'piper';
  return '/opt/piper/piper/piper';
}

function voiceModelPath(locale) {
  const lc = String(locale ?? '').toLowerCase();
  if (lc === 'en-gb' || lc === 'en_gb') {
    return (
      String(process.env.TTS_MODEL_EN_GB ?? '').trim() ||
      '/opt/piper/voices/en_GB-cori-medium.onnx'
    );
  }
  // default en-US
  return (
    String(process.env.TTS_MODEL_EN_US ?? '').trim() ||
    '/opt/piper/voices/en_US-ljspeech-medium.onnx'
  );
}

function execFileChecked(cmd, args, { stdinText } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString('utf8')));
    child.stderr.on('data', (d) => (err += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ out, err });
      const e = new Error(`${cmd} exited with code ${code}`);
      e.stdout = out;
      e.stderr = err;
      e.exitCode = code;
      reject(e);
    });
    if (stdinText != null) {
      child.stdin.write(String(stdinText));
    }
    child.stdin.end();
  });
}

const inFlight = new Map(); // key -> Promise<{ relUrl: string }>

async function ensureMp3Cached({ text, locale, rate }) {
  const enabled = envBool('TTS_ENABLED', true);
  if (!enabled) {
    const e = new Error('TTS disabled');
    e.httpStatus = 501;
    throw e;
  }

  const t = normalizeText(text);
  if (!t) {
    const e = new Error('Invalid text');
    e.httpStatus = 400;
    throw e;
  }
  const maxLen = Number(process.env.TTS_TEXT_MAX_LEN ?? 400);
  if (t.length > maxLen) {
    const e = new Error(`Text too long (max ${maxLen})`);
    e.httpStatus = 400;
    throw e;
  }

  const pol = assertAllowedUserContent(t);
  if (!pol.ok) {
    const e = new Error(pol.error);
    e.httpStatus = 400;
    throw e;
  }

  const model = voiceModelPath(locale);
  const r = Number.isFinite(rate) ? rate : Number(process.env.TTS_RATE_DEFAULT ?? 0.95);
  const rateClamped = Math.min(1.25, Math.max(0.75, r));

  const secret = String(process.env.TTS_KEY_SECRET ?? '').trim();
  const key = sha256Hex([secret, locale || 'en-US', model, String(rateClamped), t].join('|'));

  const dir = path.join(cacheRootDir(), 'v1', String(locale || 'en-US'), key.slice(0, 2));
  const mp3Path = path.join(dir, `${key}.mp3`);

  const existing = await fs
    .stat(mp3Path)
    .then((s) => (s.isFile() && s.size > 0 ? true : false))
    .catch(() => false);

  if (existing) {
    return { relUrl: `/tts/v1/${encodeURIComponent(locale || 'en-US')}/${key.slice(0, 2)}/${key}.mp3` };
  }

  const prev = inFlight.get(key);
  if (prev) return prev;

  const p = (async () => {
    await fs.mkdir(dir, { recursive: true });
    // Temp files must live on the same volume as cache — rename from /tmp → /var fails with EXDEV.
    const tmpWav = path.join(dir, `${key}.wav.part`);
    const tmpMp3 = path.join(dir, `${key}.tmp.mp3`);

    try {
      await execFileChecked(piperBinaryPath(), ['--model', model, '--output_file', tmpWav, '--length_scale', String(1 / rateClamped)], {
        stdinText: t,
      });

      // MP3 for VK native player
      await execFileChecked('ffmpeg', ['-y', '-i', tmpWav, '-f', 'mp3', '-codec:a', 'libmp3lame', '-qscale:a', '4', tmpMp3]);

      // Atomic-ish write: rename within cache dir (same filesystem)
      await fs.rename(tmpMp3, mp3Path);
      await fs.rm(tmpWav, { force: true }).catch(() => {});

      return { relUrl: `/tts/v1/${encodeURIComponent(locale || 'en-US')}/${key.slice(0, 2)}/${key}.mp3` };
    } finally {
      inFlight.delete(key);
      await fs.rm(tmpWav, { force: true }).catch(() => {});
      await fs.rm(tmpMp3, { force: true }).catch(() => {});
    }
  })();

  inFlight.set(key, p);
  return p;
}

export function registerTtsStatic(app) {
  const staticDir = path.join(cacheRootDir(), 'v1');
  app.use(
    '/tts/v1',
    express.static(staticDir, {
      fallthrough: false,
      maxAge: '365d',
      immutable: true,
      setHeaders(res) {
        res.setHeader('Content-Type', 'audio/mpeg');
      },
    }),
  );
}

export function registerTtsSpeak(app, { makeRateLimiter }) {
  const limitTts = makeRateLimiter({
    windowMs: 60_000,
    max: Number(process.env.TTS_RPM ?? 30),
    keyFn: (req) => `tts:${req.vkUserId}`,
  });

  app.post('/api/tts/speak', limitTts, async (req, res) => {
    const text = req.body?.text ?? req.body?.t ?? '';
    const locale = String(req.body?.locale ?? 'en-US').trim() || 'en-US';
    const rate = req.body?.rate != null ? Number(req.body.rate) : NaN;
    try {
      const isProd = String(process.env.NODE_ENV ?? '').toLowerCase() === 'production';
      if (isProd && !String(process.env.TTS_KEY_SECRET ?? '').trim()) {
        return res.status(503).json({ error: 'TTS not configured' });
      }
      const startedAt = Date.now();
      const r = await ensureMp3Cached({ text, locale, rate });
      res.json({ url: r.relUrl, cached: true, ms: Date.now() - startedAt });
    } catch (e) {
      const status = Number(e?.httpStatus) || 500;
      const msg = e?.message || 'TTS failed';
      if (status >= 500) console.error(e);
      res.status(status).json({ error: msg });
    }
  });
}

/** @deprecated Use registerTtsStatic + registerTtsSpeak (speak must be after auth). */
export function registerTts(app, deps) {
  registerTtsStatic(app);
  registerTtsSpeak(app, deps);
}

