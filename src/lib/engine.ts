/**
 * Typed facade over the shared engine modules.
 *
 * The engine lives in electron/lib because the main process owns authoritative
 * scoring. The renderer imports the same code so previews cannot drift.
 */

import {
  applyRules as applyRulesJs,
  parseRaw as parseRawJs,
} from "../../electron/lib/ingest.js";
import {
  defaultRules as defaultRulesJs,
  normaliseRules as normaliseRulesJs,
  rulesHash as rulesHashJs,
} from "../../electron/lib/rules.js";
import type { Endpoint, Rules } from "./types";

export interface PreviewCounts {
  lines: number;
  skipped: number;
  invalid: number;
  duplicates: number;
}

export interface Preview {
  endpoints: Endpoint[];
  counts: PreviewCounts;
}

export function previewEndpoints(raw: string, rules: Rules): Preview {
  const parsed = parseRawJs(raw);
  const endpoints: Endpoint[] = applyRulesJs(parsed.rows, rules);
  return { endpoints, counts: parsed.counts };
}

export const defaultRules = defaultRulesJs as () => Rules;
export const normaliseRules = normaliseRulesJs as (input: unknown) => Rules;
export const rulesHash = rulesHashJs as (rules: Rules) => string;
