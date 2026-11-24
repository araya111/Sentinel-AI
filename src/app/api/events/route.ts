import { NextRequest, NextResponse } from 'next/server';
import {
  subscribeSSE,
  broadcastSSE,
  sendHeartbeat,
  getActiveIncident,
} from '@/lib/eventBus';
import { SentinelEvent, IncidentEventType } from '@/types/sentinel';

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
      location: body.location || { lat: 37.8722, lng: -122.2598 },
      threatLevel: body.threatLevel || 'MEDIUM',
      triggerSource: body.triggerSource || 'MANUAL',
      transcriptSnippet: body.transcriptSnippet,
      responder: body.responder,
      audioBufferPreview: body.audioBufferPreview,
      notes: body.notes,
    };

    broadcastSSE(event);

    return NextResponse.json({ ok: true, event });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
