import { NextRequest, NextResponse } from 'next/server';
import { publishSosFallback } from '@/lib/aws/snsPublisher';
import { dynamoStore } from '@/lib/aws/dynamoStore';
import { publishToAppSyncEvents } from '@/lib/aws/appsyncServerPublisher';
import { broadcastSSE } from '@/lib/eventBus';
import { SentinelEvent } from '@/types/sentinel';
import { sanitizeRoom } from '@/lib/room';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { logTelemetry } from '@/lib/telemetry';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = getClientIp(request);

  try {
    const body = await request.json().catch(() => ({}));
    const room = sanitizeRoom(body.room);
    const isSandbox = room === 'audience-sandbox';

    // Rate Limiter
    const limit = isSandbox ? 1 : 25;
    const rateCheck = checkRateLimit({
      key: `sos:${room}:${ip}`,
      limit,
      windowMs: 60000,
    });

    if (!rateCheck.allowed) {
      logTelemetry({
        route: '/api/sos-fallback',
        awsService: 'Amazon SNS',
        source: 'rate-limited',
        latencyMs: Date.now() - startTime,
        room,
        ok: false,
        errorCode: 'RATE_LIMIT_EXCEEDED',
      });

      return NextResponse.json(
        {
          ok: false,
          error: 'Rate limit exceeded for this session. Please wait a few seconds.',
          retryAfterSec: rateCheck.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
        }
      );
    }

    const incidentId =
      body.incidentId ||
      body.id?.replace(/^evt_/, '') ||
      `inc_${Date.now().toString(36)}`;
    const triggerType = body.triggerType || body.triggerSource || 'MANUAL_SOS_BEACON';
    const threatLevel = body.threatLevel || 'CRITICAL';
    const location = body.location || body.coordinates || { lat: 37.871, lng: -122.2589 };
    const prefix = isSandbox ? '[AUDIENCE-SANDBOX] ' : '';
    const locationLabel = `${prefix}${body.locationLabel || 'Campus Safe Corridor'}`;
    const summary = `${prefix}${body.summary || body.notes || 'Manual emergency SOS broadcast'}`;

    // 1. Publish to Amazon SNS topic
    const snsResult = await publishSosFallback({
      incidentId,
      triggerType,
      threatLevel,
      locationLabel,
      coordinates: location,
      summary,
    });

    const snsMessageId = snsResult.messageId || (snsResult.ok ? 'msg-mock-sns' : undefined);
    const eventId = crypto.randomUUID();

    // 2. Construct canonical SOS_FALLBACK_SENT event with room
    const fallbackEvent: SentinelEvent = {
      id: eventId,
      eventId,
      incidentId,
      room,
      type: 'SOS_FALLBACK_SENT',
      timestamp: Date.now(),
      location,
      threatLevel: threatLevel as SentinelEvent['threatLevel'],
      triggerSource: 'MANUAL',
      snsMessageId,
      notes: `${prefix}Offline SOS beacon dispatched via Amazon SNS (Topic ARN active). MessageId: ${snsMessageId || 'N/A'}`,
    };

    // 3. Broadcast to local SSE bus immediately within room
    broadcastSSE(fallbackEvent);

    // 4. Concurrently publish to AppSync Events & merge into DynamoDB
    const [appSyncRes, dynamoRes] = await Promise.allSettled([
      publishToAppSyncEvents(fallbackEvent),
      dynamoStore.mergeAndUpsertIncident(incidentId, {
        snsMessageId,
        room,
      }),
    ]);

    const appSyncPublished =
      appSyncRes.status === 'fulfilled' ? appSyncRes.value.ok : false;
    const persistedToDynamo =
      dynamoRes.status === 'fulfilled' ? dynamoRes.value.success : false;

    logTelemetry({
      route: '/api/sos-fallback',
      awsService: 'Amazon SNS',
      source: snsResult.source,
      latencyMs: Date.now() - startTime,
      room,
      ok: true,
    });

    return NextResponse.json({
      ok: true,
      snsMessageId,
      source: snsResult.source,
      event: fallbackEvent,
      appSyncPublished,
      persistedToDynamo,
      fallbackReason: snsResult.fallbackReason,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
