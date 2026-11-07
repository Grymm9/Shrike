export interface Weights {
  base: number;
  numericId: number;
  uuid: number;
  sensitiveParam: number;
  queryParam: number;
  depth: number;
}

export interface KeywordRule {
  value: string;
  weight: number;
}

export interface Rules {
  ignoredExtensions: string[];
  ignoredSegments: string[];
  keywords: KeywordRule[];
  sensitiveParams: string[];
  weights: Weights;
}

export const RULES_VERSION: number;
export const DEFAULT_RULES: Rules;

export function normaliseExtension(value: unknown): string;
export function normaliseSegment(value: unknown): string;
export function normaliseRules(input: unknown): Rules;
export function defaultRules(): Rules;
export function rulesHash(rules: Rules): string;
