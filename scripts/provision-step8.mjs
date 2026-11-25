#!/usr/bin/env node

process.env.AWS_PROFILE = 'sentinel-ai';
process.env.AWS_SDK_LOAD_CONFIG = '1';
process.env.AWS_REGION = 'us-east-1';

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function resolveAwsCli() {
  const isWin = process.platform === 'win32';
  try {
    const cmd = isWin ? 'where.exe' : 'which';
    const out = execFileSync(cmd, ['aws'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch {
    // ignore
  }

  if (isWin) {
    const defaultWinPath = 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe';
    if (fs.existsSync(defaultWinPath)) return defaultWinPath;
  }
  return 'aws';
}

const awsBin = resolveAwsCli();
console.log(`[Provision Step 8] Using AWS CLI: ${awsBin}`);

function runAws(args) {
  return execFileSync(awsBin, args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_PROFILE: 'sentinel-ai', AWS_REGION: 'us-east-1', AWS_SDK_LOAD_CONFIG: '1' },
  });
}

async function main() {
  const region = 'us-east-1';
  const profile = 'sentinel-ai';

  console.log('[Provision Step 8] Verifying live AWS session...');
  const identity = JSON.parse(runAws(['sts', 'get-caller-identity', '--profile', profile, '--region', region, '--output', 'json']));
  const accountId = identity.Account;
  console.log(`[Provision Step 8] Authenticated Account: ${accountId}`);

  // A. Provision Amazon CloudWatch Operational Dashboard (sentinel-ai-ops)
  console.log('[Provision Step 8] Creating/updating CloudWatch Dashboard: sentinel-ai-ops...');
  
  const dashboardBody = {
    widgets: [
      {
        type: 'metric',
        x: 0,
        y: 0,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            ['AWS/Bedrock', 'Invocations', { stat: 'Sum', label: 'Bedrock Invocations (Sum)' }],
            ['.', 'InvocationLatency', { stat: 'Average', label: 'Bedrock Latency (Avg ms)' }],
            ['.', 'InvocationClientErrors', { stat: 'Sum', label: 'Client Errors' }],
            ['.', 'InvocationServerErrors', { stat: 'Sum', label: 'Server Errors' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Amazon Bedrock Invocations & Latency',
          period: 300,
        },
      },
      {
        type: 'metric',
        x: 12,
        y: 0,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            ['AWS/DynamoDB', 'SuccessfulRequestLatency', 'TableName', 'sentinel-ai-incidents', 'Operation', 'PutItem', { stat: 'Average', label: 'PutItem Latency' }],
            ['.', 'SuccessfulRequestLatency', 'TableName', 'sentinel-ai-incidents', 'Operation', 'Query', { stat: 'Average', label: 'Query Latency' }],
            ['.', 'ConsumedWriteCapacityUnits', 'TableName', 'sentinel-ai-incidents', { stat: 'Sum', label: 'Consumed WCU' }],
            ['.', 'ConsumedReadCapacityUnits', 'TableName', 'sentinel-ai-incidents', { stat: 'Sum', label: 'Consumed RCU' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Amazon DynamoDB (sentinel-ai-incidents) Latency & Capacity',
          period: 300,
        },
      },
      {
        type: 'metric',
        x: 0,
        y: 6,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            ['AWS/SNS', 'NumberOfMessagesPublished', 'TopicName', 'sentinel-ai-sos-fallback', { stat: 'Sum', label: 'SOS Beacons Published' }],
            ['.', 'NumberOfNotificationsDelivered', 'TopicName', 'sentinel-ai-sos-fallback', { stat: 'Sum', label: 'Notifications Delivered' }],
            ['.', 'NumberOfNotificationsFailed', 'TopicName', 'sentinel-ai-sos-fallback', { stat: 'Sum', label: 'Delivery Failures' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Amazon SNS (sentinel-ai-sos-fallback) SOS Delivery',
          period: 300,
        },
      },
      {
        type: 'metric',
        x: 12,
        y: 6,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            ['AWS/Polly', 'ResponseLatency', 'Operation', 'SynthesizeSpeech', { stat: 'Average', label: 'Polly Synthesis Latency (Avg ms)' }],
            ['.', 'RequestCharacters', 'Operation', 'SynthesizeSpeech', { stat: 'Sum', label: 'Characters Synthesized' }],
          ],
          view: 'timeSeries',
          stacked: false,
          region,
          title: 'Amazon Polly Voice Synthesis Latency & Characters',
          period: 300,
        },
      },
    ],
  };

  runAws([
    'cloudwatch',
    'put-dashboard',
    '--dashboard-name',
    'sentinel-ai-ops',
    '--dashboard-body',
    JSON.stringify(dashboardBody),
    '--profile',
    profile,
    '--region',
    region,
  ]);

  const dashboardUrl = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=sentinel-ai-ops`;
  console.log(`[Provision Step 8] CloudWatch Dashboard deployed: ${dashboardUrl}`);

  // B. Best-Effort Budget Guardrail Check
  try {
    console.log('[Provision Step 8] Checking AWS Budgets (best-effort)...');
    runAws(['budgets', 'describe-budgets', '--account-id', accountId, '--profile', profile, '--region', region]);
    console.log('[Provision Step 8] AWS Budgets accessible on this account.');
  } catch (budgetErr) {
    console.log('[Provision Step 8] Note: Billing/Budgets IAM access not active on this IAM role (non-fatal, continuing).');
  }

  console.log('[Provision Step 8] Step 8 Ops Provisioning Complete.');
}

main().catch((err) => {
  console.error('[Provision Step 8] Fatal error:', err.message);
  process.exit(1);
});
