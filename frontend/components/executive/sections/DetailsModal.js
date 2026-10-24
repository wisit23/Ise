"use client";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";

/**
 * The frame every Executive details dialog shares: a titled Modal with a close
 * button, rendered under <body> and locking the panel's own scrolling while
 * open. What goes inside belongs to each kind of case (complaint, dispute,
 * ticket).
 */
export default function DetailsModal({ open, title, onClose, children }) {
  const anchorRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const locked = [];
    // Executive scrolls inside its panel, not the body. Lock those ancestors
    // too; the shared Modal already locks body scrolling and manages focus.
    for (
      let node = anchorRef.current?.parentElement;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const computed = getComputedStyle(node);
      if (
        ![computed.overflowX, computed.overflowY].some((value) =>
          /^(auto|scroll)$/.test(value),
        )
      )
        continue;
      locked.push({
        node,
        overflowX: node.style.overflowX,
        overflowY: node.style.overflowY,
      });
      node.style.overflowX = "hidden";
      node.style.overflowY = "hidden";
    }
    return () => {
      for (const { node, overflowX, overflowY } of locked) {
        node.style.overflowX = overflowX;
        node.style.overflowY = overflowY;
      }
    };
  }, [open]);

  const dialog = (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      {children}
    </Modal>
  );

  // Rendering under body escapes the section's animated transform/stacking
  // context, so fixed inset-0 covers the navbar, sidebar and content together.
  return (
    <>
      <span ref={anchorRef} hidden />
      {open &&
        typeof document !== "undefined" &&
        createPortal(dialog, document.body)}
    </>
  );
}

/** One labelled value in a details dialog. */
export function DetailField({ label, children, className = "" }) {
  return (
    <div className={className}>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-slate-900">
        {children}
      </dd>
    </div>
  );
}
