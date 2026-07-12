import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { assertAllowedUserContent } from './contentPolicy.js';

function envBool(name, def = false) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return def;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function whisperBinPath() {
  return (
    String(process.env.STT_WHISPER_BIN ?? '').trim() ||
    '/opt/whisper.cpp/build/bin/whisper-cli'
  );
}

function whisperModelPath() {
  return (
    String(process.env.STT_WHISPER_MODEL ?? '').trim() ||
    '/opt/whisper.cpp/models/ggml-tiny.en.bin'
  );
}

function ffmpegBinPath() {
  return String(process.env.STT_FFMPEG_BIN ?? '').trim() || 'ffmpeg';
}

function execChecked(cmd, args, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      err += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ out, err });
      const e = new Error(`${cmd} exited with code ${code}`);
      e.stdout = out;
      e.stderr = err;
      reject(e);
    });
  });
}

async function unlinkQuiet(p) {
  try {
    await fs.unlink(p);
  } catch {
    // ignore
  }
}

function extFromMime(mime) {
  const m = String(mime ?? '').toLowerCase();
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  return 'webm';
}

async function transcodeToWav(inputPath) {
  const outPath = inputPath.replace(/\.[^.]+$/, '.wav');
  await execChecked(ffmpegBinPath(), [
    '-y',
    '-i',
    inputPath,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    outPath,
  ]);
  return outPath;
}

async function transcribeWav(wavPath) {
  const outBase = path.join(os.tmpdir(), `seashell-stt-${randomUUID()}`);
  await execChecked(
    whisperBinPath(),
    ['-m', whisperModelPath(), '-f', wavPath, '-l', 'en', '-nt', '-otxt', '-of', outBase],
    { timeoutMs: 120_000 },
  );
  const txtPath = `${outBase}.txt`;
  const text = await fs.readFile(txtPath, 'utf8').catch(() => '');
  await unlinkQuiet(txtPath);
  return String(text).trim();
}

async function transcribeAudioBuffer(buf, mime) {
  const enabled = envBool('STT_ENABLED', true);
  if (!enabled) {
    const e = new Error('STT disabled');
    e.httpStatus = 503;
    throw e;
  }

  const maxBytes = Number(process.env.STT_AUDIO_MAX_BYTES ?? 1_500_000);
  if (!buf?.length) {
    const e = new Error('Empty audio');
    e.httpStatus = 400;
    throw e;
  }
  if (buf.length > maxBytes) {
    const e = new Error('Audio too large');
    e.httpStatus = 413;
    throw e;
  }

  const inputPath = path.join(os.tmpdir(), `seashell-stt-in-${randomUUID()}.${extFromMime(mime)}`);
  let wavPath = null;
  try {
    await fs.writeFile(inputPath, buf);
    wavPath = await transcodeToWav(inputPath);
    return await transcribeWav(wavPath);
  } finally {
    await unlinkQuiet(inputPath);
    if (wavPath) await unlinkQuiet(wavPath);
  }
}

export function registerSttTranscribe(app, { makeRateLimiter }) {
  const limitStt = makeRateLimiter({
    windowMs: 60_000,
    max: Number(process.env.STT_RPM ?? 20),
    keyFn: (req) => `stt:${req.vkUserId}`,
  });

  app.post('/api/stt/transcribe', limitStt, async (req, res) => {
    const b64 = String(req.body?.audioBase64 ?? req.body?.audio ?? '').trim();
    const mime = String(req.body?.mime ?? 'audio/webm').trim() || 'audio/webm';
    if (!b64) {
      return res.status(400).json({ error: 'Missing audio' });
    }

    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid audio encoding' });
    }

    try {
      const bin = whisperBinPath();
      const model = whisperModelPath();
      await fs.access(bin);
      await fs.access(model);
    } catch {
      return res.status(503).json({ error: 'STT not configured' });
    }

    try {
      const startedAt = Date.now();
      const text = await transcribeAudioBuffer(buf, mime);
      const pol = assertAllowedUserContent(text);
      if (!pol.ok) {
        return res.status(400).json({ error: pol.error });
      }
      res.json({ text, ms: Date.now() - startedAt });
    } catch (e) {
      const status = Number(e?.httpStatus) || 500;
      const msg = e?.message || 'STT failed';
      if (status >= 500) console.error('[stt]', e);
      res.status(status).json({ error: msg });
    }
  });
}
