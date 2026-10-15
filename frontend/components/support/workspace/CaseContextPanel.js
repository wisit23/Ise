"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import styles from "./CaseContextPanel.module.css";

export default function CaseContextPanel({ open, onClose, children, footer }) {
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
            className={`${styles.docked} motion-safe:animate-slide-in-right flex h-full w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white`}
          >
            <header className={styles.panelHeader}>
              <div className={styles.panelTitle}><span className="material-symbols-outlined" aria-hidden="true">article</span><h2>ข้อมูลเคส</h2></div>
              <Button variant="ghost" onClick={onClose}>
                ปิด
              </Button>
            </header>
            <div className={styles.panelScroll}>{children}</div>
            {footer && <div className={styles.actionFooter}>{footer}</div>}
          </div>
        ) : (
          <Modal
            open
            onClose={onClose}
            title="ข้อมูลเคส"
            size="lg"
            placement="drawer"
            bodyClassName={styles.panelScroll}
            footerClassName={styles.actionFooter}
            footer={footer}
          >
            {children}
          </Modal>
        ))}
    </>
  );
}
