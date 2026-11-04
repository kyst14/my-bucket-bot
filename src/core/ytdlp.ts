import { spawn } from "node:child_process";
import env from "@/config/env.js";
import { VideoDownloaderError, classifyYtDlpError } from "@/utils/errors.js";

export interface RunOptions {
    onStdoutLine?: ((line: string) => void) | undefined;
    timeoutMs?: number | undefined;
}

export interface RunResult {
    stdout: string;
    stderr: string;
}

// Runs yt-dlp without a shell, so arguments are never interpreted by it
export function runYtDlp(
    args: string[],
    options: RunOptions = {},
): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(env.ytDlpBin, args, {
            stdio: ["ignore", "pipe", "pipe"],
            timeout: options.timeoutMs,
        });

        let stdout = "";
        let stderr = "";
        let pending = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
            if (!options.onStdoutLine) return;
            pending += chunk;
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() ?? "";
            for (const line of lines) options.onStdoutLine(line);
        });

        child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
        });

        child.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "ENOENT") {
                reject(
                    new VideoDownloaderError(
                        "YTDLP_NOT_FOUND",
                        "yt-dlp binary was not found",
                    ),
                );
            } else {
                reject(err);
            }
        });

        child.on("close", (code) => {
            if (pending && options.onStdoutLine) options.onStdoutLine(pending);
            if (code === 0) resolve({ stdout, stderr });
            else reject(classifyYtDlpError(stderr));
        });
    });
}
