"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { POSTER, START } from "./film";
import { createPromoPlayback } from "./promo-playback";
import styles from "./promo-video.module.css";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<ReturnType<typeof createPromoPlayback> | null>(null);
  const enhanced = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncState = () => {
      setPlaying(!video.paused);
      setMuted(video.muted);
    };
    const onError = () => setFailed(true);
    const playback = createPromoPlayback(video, {
      isVisible: () => document.visibilityState !== "hidden",
      prefersReducedMotion: () => reducedMotion.matches,
      onError,
    });
    playbackRef.current = playback;
    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    video.addEventListener("volumechange", syncState);
    video.addEventListener("error", onError);
    document.addEventListener("visibilitychange", playback.syncEnvironment);
    reducedMotion.addEventListener("change", playback.syncEnvironment);
    playback.start();
    return () => {
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      video.removeEventListener("volumechange", syncState);
      video.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", playback.syncEnvironment);
      reducedMotion.removeEventListener("change", playback.syncEnvironment);
      playback.dispose();
      playbackRef.current = null;
    };
  }, []);

  return (
    <figure className={styles.film}>
      <div className={styles.frame}>
        <video
          ref={videoRef}
          className={styles.video}
          aria-label="Write the Moves: the PacAsm film"
          aria-describedby="film-description"
          poster={POSTER}
          width={1920}
          height={1080}
          preload="metadata"
          controls={!enhanced}
          loop
          playsInline
        >
          {/* #t= opens on the poster frame; the loop still restarts from 0. */}
          <source src={`/video/pacasm-home-1080p.mp4#t=${START}`} type="video/mp4" media="(min-width: 1200px)" />
          <source src={`/video/pacasm-home-720p.mp4#t=${START}`} type="video/mp4" />
        </video>
        {enhanced && !failed && (
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.control}
              aria-label={playing ? "Pause film" : "Play film"}
              title={playing ? "Pause" : "Play"}
              onClick={() => {
                if (videoRef.current?.paused) playbackRef.current?.play();
                else playbackRef.current?.pause();
              }}
            >
              {playing
                ? <Pause aria-hidden="true" fill="currentColor" className={styles.solid} />
                : <Play aria-hidden="true" fill="currentColor" className={styles.solid} />}
            </button>
            <button
              type="button"
              className={styles.control}
              aria-label={muted ? "Unmute film" : "Mute film"}
              title={muted ? "Turn sound on" : "Turn sound off"}
              onClick={() => playbackRef.current?.toggleSound()}
            >
              {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </button>
          </div>
        )}
      </div>
      <p id="film-description" className={styles.srOnly}>
        A 32-second animated introduction: write assembly instructions, move through a maze,
        step through the debugger, and learn by playing. Music and game sound effects accompany the film.
      </p>
      {failed && <p className={styles.error} role="status">The film is unavailable right now.</p>}
    </figure>
  );
}
