import { describeError, truncate } from '../redact';

// Every failed Ethereum RPC call, published in status as Payload.EthereumSync.{LastRpcErrorAt,
// LastRpcError, RpcErrorsLastHour}: the same fields and meaning as evm-reader (v5.3.3), so the v5
// status page reads both the same way. LastTickError / BlockedBy only show the failure that ended the
// last tick, and a later success clears them; most RPC failures here (a failed send, a receipt poll)
// never reach them at all, so a struggling RPC would otherwise look healthy.

export type RpcErrorClass = 'rate-limit' | 'timeout' | 'other';

/** Window of the published RPC error counts. */
export const RPC_ERROR_WINDOW_SECONDS = 3600;

/**
 * Failed RPC calls per error class over the last RPC_ERROR_WINDOW_SECONDS. RangeLimit is always 0 (the
 * writer makes no getLogs calls); it is kept so the shape matches evm-reader's.
 */
export type RpcErrorCounts = { Timeout: number; RangeLimit: number; RateLimit: number; Other: number };

const COUNT_FIELD: { [k in RpcErrorClass]: keyof RpcErrorCounts } = {
  timeout: 'Timeout',
  'rate-limit': 'RateLimit',
  other: 'Other',
};
const BUCKET_MS = 60 * 1000;
const MAX_TEXT_LENGTH = 300;

function text(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Same rules as evm-reader: HTTP 429/402, JSON-RPC -32005, "too many requests", quota or rate limits. */
export function classifyRpcErrorKind(e: unknown): RpcErrorClass {
  const t = text(e);
  if (/\b(429|402)\b|-32005|too many requests|rate.?limit|rate exceeded|limit exceeded|exceeded.*(quota|limit|credits)/i.test(t)) {
    return 'rate-limit';
  }
  if (/timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(t)) return 'timeout';
  return 'other';
}

/** Counts per minute, so memory stays bounded whatever the error rate. */
export class RpcErrorLog {
  private buckets = new Map<number, RpcErrorCounts>();
  private lastAtMs = 0;
  private lastText = '';

  record(e: unknown, now = Date.now()) {
    const kind = classifyRpcErrorKind(e);
    const minute = Math.floor(now / BUCKET_MS);
    let bucket = this.buckets.get(minute);
    if (!bucket) {
      bucket = { Timeout: 0, RangeLimit: 0, RateLimit: 0, Other: 0 };
      this.buckets.set(minute, bucket);
      this.prune(now);
    }
    bucket[COUNT_FIELD[kind]]++;
    this.lastAtMs = now;
    // describeError scrubs registered secrets (web3 puts the RPC URL in connection errors)
    this.lastText = truncate((kind === 'other' ? '' : `${kind}: `) + describeError(e), MAX_TEXT_LENGTH);
  }

  /** Counts over the last RPC_ERROR_WINDOW_SECONDS (to the minute). */
  counts(now = Date.now()): RpcErrorCounts {
    this.prune(now);
    const total: RpcErrorCounts = { Timeout: 0, RangeLimit: 0, RateLimit: 0, Other: 0 };
    for (const b of this.buckets.values()) {
      total.Timeout += b.Timeout;
      total.RangeLimit += b.RangeLimit;
      total.RateLimit += b.RateLimit;
      total.Other += b.Other;
    }
    return total;
  }

  /** unix ms of the last failed call, 0 if none */
  lastAt(): number {
    return this.lastAtMs;
  }

  /** the last failed call's error, class-prefixed, URL-free; kept after later successes */
  last(): string {
    return this.lastText;
  }

  private prune(now: number) {
    const oldest = Math.floor(now / BUCKET_MS) - Math.ceil((RPC_ERROR_WINDOW_SECONDS * 1000) / BUCKET_MS) + 1;
    for (const minute of this.buckets.keys()) if (minute < oldest) this.buckets.delete(minute);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRpcResponse = { error?: { code?: number; message?: string } } | any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SendCallback = (error: any, result?: JsonRpcResponse) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SendingProvider = { send: (payload: any, callback: SendCallback) => void };

/**
 * Records every failed call made through a web3 1.2.6 provider: transport failures (connection,
 * timeout, an HTTP error page) and JSON-RPC error answers, including those in a batch. The callback
 * still gets exactly what the provider returned.
 */
export function recordProviderErrors(provider: SendingProvider, log: RpcErrorLog) {
  const send = provider.send.bind(provider);
  provider.send = (payload, callback) =>
    send(payload, (error, result) => {
      try {
        if (error) log.record(error);
        for (const response of Array.isArray(result) ? result : [result]) {
          if (response?.error) {
            log.record(new Error(`JSON-RPC error ${response.error.code ?? ''}: ${response.error.message ?? ''}`));
          }
        }
      } catch (_) {
        // recording must never break the call
      }
      callback(error, result);
    });
}
