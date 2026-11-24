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

// 1. Resolve AWS CLI binary safely
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
console.log(`[Provision Step 4] Using AWS CLI binary: ${awsBin}`);

function runAws(args) {
  return execFileSync(awsBin, args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_PROFILE: 'sentinel-ai', AWS_REGION: 'us-east-1' },
  });
}

function normalizeHost(raw) {
  if (!raw) return '';
  let host = raw.trim();
  host = host.replace(/^(https?:\/\/|wss?:\/\/)/i, '');
  const slashIdx = host.indexOf('/');
  if (slashIdx >= 0) {
    host = host.substring(0, slashIdx);
  }
  return host;
}

async function main() {
  const region = 'us-east-1';
  const profile = 'sentinel-ai';

  console.log('[Provision Step 4] Verifying sentinel-ai session...');
  const identityRaw = runAws(['sts', 'get-caller-identity', '--profile', profile, '--region', region, '--output', 'json']);
  const identity = JSON.parse(identityRaw);
  console.log(`[Provision Step 4] Authenticated: ${identity.Arn} (Account: ${identity.Account})`);

  // --- 1. AWS AppSync Events API (sentinel-ai-events) ---
  console.log('[Provision Step 4] Checking AppSync Events APIs...');
  const listApisRaw = runAws(['appsync', 'list-apis', '--profile', profile, '--region', region, '--output', 'json']);
  const listApisData = JSON.parse(listApisRaw);
  let existingApi = listApisData.apis?.find((a) => a.name === 'sentinel-ai-events');

  let apiId = '';
  let httpDomain = '';
  let realtimeDomain = '';

  if (existingApi) {
    console.log(`[Provision Step 4] Found existing AppSync API: ${existingApi.apiId}`);
    apiId = existingApi.apiId;
  } else {
    console.log('[Provision Step 4] Creating AppSync Events API: sentinel-ai-events...');
    const eventConfig = JSON.stringify({
      authProviders: [{ authType: 'API_KEY' }],
      connectionAuthModes: [{ authType: 'API_KEY' }],
      defaultPublishAuthModes: [{ authType: 'API_KEY' }],
      defaultSubscribeAuthModes: [{ authType: 'API_KEY' }],
    });

    const createRaw = runAws([
      'appsync',
      'create-api',
      '--name',
      'sentinel-ai-events',
      '--event-config',
      eventConfig,
      '--profile',
      profile,
      '--region',
      region,
      '--output',
      'json',
    ]);
    const createData = JSON.parse(createRaw);
    apiId = createData.api?.apiId;
    console.log(`[Provision Step 4] Created AppSync Events API with ID: ${apiId}`);
  }

  // Retrieve full API description to extract dns.HTTP and dns.REALTIME
  console.log(`[Provision Step 4] Fetching AppSync API details for ${apiId}...`);
  const getApiRaw = runAws(['appsync', 'get-api', '--api-id', apiId, '--profile', profile, '--region', region, '--output', 'json']);
  const getApiData = JSON.parse(getApiRaw);
  const apiObj = getApiData.api || {};

  httpDomain = normalizeHost(apiObj.dns?.HTTP);
  realtimeDomain = normalizeHost(apiObj.dns?.REALTIME);

  if (!apiId || !httpDomain || !realtimeDomain) {
    throw new Error(`[Provision Step 4] Failed to extract API ID or domains: apiId=${apiId}, http=${httpDomain}, realtime=${realtimeDomain}`);
  }
  console.log(`[Provision Step 4] AppSync Domains: HTTP=${httpDomain}, REALTIME=${realtimeDomain}`);

  // Channel namespace: sentinel
  console.log('[Provision Step 4] Checking channel namespaces...');
  const listNsRaw = runAws(['appsync', 'list-channel-namespaces', '--api-id', apiId, '--profile', profile, '--region', region, '--output', 'json']);
  const listNsData = JSON.parse(listNsRaw);
  const hasNamespace = listNsData.channelNamespaces?.some((ns) => ns.name === 'sentinel');

  if (!hasNamespace) {
    console.log('[Provision Step 4] Creating channel namespace: sentinel...');
    runAws(['appsync', 'create-channel-namespace', '--api-id', apiId, '--name', 'sentinel', '--profile', profile, '--region', region, '--output', 'json']);
    console.log('[Provision Step 4] Created channel namespace: sentinel');
  } else {
    console.log('[Provision Step 4] Channel namespace sentinel already exists');
  }

  // API Key: active key with expires > now + 30 days
  console.log('[Provision Step 4] Checking AppSync API keys...');
  const listKeysRaw = runAws(['appsync', 'list-api-keys', '--api-id', apiId, '--profile', profile, '--region', region, '--output', 'json']);
  const listKeysData = JSON.parse(listKeysRaw);
  const minExpiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const activeKey = listKeysData.apiKeys?.find((k) => k.expires > minExpiry);

  let apiKeyId = '';
  if (activeKey) {
    apiKeyId = activeKey.id;
    console.log('[Provision Step 4] Found valid active AppSync API Key (masked)');
  } else {
    const expiresEpoch = Math.floor(Date.now() / 1000) + 180 * 24 * 60 * 60;
    console.log(`[Provision Step 4] Creating 180-day AppSync API Key (expires: ${expiresEpoch})...`);
    const createKeyRaw = runAws([
      'appsync',
      'create-api-key',
      '--api-id',
      apiId,
      '--expires',
      String(expiresEpoch),
      '--profile',
      profile,
      '--region',
      region,
      '--output',
      'json',
    ]);
    const createKeyData = JSON.parse(createKeyRaw);
    apiKeyId = createKeyData.apiKey?.id;
    console.log('[Provision Step 4] Created new 180-day AppSync API Key (masked)');
  }

  if (!apiKeyId) {
    throw new Error('[Provision Step 4] Could not acquire an AppSync API Key');
  }

  // --- 2. Amazon SNS SOS Fallback Topic (sentinel-ai-sos-fallback) ---
  console.log('[Provision Step 4] Provisioning Amazon SNS SOS fallback topic...');
  const snsTopicRaw = runAws([
    'sns',
    'create-topic',
    '--name',
    'sentinel-ai-sos-fallback',
    '--profile',
    profile,
    '--region',
    region,
    '--output',
    'json',
  ]);
  const snsTopicData = JSON.parse(snsTopicRaw);
  const topicArn = snsTopicData.TopicArn;
  console.log(`[Provision Step 4] Amazon SNS Topic ARN: ${topicArn}`);

  // --- 3. Least-Privilege AWS Amplify SSR Compute Role ---
  console.log('[Provision Step 4] Describing DynamoDB table sentinel-ai-incidents...');
  let tableArn = '';
  try {
    const ddbRaw = runAws([
      'dynamodb',
      'describe-table',
      '--table-name',
      'sentinel-ai-incidents',
      '--profile',
      profile,
      '--region',
      region,
      '--output',
      'json',
    ]);
    const ddbData = JSON.parse(ddbRaw);
    tableArn = ddbData.Table?.TableArn;
    console.log(`[Provision Step 4] DynamoDB Table ARN: ${tableArn}`);
  } catch (err) {
    throw new Error(
      '[Provision Step 4] DynamoDB table sentinel-ai-incidents does not exist! Please run scripts/provision-step3.mjs first.\n' +
      err.message
    );
  }

  const roleName = 'sentinel-ai-amplify-compute-role';
  let roleArn = '';
  console.log(`[Provision Step 4] Checking IAM role: ${roleName}...`);
  try {
    const roleRaw = runAws(['iam', 'get-role', '--role-name', roleName, '--profile', profile, '--output', 'json']);
    const roleData = JSON.parse(roleRaw);
    roleArn = roleData.Role?.Arn;
    console.log(`[Provision Step 4] IAM role ${roleName} already exists: ${roleArn}`);
  } catch {
    console.log(`[Provision Step 4] Creating IAM role: ${roleName}...`);
    const trustPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: ['amplify.amazonaws.com'] },
          Action: 'sts:AssumeRole',
        },
      ],
    });

    const createRoleRaw = runAws([
      'iam',
      'create-role',
      '--role-name',
      roleName,
      '--assume-role-policy-document',
      trustPolicy,
      '--profile',
      profile,
      '--output',
      'json',
    ]);
    const createRoleData = JSON.parse(createRoleRaw);
    roleArn = createRoleData.Role?.Arn;
    console.log(`[Provision Step 4] Created IAM role: ${roleArn}`);
  }

  // Attach / update inline policy sentinel-ai-ssr-runtime-policy
  console.log('[Provision Step 4] Updating inline IAM policy sentinel-ai-ssr-runtime-policy...');
  const runtimePolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['bedrock:InvokeModel'],
        Resource: '*',
      },
      {
        Effect: 'Allow',
        Action: ['polly:SynthesizeSpeech'],
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
        ],
        Resource: tableArn,
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
  console.log('[Provision Step 4] Attached inline least-privilege policy to compute role');

  // --- 4. Merge .env.local Safely ---
  const envPath = path.join(ROOT_DIR, '.env.local');
  let currentEnv = '';
  if (fs.existsSync(envPath)) {
    currentEnv = fs.readFileSync(envPath, 'utf8');
  }

  const updates = {
    APP_AWS_REGION: 'us-east-1',
    NEXT_PUBLIC_APPSYNC_EVENTS_HTTP_DOMAIN: httpDomain,
    NEXT_PUBLIC_APPSYNC_EVENTS_REALTIME_DOMAIN: realtimeDomain,
    NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY: apiKeyId,
    NEXT_PUBLIC_APPSYNC_EVENTS_CHANNEL: '/sentinel/live',
    SNS_FALLBACK_TOPIC_ARN: topicArn,
    AMPLIFY_COMPUTE_ROLE_ARN: roleArn,
  };

  const lines = currentEnv.split(/\r?\n/);
  const updatedKeys = new Set();
  const nextLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      nextLines.push(line);
      continue;
    }
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        nextLines.push(`${key}=${updates[key]}`);
        updatedKeys.add(key);
      } else {
        nextLines.push(line);
      }
    } else {
      nextLines.push(line);
    }
  }

  for (const [key, val] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      nextLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(envPath, nextLines.join('\n') + '\n', 'utf8');
  console.log('[Provision Step 4] Successfully merged Step 4 variables into .env.local');
  console.log(`[Provision Step 4] Resources Provisioned:
- AppSync Events API ID: ${apiId}
- AppSync HTTP Domain: ${httpDomain}
- AppSync Realtime Domain: ${realtimeDomain}
- AppSync Channel: /sentinel/live
- AppSync API Key: (configured)
- SNS Topic ARN: ${topicArn}
- Amplify Compute Role ARN: ${roleArn}`);
}

main().catch((err) => {
  console.error('[Provision Step 4] Fatal error:', err);
  process.exit(1);
});
