import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { SafeHaven, PatrollingResponder, PersistedIncident } from '@/types/sentinel';
import { SAFE_HAVENS, PATROLLING_RESPONDERS } from '@/lib/mockData';

const region = process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
const tableName = process.env.DYNAMODB_TABLE_NAME || 'sentinel-ai-incidents';

// Server-only DynamoDB Document Client (uses AWS_PROFILE / default credential chain)
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const dynamoStore = {
  /**
   * Retrieves all verified Safe Havens from DynamoDB with fallback to canonical mock data.
   */
  async getSafeHavens(): Promise<SafeHaven[]> {
    try {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'SAFE_HAVEN' },
      });
      const res = await docClient.send(command, {
        abortSignal: AbortSignal.timeout(5000),
      });
      if (res.Items && res.Items.length > 0) {
        return res.Items as SafeHaven[];
      }
    } catch (err) {
      console.warn('[dynamoStore] getSafeHavens error, falling back:', err);
    }
    return SAFE_HAVENS;
  },

  /**
   * Retrieves all active campus responders from DynamoDB with fallback.
   */
  async getResponders(): Promise<PatrollingResponder[]> {
    try {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'RESPONDER' },
      });
      const res = await docClient.send(command, {
        abortSignal: AbortSignal.timeout(5000),
      });
      if (res.Items && res.Items.length > 0) {
        return res.Items as PatrollingResponder[];
      }
    } catch (err) {
      console.warn('[dynamoStore] getResponders error, falling back:', err);
    }
    return PATROLLING_RESPONDERS;
  },

  /**
   * Lists the most recent persisted incidents, sorted descending by updatedAt in memory.
   */
  async listRecentIncidents(limit = 10): Promise<PersistedIncident[]> {
    try {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'INCIDENT' },
      });
      const res = await docClient.send(command, {
        abortSignal: AbortSignal.timeout(5000),
      });
      const items = (res.Items || []) as PersistedIncident[];
      // Sort in-memory by updatedAt descending
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return items.slice(0, limit);
    } catch (err) {
      console.warn('[dynamoStore] listRecentIncidents error:', err);
      return [];
    }
  },

  /**
   * Deep-merges an incident update by incidentId and saves via PutCommand.
   */
  async mergeAndUpsertIncident(
    incidentId: string,
    patch: Partial<PersistedIncident>
  ): Promise<{ success: boolean; item?: PersistedIncident; error?: string }> {
    const pk = 'INCIDENT';
    const sk = `INC#${incidentId}`;

    try {
      // 1. Read existing item if present
      let existing: PersistedIncident | null = null;
      try {
        const getCmd = new GetCommand({
          TableName: tableName,
          Key: { pk, sk },
        });
        const getRes = await docClient.send(getCmd, {
          abortSignal: AbortSignal.timeout(5000),
        });
        if (getRes.Item) {
          existing = getRes.Item as PersistedIncident;
        }
      } catch {
        // new item
      }

      const now = new Date().toISOString();

      // Cleanly merge transcript lines without duplicate entries
      let mergedTranscript = existing?.transcript || '';
      if (patch.transcript) {
        if (!mergedTranscript) {
          mergedTranscript = patch.transcript;
        } else if (!mergedTranscript.includes(patch.transcript)) {
          mergedTranscript = `${mergedTranscript}\n${patch.transcript}`;
        }
      }

      const updatedItem: PersistedIncident = {
        pk,
        sk,
        incidentId,
        status: patch.status || existing?.status || 'ACTIVE',
        threatLevel: patch.threatLevel || existing?.threatLevel || 'MEDIUM',
        triggerSource: patch.triggerSource || existing?.triggerSource || 'MANUAL',
        location: patch.location || existing?.location || { lat: 37.8702, lng: -122.2589 },
        transcript: mergedTranscript,
        detectedCue: patch.detectedCue || existing?.detectedCue || 'None',
        dispatchedResponder: patch.dispatchedResponder || existing?.dispatchedResponder,
        snsMessageId: patch.snsMessageId || existing?.snsMessageId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      const putCmd = new PutCommand({
        TableName: tableName,
        Item: updatedItem,
      });

      await docClient.send(putCmd, {
        abortSignal: AbortSignal.timeout(5000),
      });

      return { success: true, item: updatedItem };
    } catch (err: unknown) {
      const errMessage = (err as Error).message || String(err);
      console.error('[dynamoStore] mergeAndUpsertIncident error:', errMessage);
      return { success: false, error: errMessage };
    }
  },
};
