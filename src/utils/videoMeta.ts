import { spawn } from "node:child_process";
import { VideoDownloaderError } from "./errors.js";

export interface VideoMeta {
    width: number;
    height: number;
    duration: number; // seconds
}

export function getVideoMeta(filePath: string): Promise<VideoMeta> {
    return new Promise((resolve, reject) => {
        const args = [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
            filePath,
        ];

        const child = spawn("ffprobe", args, {
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (chunk: string) => (stdout += chunk));
        child.stderr.on("data", (chunk: string) => (stderr += chunk));

        child.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "ENOENT") {
                reject(
                    new VideoDownloaderError(
                        "DOWNLOAD_FAILED",
                        "ffprobe not found",
                    ),
                );
            } else {
                reject(err);
            }
        });

        child.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new VideoDownloaderError(
                        "DOWNLOAD_FAILED",
                        `ffprobe failed: ${stderr || "unknown error"}`,
                    ),
                );
                return;
            }

            try {
                const data = JSON.parse(stdout) as {
                    streams?: Array<{ width?: number; height?: number }>;
                    format?: { duration?: string };
                };

                const stream = data.streams?.[0];
                const width = stream?.width;
                const height = stream?.height;
                const durationRaw = data.format?.duration;

                if (!width || !height || width <= 0 || height <= 0) {
                    reject(
                        new VideoDownloaderError(
                            "DOWNLOAD_FAILED",
                            "Could not read video dimensions",
                        ),
                    );
                    return;
                }

                const duration = durationRaw
                    ? Math.max(1, Math.round(Number(durationRaw)))
                    : 1;

                resolve({ width, height, duration });
            } catch {
                reject(
                    new VideoDownloaderError(
                        "DOWNLOAD_FAILED",
                        "Failed to parse ffprobe output",
                    ),
                );
            }
        });
    });
}
