import { Bot } from "grammy";
import env from "@/utils/env.js";
import type { UserFromGetMe } from "grammy/types";

export const bot = new Bot(env.botToken, {
    client: {
        apiRoot: env.tgApiRoot,
    },
});

export async function startBot() {
    console.log("🚀 Starting bot...");
    await bot.init();

    // set webhook if enabled, otherwise start long polling
    const webhookEnabled = await setWebhook();
    if (webhookEnabled) {
        console.log(`✅ Webhook enabled.`);
    } else {
        console.log(
            "Bot is running in long polling mode. Webhook is disabled.",
        );

        await bot.start();
    }

    const botInfo = await bot.api.getMe();

    await onStart(botInfo, webhookEnabled);

    return;
}

async function onStart(botInfo: UserFromGetMe, webhookEnabled?: boolean) {
    console.log(`✅ Bot started as @${botInfo.username} \n`);

    // show bot info
    console.log(
        `👤 Bot info:\n` +
            ` - ID: ${botInfo.id}\n` +
            ` - Username: ${botInfo.username}\n` +
            ` - First name: ${botInfo.first_name}\n` +
            ` - Webhook URL: ${webhookEnabled ? "✓ Enabled" : "✕ Disabled"}\n`,
    );
}

async function setWebhook(): Promise<boolean> {
    let webhookEnabled = false;

    if (env.webhookEnabled) {
        const webhookUrl = new URL(`${env.baseUrl}/webhook/${env.botToken}`);

        webhookEnabled = await bot.api.setWebhook(webhookUrl.toString(), {
            secret_token: env.webhookSecret,
            drop_pending_updates: true,
        });
    } else {
        await bot.api.deleteWebhook();
    }

    return webhookEnabled;
}
