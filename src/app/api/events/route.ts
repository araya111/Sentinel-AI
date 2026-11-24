import { NextRequest, NextResponse } from 'next/server';
import {
  subscribeSSE,
  broadcastSSE,
  sendHeartbeat,
  getActiveIncident,
} from '@/lib/eventBus';
import { SentinelEvent, IncidentEventType } from '@/types/sentinel';
import { dynamoStore } from '@/lib/aws/dynamoStore';

export async function GET(request: NextRequest) {
  const signal = request.signal;
  if (signal.aborted) {
    return new NextResponse('Aborted', { status: 499 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = subscribeSSE(controller);

      // Replay active incident state (if any) immediately on connect
      const activeIncident = getActiveIncident();
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
  try {
    const body = await request.json();
    const validTypes: IncidentEventType[] = [
      'STEALTH_TRIGGERED',
      'THREAT_ESCALATED',
      'PHONE_DROP_DETECTED',
      'RESPONDER_DISPATCHED',
      'INCIDENT_RESET',
    ];

    if (!body || !validTypes.includes(body.type)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing incident event type' },
        { status: 400 }
      );
    }

    const event: SentinelEvent = {
      id: body.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type: body.type,
      timestamp: body.timestamp || Date.now(),
      location: body.location || { lat: 37.8702, lng: -122.2589 },
      threatLevel: body.threatLevel || 'MEDIUM',
      triggerSource: body.triggerSource || 'MANUAL',
      transcriptSnippet: body.transcriptSnippet,
      responder: body.responder,
      audioBufferPreview: body.audioBufferPreview,
      notes: body.notes,
    };

    // Step 1: Sub-10ms synchronous SSE broadcast so real-time stage dual-screen is instant
    broadcastSSE(event);

    // Step 2: Asynchronously persist to DynamoDB table sentinel-ai-incidents
    let persistedToDynamo = false;
    let dynamoError: string | undefined;

    try {
      const incidentId = event.id.replace(/^evt_/, '');
      if (
        event.type === 'STEALTH_TRIGGERED' ||
        event.type === 'THREAT_ESCALATED' ||
        event.type === 'PHONE_DROP_DETECTED'
      ) {
        await dynamoStore.mergeAndUpsertIncident(incidentId, {
          status: 'ACTIVE',
          threatLevel: event.threatLevel,
          triggerSource: event.triggerSource,
          location: event.location,
          transcript: event.transcriptSnippet,
          detectedCue: event.notes || event.triggerSource,
        });
        persistedToDynamo = true;
      } else if (event.type === 'RESPONDER_DISPATCHED') {
        await dynamoStore.mergeAndUpsertIncident(incidentId, {
          status: 'DISPATCHED',
          dispatchedResponder: event.responder,
        });
        persistedToDynamo = true;
      } else if (event.type === 'INCIDENT_RESET') {
        await dynamoStore.mergeAndUpsertIncident(incidentId, {
          status: 'RESOLVED',
        });
        persistedToDynamo = true;
      }
    } catch (dErr) {
      dynamoError = (dErr as Error).message;
      console.warn('[POST /api/events] DynamoDB persistence warning:', dynamoError);
    }

    return NextResponse.json({ ok: true, event, persistedToDynamo, dynamoError });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
