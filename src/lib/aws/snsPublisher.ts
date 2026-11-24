import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { awsConfig } from './config';
import { Coordinates } from '@/types/sentinel';

export interface PublishSosFallbackParams {
  incidentId: string;
  triggerType: string;
  threatLevel: string;
  locationLabel?: string;
  coordinates?: Coordinates;
  summary?: string;
}

export interface PublishSosFallbackResult {
  ok: boolean;
  messageId?: string;
  source: 'aws-live' | 'mock-fallback';
  fallbackReason?: string;
}

const region =
  process.env.APP_AWS_REGION ||
  process.env.AWS_REGION ||
  awsConfig.region ||
  'us-east-1';

// Server-side SNS client (default credential chain; never hardcode credentials)
const snsClient = new SNSClient({ region });

/**
 * Publishes an offline/emergency SOS beacon to the Amazon SNS topic.
 * Formats a concise, SMS-compliant message under 320 characters.
 */
export async function publishSosFallback({
  incidentId,
  triggerType,
  threatLevel,
  locationLabel,
  coordinates,
  summary,
}: PublishSosFallbackParams): Promise<PublishSosFallbackResult> {
  const topicArn =
    process.env.SNS_FALLBACK_TOPIC_ARN || awsConfig.sns.topicArn;

  const lat = coordinates?.lat ?? 37.871;
  const lng = coordinates?.lng ?? -122.2589;
  const mapLink = `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;

  const conciseSummary = summary ? summary.slice(0, 70).replace(/\s+/g, ' ') : '';
  const locationTag = locationLabel ? ` @ ${locationLabel}` : '';

  // Concise SMS Beacon under 320 chars
  const message = [
    `🚨 SENTINEL SOS BEACON`,
    `INCIDENT: ${incidentId}`,
    `ALERT: [${threatLevel}] ${triggerType}${locationTag}`,
    `GPS: ${mapLink}`,
    conciseSummary ? `NOTE: ${conciseSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (!topicArn) {
    console.warn('[snsPublisher] SNS_FALLBACK_TOPIC_ARN not configured, falling back to mock beacon');
    return {
      ok: false,
      source: 'mock-fallback',
      fallbackReason: 'SNS_FALLBACK_TOPIC_ARN is not configured',
    };
  }

  try {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Subject: `SENTINEL SOS: ${incidentId} [${threatLevel}]`,
      Message: message,
    });

    const res = await snsClient.send(command, {
      abortSignal: AbortSignal.timeout(5000),
    });

    return {
      ok: true,
      messageId: res.MessageId,
      source: 'aws-live',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[snsPublisher] SNS Publish failed, returning stage-safe fallback:', errorMsg);
    return {
      ok: false,
      source: 'mock-fallback',
      fallbackReason: errorMsg,
    };
  }
}
