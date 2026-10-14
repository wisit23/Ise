"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./AuthLayout.module.css";

const TransitionContext = createContext({ phase: "idle", begin: () => {} });
export const useAuthTransition = () => useContext(TransitionContext);

// This layer survives route changes so the outgoing and incoming views share
// one continuous animation instead of mounting two independent white screens.
export default function AuthArrival({ children }) {
  const pathname = usePathname();
  const [transition, setTransition] = useState({
    phase: "idle",
    destination: null,
  });
  const { phase, destination } = transition;
  function begin(nextPath) {
    setTransition({ phase: "covering", destination: nextPath });
  }
  useLayoutEffect(() => {
    if (phase !== "covering" || pathname !== destination) return;
    setTransition((value) => ({ ...value, phase: "revealing" }));
  }, [pathname, destination, phase]);
  useLayoutEffect(() => {
    if (phase !== "revealing") return;
    const timer = setTimeout(
      () => setTransition({ phase: "idle", destination: null }),
      720,
    );
    return () => clearTimeout(timer);
  }, [phase]);
  return (
    <TransitionContext.Provider value={{ phase, begin }}>
      {children}
      {phase !== "idle" && (
        <div
          className={`${styles.portal} ${phase === "revealing" ? styles.portalReveal : ""}`}
          role="status"
          aria-label="Opening your next chapter"
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
