#!/usr/bin/env node

process.env.AWS_PROFILE = 'sentinel-ai';
process.env.AWS_SDK_LOAD_CONFIG = '1';
process.env.AWS_REGION = 'us-east-1';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const region = process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
const tableName = process.env.DYNAMODB_TABLE_NAME || 'sentinel-ai-incidents';

const ddb = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddb);

async function main() {
  console.log(`[Cleanup Demo Data] Connecting to DynamoDB table: ${tableName} (${region})...`);

  // Query ONLY pk = "INCIDENT" rows (NEVER touching SAFE_HAVEN or RESPONDER rows!)
  let deletedCount = 0;
  let lastEvaluatedKey = undefined;

  do {
    const queryCmd = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'INCIDENT' },
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const res = await docClient.send(queryCmd);
    const items = res.Items || [];

    if (items.length > 0) {
      console.log(`[Cleanup Demo Data] Found ${items.length} incident records in this batch to delete...`);

      // Batch delete in chunks of 25 (DynamoDB limit)
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const writeRequests = chunk.map((it) => ({
          DeleteRequest: {
            Key: { pk: it.pk, sk: it.sk },
          },
        }));

        await docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [tableName]: writeRequests,
            },
          })
        );
        deletedCount += chunk.length;
      }
    }

    lastEvaluatedKey = res.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`\n✨ [Cleanup Demo Data] Spotless reset complete! Deleted ${deletedCount} test incident(s).`);
  console.log('   Preserved all SAFE_HAVEN and RESPONDER reference items.');
}

main().catch((err) => {
  console.error('[Cleanup Demo Data] Fatal error:', err.message);
  process.exit(1);
});
