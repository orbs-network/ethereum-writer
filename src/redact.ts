// Keeps the Ethereum RPC endpoint URL (which usually carries a provider API key) from leaving the process.
//
// Rule: no full or partial RPC URL may appear in status.json, logs, error messages or stack traces.
// Two layers:
//  1. Call sites never format the endpoint, and status.json publishes only an allowlist of config fields
//     (see public-config.ts).
//  2. Defence in depth: every registered secret fragment is scrubbed from anything written to
//     stdout/stderr and from status.json (covers third-party libraries such as web3, whose connection
//     errors embed the URL: "CONNECTION ERROR: Couldn't connect to node <url>.").
//
// Adapted from evm-reader's src/redact.ts.
import { URL } from 'url';

const REDACTED = '[redacted]';
const MIN_FRAGMENT_LENGTH = 6;

const secretFragments = new Set<string>();
let sortedFragments: string[] = [];

/** Every substring of a URL that could identify the endpoint or carry its key. */
export function urlSecretFragments(url: string): string[] {
  const fragments = new Set<string>();
  const add = (s: string | undefined | null) => {
    if (!s) return;
    for (const v of [s, safeDecode(s)]) {
      const trimmed = v.replace(/\/+$/, '');
      if (trimmed.length >= MIN_FRAGMENT_LENGTH) fragments.add(trimmed);
    }
  };

  add(url);
  add(url.replace(/^[a-z]+:\/\//i, ''));

  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch (_) {
    parsed = undefined;
  }
  if (parsed) {
    add(parsed.host);
    add(parsed.hostname);
    add(parsed.username);
    add(parsed.password);
    add(parsed.pathname + parsed.search + parsed.hash);
    add(parsed.pathname);
    add(parsed.search);
    add(parsed.search.replace(/^\?/, ''));
    for (const segment of parsed.pathname.split('/')) if (looksLikeToken(segment)) add(segment);
    parsed.searchParams.forEach((value) => {
      if (looksLikeToken(value)) add(value);
    });
  } else {
    // not a parsable URL: still split on obvious separators
    for (const part of url.split(/[/?&=#@:,]+/)) if (looksLikeToken(part)) add(part);
  }
  return [...fragments];
}

/** Registers endpoint URLs whose fragments must never be written out. A comma-separated value is split. */
export function registerSecretUrls(urls: (string | undefined)[]) {
  for (const value of urls) {
    if (typeof value !== 'string' || !value) continue;
    for (const url of [value, ...value.split(',')]) {
      for (const f of urlSecretFragments(url.trim())) secretFragments.add(f);
    }
  }
  // longest first, so a full URL is replaced before its parts
  sortedFragments = [...secretFragments].sort((a, b) => b.length - a.length);
}

/** Test helper. */
export function clearSecrets() {
  secretFragments.clear();
  sortedFragments = [];
}

/** Removes every registered secret fragment from `text`. */
export function scrub(text: string): string {
  let out = text;
  for (const f of sortedFragments) {
    if (out.includes(f)) out = out.split(f).join(REDACTED);
  }
  return out;
}

/** A log-safe one-line description of an error (message only, scrubbed, bounded). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function describeError(err: any, maxLength = 500): string {
  const msg = err instanceof Error ? err.message : String(err);
  return truncate(scrub(msg), maxLength);
}

/** A log-safe stack trace (scrubbed). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function describeErrorStack(err: any): string {
  const text = err instanceof Error ? err.stack ?? err.message : String(err);
  return scrub(text);
}

export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

type Write = typeof process.stdout.write;
let installed = false;

/** Wraps process.stdout/stderr so registered secrets are scrubbed from all output. */
export function installOutputScrubber() {
  if (installed) return;
  installed = true;
  for (const stream of [process.stdout, process.stderr]) {
    const original: Write = stream.write.bind(stream);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stream as any).write = (chunk: any, ...rest: any[]) => {
      if (typeof chunk === 'string') chunk = scrub(chunk);
      else if (chunk instanceof Uint8Array) chunk = scrub(Buffer.from(chunk).toString('utf8'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original as any)(chunk, ...rest);
    };
  }
}

// A path segment / query value that could be a key (long, or mixed with digits), as opposed to
// plain words such as "rpc", "v3" or "ethereum" that would only add noise to scrubbed logs.
function looksLikeToken(s: string): boolean {
  return s.length >= 16 || (s.length >= 8 && /\d/.test(s));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}
