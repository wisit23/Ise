"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AuthLayout.module.css";

export default function AuthScene({ departing = false }) {
  const host = useRef(null);
  const engine = useRef(null);
  const [desktop, setDesktop] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      setReduced(motion.matches);
      engine.current?.setReducedMotion(motion.matches);
    };
    syncMotion();
    motion.addEventListener("change", syncMotion);
    setFailed(false);
    setReady(false);

    // Keep the form interactive while the renderer loads in its own chunk.
    import("./createAuthScene")
      .then(({ createAuthScene }) => {
        if (cancelled || !host.current) return;
        engine.current = createAuthScene(host.current, {
          reducedMotion: motion.matches,
          onContextLost: () => {
            if (!cancelled) {
              setFailed(true);
              setReady(false);
            }
          },
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      motion.removeEventListener("change", syncMotion);
      engine.current?.dispose();
      engine.current = null;
    };
  }, [desktop]);

  useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused, ready]);

  useEffect(() => {
    if (departing && !reduced && !paused) engine.current?.depart?.();
  }, [departing, ready, reduced, paused]);

  return (
    <>
      <div
        className={styles.canvasHost}
        ref={host}
        data-ready={ready}
        aria-hidden="true"
      />
      {(!ready || failed) && (
        <div className={styles.sceneFallback} aria-hidden="true">
          <span>∞</span>
        </div>
      )}
      {desktop && ready && !failed && !reduced && (
        <button
          type="button"
          className={styles.motionControl}
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
          aria-label={paused ? "Resume 3D animation" : "Pause 3D animation"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            {paused ? (
              <path d="m5 3 8 5-8 5Z" />
            ) : (
              <path d="M4 3h3v10H4zm5 0h3v10H9z" />
            )}
          </svg>
          {paused ? "Resume animation" : "Pause animation"}
        </button>
      )}
    </>
  );
}
