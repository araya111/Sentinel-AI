import { VOICE_SCRIPTS } from '@/lib/mockData';
import { awsConfig } from './config';

export interface DeterrentVoiceOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface IDeterrentVoiceAdapter {
  speak(text: string, options?: DeterrentVoiceOptions): Promise<void>;
  cancel(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  isSpeaking(): boolean;
  playCalmDeterrent(onStart?: () => void, onEnd?: () => void): Promise<void>;
  playEscalatedDeterrent(onStart?: () => void, onEnd?: () => void): Promise<void>;
}

class BrowserSpeechDeterrentAdapter implements IDeterrentVoiceAdapter {
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.cancel();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isSpeaking(): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return false;
    }
    return window.speechSynthesis.speaking;
  }

  public cancel(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public async speak(text: string, options: DeterrentVoiceOptions = {}): Promise<void> {
    if (this.muted) {
      options.onStart?.();
      options.onEnd?.();
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[DeterrentVoiceAdapter] SpeechSynthesis is not supported in this environment.');
      options.onStart?.();
      options.onEnd?.();
      return;
    }

    // Cancel any ongoing speech before starting new sentence
    window.speechSynthesis.cancel();

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate ?? 1.0;
      utterance.pitch = options.pitch ?? 1.0;
      utterance.volume = options.volume ?? 1.0;

      // Select a natural female or clear voice if available (e.g. Samantha, Google US English, etc.)
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Female') ||
            v.name.includes('Natural') ||
            v.name.includes('Samantha') ||
            v.name.includes('Zira') ||
            v.name.includes('Google US English'))
      ) || voices.find((v) => v.lang.startsWith('en'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        options.onStart?.();
      };

      utterance.onend = () => {
        options.onEnd?.();
        resolve();
      };

      utterance.onerror = (err) => {
        console.warn('[DeterrentVoiceAdapter] Speech synthesis utterance error:', err);
        options.onEnd?.();
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  public async playCalmDeterrent(onStart?: () => void, onEnd?: () => void): Promise<void> {
    return this.speak(VOICE_SCRIPTS.calm, {
      rate: 1.0,
      pitch: 1.05,
      volume: 1.0,
      onStart,
      onEnd,
    });
  }

  public async playEscalatedDeterrent(onStart?: () => void, onEnd?: () => void): Promise<void> {
    this.cancel(); // Mid-sentence interruption
    return this.speak(VOICE_SCRIPTS.escalated, {
      rate: 1.15, // slightly faster, urgent
      pitch: 1.1,
      volume: 1.0,
      onStart,
      onEnd,
    });
  }
}

/**
 * Singleton instance of the deterrent voice adapter.
 * Uses Web Speech API synthesis in Phase 1 (mock mode) and provides
 * clean interface for Amazon Nova 2 Sonic / Bedrock Polly in Phases 2-4.
 */
export const deterrentVoiceAdapter: IDeterrentVoiceAdapter = new BrowserSpeechDeterrentAdapter();
