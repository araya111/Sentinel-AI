export interface TelemetryEntry {
  route: string;
  awsService: string;
  source: 'aws-live' | 'mock-fallback' | 'rate-limited';
  latencyMs: number;
  room: string;
  ok: boolean;
  errorCode?: string;
}

/**
 * Emits a structured CloudWatch JSON log line.
 * Strictly zero secrets, zero API keys, zero base64 audio, zero PII.
 */
export function logTelemetry(entry: TelemetryEntry): void {
  try {
    const payload = {
      app: 'sentinel-ai',
      ts: new Date().toISOString(),
      ...entry,
    };
    console.log(JSON.stringify(payload));
  } catch {
    // ignore
  }
}
