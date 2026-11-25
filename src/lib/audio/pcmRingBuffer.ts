/**
 * PCM Ring Buffer for continuous 16kHz 16-bit mono microphone capture.
 * Provides exportLastNSecondsWav and anti-echo clearing on Polly audio completion.
 */
export class PcmRingBuffer {
  private buffer: Int16Array;
  private capacity: number;
  private writeIndex = 0;
  private totalSamplesWritten = 0;
  private sampleRate = 16000;
  private lastPollyEndTime = 0;
  private echoCooldownMs = 500;

  constructor(maxSeconds = 15, sampleRate = 16000) {
    this.sampleRate = sampleRate;
    this.capacity = maxSeconds * sampleRate;
    this.buffer = new Int16Array(this.capacity);
  }

  /**
   * Records completion of Polly playback to enforce echo-gating cooldown.
   */
  public notifyPollyEnded(): void {
    this.lastPollyEndTime = Date.now();
    this.clearBuffer();
  }

  /**
   * Returns true if the system is currently within the 500ms post-Polly cooldown.
   */
  public isEchoGated(): boolean {
    return Date.now() - this.lastPollyEndTime < this.echoCooldownMs;
  }

  /**
   * Appends raw 16-bit PCM samples to the circular buffer.
   */
  public write(samples: Int16Array): void {
    if (this.isEchoGated()) {
      return; // Discard samples during anti-echo cooldown
    }

    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writeIndex] = samples[i];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      this.totalSamplesWritten++;
    }
  }

  /**
   * Clears the ring buffer.
   */
  public clearBuffer(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.totalSamplesWritten = 0;
  }

  /**
   * Exports the last N seconds of audio as a standard 16 kHz 16-bit mono RIFF/WAV file.
   */
  public exportLastNSecondsWav(seconds: number): Uint8Array {
    const requestedSamples = Math.min(seconds * this.sampleRate, this.capacity);
    const availableSamples = Math.min(this.totalSamplesWritten, this.capacity);
    const samplesToExport = Math.min(requestedSamples, availableSamples);

    const outPcm = new Int16Array(samplesToExport);
    let readIndex = (this.writeIndex - samplesToExport + this.capacity) % this.capacity;

    for (let i = 0; i < samplesToExport; i++) {
      outPcm[i] = this.buffer[readIndex];
      readIndex = (readIndex + 1) % this.capacity;
    }

    // Build 44-byte RIFF/WAV header
    const dataSize = samplesToExport * 2;
    const fileSize = 36 + dataSize;
    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wavBuffer);

    // "RIFF" chunk descriptor
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, fileSize, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // "fmt " sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1 = mono)
    view.setUint32(24, this.sampleRate, true); // SampleRate (16000)
    view.setUint32(28, this.sampleRate * 2, true); // ByteRate (16000 * 1 * 2 = 32000)
    view.setUint16(32, 2, true); // BlockAlign (1 * 2 = 2)
    view.setUint16(34, 16, true); // BitsPerSample (16)

    // "data" sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);

    // Copy PCM bytes into WAV payload
    const pcmBytes = new Uint8Array(outPcm.buffer, outPcm.byteOffset, dataSize);
    const wavBytes = new Uint8Array(wavBuffer);
    wavBytes.set(pcmBytes, 44);

    return wavBytes;
  }
}

// Global browser singleton
export const pcmRingBuffer = new PcmRingBuffer(15, 16000);
