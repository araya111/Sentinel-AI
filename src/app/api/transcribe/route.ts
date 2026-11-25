import { NextRequest, NextResponse } from 'next/server';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { sanitizeRoom } from '@/lib/room';
import { logTelemetry } from '@/lib/telemetry';

// Strict WAV parser extracting and validating 16 kHz 16-bit mono PCM
interface ParsedWav {
  pcmBytes: Uint8Array;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  acousticEnergy: number;
  peakDb: number;
}

function parseWav(buffer: Buffer): ParsedWav {
  if (buffer.length < 44) {
    throw new Error('Audio payload too short for WAV header (< 44 bytes)');
  }

  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error(`Invalid WAV container header: expected RIFF/WAVE, got ${riff}/${wave}`);
  }

  let offset = 12;
  let fmtParsed = false;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(chunkDataStart);
      channels = buffer.readUInt16LE(chunkDataStart + 2);
      sampleRate = buffer.readUInt32LE(chunkDataStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkDataStart + 14);
      fmtParsed = true;
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      dataLength = Math.min(chunkSize, buffer.length - chunkDataStart);
      break;
    }

    // Chunks are word-aligned (padded to multiple of 2)
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (!fmtParsed) {
    throw new Error("WAV header missing 'fmt ' subchunk");
  }
  if (!dataOffset || dataLength <= 0) {
    throw new Error("WAV header missing 'data' subchunk or empty audio payload");
  }

  if (audioFormat !== 1) {
    throw new Error(`Unsupported audio format (${audioFormat}). Expected uncompressed PCM (1).`);
  }
  if (channels !== 1) {
    throw new Error(`Unsupported channels (${channels}). Expected mono (1 channel).`);
  }
  if (sampleRate !== 16000) {
    throw new Error(`Unsupported sample rate (${sampleRate} Hz). Expected 16000 Hz.`);
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bit depth (${bitsPerSample}-bit). Expected 16-bit signed PCM.`);
  }

  // Cap at 12 seconds = 384,000 bytes (16000 samples/sec * 2 bytes/sample * 12 sec)
  const maxBytes = 384000;
  const clampedLength = Math.min(dataLength, maxBytes);
  const pcmSlice = buffer.subarray(dataOffset, dataOffset + clampedLength);

  // Compute normalized acoustic RMS energy (0..100) and peakDb from Int16 samples
  const int16View = new Int16Array(
    pcmSlice.buffer,
    pcmSlice.byteOffset,
    Math.floor(pcmSlice.byteLength / 2)
  );

  let sumSquares = 0;
  let peakAbs = 0;
  for (let i = 0; i < int16View.length; i++) {
    const val = int16View[i];
    sumSquares += val * val;
    const abs = Math.abs(val);
    if (abs > peakAbs) peakAbs = abs;
  }

  const rms = Math.sqrt(sumSquares / (int16View.length || 1));
  const acousticEnergy = Math.min(100, Math.round((rms / 32767) * 200));
  const peakDb = peakAbs > 0 ? Math.round(20 * Math.log10(peakAbs / 32767)) : -96;

  return {
    pcmBytes: new Uint8Array(pcmSlice),
    sampleRate,
    channels,
    bitsPerSample,
    acousticEnergy,
    peakDb,
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = getClientIp(request);

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as Blob | null;
    const languageCodeRaw = (formData.get('languageCode') as string) || 'en-US';
    const room = sanitizeRoom(
      (formData.get('room') as string) || request.nextUrl.searchParams.get('room')
    );

    const languageCode = languageCodeRaw === 'en-IN' ? 'en-IN' : 'en-US';

    // 1. Audience Cost Shield & Rate Limiter
    const isSandbox = room === 'audience-sandbox';
    const limit = isSandbox ? 4 : 30; // 4 req/60s for audience sandbox, 30 for presenter
    const rateCheck = checkRateLimit({
      key: `transcribe:${room}:${ip}`,
      limit,
      windowMs: 60000,
    });

    if (!rateCheck.allowed) {
      logTelemetry({
        route: '/api/transcribe',
        awsService: 'Amazon Transcribe Streaming',
        source: 'rate-limited',
        latencyMs: Date.now() - startTime,
        room,
        ok: false,
        errorCode: 'RATE_LIMIT_EXCEEDED',
      });

      return NextResponse.json(
        {
          ok: false,
          error: 'Rate limit exceeded for this session. Please wait a few seconds.',
          retryAfterSec: rateCheck.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
        }
      );
    }

    if (!audioFile) {
      return NextResponse.json(
        { ok: false, error: "Missing 'audio' field in multipart form-data" },
        { status: 400 }
      );
    }

    if (audioFile.size > 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: 'Audio file exceeds 1 MB size limit' },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Strict WAV Header Parser & Guardrails
    let parsed: ParsedWav;
    try {
      parsed = parseWav(buffer);
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : 'Invalid WAV payload';
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    // 3. Mock Check
    if (process.env.NEXT_PUBLIC_USE_MOCK_AWS === 'true') {
      const latencyMs = Date.now() - startTime;
      return NextResponse.json({
        ok: true,
        source: 'mock-fallback',
        transcript: 'Stop right there, backup is on the way.',
        confidence: 0.95,
        acousticEnergy: parsed.acousticEnergy,
        peakDb: parsed.peakDb,
        languageCode,
        latencyMs,
        fallbackReason: 'NEXT_PUBLIC_USE_MOCK_AWS enabled',
      });
    }

    // 4. Amazon Transcribe Streaming Execution
    const region =
      process.env.APP_AWS_REGION ||
      process.env.AWS_REGION ||
      'us-east-1';

    const client = new TranscribeStreamingClient({ region });

    const CHUNK_SIZE = 4096;
    const pcm = parsed.pcmBytes;

    async function* pcmAudioStream() {
      // Stream raw PCM in 4096-byte chunks with 10 ms async yield
      for (let offset = 0; offset < pcm.length; offset += CHUNK_SIZE) {
        const slice = pcm.subarray(offset, Math.min(offset + CHUNK_SIZE, pcm.length));
        yield { AudioEvent: { AudioChunk: slice } };
        await new Promise((r) => setTimeout(r, 10));
      }

      // Append 400 ms of trailing silence (12800 zero bytes) in 4096-byte chunks
      const silenceBytes = 12800;
      const zeroChunk = new Uint8Array(CHUNK_SIZE);
      for (let s = 0; s < silenceBytes; s += CHUNK_SIZE) {
        yield { AudioEvent: { AudioChunk: zeroChunk } };
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: languageCode,
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 16000,
        AudioStream: pcmAudioStream(),
      });

      const response = await client.send(command, {
        abortSignal: AbortSignal.timeout(9000),
      });

      let finalTranscript = '';
      let latestPartial = '';
      let confidence = 0.92;

      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          if ('TranscriptEvent' in event && event.TranscriptEvent) {
            const results = event.TranscriptEvent.Transcript?.Results;
            if (results && results.length > 0) {
              for (const res of results) {
                const alt = res.Alternatives?.[0];
                if (alt?.Transcript) {
                  if (!res.IsPartial) {
                    finalTranscript += (finalTranscript ? ' ' : '') + alt.Transcript.trim();
                    if (typeof alt.Items?.[0]?.Confidence === 'number') {
                      confidence = alt.Items[0].Confidence;
                    }
                  } else {
                    latestPartial = alt.Transcript.trim();
                  }
                }
              }
            }
          }
        }
      }

      const transcript = (finalTranscript || latestPartial).trim();
      const latencyMs = Date.now() - startTime;

      logTelemetry({
        route: '/api/transcribe',
        awsService: 'Amazon Transcribe Streaming',
        source: 'aws-live',
        latencyMs,
        room,
        ok: true,
      });

      return NextResponse.json({
        ok: true,
        source: 'aws-live',
        transcript,
        confidence,
        acousticEnergy: parsed.acousticEnergy,
        peakDb: parsed.peakDb,
        languageCode,
        latencyMs,
      });
    } catch (streamErr: unknown) {
      const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      console.warn('[Transcribe API] AWS streaming error, falling back:', msg);

      const latencyMs = Date.now() - startTime;
      logTelemetry({
        route: '/api/transcribe',
        awsService: 'Amazon Transcribe Streaming',
        source: 'mock-fallback',
        latencyMs,
        room,
        ok: false,
        errorCode: msg,
      });

      return NextResponse.json({
        ok: true,
        source: 'mock-fallback',
        transcript: 'Stop right there and step away.',
        confidence: 0.85,
        acousticEnergy: parsed.acousticEnergy,
        peakDb: parsed.peakDb,
        languageCode,
        latencyMs,
        fallbackReason: `AWS Transcribe Streaming error: ${msg}`,
      });
    } finally {
      // Ensure HTTP/2 socket destruction so connections never leak in Lambda containers
      try {
        client.destroy();
      } catch {
        // ignore
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Transcribe API] Fatal error:', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
