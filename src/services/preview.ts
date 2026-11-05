import { buildBaseArgs } from "../core/args.js";
import { runYtDlp } from "../core/ytdlp.js";
import { VideoDownloaderError } from "@/utils/errors.js";
import type { VideoPreview, VideoQuality } from "@/config/types.js";
import { formatDuration, formatSizeMb } from "../utils/format.js";
import { assertValidUrl } from "../utils/url.js";

const PREVIEW_TIMEOUT_MS = 60_000;
const MB = 1024 * 1024;

interface RawFormat {
    ext?: string | null;
    height?: number | null;
    fps?: number | null;
    vcodec?: string | null;
    acodec?: string | null;
    tbr?: number | null;
    filesize?: number | null;
    filesize_approx?: number | null;
}

type SizeSource = Pick<RawFormat, "filesize" | "filesize_approx" | "tbr">;

interface RawInfo extends SizeSource {
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

// Size reported by yt-dlp, otherwise bitrate * duration
function estimateSize(
    source: SizeSource,
    duration?: number | null,
): number | undefined {
    const reported = source.filesize ?? source.filesize_approx;
    if (reported) return reported;
    return source.tbr && duration
        ? Math.round(((source.tbr * 1000) / 8) * duration)
        : undefined;
}

// Same preference as the downloader: mp4 first, then higher fps and bitrate
function videoScore(f: RawFormat): number {
    return (f.ext === "mp4" ? 1e9 : 0) + (f.fps ?? 0) * 1e5 + (f.tbr ?? 0);
}

// Same preference as the downloader: m4a first, then highest bitrate
function pickAudioSize(
    formats: RawFormat[],
    duration?: number | null,
): number | undefined {
    const best = formats
        .filter((f) => f.vcodec === "none" && f.acodec && f.acodec !== "none")
        .sort(
            (a, b) =>
                Number(b.ext === "m4a") - Number(a.ext === "m4a") ||
                (b.tbr ?? 0) - (a.tbr ?? 0),
        )[0];
    return best ? estimateSize(best, duration) : undefined;
}

function makeQuality(
    height: number,
    fps: number | null | undefined,
    bytes: number | undefined,
): VideoQuality {
    return {
        height,
        label: `${height}p`,
        fps: fps ?? undefined,
        approxSizeBytes: bytes,
        approxSizeMb:
            bytes !== undefined
                ? Math.round((bytes / MB) * 10) / 10
                : undefined,
        sizeText: bytes !== undefined ? formatSizeMb(bytes) : undefined,
    };
}

function extractQualities(info: RawInfo): VideoQuality[] {
    const formats = info.formats ?? [];
    const audioSize = pickAudioSize(formats, info.duration);
    const bestByHeight = new Map<number, RawFormat>();

    for (const f of formats) {
        if (!f.height || !f.vcodec || f.vcodec === "none") continue;
        const prev = bestByHeight.get(f.height);
        if (!prev || videoScore(f) > videoScore(prev))
            bestByHeight.set(f.height, f);
    }

    const qualities: VideoQuality[] = [];
    for (const [height, f] of bestByHeight) {
        const videoSize = estimateSize(f, info.duration);
        // Video-only streams get the audio track added; muxed ones already include it
        const muxed = f.acodec !== "none";
        const total =
            videoSize === undefined
                ? undefined
                : videoSize + (muxed ? 0 : (audioSize ?? 0));
        qualities.push(makeQuality(height, f.fps, total));
    }

    // Some platforms (e.g. TikTok) expose a single stream without a formats list
    if (qualities.length === 0 && info.height) {
        qualities.push(
            makeQuality(info.height, null, estimateSize(info, info.duration)),
        );
    }

    return qualities.sort((a, b) => b.height - a.height);
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
