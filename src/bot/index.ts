import { Bot, InputFile } from "grammy";
import env from "@/utils/env.js";

export const bot = new Bot(env.botToken, {
    client: {
        apiRoot: env.tgApiRoot,
    },
});

bot.command("start", async (ctx) => {
    await ctx.reply(
        `👋 Hello, I can help you to download any video across the internet! Just send me a link to the video and I will do the rest!`,
    );
});

bot.on("message:text", async (ctx, next) => {
    const hasLink =
        ctx.entities("url").length > 0 || ctx.entities("text_link").length > 0;

    if (!hasLink) return next();

    const urls = [
        ...ctx.entities("url").map((e) => e.text),
        ...ctx.entities("text_link").map((e) => e.url || e.text),
    ];

    if (urls.length !== 1) {
        await ctx.reply(
            `I found multiple links in your message. Please send me only one link at a time.`,
        );
        return;
    }

    const url = urls[0]!;

    await ctx.reply(`Processing your link: ${url}`);    
});

bot.on("message", async (ctx) => {
    await ctx.reply(`I can only process messages that contain links. Please send me a link to a video and I will do the rest!`);    
});

export async function startBot() {
    await bot.init();

    // set webhook if enabled, otherwise start long polling
    const webhookEnabled = await setWebhook();
    console.log(webhookEnabled);
    if (webhookEnabled) {
        console.log(`✅ Webhook enabled.`);
    } else {
        console.log(
            "Bot is running in long polling mode. Webhook is disabled.",
        );

        await bot.start();
    }

    const botInfo = await bot.api.getMe();

    return { botInfo, webhookEnabled };
}

async function setWebhook(): Promise<boolean> {
    let webhookEnabled = false;

    if (env.webhookEnabled) {
        const webhookUrl = new URL(`${env.baseUrl}/webhook/${env.botToken}`);

        await bot.api.setWebhook(webhookUrl.toString(), {
            secret_token: env.webhookSecret,
            drop_pending_updates: true,
        });

        webhookEnabled = true;
    } else {
        await bot.api.deleteWebhook();
    }

    return webhookEnabled;
}
