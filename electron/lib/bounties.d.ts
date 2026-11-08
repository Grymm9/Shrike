import type { Bounty, BountyCache, BountySource } from "../../src/lib/types";

export const HACKERONE_DIRECTORY_URL: string;
export const HACKERONE_GRAPHQL_URL: string;
export const PAGE_SIZE: number;
export const MAX_PAGES: number;
export const SOURCE_LABELS: Record<BountySource, string>;

export interface HackerOnePage {
  programs: Bounty[];
  cursor: string | null;
  hasNext: boolean;
  total: number;
}

export interface SourcePage {
  programs: Bounty[];
  total: number;
  pages?: number;
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
export function normaliseBugcrowd(payload: unknown): SourcePage;
export function normaliseYesWeHack(payload: unknown): SourcePage;
export function emptyBountyCache(source?: BountySource): BountyCache;
export function normaliseBountyCache(
  raw: unknown,
  fallbackSource?: BountySource,
): BountyCache;
export function bountiesToCsv(rows: Bounty[]): string;
