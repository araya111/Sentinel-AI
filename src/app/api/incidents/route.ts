import { NextRequest, NextResponse } from 'next/server';
import { dynamoStore } from '@/lib/aws/dynamoStore';
import { SAFE_HAVENS, PATROLLING_RESPONDERS } from '@/lib/mockData';

export async function GET(request: NextRequest) {
  // Reading request.url ensures runtime dynamic evaluation in Next.js 16
  const url = request.url;
  const useMockAws = process.env.NEXT_PUBLIC_USE_MOCK_AWS === 'true';

  if (useMockAws) {
    return NextResponse.json({
      safeHavens: SAFE_HAVENS,
      responders: PATROLLING_RESPONDERS,
      incidents: [],
      source: 'mock-fallback',
      fallbackReason: 'Mock AWS mode active via NEXT_PUBLIC_USE_MOCK_AWS=true',
    });
  }

  try {
    const [safeHavens, responders, incidents] = await Promise.all([
      dynamoStore.getSafeHavens(),
      dynamoStore.getResponders(),
      dynamoStore.listRecentIncidents(15),
    ]);

    return NextResponse.json({
      safeHavens,
      responders,
      incidents,
      source: 'aws-live',
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || String(err);
    console.error('[GET /api/incidents] Error:', errorMsg);
    return NextResponse.json({
      safeHavens: SAFE_HAVENS,
      responders: PATROLLING_RESPONDERS,
      incidents: [],
      source: 'mock-fallback',
      fallbackReason: errorMsg,
    });
  }
}
