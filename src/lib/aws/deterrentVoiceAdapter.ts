import type { DeterrentRequest, DeterrentResponse } from '@/app/api/deterrent/route';

// Minimal 44-byte silent PCM WAV data URI for browser programmatic autoplay unlock
const SILENT_WAV_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export interface IDeterrentVoiceAdapter {
  unlockAudio(): Promise<void>;
  stopAudio(): void;
  playPollyAudio(
    base64Data: string,
    onEnded?: () => void,
    onError?: (err: unknown) => void
  ): Promise<void>;
  speakFallback(
    text: string,
    options?: { onStart?: () => void; onEnd?: () => void }
  ): Promise<void>;
  requestDeterrentTurn(
    req: DeterrentRequest,
    signal?: AbortSignal
  ): Promise<DeterrentResponse>;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

class DeterrentVoiceAdapter implements IDeterrentVoiceAdapter {
  private audioElement: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private isUnlocked = false;
  private muted = false;

  private getAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = 'auto';
    }
    return this.audioElement;
  }

  /**
   * Pre-warms programmatic audio playback during a direct user touch/click event.
   */
  public async unlockAudio(): Promise<void> {
    if (this.isUnlocked || typeof window === 'undefined') return;
    try {
      const audio = this.getAudio();
      if (!audio) return;
      audio.src = SILENT_WAV_URI;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      this.isUnlocked = true;
      console.log('[DeterrentVoiceAdapter] Programmatic audio unlocked successfully.');
    } catch (e) {
      console.warn('[DeterrentVoiceAdapter] Autoplay unlock note:', e);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopAudio();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public stopAudio(): void {
    if (typeof window === 'undefined') return;

    // Stop persistent HTMLAudioElement
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.onended = null;
        this.audioElement.onerror = null;
      } catch {
        // ignore
      }
    }

    // Revoke old object URL to prevent memory leaks
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    // Stop Web Speech API synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public async playPollyAudio(
    base64Data: string,
    onEnded?: () => void,
    onError?: (err: unknown) => void
  ): Promise<void> {
    if (this.muted) {
      onEnded?.();
      return;
    }

    this.stopAudio();

    try {
      const audio = this.getAudio();
      if (!audio) {
        onEnded?.();
        return;
      }

      // Convert base64 to binary blob
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mpeg' });

      const objectUrl = URL.createObjectURL(blob);
      this.currentObjectUrl = objectUrl;

      audio.src = objectUrl;

      audio.onended = () => {
        if (this.currentObjectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          this.currentObjectUrl = null;
        }
        onEnded?.();
      };

      audio.onerror = (e) => {
        if (this.currentObjectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          this.currentObjectUrl = null;
        }
        onError?.(e);
      };

      await audio.play();
    } catch (err) {
      console.warn('[DeterrentVoiceAdapter] Audio play failed, falling back:', err);
      onError?.(err);
    }
  }

  public async speakFallback(
    text: string,
    options: { onStart?: () => void; onEnd?: () => void } = {}
  ): Promise<void> {
    if (this.muted) {
      options.onStart?.();
      options.onEnd?.();
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      options.onStart?.();
      options.onEnd?.();
      return;
    }

    window.speechSynthesis.cancel();

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Female') ||
            v.name.includes('Samantha') ||
            v.name.includes('Zira') ||
            v.name.includes('Natural'))
      ) || voices.find((v) => v.lang.startsWith('en'));

      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        options.onStart?.();
      };
      utterance.onend = () => {
        options.onEnd?.();
        resolve();
      };
      utterance.onerror = () => {
        options.onEnd?.();
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  public async requestDeterrentTurn(
    req: DeterrentRequest,
    signal?: AbortSignal
  ): Promise<DeterrentResponse> {
    const res = await fetch('/api/deterrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });

    if (!res.ok) {
      throw new Error(`Deterrent API responded with HTTP ${res.status}`);
    }

    return (await res.json()) as DeterrentResponse;
  }
}

export const deterrentVoiceAdapter: IDeterrentVoiceAdapter = new DeterrentVoiceAdapter();
