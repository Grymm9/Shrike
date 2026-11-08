export const MAX_RESPONSE_BYTES: number;
export const REQUEST_TIMEOUT_MS: number;
export const MAX_REDIRECTS: number;

export function fetchPage(
  input: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  },
): Promise<{
  url: string;
  contentType: string;
  body: string;
  status: number;
}>;
