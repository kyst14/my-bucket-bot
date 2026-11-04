import { buildBaseArgs } from "@/core/args.js";
import { runYtDlp } from "@/core/ytdlp.js";
import { VideoDownloaderError } from "@/utils/errors.js";
import type { VideoPreview, VideoQuality } from "@/config/types.js";
import { formatDuration } from "@/utils/format.js";
import { assertValidUrl } from "@/utils/url.js";

const PREVIEW_TIMEOUT_MS = 60_000;

interface RawFormat {
    height?: number | null;
    fps?: number | null;
    vcodec?: string | null;
    acodec?: string | null;
    filesize?: number | null;
    filesize_approx?: number | null;
}

interface RawInfo {
    id: string;
    title?: string;
    description?: string | null;
    thumbnail?: string | null;
    duration?: number | null;
    uploader?: string | null;
    channel?: string | null;
    extractor_key?: string | null;
    webpage_url?: string | null;
    view_count?: number | null;
    upload_date?: string | null;
    is_live?: boolean | null;
    height?: number | null;
    formats?: RawFormat[];
}

function extractQualities(info: RawInfo): VideoQuality[] {
    const byHeight = new Map<number, VideoQuality>();

    for (const f of info.formats ?? []) {
        if (!f.height || !f.vcodec || f.vcodec === "none") continue;
        const prev = byHeight.get(f.height);
        // Keep the highest-fps variant for each resolution
        if (prev && (prev.fps ?? 0) >= (f.fps ?? 0)) continue;
        byHeight.set(f.height, {
            height: f.height,
            label: `${f.height}p`,
            fps: f.fps ?? undefined,
            approxSizeBytes: f.filesize ?? f.filesize_approx ?? undefined,
        });
    }

    // Some platforms (e.g. TikTok) expose a single stream without a formats list
    if (byHeight.size === 0 && info.height) {
        byHeight.set(info.height, {
            height: info.height,
            label: `${info.height}p`,
        });
    }

    return [...byHeight.values()].sort((a, b) => b.height - a.height);
}

function formatUploadDate(raw?: string | null): string | undefined {
    return raw && /^\d{8}$/.test(raw)
        ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
        : undefined;
}

export async function getVideoPreview(url: string): Promise<VideoPreview> {
    const safeUrl = assertValidUrl(url);
    const { stdout } = await runYtDlp(
        ["--dump-single-json", ...buildBaseArgs(), "--", safeUrl],
        { timeoutMs: PREVIEW_TIMEOUT_MS },
    );

    let info: RawInfo;
    try {
        info = JSON.parse(stdout) as RawInfo;
    } catch {
        throw new VideoDownloaderError(
            "DOWNLOAD_FAILED",
            "Could not parse video info",
        );
    }

    const duration = info.duration ?? undefined;
    return {
        id: info.id,
        title: info.title ?? "Untitled",
        description: info.description ?? undefined,
        thumbnailUrl: info.thumbnail ?? undefined,
        durationSeconds: duration,
        durationText:
            duration !== undefined ? formatDuration(duration) : undefined,
        uploader: info.uploader ?? info.channel ?? undefined,
        platform: info.extractor_key ?? undefined,
        webpageUrl: info.webpage_url ?? undefined,
        viewCount: info.view_count ?? undefined,
        uploadDate: formatUploadDate(info.upload_date),
        isLive: Boolean(info.is_live),
        hasAudio:
            (info.formats ?? []).some((f) => f.acodec !== "none") ||
            !info.formats,
        qualities: extractQualities(info),
    };
}
