import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import env from "@/config/env.js";

// Every download lives in its own "job-*" folder inside the download dir
const JOB_PREFIX = "job-";
const activeJobs = new Set<string>();
let timer: NodeJS.Timeout | undefined;

export async function createJobDir(): Promise<string> {
    const downloadDir = env.tmpDir + "/downloads";
    await mkdir(downloadDir, { recursive: true });
    const dir = resolve(await mkdtemp(join(downloadDir, JOB_PREFIX)));
    activeJobs.add(dir);
    return dir;
}

// Finished jobs become eligible for TTL cleanup
export function markJobDone(dir: string): void {
    activeJobs.delete(dir);
}

export async function discardJob(dir: string): Promise<void> {
    activeJobs.delete(dir);
    await rm(dir, { recursive: true, force: true });
}

// Deletes the job folder that contains the given downloaded file
export async function removeDownload(filePath: string): Promise<void> {
    const jobDir = resolve(dirname(filePath));
    const root = resolve(env.tmpDir + "/downloads");
    if (dirname(jobDir) === root && basename(jobDir).startsWith(JOB_PREFIX)) {
        await discardJob(jobDir);
    }
}

export async function cleanupOldJobs(): Promise<number> {
    const { tmpDir, fileTtlMs } = env;
    const downloadDir = resolve(tmpDir + "/downloads");
    let entries: string[];
    try {
        entries = await readdir(downloadDir);
    } catch {
        return 0;
    }

    const now = Date.now();
    let removed = 0;
    for (const name of entries) {
        if (!name.startsWith(JOB_PREFIX)) continue;
        const dir = resolve(downloadDir, name);
        if (activeJobs.has(dir)) continue;
        try {
            const { mtimeMs } = await stat(dir);
            if (now - mtimeMs < fileTtlMs) continue;
            await rm(dir, { recursive: true, force: true });
            removed++;
        } catch {
            // Folder may be removed concurrently
        }
    }
    return removed;
}

// Idempotent; also purges leftovers from previous runs on first call
export function startAutoCleanup(): void {
    if (timer) return;
    const run = () => void cleanupOldJobs().catch(() => undefined);
    run();
    timer = setInterval(run, env.cleanupIntervalMs);
    timer.unref();
}

export function stopAutoCleanup(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
}
