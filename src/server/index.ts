import { bot } from "@/bot/index.js";
import env from "@/utils/env.js";
import Fastify from "fastify";
import { webhookCallback } from "grammy";

const app = Fastify({
    logger: !env.isProd,
});

// Webhook endpoint
app.post(
    `/webhook/${env.botToken}`,
    webhookCallback(bot, "fastify", {
        secretToken: env.webhookSecret,
        timeoutMilliseconds: 10 * 60 * 1000, // 10 minutes
    }),
);

// Healthcheck
app.get("/health", async () => {
    return { status: "ok" };
});

export async function startServer() {
    await app.listen({ port: env.port, host: "0.0.0.0" });
}
