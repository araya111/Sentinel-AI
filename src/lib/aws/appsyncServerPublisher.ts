import { SentinelEvent } from '@/types/sentinel';
import { awsConfig, normalizeHost } from './config';
import { roomToChannel } from '../room';

export interface AppSyncPublishResult {
  ok: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Server-side publisher to AWS AppSync Events via its REST HTTP event endpoint.
 * POST https://<http-domain>/event
 */
export async function publishToAppSyncEvents(
  event: SentinelEvent
): Promise<AppSyncPublishResult> {
  const httpDomain =
    awsConfig.appSync.httpDomain ||
    normalizeHost(process.env.NEXT_PUBLIC_APPSYNC_EVENTS_HTTP_DOMAIN);
  const apiKey =
    awsConfig.appSync.apiKey ||
    process.env.NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY ||
    '';
  const channel = event.room
    ? roomToChannel(event.room)
    : awsConfig.appSync.channel ||
      process.env.NEXT_PUBLIC_APPSYNC_EVENTS_CHANNEL ||
      '/sentinel/live';

  if (!httpDomain || !apiKey) {
    return {
      ok: false,
      error: 'AppSync Events HTTP domain or API key not configured',
    };
  }

  const endpoint = `https://${httpDomain}/event`;

  try {
    const payload = {
      channel,
      events: [JSON.stringify(event)],
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[AppSync Server Publisher] HTTP error ${res.status}: ${errText}`);
      return {
        ok: false,
        statusCode: res.status,
        error: `HTTP ${res.status}: ${errText || res.statusText}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as {
      failed?: Array<{ errorCode: string; errorMessage: string }>;
      successful?: Array<{ id: string }>;
    };

    if (data.failed && data.failed.length > 0) {
      const firstFail = data.failed[0];
      const errMsg = `AppSync event rejected (${firstFail.errorCode}): ${firstFail.errorMessage}`;
      console.warn(`[AppSync Server Publisher] ${errMsg}`);
      return {
        ok: false,
        error: errMsg,
      };
    }

    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[AppSync Server Publisher] Network or timeout error:', message);
    return {
      ok: false,
      error: message,
    };
  }
}
