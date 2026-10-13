"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthTransition } from "./AuthArrival";
import AuthLayout from "./AuthLayout";
import { LoginPage, RegisterPage } from "./AuthForms";

export default function AuthExperience({ initialMode }) {
  const router = useRouter();
  const { begin } = useAuthTransition();
  const timer = useRef(null);
  const [departing, setDeparting] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function enterSite(destination) {
    if (departing) return;
    setDeparting(true);
    router.prefetch?.(destination);
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!reduced) begin(destination);
    await new Promise((resolve) => {
      timer.current = setTimeout(resolve, reduced ? 0 : 1050);
    });
    router.push(destination);
  }

  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    const sync = () =>
      setMode(window.location.pathname === "/register" ? "register" : "login");
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function changeMode(event, nextMode) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (departing) return;
    if (mode === nextMode) return;
    window.history.pushState(
      null,
      "",
      nextMode === "register" ? "/register" : "/login",
    );
    setMode(nextMode);
  }

  return (
    <AuthLayout mode={mode} onModeChange={changeMode} departing={departing}>
      {mode === "register" ? (
        <RegisterPage onAuthenticated={enterSite} />
      ) : (
        <LoginPage onAuthenticated={enterSite} />
      )}
    </AuthLayout>
  );
}
