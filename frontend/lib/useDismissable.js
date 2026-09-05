"use client";

import { useEffect } from "react";

/* Closes a popover on an outside click or Escape, and hands focus back to
 * the control that opened it.
 *
 * The account menu grew this logic inline; the header is about to need a
 * second menu, and a third would have copied it again. Keyboard users
 * getting stranded in a menu they cannot dismiss is exactly the kind of bug
 * that appears the moment one copy drifts from the other.
 */
export default function useDismissable(ref, open, onClose) {
  useEffect(() => {
    if (!open) return;

    function handlePointer(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleEscape(e) {
      if (e.key !== "Escape") return;
      onClose();
      // Focus goes back to the trigger, which is the first focusable thing
      // inside the wrapper by construction.
      ref.current?.querySelector("button")?.focus();
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [ref, open, onClose]);
}
