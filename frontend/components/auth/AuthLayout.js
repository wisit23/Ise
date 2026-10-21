"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Input from "../ui/Input";
import AuthScene from "./AuthScene";
import { useAuthTransition } from "./AuthArrival";
import { AUTH_ENTRANCE_MS } from "./authMotion";
import BrandLogo from "../BrandLogo";
import styles from "./AuthLayout.module.css";

export function AuthIcon({ name, ...props }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3.2 4M6.4 6.4A23 23 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.5-1.5M10 10a3 3 0 0 0 4 4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.password}>
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={styles.passwordInput}
      />
      <button
        type="button"
        className={styles.reveal}
        onClick={() => setVisible(!visible)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        <AuthIcon name={visible ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

const HEADINGS = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to discover your next favorite find.",
  },
  register: {
    title: "Make it yours",
    subtitle: "Create an account. Find a style all your own.",
  },
};

/**
 * `mode` is "login", "register" or "recovery". Recovery screens (forgot /
 * reset password) pass their own title and subtitle and get no tabs.
 */
export default function AuthLayout({
  mode,
  title,
  subtitle,
  children,
  onModeChange,
  departing = false,
}) {
  const register = mode === "register";
  const recovery = mode === "recovery";
  const heading = HEADINGS[mode] || {};
  const { phase, markAuthReady } = useAuthTransition();
  const [arriving, setArriving] = useState(true);
  const center = useRef(null);
  const initialMode = useRef(mode);
  const [hasSwitched, setHasSwitched] = useState(false);
  useLayoutEffect(() => {
    // Set the HTML attribute directly for both React 18 and React 19.
    center.current?.toggleAttribute("inert", departing);
  }, [departing]);
  useLayoutEffect(() => {
    if (mode !== initialMode.current) setHasSwitched(true);
  }, [mode]);
  useLayoutEffect(() => {
    if (!recovery) markAuthReady(register ? "/register" : "/login");
  }, [register, recovery, markAuthReady]);
  useEffect(() => {
    if (!arriving || phase === "covering") return;
    const timer = setTimeout(() => setArriving(false), AUTH_ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, [arriving, phase]);
  const card = useRef(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const measure = () => setHeight(card.current.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  return (
    <main
      className={`${styles.page} ${departing ? styles.departing : ""} ${arriving ? styles.arriving : ""} ${phase === "covering" ? styles.arrivalPaused : ""}`}
      lang="en"
      aria-busy={departing}
    >
      <AuthScene departing={departing} />
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.orbit} />
        <div className={styles.orbitInner} />
      </div>
      <header className={styles.header}>
        <BrandLogo label="RE-LOOP home" />
        <Link href="/" className={styles.backLink}>
          <AuthIcon name="back" />
          Back to shopping
        </Link>
      </header>
      <div ref={center} className={styles.center}>
        <div
          className={styles.cardFrame}
          style={height ? { height } : undefined}
        >
          <section
            ref={card}
            className={`${styles.formContent} ${register ? styles.register : ""}`}
            aria-labelledby="auth-title"
          >
            <div className={styles.formHeading}>
              <h1 id="auth-title">
                {title || heading.title}
                <span>.</span>
              </h1>
              <p>{subtitle || heading.subtitle}</p>
            </div>
            {!recovery && (
              <nav className={styles.tabs} aria-label="Account">
                <Link
                  href="/login"
                  onClick={(event) => onModeChange?.(event, "login")}
                  aria-current={!register ? "page" : undefined}
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={(event) => onModeChange?.(event, "register")}
                  aria-current={register ? "page" : undefined}
                >
                  Sign up
                </Link>
              </nav>
            )}
            <div
              key={mode}
              className={`${styles.formTransition} ${!hasSwitched ? styles.initialForm : ""}`}
            >
              {children}
            </div>
            {recovery ? (
              <p className={styles.switchAccount}>
                Remembered your password?{" "}
                <Link href="/login">
                  Sign in
                  <AuthIcon name="arrow" />
                </Link>
              </p>
            ) : (
              <p className={styles.switchAccount}>
                {register ? "Already have an account?" : "New to RE-LOOP?"}{" "}
                <Link
                  href={register ? "/login" : "/register"}
                  onClick={(event) =>
                    onModeChange?.(event, register ? "login" : "register")
                  }
                >
                  {register ? "Sign in" : "Sign up"}
                  <AuthIcon name="arrow" />
                </Link>
              </p>
            )}
          </section>
        </div>
      </div>
      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} RE-LOOP</span>
        <span>Educational demo. No real payments.</span>
      </footer>
    </main>
  );
}
