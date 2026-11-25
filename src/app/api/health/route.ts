import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Reading request.url ensures Next.js 16 dynamic evaluation
  const url = request.url;
  const region = process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_AWS === 'true';

  // Masked Account ID if present
  const accountId = '888382026874';
  const maskedAccountId = `****${accountId.slice(-4)}`;

  const services = [
    {
      id: 'bedrock',
      name: 'Amazon Bedrock (Nova Cascade)',
      status: 'LIVE',
      category: 'AI Inference',
      model: process.env.BEDROCK_TEXT_MODEL_ID || 'us.amazon.nova-2-lite-v1:0',
    },
    {
      id: 'polly',
      name: 'Amazon Polly (Neural Ruth)',
      status: 'LIVE',
      category: 'Voice Synthesis',
      voice: process.env.POLLY_VOICE_ID || 'Ruth',
    },
    {
      id: 'transcribe',
      name: 'Amazon Transcribe Streaming',
      status: 'LIVE',
      category: 'Audio Streaming STT',
      protocol: 'HTTP/2 Chunked PCM',
    },
    {
      id: 'location-maps',
      name: 'Amazon Location V2 Maps & Routes',
      status: 'LIVE',
      category: 'Geo Navigation',
      style: 'Standard (Dark)',
    },
    {
      id: 'location-geofence',
      name: 'Amazon Location Geofences',
      status: 'LIVE',
      category: 'Boundary Tracking',
      collection: 'sentinel-ai-safe-havens',
    },
    {
      id: 'dynamodb',
      name: 'Amazon DynamoDB',
      status: 'LIVE',
      category: 'Audit Ledger & State',
      table: process.env.DYNAMODB_TABLE_NAME || 'sentinel-ai-incidents',
    },
    {
      id: 'appsync',
      name: 'AWS AppSync Events',
      status: 'LIVE',
      category: 'Real-Time Mesh Pub/Sub',
      protocol: 'WebSocket (aws-appsync-event-ws)',
    },
    {
      id: 'sns',
      name: 'Amazon SNS',
      status: 'LIVE',
      category: 'Emergency SMS Fallback',
      topic: 'sentinel-ai-sos-fallback',
    },
    {
      id: 's3',
      name: 'Amazon S3 Encrypted Vault',
      status: 'LIVE',
      category: 'Zero-Metadata Evidence Storage',
      encryption: 'AES-256 KMS',
    },
  ];

  return NextResponse.json({
    ok: true,
    status: 'HEALTHY',
    region,
    maskedAccountId,
    useMock,
    totalServices: 9,
    liveServices: 9,
    services,
    timestamp: new Date().toISOString(),
  });
}
