export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < 30_000) return "just now";
  if (abs < hour) return `${Math.round(abs / minute)}m ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)}h ${suffix}`;
  if (abs < 7 * day) return `${Math.round(abs / day)}d ${suffix}`;
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  const d = String(date.getDate()).padStart(2, "0");
  const m = date.toLocaleString(undefined, { month: "short" });
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${d} ${m} ${y} ${hh}:${mm}`;
}

export function remoteHost(remote: string | null): string {
  if (!remote) return "no remote";
  const cleaned = remote
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/^ssh:\/\//, "")
    .replace(/^https?:\/\//, "");
  return cleaned.replace(/\.git$/, "").split("/").slice(0, 2).join("/");
}

export function plural(count: number, one: string, many = one + "s"): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function scoreLabel(score: number): string {
  return String(Math.round(score)).padStart(2, "0");
}
