"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Input from "../ui/Input";
import AuthScene from "./AuthScene";
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

export default function AuthLayout({
  mode,
  children,
  onModeChange,
  departing = false,
}) {
  const register = mode === "register";
  const card = useRef(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const measure = () =>
      setHeight(card.current.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  return (
    <main
      className={`${styles.page} ${departing ? styles.departing : ""}`}
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
      <div className={styles.center} inert={departing}>
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
                {register ? "Make it yours" : "Welcome back"}
                <span>.</span>
              </h1>
              <p>
                {register
                  ? "Create an account. Find a style all your own."
                  : "Sign in to discover your next favorite find."}
              </p>
            </div>
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
            <div key={mode} className={styles.formTransition}>
              {children}
            </div>
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
