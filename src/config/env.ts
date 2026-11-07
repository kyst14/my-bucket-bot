import "dotenv/config";
import { existsSync } from "node:fs";

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing env variable: ${name}`);
    }
    return value;
}

function optional(name: string, defaultValue: string): string {
    const value = process.env[name];
    if (!value) {
        return defaultValue;
    }
    return value;
}

export const env = {
    nodeEnv: optional("NODE_ENV", "development"),
    isProd: process.env.NODE_ENV === "production",

    botToken: required("BOT_TOKEN"),

    port: Number(optional("PORT", "3000")),
    host: optional("HOST", "0.0.0.0"),

    webhookEnabled:
        optional("WEBHOOK_ENABLED", "false").toLowerCase() === "true",
    baseUrl: optional("BASE_URL", "").replace(/\/$/, ""),
    webhookSecret: optional("WEBHOOK_SECRET", ""),

    tgApiRoot: optional("TG_API_ROOT", "https://api.telegram.org"),
    redisUrl: optional("REDIS_URL", "redis://localhost:6379"),

    // yt-dlp config
    downloadDir: optional("DOWNLOADS_DIR", "./tmp/downloads"),
    ytDlpBin: optional("YTDLP_BIN", "yt-dlp"),
    ytDlpJsRuntime: optional("YTDLP_JS_RUNTIME", "node"),
    maxFileSizeBytes:
        Math.floor(Number(optional("MAX_FILE_SIZE_BYTES", "50"))) * 1024 * 1024, // 50 MB
    fileTtlMs: Number(optional("FILE_TTL_MS", "600000")), // 10 minutes
    cleanupIntervalMs: Number(optional("CLEANUP_INTERVAL_MS", "300000")), // 5 minutes
    allowedQualities: optional("ALLOWED_QUALITY", "360p,480p,720p,1080p")
        .split(",")
        .map((q) => q.trim()),
    cookiesPath: optional("COOKIES_PATH", "")
} as const;

if (env.webhookEnabled) {
    if (!env.baseUrl)
        throw new Error("BASE_URL is required when WEBHOOK_ENABLED=true");
    if (!env.webhookSecret)
        throw new Error("WEBHOOK_SECRET is required when WEBHOOK_ENABLED=true");
    if (env.webhookSecret.length < 32) {
        throw new Error("WEBHOOK_SECRET must be at least 32 characters");
    }
}

if (env.cookiesPath) {
    const cookiesPathExists = existsSync(env.cookiesPath)
    if (!cookiesPathExists) {
        throw new Error("COOKIES_PATH does not point to an existing file");
    } else if (!env.cookiesPath.endsWith(".txt")) {
        throw new Error("COOKIES_PATH must point to a .txt file");
    }
}

export default env;
