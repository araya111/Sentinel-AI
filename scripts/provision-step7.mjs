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
console.log(`[Provision Step 7] Using AWS CLI: ${awsBin}`);

function runAws(args) {
  return execFileSync(awsBin, args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_PROFILE: 'sentinel-ai', AWS_REGION: 'us-east-1', AWS_SDK_LOAD_CONFIG: '1' },
  });
}

async function main() {
  const region = 'us-east-1';
  const profile = 'sentinel-ai';

  console.log('[Provision Step 7] Verifying live AWS session...');
  const identity = JSON.parse(runAws(['sts', 'get-caller-identity', '--profile', profile, '--region', region, '--output', 'json']));
  const accountId = identity.Account;
  console.log(`[Provision Step 7] Authenticated Account: ${accountId}`);

  const roleName = 'sentinel-ai-amplify-compute-role';
  const tableName = 'sentinel-ai-incidents';
  const tableArn = `arn:aws:dynamodb:${region}:${accountId}:table/${tableName}`;
  const topicArn = `arn:aws:sns:${region}:${accountId}:sentinel-ai-sos-fallback`;

  console.log(`[Provision Step 7] Updating ${roleName} policy with Amazon Transcribe Streaming...`);

  const runtimePolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:Converse',
          'bedrock:ConverseStream',
        ],
        Resource: '*',
      },
      {
        Effect: 'Allow',
        Action: ['polly:SynthesizeSpeech'],
        Resource: '*',
      },
      {
        Effect: 'Allow',
        Action: ['transcribe:StartStreamTranscription'],
        Resource: '*',
      },
      {
        Effect: 'Allow',
        Action: ['geo-routes:CalculateRoutes'],
        Resource: '*',
      },
      {
        Effect: 'Allow',
        Action: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:Query',
          'dynamodb:BatchWriteItem',
        ],
        Resource: [tableArn, `${tableArn}/index/*`],
      },
      {
        Effect: 'Allow',
        Action: ['sns:Publish'],
        Resource: topicArn,
      },
      {
        Effect: 'Allow',
        Action: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        Resource: '*',
      },
    ],
  });

  runAws([
    'iam',
    'put-role-policy',
    '--role-name',
    roleName,
    '--policy-name',
    'sentinel-ai-ssr-runtime-policy',
    '--policy-document',
    runtimePolicy,
    '--profile',
    profile,
  ]);

  console.log('[Provision Step 7] Successfully attached Step 7 inline policy (Transcribe Streaming granted).');
}

main().catch((err) => {
  console.error('[Provision Step 7] Fatal error:', err.message);
  process.exit(1);
});
