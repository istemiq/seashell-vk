#!/usr/bin/env python3
"""Reformat /root/seashell-server-new/.env — сохраняет значения, чистая структура."""
from pathlib import Path

ENV_PATH = Path("/root/seashell-server-new/.env")

SECRET_KEYS = {
    "TELEGRAM_BOT_TOKEN",
    "OPENROUTER_API_KEY",
    "GIGACHAT_API_KEY",
    "DATABASE_URL",
    "VK_APP_SECRET",
    "TTS_KEY_SECRET",
}

PLACEHOLDER = {
    "OPENROUTER_API_KEY": "",
}

SECTIONS = [
    ("# --- Telegram ---", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOW_LOCALHOST_HEADER"]),
    ("# --- Сервер ---", ["PORT", "NODE_ENV"]),
    ("# --- База ---", ["DATABASE_URL"]),
    ("# --- CORS ---", ["CORS_ORIGINS"]),
    (
        "# --- LLM: OpenRouter + DeepSeek ---",
        [
            "LLM_PROVIDER",
            "OPENROUTER_API_KEY",
            "OPENROUTER_MODEL",
            "OPENROUTER_APP_NAME",
            "OPENROUTER_HTTP_REFERER",
        ],
    ),
    (
        "# --- GigaChat (не используется при LLM_PROVIDER=openrouter) ---",
        [
            "GIGACHAT_API_KEY",
            "GIGACHAT_MODEL_NAME",
            "GIGACHAT_TLS_INSECURE",
            "GIGACHAT_DICTIONARY_CACHE_VERSION",
        ],
    ),
    ("# --- VK ---", ["VK_APP_SECRET", "VK_REVIEWER_USER_ID"]),
    (
        "# --- TTS ---",
        [
            "TTS_ENABLED",
            "TTS_CACHE_DIR",
            "TTS_MODEL_EN_US",
            "TTS_MODEL_EN_GB",
            "TTS_KEY_SECRET",
        ],
    ),
]

DEFAULTS = {
    "TELEGRAM_ALLOW_LOCALHOST_HEADER": "1",
    "PORT": "3001",
    "NODE_ENV": "production",
    "LLM_PROVIDER": "openrouter",
    "OPENROUTER_MODEL": "deepseek/deepseek-chat",
    "OPENROUTER_APP_NAME": "Seashell",
    "OPENROUTER_HTTP_REFERER": "https://api.sishel.ru",
    "GIGACHAT_MODEL_NAME": "GigaChat-Max",
    "GIGACHAT_TLS_INSECURE": "1",
    "GIGACHAT_DICTIONARY_CACHE_VERSION": "v1",
    "VK_REVIEWER_USER_ID": "1",
    "TTS_ENABLED": "true",
    "TTS_CACHE_DIR": "/var/lib/seashell-tts",
    "TTS_MODEL_EN_US": "/opt/piper/voices/en_US-ljspeech-medium.onnx",
    "TTS_MODEL_EN_GB": "/opt/piper/voices/en_GB-cori-medium.onnx",
    "CORS_ORIGINS": (
        "https://vk.com,https://m.vk.com,https://web.vk.com,https://vk.ru,https://m.vk.ru,"
        "http://127.0.0.1:5173,http://localhost:5173,https://front.sishel.ru,http://front.sishel.ru"
    ),
}


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def main() -> None:
    old = parse_env(ENV_PATH.read_text(encoding="utf-8")) if ENV_PATH.exists() else {}
    merged = {**DEFAULTS, **old}

    if not merged.get("OPENROUTER_API_KEY"):
        merged["OPENROUTER_API_KEY"] = PLACEHOLDER["OPENROUTER_API_KEY"]

    lines: list[str] = []
    used: set[str] = set()

    for header, keys in SECTIONS:
        lines.append(header)
        for key in keys:
            used.add(key)
            val = merged.get(key, DEFAULTS.get(key, ""))
            if key == "OPENROUTER_API_KEY" and not val:
                lines.append("# Вставьте ключ с openrouter.ai (Keys → Create Key):")
            lines.append(f"{key}={val}")
        lines.append("")

    extra = sorted(k for k in merged if k not in used)
    if extra:
        lines.append("# --- Прочее (из старого .env) ---")
        for key in extra:
            lines.append(f"{key}={merged[key]}")
        lines.append("")

    backup = ENV_PATH.with_suffix(".env.bak")
    if ENV_PATH.exists():
        backup.write_text(ENV_PATH.read_text(encoding="utf-8"), encoding="utf-8")

    ENV_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"ok backup={backup}")
    print("OPENROUTER_API_KEY set:", bool(merged.get("OPENROUTER_API_KEY")))


if __name__ == "__main__":
    main()
