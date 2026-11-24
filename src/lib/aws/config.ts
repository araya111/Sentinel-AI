/**
 * Centralized AWS configuration reader.
 * Resolves cloud configuration and helper functions for AWS services.
 */

export function normalizeHost(raw?: string): string {
  if (!raw) return '';
  let host = raw.trim();
  host = host.replace(/^(https?:\/\/|wss?:\/\/)/i, '');
  const slashIdx = host.indexOf('/');
  if (slashIdx >= 0) {
    host = host.substring(0, slashIdx);
  }
  return host;
}

export const awsConfig = {
  useMockAws: process.env.NEXT_PUBLIC_USE_MOCK_AWS !== 'false',
  region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1',
  bedrock: {
    speechModelId: process.env.BEDROCK_SPEECH_MODEL_ID || 'amazon.nova-2-sonic-v1:0',
    textModelId: process.env.BEDROCK_TEXT_MODEL_ID || 'us.amazon.nova-2-lite-v1:0',
    fallbackModelIds: (process.env.BEDROCK_FALLBACK_MODEL_IDS || 'us.amazon.nova-lite-v1:0,us.amazon.nova-micro-v1:0')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  polly: {
    voiceId: process.env.POLLY_VOICE_ID || 'Ruth',
  },
  location: {
    apiKey: process.env.NEXT_PUBLIC_AMAZON_LOCATION_API_KEY || '',
    region: process.env.NEXT_PUBLIC_AMAZON_LOCATION_REGION || process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1',
  },
  appSync: {
    httpDomain: normalizeHost(process.env.NEXT_PUBLIC_APPSYNC_EVENTS_HTTP_DOMAIN),
    realtimeDomain: normalizeHost(process.env.NEXT_PUBLIC_APPSYNC_EVENTS_REALTIME_DOMAIN),
    apiKey: process.env.NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY || '',
    channel: process.env.NEXT_PUBLIC_APPSYNC_EVENTS_CHANNEL || '/sentinel/live',
  },
  dynamoDb: {
    tableName: process.env.DYNAMODB_TABLE_NAME || 'sentinel-ai-incidents',
  },
  sns: {
    topicArn: process.env.SNS_FALLBACK_TOPIC_ARN || '',
  },
  amplify: {
    computeRoleArn: process.env.AMPLIFY_COMPUTE_ROLE_ARN || '',
  },
};
