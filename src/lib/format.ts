import type { BountyType } from "./types";

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "not yet";
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
  if (!remote) return "Not connected";
  const cleaned = remote
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/^ssh:\/\//, "")
    .replace(/^https?:\/\//, "");
  return cleaned.replace(/\.git$/, "").split("/").slice(0, 2).join("/");
}

export function plural(count: number, one: string, many = one + "s"): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value == null) return "—";
  const symbol =
    currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const short = Number(millions.toFixed(millions >= 10 ? 0 : 1));
    return symbol ? `${symbol}${short}M` : `${short}M${currency ? " " + currency : ""}`;
  }
  const short =
    value >= 1000
      ? `${Number((value / 1000).toFixed(value % 1000 === 0 ? 0 : 1))}k`
      : String(Math.round(value));
  if (symbol) return `${symbol}${short}`;
  return currency ? `${short} ${currency}` : short;
}

export function formatPayout(
  min: number | null,
  max: number | null,
  currency: string | null,
): string {
  const low = min ?? max;
  const high = max ?? min;
  if (low == null || high == null) return "—";
  if (low === high) return formatMoney(low, currency);
  return `${formatMoney(low, currency)} – ${formatMoney(high, currency)}`;
}

export function formatType(type: BountyType): string {
  if (type === "vdp") return "VDP";
  if (type === "external") return "External";
  return "Bounty";
}

export function formatResponse(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)}%`;
}

export function formatLaunched(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.getFullYear() : null;
}
