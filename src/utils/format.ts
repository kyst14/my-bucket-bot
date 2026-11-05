export function formatDuration(totalSeconds: number): string {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const MB = 1024 * 1024;

// "~12.5 МБ" or "~1.4 ГБ"; the tilde is there because the real size is only an estimate
export function formatSizeMb(bytes: number): string {
    const mb = Math.max(Math.round((bytes / MB) * 10) / 10, 0.1);
    return mb >= 1024
        ? `~${(mb / 1024).toFixed(1)} ГБ`
        : `~${mb.toFixed(1)} МБ`;
}
