"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_RETURN_COVER_MS, AUTH_REVEAL_MS } from "./authMotion";
import styles from "./AuthLayout.module.css";

const TransitionContext = createContext({
  phase: "idle",
  begin: () => {},
  markAuthReady: () => {},
});
export const useAuthTransition = () => useContext(TransitionContext);
const isAuthPath = (path) => path === "/login" || path === "/register";

// Keep one overlay mounted while the outgoing and incoming routes change.
export default function AuthArrival({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const navigationTimer = useRef(null);
  const navigationPending = useRef(false);
  const [authReadyPath, setAuthReadyPath] = useState(null);
  const markAuthReady = useCallback((path) => setAuthReadyPath(path), []);
  const [transition, setTransition] = useState({
    phase: "idle",
    destination: null,
    returning: false,
  });
  const { phase, destination, returning } = transition;
  const begin = useCallback((nextPath) => {
    setAuthReadyPath(null);
    setTransition({
      phase: "covering",
      destination: nextPath.split("?")[0],
      returning: isAuthPath(nextPath.split("?")[0]),
    });
  }, []);
  const reset = useCallback(() => {
    navigationPending.current = false;
    clearTimeout(navigationTimer.current);
    setTransition({ phase: "idle", destination: null, returning: false });
  }, []);

  useEffect(() => {
    function onAuthLink(event) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        isAuthPath(pathname)
      )
        return;
      const link = event.target.closest?.("a[href]");
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !isAuthPath(url.pathname))
        return;
      event.preventDefault();
      if (navigationPending.current || phase !== "idle") return;
      navigationPending.current = true;
      const nextPath = url.pathname + url.search + url.hash;
      router.prefetch?.(nextPath);
      begin(nextPath);
      navigationTimer.current = setTimeout(() => {
        navigationTimer.current = null;
        try {
          router.push(nextPath);
        } catch {
          reset();
        }
      }, AUTH_RETURN_COVER_MS);
    }
    // Capture before Next Link handles the click so it waits for the cover.
    document.addEventListener("click", onAuthLink, true);
    return () => document.removeEventListener("click", onAuthLink, true);
  }, [pathname, router, phase, begin, reset]);

  useEffect(() => () => clearTimeout(navigationTimer.current), []);
  useLayoutEffect(() => {
    if (phase !== "covering" || pathname !== destination) return;
    // The pathname may update while the destination is still streaming.
    if (returning && authReadyPath !== destination) return;
    navigationPending.current = false;
    setTransition((value) => ({ ...value, phase: "revealing" }));
  }, [pathname, destination, phase, returning, authReadyPath]);
  useEffect(() => {
    if (phase !== "covering") return;
    // A failed route load must not leave the entire site covered indefinitely.
    const timer = setTimeout(reset, 10000);
    return () => clearTimeout(timer);
  }, [phase, reset]);
  useLayoutEffect(() => {
    if (phase !== "revealing") return;
    const timer = setTimeout(reset, AUTH_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [phase, reset]);
  return (
    <TransitionContext.Provider value={{ phase, begin, markAuthReady }}>
      {children}
      {phase !== "idle" && (
        <div
          className={
            styles.portal +
            (returning ? " " + styles.portalReturn : "") +
            (phase === "revealing" ? " " + styles.portalReveal : "")
          }
          style={{
            "--auth-cover-duration": AUTH_RETURN_COVER_MS + "ms",
            "--auth-reveal-duration": AUTH_REVEAL_MS + "ms",
          }}
          role="status"
          aria-label={
            returning ? "Opening sign in" : "Opening your next chapter"
          }
        >
          <div className={styles.portalRings} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ "--ring": i }} />
            ))}
          </div>
        </div>
      )}
    </TransitionContext.Provider>
  );
}
