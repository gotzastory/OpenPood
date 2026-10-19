import { app } from 'electron';
import { RUNTIME } from '../src/lib/runtimeConfig';

const enabled = process.env.OPENPOOD_DIAGNOSTICS === '1';

export async function measureStage<T>(stage: 'stt' | 'polish' | 'translate' | 'history' | 'paste', operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try { return await operation(); }
  finally { reportDuration(stage, performance.now() - started); }
}

export function reportDuration(stage: string, durationMs: number): void {
  if (enabled) console.info('[performance]', { stage, durationMs: Math.round(durationMs) });
}

export function startPerformanceSampling(): () => void {
  if (!enabled) return () => undefined;
  const timer = setInterval(() => {
    try {
      const metrics = app.getAppMetrics();
      console.info('[performance]', {
        processes: metrics.length,
        cpuPercent: Math.round(metrics.reduce((sum, entry) => sum + entry.cpu.percentCPUUsage, 0) * 10) / 10,
        workingSetMb: Math.round(metrics.reduce((sum, entry) => sum + entry.memory.workingSetSize, 0) / 1024),
      });
    } catch { console.warn('Performance metrics unavailable.'); }
  }, RUNTIME.metricsIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
