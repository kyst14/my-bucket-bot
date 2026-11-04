import { VideoDownloaderError } from "@/utils/errors.js";

export function assertValidUrl(input: string): string {
    let parsed: URL;
    try {
        parsed = new URL(input.trim());
    } catch {
        throw new VideoDownloaderError("INVALID_URL", "Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new VideoDownloaderError(
            "INVALID_URL",
            "Only http(s) links are allowed",
        );
    }
    return parsed.toString();
}
