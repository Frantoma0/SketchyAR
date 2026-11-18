/** SketchyAR Day 4: a single camera owner shared by legacy diagnostics and Drawing.
 *  No tracking or frame processing occurs here. Video frame resolution is independent
 *  of how large the <video> is displayed with CSS.
 */
import * as D from './diagnostics';

export type CameraPhase = 'stopped' | 'starting' | 'active' | 'suspended' | 'error';
export interface CameraSnapshot {
  phase: CameraPhase;
  wanted: boolean;
  active: boolean;
  reason?: string;
  settings: Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
  supportedConstraints: Record<string, boolean> | null;
}
type Listener = (snapshot: CameraSnapshot) => void;

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

/** Suppress deviceId/groupId from exported diagnostics; they are not needed for camera tests. */
function safeTrackSettings(track: MediaStreamTrack): Record<string, unknown> {
  const raw = toObject(track.getSettings()) ?? {};
  const { deviceId: _deviceId, groupId: _groupId, ...settings } = raw;
  void _deviceId;
  void _groupId;
  return settings;
}

class CameraController {
  private stream: MediaStream | null = null;
  private target: HTMLVideoElement | null = null;
  private wanted = false;
  private phase: CameraPhase = 'stopped';
  private reason = 'not-started';
  private generation = 0;
  private opening: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private lastCapabilities: Record<string, unknown> | null = null;
  private lastSupported: Record<string, boolean> | null = null;
  private lastSettings: Record<string, unknown> | null = null;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.suspend('visibility-hidden');
      else void this.resume('visibility-visible');
    });
    addEventListener('pagehide', () => this.suspend('pagehide'));
    addEventListener('pageshow', () => {
      if (!document.hidden) void this.resume('pageshow');
    });
  }

  get active(): boolean {
    return !!this.stream?.getVideoTracks().some((track) => track.readyState === 'live');
  }
  get snapshot(): CameraSnapshot {
    return {
      phase: this.phase, wanted: this.wanted, active: this.active, reason: this.reason,
      settings: this.lastSettings, capabilities: this.lastCapabilities,
      supportedConstraints: this.lastSupported,
    };
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }
  private report(phase: CameraPhase, reason: string): void {
    if (this.phase === phase && this.reason === reason) return;
    this.phase = phase;
    this.reason = reason;
    const snapshot = this.snapshot;
    D.log(phase === 'error' ? 'error' : 'info', 'camera.day4', `${phase}: ${reason}`, snapshot);
    for (const listener of this.listeners) listener(snapshot);
  }

  async attach(video: HTMLVideoElement): Promise<void> {
    if (this.target && this.target !== video) {
      this.target.pause();
      this.target.srcObject = null;
    }
    this.target = video;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.srcObject = this.stream;
    if (this.stream) {
      try { await video.play(); }
      catch (error) { D.log('warn', 'camera.day4', 'video.play() failed after attach', { message: String(error) }); }
    }
  }

  private releaseTracks(): void {
    const previous = this.stream;
    this.stream = null;
    if (this.target) {
      this.target.pause();
      this.target.srcObject = null;
    }
    for (const track of previous?.getTracks() ?? []) track.stop();
  }

  stop(reason = 'manual-stop'): void {
    this.wanted = false;
    this.generation++;
    this.releaseTracks();
    this.report('stopped', reason);
  }

  /** Stop active hardware while retaining the user's intent to restart on return. */
  suspend(reason = 'background'): void {
    if (!this.wanted) return;
    this.generation++;
    this.releaseTracks();
    this.report('suspended', reason);
  }

  async resume(reason = 'foreground'): Promise<void> {
    if (!this.wanted || document.hidden) return;
    try { await this.start(undefined, reason); }
    catch (error: unknown) {
      // The next tap on Retry can request camera permission in a user gesture.
      D.log('warn', 'camera.day4', 'Auto-resume was unsuccessful; manual retry available', { message: String(error) });
    }
  }

  async start(video?: HTMLVideoElement, reason = 'user-start'): Promise<void> {
    if (video) await this.attach(video);
    this.wanted = true;
    if (document.hidden) {
      this.report('suspended', 'document-hidden');
      return;
    }
    if (this.active) {
      if (this.target) {
        try { await this.target.play(); }
        catch (error) { this.report('error', `video-play: ${String(error)}`); throw error; }
      }
      this.report('active', 'stream-reused');
      return;
    }
    // If a camera request was invalidated by backgrounding, wait for it to
    // settle before opening a fresh stream. This prevents a stuck suspended UI.
    if (this.opening) {
      try { await this.opening; } catch { /* retry with fresh permission request */ }
      if (this.active || !this.wanted || document.hidden) return;
      return this.start(undefined, 'resume-after-pending-request');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error('Camera API не се поддържа');
      this.report('error', error.message);
      throw error;
    }
    const token = ++this.generation;
    this.report('starting', reason);
    const pending = this.acquire(token);
    this.opening = pending;
    try { await pending; }
    finally { if (this.opening === pending) this.opening = null; }
  }

  private async acquire(token: number): Promise<void> {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        },
      });
      if (token !== this.generation || !this.wanted || document.hidden) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('getUserMedia не върна видео трак');
      this.stream = stream;
      track.addEventListener('ended', () => {
        if (this.stream !== stream) return;
        this.releaseTracks();
        this.report('error', 'track-ended');
      });
      track.addEventListener('mute', () => {
        if (this.stream === stream) D.log('warn', 'camera.day4', 'track-muted');
      });
      track.addEventListener('unmute', () => {
        if (this.stream === stream) D.log('info', 'camera.day4', 'track-unmuted');
      });
      this.lastSettings = safeTrackSettings(track);
      const candidate = track as MediaStreamTrack & { getCapabilities?: () => MediaTrackCapabilities };
      try { this.lastCapabilities = toObject(candidate.getCapabilities?.() ?? null); }
      catch (error) { this.lastCapabilities = null; D.log('warn', 'camera.day4', 'getCapabilities failed', { message: String(error) }); }
      try { this.lastSupported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>; }
      catch { this.lastSupported = null; }
      if (this.target) {
        this.target.srcObject = stream;
        await this.target.play();
      }
      this.report('active', reasonForCapture(this.lastSettings));
      D.log('info', 'camera.day4.settings', 'camera capabilities detected', {
        settings: this.lastSettings,
        focusMode: this.lastCapabilities?.focusMode ?? null,
        exposureMode: this.lastCapabilities?.exposureMode ?? null,
        zoom: this.lastCapabilities?.zoom ?? null,
        supportedFocusMode: this.lastSupported?.focusMode ?? false,
        supportedExposureMode: this.lastSupported?.exposureMode ?? false,
      });
    } catch (error: unknown) {
      if (stream && this.stream !== stream) stream.getTracks().forEach((track) => track.stop());
      if (token === this.generation) {
        this.releaseTracks();
        this.report('error', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      }
      throw error;
    }
  }
}

function reasonForCapture(settings: Record<string, unknown> | null): string {
  return `started ${settings?.width ?? '?'}×${settings?.height ?? '?'} @${settings?.frameRate ?? '?'}fps`;
}

export const cameraController = new CameraController();
