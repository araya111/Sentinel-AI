import { NextRequest, NextResponse } from 'next/server';
import { publishSosFallback } from '@/lib/aws/snsPublisher';
import { dynamoStore } from '@/lib/aws/dynamoStore';
import { publishToAppSyncEvents } from '@/lib/aws/appsyncServerPublisher';
import { broadcastSSE } from '@/lib/eventBus';
import { SentinelEvent } from '@/types/sentinel';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const incidentId =
      body.incidentId ||
      body.id?.replace(/^evt_/, '') ||
      `inc_${Date.now().toString(36)}`;
    const triggerType = body.triggerType || body.triggerSource || 'MANUAL_SOS_BEACON';
    const threatLevel = body.threatLevel || 'CRITICAL';
    const location = body.location || { lat: 37.871, lng: -122.2589 };
    const locationLabel = body.locationLabel || 'Campus Safe Corridor';
    const summary = body.summary || body.notes || 'Manual emergency SOS broadcast';

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

    // 2. Construct canonical SOS_FALLBACK_SENT event
    const fallbackEvent: SentinelEvent = {
      id: eventId,
      eventId,
      incidentId,
      type: 'SOS_FALLBACK_SENT',
      timestamp: Date.now(),
      location,
      threatLevel: threatLevel as SentinelEvent['threatLevel'],
      triggerSource: 'MANUAL',
      snsMessageId,
      notes: `Offline SOS beacon dispatched via Amazon SNS (Topic ARN active). MessageId: ${snsMessageId || 'N/A'}`,
    };

    // 3. Broadcast to local SSE bus immediately
    broadcastSSE(fallbackEvent);

    // 4. Concurrently publish to AppSync Events & merge into DynamoDB
    const [appSyncRes, dynamoRes] = await Promise.allSettled([
      publishToAppSyncEvents(fallbackEvent),
      dynamoStore.mergeAndUpsertIncident(incidentId, {
        snsMessageId,
      }),
    ]);

    const appSyncPublished =
      appSyncRes.status === 'fulfilled' ? appSyncRes.value.ok : false;
    const persistedToDynamo =
      dynamoRes.status === 'fulfilled' ? dynamoRes.value.success : false;

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
