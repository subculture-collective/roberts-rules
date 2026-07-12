import { describe, expect, it } from 'vitest';
import { nearestRank, summarizeLoad } from './load-metrics.js';

describe('load metrics', () => {
  it('computes nearest-rank percentiles from integer milliseconds', () => {
    const samples = Array.from({ length: 100 }, (_, index) => index + 1).reverse();
    expect(nearestRank(samples, 50)).toBe(50);
    expect(nearestRank(samples, 95)).toBe(95);
    expect(nearestRank(samples, 99)).toBe(99);
    expect(nearestRank([], 95)).toBeNull();
  });

  it('summarizes success, failure rate, latency, and failure codes deterministically', () => {
    expect(summarizeLoad({
      initialTarget: 4,
      initialReadyMs: [40, 10, 30],
      reconnectTarget: 2,
      reconnectReadyMs: [25],
      failures: ['socket_error', 'http_401', 'socket_error'],
      peakHarnessRssBytes: 1234,
    })).toEqual({
      initial: { target: 4, succeeded: 3, failed: 1, failureRate: 0.25, readyMs: { samples: 3, p50: 30, p95: 40, p99: 40, max: 40 } },
      reconnect: { target: 2, succeeded: 1, failed: 1, failureRate: 0.5, readyMs: { samples: 1, p50: 25, p95: 25, p99: 25, max: 25 } },
      failures: { http_401: 1, socket_error: 2 },
      peakHarnessRssBytes: 1234,
    });
  });
});
