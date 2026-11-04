export type ErrorCode =
    // yt-dlp errors
    | "INVALID_URL"
    | "INVALID_OPTIONS"
    | "YTDLP_NOT_FOUND"
    | "UNSUPPORTED_URL"
    | "VIDEO_UNAVAILABLE"
    | "FORMAT_NOT_AVAILABLE"
    | "FILE_TOO_LARGE"
    | "DOWNLOAD_FAILED";

export class VideoDownloaderError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly details?: string,
    ) {
        super(message);
        this.name = "VideoDownloaderError";
    }
}

// Map raw yt-dlp stderr to a typed error
export function classifyYtDlpError(stderr: string): VideoDownloaderError {
    const lines = stderr.trim().split(/\r?\n/);
    const errorLine =
        [...lines].reverse().find((l) => l.startsWith("ERROR:")) ??
        lines[lines.length - 1] ??
        "";
    const details =
        errorLine.replace(/^ERROR:\s*/, "") || "yt-dlp exited with an error";

    if (/unsupported url/i.test(details)) {
        return new VideoDownloaderError(
            "UNSUPPORTED_URL",
            "This link is not supported",
            details,
        );
    }
    if (/requested format/i.test(details)) {
        return new VideoDownloaderError(
            "FORMAT_NOT_AVAILABLE",
            "Requested quality is not available",
            details,
        );
    }
    if (
        /private|unavailable|removed|sign in|log in|\bage\b|not available|copyright/i.test(
            details,
        )
    ) {
        return new VideoDownloaderError(
            "VIDEO_UNAVAILABLE",
            "Video is unavailable",
            details,
        );
    }
    return new VideoDownloaderError(
        "DOWNLOAD_FAILED",
        "Download failed",
        details,
    );
}
