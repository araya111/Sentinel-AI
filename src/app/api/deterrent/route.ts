import { NextRequest, NextResponse } from 'next/server';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  Message,
} from '@aws-sdk/client-bedrock-runtime';
import {
  PollyClient,
  SynthesizeSpeechCommand,
  VoiceId,
} from '@aws-sdk/client-polly';

export type DeterrentRequest = {
  phase: 'START_CALL' | 'AMBIENT_TURN' | 'FORCE_ESCALATE';
  ambientTranscript: string;
  userLocationLabel: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
};

export type DeterrentResponse = {
  threatDetected: boolean;
  threatLevel: 'LOW' | 'HIGH' | 'CRITICAL';
  detectedCue: string;
  spokenReply: string;
  audioBase64: string | null;
  audioMimeType: string;
  modelUsed?: string;
  source: 'aws-live' | 'mock-fallback';
  fallbackReason?: string;
  latencyMs: number;
};

// Instantiate clients without hardcoded credentials (delegating to AWS CLI profile / IAM chain)
const region = process.env.AWS_REGION || 'us-east-1';
const bedrockClient = new BedrockRuntimeClient({ region });
const pollyClient = new PollyClient({ region });

const SYSTEM_PROMPT = `You are Maya, a protective, grounded, and alert friend on a live speakerphone call with the user while they walk alone at night on campus.

BEHAVIORAL RULES:
1. On START_CALL or calm ambient turns: Sound natural, warm, and casually protective. Casually reference the user's location to signal live GPS tracking without sounding robotic (e.g. "Hey, I see you passing the pharmacy—keep me on speaker until you hit North Gate").
2. On hostile, intimidating, distressing, or suspicious background speech OR if phase is FORCE_ESCALATE: Immediately break the calm demeanor. Set threatDetected to true and threatLevel to CRITICAL. Speak sharply and loudly to warn off the aggressor (e.g. "Hey—who is that in the background? I have your live GPS on my screen and campus security is being patched onto this line right now. Back off!").
3. Always respond using the deterrent_response tool. Keep spokenReply to 1-2 natural spoken sentences, maximum 35 words.`;

const TOOL_CONFIG = {
  tools: [
    {
      toolSpec: {
        name: 'deterrent_response',
        description: 'Provide structured voice deterrent reply and threat assessment',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              threatDetected: {
                type: 'boolean',
                description: 'Whether hostility, threat, stalking, or danger is detected',
              },
              threatLevel: {
                type: 'string',
                enum: ['LOW', 'HIGH', 'CRITICAL'],
                description: 'Assessed threat level',
              },
              detectedCue: {
                type: 'string',
                description: 'Specific acoustic or verbal threat cue observed in environment',
              },
              spokenReply: {
                type: 'string',
                description: 'Natural 1-2 spoken sentences directly addressing the situation, max 35 words',
              },
            },
            required: ['threatDetected', 'threatLevel', 'detectedCue', 'spokenReply'],
          },
        },
      },
    },
  ],
  toolChoice: {
    tool: {
      name: 'deterrent_response',
    },
  },
};

/**
 * Strict sanitizer ensuring alternating user -> assistant -> user messages.
 */
function sanitizeConversationHistory(
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  currentPrompt: string
): Message[] {
  // Step 1: Trim and drop empty entries
  const valid = (history || [])
    .map((h) => ({ role: h.role, text: (h.text || '').trim() }))
    .filter((h) => h.text.length > 0);

  // Step 2: Keep only the last 8 turns
  const recent = valid.slice(-8);

  // Step 3: Drop any leading assistant message
  while (recent.length > 0 && recent[0].role === 'assistant') {
    recent.shift();
  }

  // Step 4: Append final non-empty user prompt
  recent.push({ role: 'user', text: currentPrompt });

  // Step 5: Merge consecutive same-role messages
  const sanitized: Message[] = [];
  for (const item of recent) {
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === item.role) {
      const prev = sanitized[sanitized.length - 1];
      const prevText = prev.content?.[0]?.text ?? '';
      prev.content = [{ text: `${prevText}\n${item.text}` }];
    } else {
      sanitized.push({
        role: item.role,
        content: [{ text: item.text }],
      });
    }
  }

  return sanitized;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  let body: DeterrentRequest;
  try {
    body = await request.json();
    if (!body || !body.phase) {
      return NextResponse.json(
        { error: 'Invalid body: phase is required' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const { phase, ambientTranscript, userLocationLabel, history } = body;
  const useMockAws = process.env.NEXT_PUBLIC_USE_MOCK_AWS === 'true';

  // Construct current prompt turn
  const ambientClean = (ambientTranscript || '').trim();
  const currentPrompt = `[Phase: ${phase}] [Location: ${userLocationLabel || 'Campus Corridor'}] [Ambient Audio: "${ambientClean || 'Call just connected.'}"]`;

  // Fallback defaults for failover
  const isForceEscalate =
    phase === 'FORCE_ESCALATE' ||
    ambientClean.toLowerCase().includes('stop') ||
    ambientClean.toLowerCase().includes('give me') ||
    ambientClean.toLowerCase().includes('back off');

  const fallbackData: {
    threatDetected: boolean;
    threatLevel: 'LOW' | 'HIGH' | 'CRITICAL';
    detectedCue: string;
    spokenReply: string;
  } = isForceEscalate
    ? {
        threatDetected: true,
        threatLevel: 'CRITICAL',
        detectedCue: ambientClean || 'Emergency escalation trigger',
        spokenReply:
          "Hey—who is that in the background? I have your live GPS right here and I'm patching campus security onto this line right now. Back off!",
      }
    : phase === 'START_CALL'
    ? {
        threatDetected: false,
        threatLevel: 'LOW',
        detectedCue: 'None',
        spokenReply:
          "Hey! Just saw your location—you're about two minutes past the pharmacy, right? Keep talking to me until you hit the main gate.",
      }
    : {
        threatDetected: false,
        threatLevel: 'LOW',
        detectedCue: 'None',
        spokenReply:
          "I hear you, keep walking along the brightly lit path toward the campus hub, I'm right here on speaker.",
      };

  if (useMockAws) {
    const response: DeterrentResponse = {
      ...fallbackData,
      audioBase64: null,
      audioMimeType: 'audio/mpeg',
      source: 'mock-fallback',
      fallbackReason: 'Mock AWS mode active via NEXT_PUBLIC_USE_MOCK_AWS=true',
      latencyMs: Date.now() - startTime,
    };
    return NextResponse.json(response);
  }

  // Live AWS Execution
  const modelCascade = [
    process.env.BEDROCK_TEXT_MODEL_ID || 'us.amazon.nova-2-lite-v1:0',
    ...(process.env.BEDROCK_FALLBACK_MODEL_IDS?.split(',').map((m) => m.trim()) ?? [
      'us.amazon.nova-lite-v1:0',
      'us.amazon.nova-micro-v1:0',
    ]),
  ];

  let structuredOutput: {
    threatDetected: boolean;
    threatLevel: 'LOW' | 'HIGH' | 'CRITICAL';
    detectedCue: string;
    spokenReply: string;
  } | null = null;
  let successfulModel: string | undefined;
  let lastBedrockError: string | undefined;

  const messages = sanitizeConversationHistory(history, currentPrompt);

  for (const modelId of modelCascade) {
    if (!modelId) continue;
    try {
      const command = new ConverseCommand({
        modelId,
        messages,
        system: [{ text: SYSTEM_PROMPT }],
        inferenceConfig: {
          maxTokens: 250,
          temperature: 0.4,
        },
        toolConfig: TOOL_CONFIG,
      });

      const result = await bedrockClient.send(command, {
        abortSignal: AbortSignal.timeout(7000),
      });

      const contentBlocks = result.output?.message?.content ?? [];
      for (const block of contentBlocks) {
        if (
          block.toolUse &&
          block.toolUse.name === 'deterrent_response' &&
          block.toolUse.input
        ) {
          const rawInput = block.toolUse.input as Record<string, unknown>;
          structuredOutput = {
            threatDetected: Boolean(rawInput.threatDetected),
            threatLevel: (rawInput.threatLevel as 'LOW' | 'HIGH' | 'CRITICAL') || 'LOW',
            detectedCue: String(rawInput.detectedCue || 'None'),
            spokenReply: String(rawInput.spokenReply || fallbackData.spokenReply),
          };
          successfulModel = modelId;
          break;
        }
      }

      if (structuredOutput) {
        break; // Successfully got structured tool response
      }
    } catch (err: unknown) {
      const errObj = err as { name?: string; message?: string };
      lastBedrockError = `${errObj.name || 'Error'}: ${errObj.message || String(err)}`;
      console.warn(`[Bedrock] Model ${modelId} failed: ${lastBedrockError}. Trying next model...`);
    }
  }

  // If all Bedrock models in cascade fail, fall back safely
  if (!structuredOutput) {
    console.error('[Bedrock] All cascade models failed. Falling back to stage mock response.', lastBedrockError);
    const response: DeterrentResponse = {
      ...fallbackData,
      audioBase64: null,
      audioMimeType: 'audio/mpeg',
      source: 'mock-fallback',
      fallbackReason: lastBedrockError || 'All Bedrock models exhausted',
      latencyMs: Date.now() - startTime,
    };
    return NextResponse.json(response);
  }

  // Synthesize Speech via Amazon Polly
  let audioBase64: string | null = null;
  const voiceId = (process.env.POLLY_VOICE_ID as VoiceId) || 'Ruth';

  try {
    const pollyCmd = new SynthesizeSpeechCommand({
      Text: structuredOutput.spokenReply,
      OutputFormat: 'mp3',
      Engine: 'neural',
      VoiceId: voiceId,
    });

    const pollyRes = await pollyClient.send(pollyCmd, {
      abortSignal: AbortSignal.timeout(5000),
    });

    if (pollyRes.AudioStream) {
      const bytes = await pollyRes.AudioStream.transformToByteArray();
      audioBase64 = Buffer.from(bytes).toString('base64');
    }
  } catch (pollyErr: unknown) {
    const errObj = pollyErr as { name?: string; message?: string };
    console.warn(`[Polly] Neural synthesis failed (${errObj.name}): ${errObj.message}. Retrying with Standard engine...`);

    // Retry once with Standard engine if Neural is unavailable
    try {
      const fallbackPollyCmd = new SynthesizeSpeechCommand({
        Text: structuredOutput.spokenReply,
        OutputFormat: 'mp3',
        Engine: 'standard',
        VoiceId: voiceId,
      });

      const fallbackRes = await pollyClient.send(fallbackPollyCmd, {
        abortSignal: AbortSignal.timeout(5000),
      });

      if (fallbackRes.AudioStream) {
        const bytes = await fallbackRes.AudioStream.transformToByteArray();
        audioBase64 = Buffer.from(bytes).toString('base64');
      }
    } catch (stdErr) {
      console.error('[Polly] Standard synthesis also failed:', stdErr);
    }
  }

  const response: DeterrentResponse = {
    ...structuredOutput,
    audioBase64,
    audioMimeType: 'audio/mpeg',
    modelUsed: successfulModel,
    source: 'aws-live',
    latencyMs: Date.now() - startTime,
  };

  return NextResponse.json(response);
}
