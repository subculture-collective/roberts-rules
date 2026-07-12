export function nearestRank(samples: readonly number[], percentile: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1]!;
}

interface LoadMetricsInput {
  initialTarget: number
  initialReadyMs: readonly number[]
  reconnectTarget: number
  reconnectReadyMs: readonly number[]
  failures: readonly string[]
  peakHarnessRssBytes: number
}

function phase(target: number, samples: readonly number[]) {
  const succeeded = samples.length;
  const failed = Math.max(0, target - succeeded);
  return {
    target,
    succeeded,
    failed,
    failureRate: target === 0 ? 0 : failed / target,
    readyMs: {
      samples: samples.length,
      p50: nearestRank(samples, 50),
      p95: nearestRank(samples, 95),
      p99: nearestRank(samples, 99),
      max: samples.length === 0 ? null : Math.max(...samples),
    },
  };
}

export function summarizeLoad(input: LoadMetricsInput) {
  const failures: Record<string, number> = {};
  for (const code of [...input.failures].sort()) failures[code] = (failures[code] ?? 0) + 1;
  return {
    initial: phase(input.initialTarget, input.initialReadyMs),
    reconnect: phase(input.reconnectTarget, input.reconnectReadyMs),
    failures,
    peakHarnessRssBytes: input.peakHarnessRssBytes,
  };
}
