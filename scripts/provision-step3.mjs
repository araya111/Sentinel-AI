#!/usr/bin/env node

process.env.AWS_PROFILE = 'sentinel-ai';
process.env.AWS_SDK_LOAD_CONFIG = '1';
process.env.AWS_REGION = 'us-east-1';

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

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
console.log(`[Provision Step 3] Using AWS CLI binary: ${awsBin}`);

function runAws(args) {
  return execFileSync(awsBin, args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_PROFILE: 'sentinel-ai', AWS_REGION: 'us-east-1' },
  });
}

async function main() {
  const region = 'us-east-1';
  const profile = 'sentinel-ai';

  console.log('[Provision Step 3] Checking caller identity...');
  const identityRaw = runAws(['sts', 'get-caller-identity', '--profile', profile, '--region', region, '--output', 'json']);
  const identity = JSON.parse(identityRaw);
  console.log(`[Provision Step 3] Authenticated as: ${identity.Arn} (Account: ${identity.Account})`);

  // --- A. Amazon Location V2 Map API Key (sentinel-ai-maps-key) ---
  const keyName = 'sentinel-ai-maps-key';
  let mapApiKey = '';

  console.log(`[Provision Step 3] Describing Location API Key: ${keyName}...`);
  try {
    const descRaw = runAws(['location', 'describe-key', '--key-name', keyName, '--profile', profile, '--region', region, '--output', 'json']);
    const desc = JSON.parse(descRaw);
    mapApiKey = desc.Key;
    console.log(`[Provision Step 3] Existing API key found: ${desc.KeyArn}`);
  } catch (err) {
    console.log(`[Provision Step 3] Key not found or describe failed, creating ${keyName}...`);
    const restrictions = JSON.stringify({
      AllowActions: ['geo-maps:GetTile', 'geo-maps:GetStaticMap'],
      AllowResources: [`arn:aws:geo-maps:${region}::provider/default`],
    });

    const createRaw = runAws([
      'location',
      'create-key',
      '--key-name',
      keyName,
      '--no-expiry',
      '--restrictions',
      restrictions,
      '--description',
      'Sentinel AI Location V2 Map Tile Key',
      '--profile',
      profile,
      '--region',
      region,
      '--output',
      'json',
    ]);
    const createRes = JSON.parse(createRaw);
    mapApiKey = createRes.Key;
    console.log(`[Provision Step 3] Successfully created Location API Key: ${createRes.KeyArn}`);
  }

  if (!mapApiKey) {
    throw new Error('[Provision Step 3] Failed to obtain Amazon Location API Key string.');
  }

  // --- B. Amazon DynamoDB Table (sentinel-ai-incidents) ---
  const tableName = 'sentinel-ai-incidents';
  console.log(`[Provision Step 3] Checking DynamoDB Table: ${tableName}...`);
  try {
    runAws(['dynamodb', 'describe-table', '--table-name', tableName, '--profile', profile, '--region', region, '--output', 'json']);
    console.log(`[Provision Step 3] Table ${tableName} exists.`);
  } catch {
    console.log(`[Provision Step 3] Creating DynamoDB Table: ${tableName}...`);
    runAws([
      'dynamodb',
      'create-table',
      '--table-name',
      tableName,
      '--attribute-definitions',
      'AttributeName=pk,AttributeType=S',
      'AttributeName=sk,AttributeType=S',
      '--key-schema',
      'AttributeName=pk,KeyType=HASH',
      'AttributeName=sk,KeyType=RANGE',
      '--billing-mode',
      'PAY_PER_REQUEST',
      '--profile',
      profile,
      '--region',
      region,
      '--output',
      'json',
    ]);

    console.log(`[Provision Step 3] Waiting for table ${tableName} to become active...`);
    runAws(['dynamodb', 'wait', 'table-exists', '--table-name', tableName, '--profile', profile, '--region', region]);
    console.log(`[Provision Step 3] Table ${tableName} is now active.`);
  }

  // --- C. Seed Safe Havens & Responders via DynamoDBDocumentClient ---
  console.log('[Provision Step 3] Seeding Safe Havens & Responders to DynamoDB...');
  const ddbClient = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true },
  });

  const safeHavens = [
    {
      pk: 'SAFE_HAVEN',
      sk: 'HAVEN#1',
      id: 'haven-pharmacy',
      name: '24/7 Campus Pharmacy',
      category: 'pharmacy',
      address: '2350 Telegraph Ave',
      lat: 37.8698,
      lng: -122.2574,
      coordinates: [-122.2574, 37.8698],
      open24x7: true,
      is24Seven: true,
      verified: true,
      lightingScore: 95,
      phone: '+1 (510) 642-1000',
      description: 'Brightly lit retail haven with security vestibule and direct 911 dispatch button.',
      distanceMeters: 140,
    },
    {
      pk: 'SAFE_HAVEN',
      sk: 'HAVEN#2',
      id: 'haven-cafe',
      name: 'NightOwl Cafe & Student Study',
      category: 'cafe',
      address: '2490 Bancroft Way',
      lat: 37.8722,
      lng: -122.2575,
      coordinates: [-122.2575, 37.8722],
      open24x7: true,
      is24Seven: true,
      verified: true,
      lightingScore: 92,
      phone: '+1 (510) 642-2000',
      description: 'Continuous student presence, CCTV monitoring, and certified safe haven partner.',
      distanceMeters: 310,
    },
    {
      pk: 'SAFE_HAVEN',
      sk: 'HAVEN#3',
      id: 'haven-security',
      name: 'North Gate Security Booth',
      category: 'security_post',
      address: 'Hearst Ave & Euclid Gate',
      lat: 37.8756,
      lng: -122.2601,
      coordinates: [-122.2601, 37.8756],
      open24x7: true,
      is24Seven: true,
      verified: true,
      lightingScore: 98,
      phone: '+1 (510) 642-6765',
      description: 'Stationary university police kiosk staffed 24/7 with emergency beacon lights.',
      distanceMeters: 490,
    },
  ];

  const responders = [
    {
      pk: 'RESPONDER',
      sk: 'RESP#1',
      id: 'resp-unit-04',
      name: 'Campus Security Unit 04',
      role: 'Patrol Vehicle (Mobile Patrol)',
      lat: 37.8734,
      lng: -122.2618,
      coordinates: [-122.2618, 37.8734],
      etaSeconds: 75,
      etaDisplay: '1m 15s',
      status: 'AVAILABLE',
      contactPhone: '+1 (510) 555-0104',
    },
    {
      pk: 'RESPONDER',
      sk: 'RESP#2',
      id: 'resp-volunteer-rohan',
      name: 'Peer Safety Volunteer — Rohan',
      role: 'Foot Escort & Certified First Responder',
      lat: 37.8712,
      lng: -122.2589,
      coordinates: [-122.2589, 37.8712],
      etaSeconds: 100,
      etaDisplay: '1m 40s',
      status: 'AVAILABLE',
      contactPhone: '+1 (510) 555-0188',
    },
    {
      pk: 'RESPONDER',
      sk: 'RESP#3',
      id: 'resp-haven-cafe',
      name: 'Safe Haven — NightOwl Staff Escort',
      role: 'Stationary Responder & Safe Haven Marshall',
      lat: 37.8722,
      lng: -122.2575,
      coordinates: [-122.2575, 37.8722],
      etaSeconds: 115,
      etaDisplay: '1m 55s',
      status: 'AVAILABLE',
      contactPhone: '+1 (510) 555-0199',
    },
  ];

  for (const haven of safeHavens) {
    await docClient.send(new PutCommand({ TableName: tableName, Item: haven }));
  }
  console.log(`[Provision Step 3] Seeded ${safeHavens.length} Safe Havens.`);

  for (const resp of responders) {
    await docClient.send(new PutCommand({ TableName: tableName, Item: resp }));
  }
  console.log(`[Provision Step 3] Seeded ${responders.length} Patrolling Responders.`);

  // --- D. Safely Merge .env.local (Preserving All Step 2 Vars) ---
  const envPath = path.join(ROOT_DIR, '.env.local');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const upsertKeys = {
    NEXT_PUBLIC_AMAZON_LOCATION_API_KEY: mapApiKey,
    NEXT_PUBLIC_AMAZON_LOCATION_REGION: region,
    DYNAMODB_TABLE_NAME: tableName,
  };

  const lines = envContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const remainingKeys = { ...upsertKeys };

  const updatedLines = lines.map((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      if (key in remainingKeys) {
        const val = remainingKeys[key];
        delete remainingKeys[key];
        return `${key}=${val}`;
      }
    }
    return line;
  });

  for (const [key, val] of Object.entries(remainingKeys)) {
    updatedLines.push(`${key}=${val}`);
  }

  fs.writeFileSync(envPath, updatedLines.join('\n') + '\n', 'utf8');
  console.log('[Provision Step 3] Successfully merged .env.local (preserved all Step 2 vars and updated Step 3 keys).');
  console.log('[Provision Step 3] Step 3 provisioning completed successfully!');
}

main().catch((err) => {
  console.error('[Provision Step 3] Error during provisioning:', err);
  process.exit(1);
});
