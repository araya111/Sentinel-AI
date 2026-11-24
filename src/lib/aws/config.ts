/**
 * Centralized AWS configuration reader.
 * In Phase 1, `useMockAws` defaults to true so the stage demo functions
 * 100% offline without live cloud credentials.
 */
export const awsConfig = {
  useMockAws: process.env.NEXT_PUBLIC_USE_MOCK_AWS !== 'false',
  region: process.env.AWS_REGION || 'us-east-1',
  bedrock: {
    speechModelId: process.env.BEDROCK_SPEECH_MODEL_ID || 'amazon.nova-2-sonic-v1:0',
    textModelId:
      process.env.BEDROCK_TEXT_MODEL_ID ||
      'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  },
  location: {
    apiKey: process.env.NEXT_PUBLIC_AMAZON_LOCATION_API_KEY || '',
    region: process.env.NEXT_PUBLIC_AMAZON_LOCATION_REGION || 'us-east-1',
  },
  appSync: {
    httpEndpoint: process.env.NEXT_PUBLIC_APPSYNC_EVENTS_HTTP_ENDPOINT || '',
    realtimeEndpoint: process.env.NEXT_PUBLIC_APPSYNC_EVENTS_REALTIME_ENDPOINT || '',
    apiKey: process.env.NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY || '',
  },
  dynamoDb: {
    tableName: process.env.DYNAMODB_TABLE_NAME || 'sentinel-ai-incidents',
  },
  sns: {
    topicArn: process.env.SNS_FALLBACK_TOPIC_ARN || '',
  },
};
