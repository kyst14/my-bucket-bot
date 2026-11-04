import type { DownloadProgress } from "@/config/types.js";

// Markers used in --progress-template / --print output
export const PROGRESS_PREFIX = "PROGRESS";
export const POSTPROCESS_PREFIX = "POSTPROCESS";
export const FILE_PREFIX = "FILEPATH|";

function toNumber(value?: string): number | undefined {
    if (
        value === undefined ||
        value === "" ||
        value === "NA" ||
        value === "None"
    )
        return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

export function parseProgressLine(line: string): DownloadProgress | null {
    if (line.startsWith(`${POSTPROCESS_PREFIX}|`)) {
        return { stage: "processing", percent: 100 };
    }
    if (!line.startsWith(`${PROGRESS_PREFIX}|`)) return null;

    const [, downloaded, total, estimate, speed, eta] = line.split("|");
    const downloadedBytes = toNumber(downloaded);
    const totalBytes = toNumber(total) ?? toNumber(estimate);
    const percent =
        downloadedBytes !== undefined && totalBytes
            ? Math.min(
                  100,
                  Math.round((downloadedBytes / totalBytes) * 1000) / 10,
              )
            : 0;

    return {
        stage: "downloading",
        percent,
        downloadedBytes,
        totalBytes,
        speedBytesPerSec: toNumber(speed),
        etaSeconds: toNumber(eta),
    };
}
