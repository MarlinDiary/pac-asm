type Media = Pick<HTMLVideoElement, "play" | "pause" | "muted" | "paused">;
type Environment = {
  isVisible: () => boolean;
  prefersReducedMotion: () => boolean;
  onError: () => void;
};

/** Homepage-only playback. No timers, frame callbacks, or global game state. */
export function createPromoPlayback(video: Media, environment: Environment) {
  let disposed = false;
  let generation = 0;
  let reducedMotion = environment.prefersReducedMotion();
  let wantsPlayback = !reducedMotion;

  async function requestPlay(allowMutedFallback: boolean) {
    if (disposed || !wantsPlayback || !environment.isVisible()) return;
    const request = ++generation;
    try {
      await video.play();
    } catch (error) {
      // A pause, navigation, or newer user action supersedes this request.
      if (disposed || request !== generation) return;
      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError") return;
      if (name === "NotAllowedError" && allowMutedFallback && !video.muted) {
        video.muted = true;
        await requestPlay(false);
      } else if (name !== "NotAllowedError") {
        environment.onError();
      }
      // If even muted playback is blocked, the ordinary play button stays usable.
    }
  }

  function pause() {
    wantsPlayback = false;
    generation++;
    video.pause();
  }

  function syncEnvironment() {
    const nextReducedMotion = environment.prefersReducedMotion();
    if (nextReducedMotion && !reducedMotion) wantsPlayback = false;
    reducedMotion = nextReducedMotion;
    if (!environment.isVisible() || !wantsPlayback) {
      generation++;
      video.pause();
    } else {
      void requestPlay(true);
    }
  }

  return {
    start: syncEnvironment,
    syncEnvironment,
    pause,
    play() {
      wantsPlayback = true;
      void requestPlay(false);
    },
    toggleSound() {
      generation++;
      video.muted = !video.muted;
      if (wantsPlayback && video.paused) void requestPlay(false);
    },
    dispose() {
      disposed = true;
      generation++;
      video.pause();
    },
  };
}
