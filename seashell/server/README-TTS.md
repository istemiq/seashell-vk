## TTS (Piper on VPS)

Мини‑приложение внутри VK WebView часто не умеет Web Speech / WebAudio, поэтому озвучка делается на бэкенде:

- `POST /api/tts/speak` → генерирует/берёт из кэша mp3 и отдаёт `{ url }`
- `GET /tts/v1/.../*.mp3` → публичная раздача (для `VKWebAppAudioPlay`)

### Требования на VPS

- `piper` в PATH (проверка: `piper --version`)
- `ffmpeg` в PATH
- голоса Piper `.onnx` на диске

### Переменные окружения

- `TTS_ENABLED` (default: `true`)
- `TTS_CACHE_DIR` (default: `/var/lib/seashell-tts`)
- `TTS_MODEL_EN_US` (default: `/opt/piper/voices/en_US-ljspeech-medium.onnx`)
- `TTS_MODEL_EN_GB` (default: `/opt/piper/voices/en_GB-cori-medium.onnx`)
- `TTS_RATE_DEFAULT` (default: `0.95`)
- `TTS_TEXT_MAX_LEN` (default: `400`)
- `TTS_RPM` (default: `30`) — лимит запросов в минуту на пользователя
- `TTS_KEY_SECRET` (optional) — соль для ключа кэша (чтобы нельзя было угадывать файлы по тексту)

