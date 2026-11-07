import type { Rules } from "./rules.js";

export interface Counts {
  lines: number;
  skipped: number;
  invalid: number;
  duplicates: number;
}

export interface Stats extends Counts {
  ingested: number;
  kept: number;
  filtered: number;
  maxScore: number;
  avgScore: number;
}

export interface Reason {
  code: string;
  label: string;
  delta: number;
}

export interface FilterReason {
  code: "extension" | "segment";
  detail: string;
}

export interface ParsedRow {
  method: string;
  host: string;
  path: string;
  query: string;
  url: string;
}

export interface BaseEndpoint extends ParsedRow {
  id: string;
}

export interface Endpoint extends BaseEndpoint {
  template: string;
  depth: number;
  score: number;
  kept: boolean;
  reasons: Reason[];
  filterReason: FilterReason | null;
}

export interface SessionShape {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  rulesHash: string;
  rulesSnapshot: Rules;
  source: { kind: string; name: string | null; importedAt: string };
  stats: Stats;
  endpoints: Endpoint[];
}

export function fnv1a(text: string): number;
export function endpointKey(row: ParsedRow): string;
export function templateOf(path: string): string;
export function depthOf(path: string): number;
export function extensionOf(path: string): string;
export function parseLine(rawLine: unknown): ParsedRow | null;
export function filterReason(path: string, rules: Rules): FilterReason | null;
export function scoreEndpoint(
  row: ParsedRow,
  rules: Rules,
): { score: number; reasons: Reason[] };
export function applyRules(rows: BaseEndpoint[], rules: Rules): Endpoint[];
export function parseRaw(raw: unknown): { rows: BaseEndpoint[]; counts: Counts };
export function computeStats(counts: Partial<Counts>, endpoints: Endpoint[]): Stats;
export function emptySession(
  id: string,
  name: string,
  rules: Rules,
  now: string,
): SessionShape;
export function ingestIntoSession(
  session: SessionShape,
  raw: string,
  mode: "replace" | "append",
  rules: Rules,
  sourceName: string | null,
  now: string,
): SessionShape;
export function rescoreSession(
  session: SessionShape,
  rules: Rules,
  now: string,
): SessionShape;
export function rankEndpoints(endpoints: Endpoint[]): Endpoint[];
