import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { I18nFlavor } from "@grammyjs/i18n";
import type { Context, SessionFlavor } from "grammy";

export interface VideoQuality {
    height: number;
    label: string;
    fps?: number | undefined;
    // Estimated final file size (video + audio), missing if unknown
    approxSizeBytes?: number | undefined;
    approxSizeMb?: number | undefined;
    // Ready for UI, e.g. "~12.5 МБ"
    sizeText?: string | undefined;
}

export interface VideoPreview {
    id: string;
    title: string;
    description?: string | undefined;
    thumbnailUrl?: string | undefined;
    durationSeconds?: number | undefined;
    durationText?: string | undefined;
    uploader?: string | undefined;
    platform?: string | undefined;
    webpageUrl?: string | undefined;
    viewCount?: number | undefined;
    uploadDate?: string | undefined;
    isLive: boolean;
    hasAudio: boolean;
    qualities: VideoQuality[];
}

export interface DownloadProgress {
    stage: "downloading" | "processing";
    percent: number;
    downloadedBytes?: number | undefined;
    totalBytes?: number | undefined;
    speedBytesPerSec?: number | undefined;
    etaSeconds?: number | undefined;
}

export interface DownloadOptions {
    // Max video height in px, or 'best' (default)
    quality?: "best" | number | undefined;
    // Extract audio as mp3 instead of video
    audioOnly?: boolean | undefined;
    // Cut sponsor / self-promo segments (YouTube only, needs ffmpeg)
    removeAds?: boolean | undefined;
    // Overrides MAX_FILE_SIZE_MB from env
    maxFileSizeMb?: number | undefined;
    onProgress?: ((progress: DownloadProgress) => void) | undefined;
}

export interface DownloadResult {
    filePath: string;
    fileName: string;
    sizeBytes: number;
    audioOnly: boolean;
}

export interface SessionData {
    __language_code?: string;
}

export type MyContext = Context &
    I18nFlavor &
    SessionFlavor<SessionData> &
    ConversationFlavor<Context>;

export type MyConversation = Conversation<MyContext, MyContext>;
