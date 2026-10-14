"use client";

import { useLayoutEffect, useRef } from "react";
import { useAuthTransition } from "../auth/AuthArrival";

// Animate each piece once, including cards that arrive after the API response.
// Elements stay visible if motion or observer APIs are unavailable.
export default function useHomeEntrance(root) {
  const { phase } = useAuthTransition();
  const phaseRef = useRef(phase);
  const waiting = useRef(new Set());
  useLayoutEffect(() => {
    phaseRef.current = phase;
    if (phase !== "covering") {
      waiting.current.forEach((animation) => animation.play());
      waiting.current.clear();
    }
  }, [phase]);
  useLayoutEffect(() => {
    const page = root.current;
    if (!page || !window.IntersectionObserver || !Element.prototype.animate)
      return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const seen = new WeakSet();
    const observed = new WeakSet();
    const active = new Map();
    let enabled = true;
    const started = performance.now();

    function reveal(element, play = true) {
      if (!enabled || seen.has(element)) return;
      seen.add(element);
      const initial = performance.now() - started < 200;
      const block = element.hasAttribute("data-home-block");
      const text = element.hasAttribute("data-home-text");
      const card = element.hasAttribute("data-home-card");
      const delay = text
        ? Number(element.dataset.homeText || 0)
        : card
          ? Number(element.dataset.homeDrop || 0)
          : block
            ? 60
            : initial
              ? Number(element.dataset.homeDrop || 0) + 120
              : 0;
      const animation = element.animate(
        text
          ? [
              {
                opacity: 0,
                filter: "blur(5px)",
                clipPath: "inset(-12px 100% -12px -12px)",
              },
              {
                opacity: 1,
                filter: "blur(2px)",
                clipPath: "inset(-12px 25% -12px -12px)",
                offset: 0.65,
              },
              {
                opacity: 1,
                filter: "blur(0px)",
                clipPath: "inset(-12px -12px -12px -12px)",
              },
            ]
          : [
              {
                opacity: card || block || initial ? 0 : 0.85,
                transform: card
                  ? "translateY(24px)"
                  : block
                    ? "translateY(32px)"
                    : initial
                      ? "translateY(-20px)"
                      : "translateY(10px)",
              },
              { opacity: 1, transform: "translateY(0)" },
            ],
        {
          duration: text ? 850 : card ? 650 : block ? 720 : initial ? 650 : 380,
          delay,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "backwards",
        },
      );
      active.set(element, animation);
      if (!play || phaseRef.current === "covering") {
        animation.pause();
        if (play) waiting.current.add(animation);
      }
      animation.onfinish = () => {
        animation.cancel();
        active.delete(element);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (!isIntersecting) return;
          const animation = active.get(target);
          if (animation) {
            if (phaseRef.current === "covering") waiting.current.add(animation);
            else animation.play();
          }
          observer.unobserve(target);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 40px 0px" },
    );

    const discover = (scope) => {
      if (!(scope instanceof Element)) return;
      const selector = "[data-home-drop], [data-home-text]";
      const elements = [...scope.querySelectorAll(selector)];
      if (scope.matches(selector)) elements.unshift(scope);
      if (scope === page) {
        const header = page.querySelector(":scope > header");
        if (header) elements.unshift(header);
      }
      elements.forEach((element) => {
        if (seen.has(element) || observed.has(element)) return;
        // Animate either a section or its individual cards, never both.
        if (
          !element.hasAttribute("data-home-card") &&
          element.querySelector(selector)
        ) {
          seen.add(element);
          return;
        }
        observed.add(element);
        const box = element.getBoundingClientRect();
        if (box.top < window.innerHeight + 40 && box.bottom > 0)
          reveal(element);
        else {
          reveal(element, false);
          observer.observe(element);
        }
      });
    };
    discover(page);
    // Scan only newly added content; badge/text updates should not trigger
    // repeated layout reads across the entire storefront.
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(discover));
    });
    mutations.observe(page, { childList: true, subtree: true });
    const stop = () => {
      enabled = false;
      observer.disconnect();
      mutations.disconnect();
      active.forEach((animation) => animation.cancel());
      waiting.current.clear();
      active.clear();
    };
    const onPreference = () => {
      if (preference.matches) stop();
    };
    const onFocus = (event) => {
      active.forEach((animation, element) => {
        if (element.contains(event.target)) {
          animation.cancel();
          waiting.current.delete(animation);
          active.delete(element);
        }
      });
    };
    preference.addEventListener("change", onPreference);
    page.addEventListener("focusin", onFocus);
    return () => {
      stop();
      preference.removeEventListener("change", onPreference);
      page.removeEventListener("focusin", onFocus);
    };
  }, [root]);
}
