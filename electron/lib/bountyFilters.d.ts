import type { Bounty, BountyFilters, SortKey } from "../../src/lib/types";

export function emptyFilters(): BountyFilters;
export function normaliseFilters(input: unknown): BountyFilters;
export function normaliseSort(value: unknown): SortKey;
export function matchesFilters(
  bounty: Bounty,
  filters: BountyFilters,
  shortlistedIds?: Set<string>,
): boolean;
export function filterBounties(
  rows: Bounty[],
  filters: BountyFilters,
  shortlistedIds?: Set<string>,
): Bounty[];
export function sortBounties(rows: Bounty[], sort: SortKey): Bounty[];
export function applyBountyView(
  rows: Bounty[],
  filters: BountyFilters,
  sort: SortKey,
  shortlistedIds?: Set<string>,
): Bounty[];
export function activeFilterCount(filters: BountyFilters): number;
export function filterLabels(
  filters: BountyFilters,
): Array<{ key: keyof BountyFilters | "types"; text: string }>;
