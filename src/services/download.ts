import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { buildDownloadArgs } from "@/core/args.js";
import { FILE_PREFIX, parseProgressLine } from "@/core/progress.js";
import { runYtDlp } from "@/core/ytdlp.js";
import env from "@/config/env.js";
import { VideoDownloaderError } from "@/utils/errors.js";
import {
    createJobDir,
    discardJob,
    markJobDone,
    startAutoCleanup,
} from "@/utils/tempStorage.js";
import type {
    DownloadOptions,
    DownloadProgress,
    DownloadResult,
} from "@/config/types.js";
import { assertValidUrl } from "../utils/url.js";

const MB = 1024 * 1024;
const UNFINISHED_EXT = /\.(part|ytdl|temp)$/;

function notify(
    cb: DownloadOptions["onProgress"],
    progress: DownloadProgress,
): void {
    try {
        cb?.(progress);
    } catch {
        // A faulty callback must not break the download
    }
}

// Fallback when yt-dlp did not report the final path
async function findDownloadedFile(dir: string): Promise<string | undefined> {
    const files = (await readdir(dir)).filter(
        (name) => !UNFINISHED_EXT.test(name),
    );
    return files[0] ? join(dir, files[0]) : undefined;
}

export async function downloadVideo(
    url: string,
    options: DownloadOptions = {},
): Promise<DownloadResult> {
    const safeUrl = assertValidUrl(url);
    const limit = options.maxFileSizeMb
        ? options.maxFileSizeMb * MB
        : env.maxFileSizeBytes;
    const tooLarge = () =>
        new VideoDownloaderError(
            "FILE_TOO_LARGE",
            `File exceeds the ${Math.round((limit ?? 0) / MB)} MB limit`,
        );

    startAutoCleanup();
    const jobDir = await createJobDir();

    try {
        const state: { filePath?: string } = {};

        await runYtDlp(
            buildDownloadArgs({
                url: safeUrl,
                outputDir: jobDir,
                options,
                maxFileSizeBytes: limit,
            }),
            {
                onStdoutLine: (line) => {
                    if (line.startsWith(FILE_PREFIX)) {
                        state.filePath = line.slice(FILE_PREFIX.length).trim();
                        return;
                    }
                    const progress = parseProgressLine(line);
                    if (progress) notify(options.onProgress, progress);
                },
            },
        );

        const filePath = state.filePath ?? (await findDownloadedFile(jobDir));
        if (!filePath) {
            // yt-dlp silently skips files above --max-filesize
            throw limit
                ? tooLarge()
                : new VideoDownloaderError(
                      "DOWNLOAD_FAILED",
                      "yt-dlp did not produce a file",
                  );
        }

        const { size } = await stat(filePath);
        if (limit && size > limit) throw tooLarge();

        markJobDone(jobDir);
        return {
            filePath,
            fileName: basename(filePath),
            sizeBytes: size,
            audioOnly: Boolean(options.audioOnly),
        };
    } catch (error) {
        await discardJob(jobDir);
        throw error;
    }
}
