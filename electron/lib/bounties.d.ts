import type { Bounty, BountyCache } from "../../src/lib/types";

export const HACKERONE_DIRECTORY_URL: string;
export const HACKERONE_GRAPHQL_URL: string;
export const PAGE_SIZE: number;
export const MAX_PAGES: number;

export interface HackerOnePage {
  programs: Bounty[];
  cursor: string | null;
  hasNext: boolean;
  total: number;
}

export function validateSourceUrl(input: unknown): {
  url: string;
  hostname: string;
};
export function bountyId(handle: string): string;
export function hackerOneRequest(input?: {
  cursor?: string | null;
  kind?: "bounty" | "vdp";
}): { url: string; body: unknown };
export function normaliseHackerOne(payload: unknown): HackerOnePage;
export function emptyBountyCache(): BountyCache;
export function normaliseBountyCache(raw: unknown): BountyCache;
export function bountiesToCsv(rows: Bounty[]): string;
