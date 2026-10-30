import "dotenv/config";

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

    tgApiRoot: optional("TG_API_ROOT", "")
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

export default env;
