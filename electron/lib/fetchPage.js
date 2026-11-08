/**
 * Minimal, polite HTTP reader for public directory pages.
 *
 * Only the main process uses this. Every URL goes through validateSourceUrl,
 * every redirect is re-validated, and responses are capped in size and time so a
 * hostile or broken page cannot hang the app.
 */

import { validateSourceUrl } from "./bounties.js";

export const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 3;

const USER_AGENT = "Shrike/1.0 (public program directory reader)";
const READABLE_TYPES =
  /^(?:text\/html|application\/xhtml\+xml|application\/json|text\/plain|text\/xml|[a-z0-9.+-]+\/[a-z0-9.+-]*\+json)$/i;

function tooBig(maxBytes) {
  const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
  return new Error(`That page is larger than ${mb} MB, so Shrike stopped reading it.`);
}

function networkError(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return new Error("That page took too long to respond. Try again or pick a smaller page.");
  }
  const code = error?.cause?.code || error?.code || "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new Error("That host could not be found. Check the URL.");
  }
  if (code === "ECONNREFUSED") {
    return new Error("That host refused the connection.");
  }
  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return new Error("That site's HTTPS certificate could not be verified.");
  }
  return new Error("Shrike could not reach that page. Check the URL and your connection.");
}

async function readBody(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (text.length > maxBytes) throw tooBig(maxBytes);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength ?? 0;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooBig(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    text += decoder.decode();
  }

  return text;
}

/**
 * Fetch a page as text. Returns { url, contentType, body, status } where `url`
 * is the final URL after redirects (callers use it to resolve relative links).
 */
export async function fetchPage(
  input,
  {
    method = "GET",
    headers = {},
    body = undefined,
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
    maxRedirects = MAX_REDIRECTS,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("This build cannot make network requests.");
  }

  let current = validateSourceUrl(input).url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response;
      try {
        response = await fetchImpl(current, {
          method,
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/json,text/plain;q=0.8,*/*;q=0.5",
            ...headers,
          },
          body,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        throw networkError(error);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`That page redirected with HTTP ${response.status} but no destination.`);
        }
        if (hop === maxRedirects) {
          throw new Error("That link redirected too many times.");
        }
        // Re-validate: a public URL must not be able to bounce into localhost.
        current = validateSourceUrl(new URL(location, current).toString()).url;
        continue;
      }

      if (!response.ok) {
        throw new Error(`That page returned HTTP ${response.status}.`);
      }

      const type = String(response.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      if (type && !READABLE_TYPES.test(type)) {
        throw new Error(`Shrike can read HTML, JSON or plain text, not ${type}.`);
      }

      const text = await readBody(response, maxBytes);
      return {
        url: current,
        contentType: type || "text/html",
        body: text,
        status: response.status,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("That link redirected too many times.");
}
