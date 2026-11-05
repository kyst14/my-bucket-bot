import env from "@/config/env.js";
import type {
    DownloadResult,
    MyContext,
    MyConversation,
    VideoPreview,
} from "@/config/types.js";
import { downloadVideo } from "@/services/download.js";
import { getVideoPreview } from "@/services/preview.js";
import { InlineKeyboard, InputFile } from "grammy";

export async function downloadConversation(
    conversation: MyConversation,
    ctx: MyContext,
    url: string,
) {
    const processingMessage = await ctx.reply(ctx.t("processing_video"));

    let preview: VideoPreview | null = null;

    try {
        preview = await getVideoPreview(url);
    } catch (error) {
        console.error("Error processing video preview:", error);
        await ctx.reply(
            "⛔️ Error generating video preview: " +
                (error instanceof Error ? error.message : String(error)),
        );
        return;
    }

    if (!preview) {
        await ctx.reply(
            `"⛔️ I couldn't generate a preview for the provided link. Please make sure it's a valid video link.`,
        );
        return;
    }
    const {
        uploader: author,
        durationText,
        title,
        thumbnailUrl,
        qualities,
    } = preview;

    const caption = ctx.t("video_preview", {
        title,
        author: author || "Unknown",
        durationText: durationText || "Unknown",
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

    await ctx.api.deleteMessage(ctx.chat!.id!, processingMessage.message_id);

    const clickCtx = await conversation.waitForCallbackQuery(/download_(\w+)/);
    await clickCtx.answerCallbackQuery();

    const quality = clickCtx.match[1]!;

    if (quality === "audio") {
        await clickCtx.reply(
            "Audio download is not implemented yet. Stay tuned!",
        );
    }

    const progressMessage = await clickCtx.reply(
        ctx.t("downloading", { progressBar: "0%" }),
    );

    let downloadedVideo: DownloadResult | null = null;

    try {
        downloadedVideo = await conversation.external(async (externalCtx) => {
            return await downloadVideo(url, {
                quality: Number(quality.replace("p", "")),
            });
        });
    } catch (error) {
        console.error("Error downloading video:", error);

        await clickCtx.api.deleteMessage(
            clickCtx.chat!.id!,
            progressMessage.message_id,
        );

        await clickCtx.reply(
            "⛔️ Error downloading video: " +
                (error instanceof Error ? error.message : String(error)),
        );
        return;
    }

    if (!downloadedVideo || !downloadedVideo.filePath) {
        await clickCtx.api.deleteMessage(
            clickCtx.chat!.id!,
            progressMessage.message_id,
        );

        await clickCtx.reply("⛔️ Download failed. Please try again later.");
        return;
    }

    await clickCtx.api.editMessageText(
        clickCtx.chat!.id!,
        progressMessage.message_id,
        ctx.t("uploading"),
    );

    try {
        await clickCtx.replyWithVideo(new InputFile(downloadedVideo.filePath), {
            caption: preview.title,
        });
    } catch (error) {
        console.error("Error sending video:", error);
        await clickCtx.reply(
            "⛔️ Error sending video: " +
                (error instanceof Error ? error.message : String(error)),
        );
    }
}
