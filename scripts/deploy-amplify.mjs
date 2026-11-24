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

// Helper to resolve AWS CLI binary safely
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

// Helper to resolve GitHub CLI binary safely
function resolveGhCli() {
  const isWin = process.platform === 'win32';
  try {
    const cmd = isWin ? 'where.exe' : 'which';
    const out = execFileSync(cmd, ['gh'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch {
    // ignore
  }

  if (isWin) {
    const defaultWinPath = 'C:\\Program Files\\GitHub CLI\\gh.exe';
    if (fs.existsSync(defaultWinPath)) return defaultWinPath;
  }
  return 'gh';
}

// Helper to resolve GitHub Token via env, GitHub CLI, or Git Credential Manager
function resolveGitHubToken() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    console.log('[Deploy Amplify] Using GITHUB_TOKEN from process environment.');
    return process.env.GITHUB_TOKEN.trim();
  }
  if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) {
    console.log('[Deploy Amplify] Using GH_TOKEN from process environment.');
    return process.env.GH_TOKEN.trim();
  }

  // 1. Try GitHub CLI
  try {
    const ghBin = resolveGhCli();
    const out = execFileSync(ghBin, ['auth', 'token'], { encoding: 'utf8' }).trim();
    if (out) {
      console.log('[Deploy Amplify] Retrieved GitHub Token via GitHub CLI (gh).');
      return out;
    }
  } catch {
    // ignore
  }

  // 2. Try Git Credential Manager
  try {
    const gitBin = process.platform === 'win32' ? 'git.exe' : 'git';
    const creds = execFileSync(gitBin, ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
    });
    const match = creds.match(/^password=(.+)$/m);
    if (match && match[1]) {
      console.log('[Deploy Amplify] Retrieved GitHub Token via Git Credential Manager.');
      return match[1].trim();
    }
  } catch {
    // ignore
  }

  return '';
}

const awsBin = resolveAwsCli();
const ghBin = resolveGhCli();

console.log(`[Deploy Amplify] AWS CLI: ${awsBin}`);

function runAws(args) {
  return execFileSync(awsBin, args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_PROFILE: 'sentinel-ai', AWS_REGION: 'us-east-1', AWS_SDK_LOAD_CONFIG: '1' },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const region = 'us-east-1';
  const profile = 'sentinel-ai';

  console.log('[Deploy Amplify] Step A: Resolving Repository & Branch...');
  
  // 1. Resolve repository URL and normalize to HTTPS without .git
  const rawRemote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  let repoUrl = rawRemote.replace(/\.git$/, '');
  if (repoUrl.startsWith('git@github.com:')) {
    repoUrl = repoUrl.replace('git@github.com:', 'https://github.com/');
  }
  console.log(`[Deploy Amplify] Normalized Repo URL: ${repoUrl}`);

  // 2. Resolve active branch name
  const activeBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(`[Deploy Amplify] Target Active Branch: ${activeBranch}`);

  // 3. Read .env.local and collect safe environment variables
  const envPath = path.join(ROOT_DIR, '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('[Deploy Amplify] .env.local not found in workspace root!');
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envMap = {};
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      envMap[match[1].trim()] = match[2].trim();
    }
  }

  const amplifyEnvVars = {
    NEXT_PUBLIC_USE_MOCK_AWS: 'false',
    APP_AWS_REGION: region,
    NODE_OPTIONS: '--max-old-space-size=4096',
    BEDROCK_TEXT_MODEL_ID: envMap.BEDROCK_TEXT_MODEL_ID || 'us.amazon.nova-2-lite-v1:0',
    BEDROCK_FALLBACK_MODEL_IDS: envMap.BEDROCK_FALLBACK_MODEL_IDS || 'us.amazon.nova-lite-v1:0,us.amazon.nova-micro-v1:0',
    POLLY_VOICE_ID: envMap.POLLY_VOICE_ID || 'Ruth',
    NEXT_PUBLIC_AMAZON_LOCATION_API_KEY: envMap.NEXT_PUBLIC_AMAZON_LOCATION_API_KEY || '',
    NEXT_PUBLIC_AMAZON_LOCATION_REGION: envMap.NEXT_PUBLIC_AMAZON_LOCATION_REGION || region,
    DYNAMODB_TABLE_NAME: envMap.DYNAMODB_TABLE_NAME || 'sentinel-ai-incidents',
    NEXT_PUBLIC_APPSYNC_EVENTS_HTTP_DOMAIN: envMap.NEXT_PUBLIC_APPSYNC_EVENTS_HTTP_DOMAIN || '',
    NEXT_PUBLIC_APPSYNC_EVENTS_REALTIME_DOMAIN: envMap.NEXT_PUBLIC_APPSYNC_EVENTS_REALTIME_DOMAIN || '',
    NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY: envMap.NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY || '',
    NEXT_PUBLIC_APPSYNC_EVENTS_CHANNEL: envMap.NEXT_PUBLIC_APPSYNC_EVENTS_CHANNEL || '/sentinel/live',
    SNS_FALLBACK_TOPIC_ARN: envMap.SNS_FALLBACK_TOPIC_ARN || '',
  };

  // 4. Retrieve GitHub Token
  console.log('[Deploy Amplify] Resolving GitHub Token for Amplify repository access...');
  const ghToken = resolveGitHubToken();

  if (!ghToken) {
    throw new Error('[Deploy Amplify] Failed to retrieve GitHub token via environment, GitHub CLI, or Git Credential Manager.');
  }
  console.log('[Deploy Amplify] GitHub Token verified (masked).');

  // Step B: Ensure IAM Roles
  console.log('[Deploy Amplify] Step B: Checking IAM Roles...');
  
  // 1. Compute Role (created in Step 4)
  const computeRoleName = 'sentinel-ai-amplify-compute-role';
  const computeRoleData = JSON.parse(runAws(['iam', 'get-role', '--role-name', computeRoleName, '--output', 'json']));
  const computeRoleArn = computeRoleData.Role?.Arn;
  console.log(`[Deploy Amplify] Compute Role ARN: ${computeRoleArn}`);

  // 2. Service Role for Amplify Hosting
  const serviceRoleName = 'sentinel-ai-amplify-service-role';
  let serviceRoleArn = '';
  try {
    const sRoleData = JSON.parse(runAws(['iam', 'get-role', '--role-name', serviceRoleName, '--output', 'json']));
    serviceRoleArn = sRoleData.Role?.Arn;
    console.log(`[Deploy Amplify] Found existing Service Role: ${serviceRoleArn}`);
  } catch {
    console.log(`[Deploy Amplify] Creating IAM Service Role: ${serviceRoleName}...`);
    const trustPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'amplify.amazonaws.com' },
          Action: 'sts:AssumeRole',
        },
      ],
    });
    const sCreateData = JSON.parse(runAws([
      'iam',
      'create-role',
      '--role-name',
      serviceRoleName,
      '--assume-role-policy-document',
      trustPolicy,
      '--output',
      'json',
    ]));
    serviceRoleArn = sCreateData.Role?.Arn;

    // Attach CloudWatch Logs Policy
    const logsPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
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
      serviceRoleName,
      '--policy-name',
      'amplify-cloudwatch-logs',
      '--policy-document',
      logsPolicy,
    ]);
    console.log('[Deploy Amplify] Created and configured Service Role. Waiting 10s for IAM propagation...');
    await sleep(10000);
  }

  // Step C: Create or Update Amplify App
  console.log('[Deploy Amplify] Step C: Managing Amplify App (WEB_COMPUTE)...');
  const listAppsData = JSON.parse(runAws(['amplify', 'list-apps', '--output', 'json']));
  const existingApp = listAppsData.apps?.find((a) => a.name === 'sentinel-ai');

  let appId = '';
  let defaultDomain = '';

  const envJson = JSON.stringify(amplifyEnvVars);

  if (!existingApp) {
    console.log('[Deploy Amplify] Creating new Amplify App: sentinel-ai...');
    let createAppData;
    try {
      createAppData = JSON.parse(runAws([
        'amplify',
        'create-app',
        '--name',
        'sentinel-ai',
        '--repository',
        repoUrl,
        '--access-token',
        ghToken,
        '--platform',
        'WEB_COMPUTE',
        '--iam-service-role-arn',
        serviceRoleArn,
        '--compute-role-arn',
        computeRoleArn,
        '--environment-variables',
        envJson,
        '--output',
        'json',
      ]));
    } catch (createErr) {
      console.warn('[Deploy Amplify] --access-token attempt failed, retrying with --oauth-token...');
      createAppData = JSON.parse(runAws([
        'amplify',
        'create-app',
        '--name',
        'sentinel-ai',
        '--repository',
        repoUrl,
        '--oauth-token',
        ghToken,
        '--platform',
        'WEB_COMPUTE',
        '--iam-service-role-arn',
        serviceRoleArn,
        '--compute-role-arn',
        computeRoleArn,
        '--environment-variables',
        envJson,
        '--output',
        'json',
      ]));
    }
    appId = createAppData.app.appId;
    defaultDomain = createAppData.app.defaultDomain;
    console.log(`[Deploy Amplify] Created App ID: ${appId} (Domain: ${defaultDomain})`);
  } else {
    appId = existingApp.appId;
    defaultDomain = existingApp.defaultDomain;
    console.log(`[Deploy Amplify] Updating existing Amplify App ID: ${appId}...`);
    runAws([
      'amplify',
      'update-app',
      '--app-id',
      appId,
      '--platform',
      'WEB_COMPUTE',
      '--iam-service-role-arn',
      serviceRoleArn,
      '--compute-role-arn',
      computeRoleArn,
      '--environment-variables',
      envJson,
      '--output',
      'json',
    ]);
  }

  // Step D: Create or Update Branch & Trigger Release
  console.log(`[Deploy Amplify] Step D: Configuring Branch ${activeBranch}...`);
  let branchExists = false;
  try {
    runAws(['amplify', 'get-branch', '--app-id', appId, '--branch-name', activeBranch, '--output', 'json']);
    branchExists = true;
  } catch {
    branchExists = false;
  }

  if (!branchExists) {
    console.log(`[Deploy Amplify] Creating branch ${activeBranch} (Next.js - SSR)...`);
    runAws([
      'amplify',
      'create-branch',
      '--app-id',
      appId,
      '--branch-name',
      activeBranch,
      '--framework',
      'Next.js - SSR',
      '--stage',
      'PRODUCTION',
      '--enable-auto-build',
      '--compute-role-arn',
      computeRoleArn,
      '--output',
      'json',
    ]);
  } else {
    console.log(`[Deploy Amplify] Updating branch ${activeBranch} (Next.js - SSR)...`);
    runAws([
      'amplify',
      'update-branch',
      '--app-id',
      appId,
      '--branch-name',
      activeBranch,
      '--framework',
      'Next.js - SSR',
      '--stage',
      'PRODUCTION',
      '--enable-auto-build',
      '--compute-role-arn',
      computeRoleArn,
      '--output',
      'json',
    ]);
  }

  // Check recent jobs
  const listJobsData = JSON.parse(runAws([
    'amplify',
    'list-jobs',
    '--app-id',
    appId,
    '--branch-name',
    activeBranch,
    '--max-results',
    '1',
    '--output',
    'json',
  ]));

  let activeJobId = '';
  const latestJob = listJobsData.jobSummaries?.[0];
  if (latestJob && ['PENDING', 'PROVISIONING', 'RUNNING'].includes(latestJob.status)) {
    activeJobId = latestJob.jobId;
    console.log(`[Deploy Amplify] Tracking existing running job: ${activeJobId}`);
  } else {
    console.log(`[Deploy Amplify] Triggering release job for ${activeBranch}...`);
    const startJobData = JSON.parse(runAws([
      'amplify',
      'start-job',
      '--app-id',
      appId,
      '--branch-name',
      activeBranch,
      '--job-type',
      'RELEASE',
      '--output',
      'json',
    ]));
    activeJobId = startJobData.jobSummary.jobId;
    console.log(`[Deploy Amplify] Started release job: ${activeJobId}`);
  }

  // Step E: Polling Build Status & Automatic Log Self-Healing
  console.log(`[Deploy Amplify] Step E: Polling Job ${activeJobId} until completion...`);
  const startTime = Date.now();
  const maxTimeoutMs = 12 * 60 * 1000; // 12 minutes
  let lastStatus = '';

  while (Date.now() - startTime < maxTimeoutMs) {
    await sleep(15000);
    const jobData = JSON.parse(runAws([
      'amplify',
      'get-job',
      '--app-id',
      appId,
      '--branch-name',
      activeBranch,
      '--job-id',
      activeJobId,
      '--output',
      'json',
    ]));

    const job = jobData.job;
    const status = job.summary.status;

    if (status !== lastStatus) {
      console.log(`[Deploy Amplify] Build Status: ${lastStatus || 'INIT'} -> ${status}`);
      lastStatus = status;
    }

    if (status === 'SUCCEED') {
      const liveUrl = `https://${activeBranch}.${defaultDomain}`;
      console.log(`\n🎉 [Deploy Amplify] DEPLOYMENT SUCCEEDED!`);
      console.log(`[Deploy Amplify] Live Production HTTPS URL: ${liveUrl}`);
      
      // Update AGENTS.md with deployment records
      const agentsPath = path.join(ROOT_DIR, 'AGENTS.md');
      if (fs.existsSync(agentsPath)) {
        let agentsText = fs.readFileSync(agentsPath, 'utf8');
        if (!agentsText.includes('AMPLIFY_LIVE_URL')) {
          agentsText += `\n\n## 5. Live Production Deployment (Phase 5)\n- **AMPLIFY_APP_ID**: \`${appId}\`\n- **AMPLIFY_LIVE_URL**: \`${liveUrl}\`\n- **AMPLIFY_BRANCH**: \`${activeBranch}\`\n- **STATUS**: \`SUCCEED\`\n`;
          fs.writeFileSync(agentsPath, agentsText, 'utf8');
        }
      }
      return { liveUrl, appId, defaultDomain, activeBranch };
    }

    if (status === 'FAILED') {
      console.error(`\n❌ [Deploy Amplify] Deployment job ${activeJobId} FAILED!`);
      // Find failed step and print logs
      for (const step of job.steps || []) {
        if (step.status === 'FAILED') {
          console.error(`[Deploy Amplify] Failed Step: ${step.stepName}`);
          if (step.logUrl) {
            try {
              const res = await fetch(step.logUrl);
              const logText = await res.text();
              const lines = logText.split(/\r?\n/);
              console.error('--- LAST 120 LOG LINES ---');
              console.error(lines.slice(-120).join('\n'));
              console.error('---------------------------');
            } catch (fetchErr) {
              console.error('[Deploy Amplify] Could not fetch logUrl:', fetchErr.message);
            }
          }
        }
      }
      process.exit(1);
    }
  }

  throw new Error('[Deploy Amplify] Deployment timed out after 12 minutes.');
}

main().catch((err) => {
  console.error('[Deploy Amplify] Fatal error:', err.message);
  process.exit(1);
});
