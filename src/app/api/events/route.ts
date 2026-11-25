import { NextRequest, NextResponse } from 'next/server';
import {
  subscribeSSE,
  broadcastSSE,
  sendHeartbeat,
  getActiveIncident,
} from '@/lib/eventBus';
import { SentinelEvent, IncidentEventType, ThreatLevel, TriggerSource } from '@/types/sentinel';
import { dynamoStore } from '@/lib/aws/dynamoStore';
import { publishToAppSyncEvents } from '@/lib/aws/appsyncServerPublisher';
import { publishSosFallback } from '@/lib/aws/snsPublisher';
import { sanitizeRoom } from '@/lib/room';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { logTelemetry } from '@/lib/telemetry';

export async function GET(request: NextRequest) {
  const signal = request.signal;
  if (signal.aborted) {
    return new NextResponse('Aborted', { status: 499 });
  }

  const room = sanitizeRoom(request.nextUrl.searchParams.get('room'));

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = subscribeSSE(controller, room);

      // Replay active incident state for this specific room immediately on connect
      const activeIncident = getActiveIncident(room);
      if (activeIncident) {
        const encoder = new TextEncoder();
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(activeIncident)}\n\n`)
          );
        } catch {
          unsubscribe();
          return;
        }
      }

      // Heartbeat comment every 15s to keep connection alive
      const interval = setInterval(() => {
        try {
          sendHeartbeat();
        } catch {
          clearInterval(interval);
          unsubscribe();
        }
      }, 15000);

      // Clean up on client disconnect
      signal.addEventListener('abort', () => {
        clearInterval(interval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Closed stream
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = getClientIp(request);

  try {
    const body = await request.json().catch(() => ({}));
    const validTypes: IncidentEventType[] = [
      'STEALTH_TRIGGERED',
      'THREAT_ESCALATED',
      'PHONE_DROP_DETECTED',
      'RESPONDER_DISPATCHED',
      'INCIDENT_RESET',
      'SOS_FALLBACK_SENT',
      'LOCATION_PING',
    ];

    if (!body || !validTypes.includes(body.type)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing incident event type' },
        { status: 400 }
      );
    }

    const room = sanitizeRoom(body.room);
    const eventId = body.eventId || crypto.randomUUID();
    const incidentId =
      body.incidentId ||
      body.id?.replace(/^evt_/, '') ||
      `inc_${Date.now().toString(36)}`;

    // Normalize transcript snippet from string or role/text object array
    let transcriptSnippet: string | undefined = body.transcriptSnippet;
    if (!transcriptSnippet && body.transcript) {
      if (typeof body.transcript === 'string') {
        transcriptSnippet = body.transcript;
      } else if (Array.isArray(body.transcript)) {
        transcriptSnippet = body.transcript
          .map((item: { role?: string; text?: string }) =>
            item.role ? `${item.role}: ${item.text || ''}` : item.text || ''
          )
          .join(' ');
      }
    }

    const triggerSource = (body.triggerSource ||
      body.triggerType ||
      'MANUAL') as TriggerSource;
    const threatLevel = (body.threatLevel || 'MEDIUM') as ThreatLevel;
    const notes = body.notes || body.detectedCue || '';

    const event: SentinelEvent = {
      id: body.id || eventId,
      eventId,
      incidentId,
      room,
      type: body.type,
      timestamp: body.timestamp || Date.now(),
      location: body.location || body.coordinates || { lat: 37.8702, lng: -122.2589 },
      coordinates: body.coordinates || body.location,
      heading: body.heading,
      mode: body.mode,
      threatLevel,
      triggerSource,
      transcriptSnippet,
      responder: body.responder,
      audioBufferPreview: body.audioBufferPreview,
      notes,
      snsMessageId: body.snsMessageId,
    };

    // --- SPECIAL CASE: LOCATION_PING Telemetry ---
    // Broadcast ONLY via local SSE + AppSync Events — DO NOT write DynamoDB, DO NOT fire SNS
    if (event.type === 'LOCATION_PING') {
      broadcastSSE(event);
      const appSyncRes = await publishToAppSyncEvents(event);
      return NextResponse.json({
        ok: true,
        event,
        appSyncPublished: appSyncRes.ok,
        persistedToDynamo: false,
        sseBroadcast: true,
      });
    }

    // Step 1: Sub-10ms synchronous SSE broadcast within the room
    broadcastSSE(event);

    // Step 2: Parallel execution: AppSync publish + DynamoDB persistence + optional SNS SOS fallback
    const appSyncPromise = publishToAppSyncEvents(event);

    let dynamoPromise: Promise<{ success: boolean; error?: string }>;
    if (
      event.type === 'STEALTH_TRIGGERED' ||
      event.type === 'THREAT_ESCALATED' ||
      event.type === 'PHONE_DROP_DETECTED'
    ) {
      dynamoPromise = dynamoStore.mergeAndUpsertIncident(incidentId, {
        status: 'ACTIVE',
        room,
        threatLevel: event.threatLevel,
        triggerSource: event.triggerSource,
        location: event.location,
        transcript: event.transcriptSnippet,
        detectedCue: event.notes || event.triggerSource,
        snsMessageId: event.snsMessageId,
      });
    } else if (event.type === 'RESPONDER_DISPATCHED') {
      dynamoPromise = dynamoStore.mergeAndUpsertIncident(incidentId, {
        status: 'DISPATCHED',
        room,
        dispatchedResponder: event.responder,
      });
    } else if (event.type === 'INCIDENT_RESET') {
      dynamoPromise = dynamoStore.mergeAndUpsertIncident(incidentId, {
        status: 'RESOLVED',
        room,
      });
    } else if (event.type === 'SOS_FALLBACK_SENT') {
      dynamoPromise = dynamoStore.mergeAndUpsertIncident(incidentId, {
        snsMessageId: event.snsMessageId,
        room,
      });
    } else {
      dynamoPromise = Promise.resolve({ success: true });
    }

    const isSandbox = room === 'audience-sandbox';
    const shouldTriggerSns =
      (event.type === 'THREAT_ESCALATED' || event.type === 'PHONE_DROP_DETECTED') &&
      !event.snsMessageId;

    let snsPromise = Promise.resolve(null as { ok: boolean; messageId?: string; fallbackReason?: string } | null);

    if (shouldTriggerSns) {
      const snsRate = checkRateLimit({
        key: `sns:${room}:${ip}`,
        limit: isSandbox ? 1 : 25,
        windowMs: 60000,
      });

      if (snsRate.allowed) {
        const prefix = isSandbox ? '[AUDIENCE-SANDBOX] ' : '';
        snsPromise = publishSosFallback({
          incidentId,
          triggerType: event.triggerSource,
          threatLevel: event.threatLevel,
          locationLabel: `${prefix}Campus Corridor`,
          coordinates: event.location,
          summary: `${prefix}${event.notes || event.transcriptSnippet || 'Threat escalation'}`,
        });
      }
    }

    const [appSyncResult, dynamoResult, snsResult] = await Promise.allSettled([
      appSyncPromise,
      dynamoPromise,
      snsPromise,
    ]);

    const appSyncPublished =
      appSyncResult.status === 'fulfilled' ? appSyncResult.value.ok : false;
    const appSyncError =
      appSyncResult.status === 'fulfilled'
        ? appSyncResult.value.error
        : String(appSyncResult.reason);

    const persistedToDynamo =
      dynamoResult.status === 'fulfilled' ? dynamoResult.value.success : false;
    const dynamoError =
      dynamoResult.status === 'fulfilled'
        ? dynamoResult.value.error
        : String(dynamoResult.reason);

    let snsMessageId: string | undefined = event.snsMessageId;
    let snsError: string | undefined;

    if (snsResult.status === 'fulfilled' && snsResult.value) {
      if (snsResult.value.messageId) {
        snsMessageId = snsResult.value.messageId;
      }
      if (!snsResult.value.ok) {
        snsError = snsResult.value.fallbackReason;
      }
    } else if (snsResult.status === 'rejected') {
      snsError = String(snsResult.reason);
    }

    // Step 3: If an SNS fallback messageId was returned, broadcast the SOS_FALLBACK_SENT confirmation
    if (snsMessageId && snsMessageId !== event.snsMessageId) {
      const fallbackEventId = crypto.randomUUID();
      const sosEvent: SentinelEvent = {
        id: fallbackEventId,
        eventId: fallbackEventId,
        incidentId,
        room,
        type: 'SOS_FALLBACK_SENT',
        timestamp: Date.now(),
        location: event.location,
        threatLevel: event.threatLevel,
        triggerSource: event.triggerSource,
        snsMessageId,
        notes: `Amazon SNS SOS beacon published (MessageId: ${snsMessageId})`,
      };

      // Broadcast to local SSE & AppSync
      broadcastSSE(sosEvent);
      publishToAppSyncEvents(sosEvent).catch(() => {});

      // Persist snsMessageId onto DynamoDB incident record
      dynamoStore
        .mergeAndUpsertIncident(incidentId, { snsMessageId, room })
        .catch(() => {});
    }

    logTelemetry({
      route: '/api/events',
      awsService: 'AppSync Events + DynamoDB + SNS',
      source: 'aws-live',
      latencyMs: Date.now() - startTime,
      room,
      ok: true,
    });

    return NextResponse.json({
      ok: true,
      event,
      appSyncPublished,
      persistedToDynamo,
      snsMessageId,
      diagnostics: {
        appSyncPublished,
        appSyncError,
        persistedToDynamo,
        dynamoError,
        snsMessageId,
        snsError,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
