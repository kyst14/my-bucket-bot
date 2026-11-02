import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

/** Путь к yt-dlp. На Render/Docker обычно просто "yt-dlp" */
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";

/** Папка для временных файлов */
const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOADS_DIR || "downloads");

/** Лимит Telegram Bot API ~50MB, оставляем запас */
const MAX_FILESIZE_MB = Number(process.env.MAX_FILESIZE_MB || 45);

/** Таймаут скачивания (мс) */
const DOWNLOAD_TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS || 180_000);

// ——— Типы ———

export type VideoInfo = {
  id: string;
  title: string;
  extractor: string;      // youtube, tiktok, instagram ...
  webpage_url: string;
  duration: number | null;
  thumbnail: string | null;
  uploader: string | null;
  filesizeApprox: number | null; // байты, может быть null
};

export type DownloadResult = {
  filePath: string;
  title: string;
  info: VideoInfo;
  sizeBytes: number;
};

export class UnsupportedUrlError extends Error {
  constructor(message = "Ссылка не поддерживается") {
    super(message);
    this.name = "UnsupportedUrlError";
  }
}

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadError";
  }
}

// ——— Хелперы ———

function isHttpUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Достаёт первую http(s) ссылку из текста */
export function extractUrl(text: string): string | null {
  const match = text.match(
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/
  );
  return match?.[0] ?? null;
}

async function runYtDlp(
  args: string[],
  timeoutMs = DOWNLOAD_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(YTDLP, args, {
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.() || err?.message || String(err);
    throw new DownloadError(stderr.slice(0, 800));
  }
}

// ——— Публичное API ———

/**
 * Проверяет, умеет ли yt-dlp обработать ссылку.
 * Делает лёгкий запрос метаданных (без скачивания файла).
 */
export async function checkSupport(url: string): Promise<VideoInfo> {
  if (!isHttpUrl(url)) {
    throw new UnsupportedUrlError("Это не http/https ссылка");
  }

  // --simulate + --print даёт JSON-подобные поля без загрузки медиа
  const { stdout } = await runYtDlp(
    [
      url,
      "--simulate",
      "--no-playlist",
      "--no-warnings",
      "--print",
      "%(.{id,title,extractor,webpage_url,duration,thumbnail,uploader,filesize_approx})j",
    ],
    45_000
  );

  let raw: any;
  try {
    // yt-dlp может вернуть несколько строк (плейлист и т.п.) — берём первую
    const line = stdout.trim().split("\n").find(Boolean);
    if (!line) throw new Error("empty");
    raw = JSON.parse(line);
  } catch {
    throw new UnsupportedUrlError(
      "Не удалось получить информацию. Ссылка не поддерживается или недоступна."
    );
  }

  if (!raw?.id && !raw?.title) {
    throw new UnsupportedUrlError("Сервис не распознан или контент недоступен");
  }

  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? "video"),
    extractor: String(raw.extractor ?? "unknown"),
    webpage_url: String(raw.webpage_url ?? url),
    duration: typeof raw.duration === "number" ? raw.duration : null,
    thumbnail: raw.thumbnail ? String(raw.thumbnail) : null,
    uploader: raw.uploader ? String(raw.uploader) : null,
    filesizeApprox:
      typeof raw.filesize_approx === "number" ? raw.filesize_approx : null,
  };
}

/**
 * Скачивает видео (лучшее ≤720p, mp4, с лимитом размера).
 * Возвращает путь к файлу — не забудь cleanup().
 */
export async function downloadVideo(url: string): Promise<DownloadResult> {
  if (!isHttpUrl(url)) {
    throw new UnsupportedUrlError("Это не http/https ссылка");
  }

  // Сначала проверяем поддержку
  const info = await checkSupport(url);

  // Предупреждение по примерному размеру (если yt-dlp знает)
  if (
    info.filesizeApprox &&
    info.filesizeApprox > MAX_FILESIZE_MB * 1024 * 1024
  ) {
    throw new DownloadError(
      `Файл слишком большой (~${Math.round(info.filesizeApprox / 1024 / 1024)} МБ). Лимит ${MAX_FILESIZE_MB} МБ.`
    );
  }

  const jobId = randomUUID();
  const outDir = path.join(DOWNLOADS_DIR, jobId);
  await mkdir(outDir, { recursive: true });

  // Шаблон имени: безопасный title + id
  const outputTemplate = path.join(
    outDir,
    "%(title).80B [%(id)s].%(ext)s"
  );

  const args = [
    url,
    "--no-playlist",
    "--no-warnings",
    // видео+аудио до 720p, иначе best
    "-f",
    "bv*[height<=720]+ba/b[height<=720]/b",
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
    // жёсткий лимит размера
    "--max-filesize",
    `${MAX_FILESIZE_MB}M`,
    // после скачивания печатаем путь
    "--print",
    "after_move:filepath",
    "--print",
    "title",
  ];

  try {
    const { stdout } = await runYtDlp(args);
    const lines = stdout.trim().split("\n").filter(Boolean);

    const filePath = lines[0];
    const title = lines[1] || info.title;

    if (!filePath) {
      throw new DownloadError("Файл не скачался (пустой путь)");
    }

    const st = await stat(filePath);
    if (st.size === 0) {
      await cleanup(filePath);
      throw new DownloadError("Скачанный файл пустой");
    }

    if (st.size > MAX_FILESIZE_MB * 1024 * 1024) {
      await cleanup(filePath);
      throw new DownloadError(
        `Файл ${Math.round(st.size / 1024 / 1024)} МБ > лимита ${MAX_FILESIZE_MB} МБ`
      );
    }

    return {
      filePath,
      title: String(title).slice(0, 200),
      info,
      sizeBytes: st.size,
    };
  } catch (err) {
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Удаляет папку задания (рядом с файлом).
 * Вызывай в finally после отправки в Telegram.
 */
export async function cleanup(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  // чистим только внутри downloads/
  if (!dir.startsWith(DOWNLOADS_DIR)) return;
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Только метаданные, без скачивания (алиас checkSupport).
 */
export async function getInfo(url: string): Promise<VideoInfo> {
  return checkSupport(url);
}