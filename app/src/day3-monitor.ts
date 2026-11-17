/** Day 3: independent UI/video timing measurements. No claim to measure Safari process RAM. */
export interface FrameSummary {
  durationMs: number;
  rafCount: number;
  rafMedianMs: number;
  rafP95Ms: number;
  rafOver50Ms: number;
  rafMaxMs: number;
  videoCallbackCount: number;
  videoFps: number | null;
  videoP95IntervalMs: number | null;
  videoPresentedFrameSkips: number;
  becameHidden: boolean;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}
function rounded(n: number): number { return Math.round(n * 10) / 10; }

export function monitorFrames(video: HTMLVideoElement, cameraInitiallyActive: boolean): () => FrameSummary {
  const start = performance.now();
  const rafIntervals: number[] = [];
  const videoIntervals: number[] = [];
  let previousRaf = 0;
  let previousVideo = 0;
  let previousPresented = -1;
  let callbacks = 0;
  let videoCallbacks = 0;
  let frameSkips = 0;
  let rafId = 0;
  let videoId = 0;
  let started = true;
  let becameHidden = document.hidden;
  const onVisibility = () => { if (document.hidden) becameHidden = true; };
  document.addEventListener('visibilitychange', onVisibility);

  const onRaf = (now: number): void => {
    if (!started) return;
    if (previousRaf > 0 && !document.hidden) rafIntervals.push(now - previousRaf);
    previousRaf = now;
    callbacks++;
    rafId = requestAnimationFrame(onRaf);
  };
  rafId = requestAnimationFrame(onRaf);

  if (cameraInitiallyActive && 'requestVideoFrameCallback' in video) {
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (!started) return;
      // Callback timing, not actual sensor frame timestamps; use presentedFrames for gaps.
      if (previousVideo > 0 && !document.hidden) videoIntervals.push(metadata.presentationTime - previousVideo);
      previousVideo = metadata.presentationTime;
      if (previousPresented >= 0) frameSkips += Math.max(0, metadata.presentedFrames - previousPresented - 1);
      previousPresented = metadata.presentedFrames;
      videoCallbacks++;
      videoId = video.requestVideoFrameCallback(onFrame);
    };
    videoId = video.requestVideoFrameCallback(onFrame);
  }

  return () => {
    started = false;
    cancelAnimationFrame(rafId);
    if (videoId && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(videoId);
    document.removeEventListener('visibilitychange', onVisibility);
    const durationMs = performance.now() - start;
    return {
      durationMs: rounded(durationMs),
      rafCount: callbacks,
      rafMedianMs: rounded(percentile(rafIntervals, .5)),
      rafP95Ms: rounded(percentile(rafIntervals, .95)),
      rafOver50Ms: rafIntervals.filter((n) => n > 50).length,
      rafMaxMs: rounded(Math.max(0, ...rafIntervals)),
      videoCallbackCount: videoCallbacks,
      videoFps: cameraInitiallyActive ? rounded(videoCallbacks / Math.max(.001, durationMs / 1000)) : null,
      videoP95IntervalMs: cameraInitiallyActive ? rounded(percentile(videoIntervals, .95)) : null,
      videoPresentedFrameSkips: frameSkips,
      becameHidden,
    };
  };
}
