import env from "@/config/env.js";
import { VideoDownloaderError } from "@/utils/errors.js";
import type { DownloadOptions } from "@/config/types.js";
import {
    FILE_PREFIX,
    POSTPROCESS_PREFIX,
    PROGRESS_PREFIX,
} from "./progress.js";

const AD_SEGMENT_CATEGORIES = ["sponsor", "selfpromo"];
const cookiesPath = env.cookiesPath;
const runtime = env.ytDlpJsRuntime

// Prefers mp4/m4a for broad player compatibility, falls back to anything
export function buildFormatSelector(quality: "best" | number): string {
    if (quality === "best") return "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b";
    if (!Number.isFinite(quality) || quality <= 0) {
        throw new VideoDownloaderError(
            "INVALID_OPTIONS",
            'quality must be "best" or a positive number',
        );
    }
    const h = `[height<=${Math.floor(quality)}]`;
    return `bv*${h}[ext=mp4]+ba[ext=m4a]/bv*${h}+ba/b${h}`;
}

// Flags shared by every yt-dlp call
export function buildBaseArgs(): string[] {
    const args = ["--no-playlist", "--no-warnings"];

    if (runtime) {
        args.push("--js-runtimes", runtime);
    }

    if (cookiesPath) {
        args.push("--cookies", cookiesPath);
    }

    args.push("--extractor-args", "youtube:player_client=android,tv,web_embedded");

    return args;
}

export interface DownloadArgsInput {
    url: string;
    outputDir: string;
    options: DownloadOptions;
    maxFileSizeBytes?: number | undefined;
}

export function buildDownloadArgs({
    url,
    outputDir,
    options,
    maxFileSizeBytes,
}: DownloadArgsInput): string[] {
    const args = [
        ...buildBaseArgs(),
        "--no-colors",
        "--newline",
        "--quiet",
        "--progress",
        "--no-simulate",
        "--retries",
        "3",
        "--windows-filenames",
        "--paths",
        outputDir,
        "--output",
        "%(title).100B [%(id)s].%(ext)s",
        "--progress-template",
        `download:${PROGRESS_PREFIX}|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
        "--progress-template",
        `postprocess:${POSTPROCESS_PREFIX}|%(progress.postprocessor)s`,
        "--print",
        `after_move:${FILE_PREFIX}%(filepath)s`,
    ];

    if (options.audioOnly) {
        args.push(
            "--format",
            "ba/b",
            "--extract-audio",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
        );
    } else {
        args.push(
            "--format",
            buildFormatSelector(options.quality ?? "best"),
            "--merge-output-format",
            "mp4",
        );
    }

    if (options.removeAds) {
        args.push("--sponsorblock-remove", AD_SEGMENT_CATEGORIES.join(","));
    }
    if (maxFileSizeBytes) {
        args.push("--max-filesize", String(maxFileSizeBytes));
    }

    // "--" stops option parsing, so a URL can never be treated as a flag
    args.push("--", url);
    return args;
}
