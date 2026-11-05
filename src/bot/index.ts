import {
    Bot,
    BotError,
    Context,
    InlineKeyboard,
    InputFile,
    session,
    type SessionFlavor,
} from "grammy";
import env from "@/config/env.js";
import { RedisAdapter } from "@grammyjs/storage-redis";
import { Redis } from "ioredis";
import { I18n, type I18nFlavor } from "@grammyjs/i18n";
import { getVideoPreview } from "@/services/preview.js";
import type { VideoPreview } from "@/config/types.js";

interface SessionData {
    __language_code?: string;
}
type MyContext = Context & I18nFlavor & SessionFlavor<SessionData>;

export const bot = new Bot<MyContext>(env.botToken, {
    client: {
        apiRoot: env.tgApiRoot,
    },
});

bot.catch((err: BotError) => {
    const ctx = err.ctx;
    console.error(
        `Error while handling update ${ctx.update.update_id}:`,
        err.error,
    );
});

const redisClient = new Redis(env.redisUrl, {
    enableReadyCheck: false,
});
const storage = new RedisAdapter({ instance: redisClient });

const i18n = new I18n<MyContext>({
    defaultLocale: "en",
    directory: "locales",
    useSession: true,
});

bot.use(
    session({
        initial: (): SessionData => ({}),
        storage,
    }),
);

bot.use(i18n);

bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name || ctx.from?.username || "user";
    await ctx.reply(ctx.t("welcome", { name }), {
        parse_mode: "Markdown",
    });
});

bot.command("info", async (ctx) => {
    await ctx.reply(ctx.t("info"), {
        parse_mode: "Markdown",
    });
});

bot.command("help", async (ctx) => {
    await ctx.reply(ctx.t("help"), { parse_mode: "Markdown" });
});

bot.command("language", async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text("🇷🇺 Русский", "set_lang_ru")
        .text("🇬🇧 English", "set_lang_en");

    await ctx.reply("Please select a language:", { reply_markup: keyboard });
});

bot.callbackQuery(/^set_lang_(ru|en)$/, async (ctx) => {
    const lang = ctx.match[1]!;
    await ctx.i18n.setLocale(lang);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t("lang_changed"));
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

    const processingMessage = await ctx.reply(ctx.t("processing_video"));

    const url = urls[0]!;
    let preview: VideoPreview | null = null;

    try {
        preview = await getVideoPreview(url);
    } catch (error) {
        console.error("Error processing video preview:", error);
        await ctx.reply(
            "Error generating video preview: " +
                (error instanceof Error ? error.message : String(error)),
        );
    }

    if (!preview) {
        await ctx.reply(
            `I couldn't generate a preview for the provided link. Please make sure it's a valid video link.`,
        );
        return;
    } else {
        const {
            uploader: author,
            durationText,
            title,
            thumbnailUrl,
            qualities,
        } = preview;

        const caption = ctx.t("video_preview", {
            title,
            author: author || 'Unknown',
            durationText: durationText || 'Unknown',
        });

        const keyboard = new InlineKeyboard();

        const allowedQualities = qualities.filter((q) =>
            env.allowedQualities.includes(q.label),
        );

        allowedQualities.forEach((quality, index) => {
            keyboard.text(
                `${quality.label} (${quality.sizeText})`,
                `download_${quality.label}`,
            );

            if ((index + 1) % 2 === 0) {
                keyboard.row();
            }
        });

        keyboard.row().text(ctx.t("download_audio"), "download_audio");

        if (thumbnailUrl) {
            await ctx.replyWithPhoto(
                (() => {
                    if (
                        thumbnailUrl.startsWith("http://") ||
                        thumbnailUrl.startsWith("https://")
                    ) {
                        return thumbnailUrl;
                    }
                    return new InputFile(thumbnailUrl);
                })(),
                {
                    caption,
                    parse_mode: "Markdown",
                    reply_markup: keyboard,
                },
            );
        } else {
            await ctx.reply(caption, {
                parse_mode: "Markdown",
                reply_markup: keyboard,
            });
        }

        await ctx.api.deleteMessage(ctx.chat.id, processingMessage.message_id);
    }
});

bot.on("message", async (ctx) => {
    await ctx.reply(
        `I can only process messages that contain links. Please send me a link to a video and I will do the rest!`,
    );
});

export async function startBot() {
    await bot.init();

    // set webhook if enabled, otherwise start long polling
    const webhookEnabled = await setWebhook();
    if (webhookEnabled) {
        console.log(`✅ Webhook enabled.`);
    } else {
        console.log(
            "Bot is running in long polling mode. Webhook is disabled.",
        );

        bot.start();
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
