"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";

export default function CaseContextPanel({ open, onClose, children }) {
  const host = useRef(null);
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const parent = host.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      setDocked(entries[0].contentRect.width >= 1250),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <span ref={host} className="hidden" />
      {open &&
        (docked ? (
          <div
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
              }
            }}
            className="motion-safe:animate-slide-in-right flex h-full w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white"
          >
            <header className="flex shrink-0 items-center justify-between border-b p-4">
              <h2 className="font-semibold">ข้อมูลบริบท</h2>
              <Button variant="ghost" onClick={onClose}>
                ปิด
              </Button>
            </header>
            {children}
          </div>
        ) : (
          <Modal
            open
            onClose={onClose}
            title="ข้อมูลบริบท"
            size="lg"
            placement="drawer"
          >
            {children}
          </Modal>
        ))}
    </>
  );
}
