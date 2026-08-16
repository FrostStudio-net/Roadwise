"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  title: string;
  children: React.ReactNode;
  closeLabel?: string;
  variant?: "detail" | "fullscreen";
};

const subscribeToHydration = () => () => undefined;

export default function RoadwiseDialog({
  open,
  onClose,
  label,
  title,
  children,
  closeLabel = "Close details",
  variant = "detail",
}: Props) {
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const dialogRef = useRef<HTMLElement>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useBodyScrollLock(true);

  useEffect(() => {
    if (!mounted) return;
    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });
    return () => {
      const anotherDialogIsOpen = Array.from(document.querySelectorAll('[data-roadwise-dialog][data-state="open"]'))
        .some((candidate) => candidate !== dialog);
      if (!anotherDialogIsOpen && priorFocusRef.current?.isConnected) priorFocusRef.current.focus({ preventScroll: true });
    };
  }, [mounted]);

  if (!mounted) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="roadwise-dialog-layer fixed inset-0 z-[100]" data-state={open ? "open" : "closed"}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="roadwise-dialog-backdrop absolute inset-0 cursor-default touch-none bg-black/60"
      />
      <aside
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-roadwise-dialog
        onKeyDown={handleKeyDown}
        data-state={open ? "open" : "closed"}
        data-variant={variant}
        className="roadwise-dialog-panel absolute z-[110] flex min-h-0 flex-col overflow-hidden border border-white/[.11] bg-[#101919]/[.985] shadow-[0_28px_90px_rgba(0,0,0,.72)]"
      >
        <div className="roadwise-dialog-handle mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-white/[.14] sm:hidden" aria-hidden="true" />
        <header className="roadwise-dialog-header relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/[.07] bg-[#101919]/[.98] px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow">{label}</div>
            <h2 id={titleId} className="mt-1 truncate text-[18px] font-semibold tracking-[-.025em]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="motion-press flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-white/[.05] text-[#a4aeab]">
            <X size={18} />
          </button>
        </header>
        <div className="roadwise-dialog-body min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-[calc(22px+env(safe-area-inset-bottom,0px))] pt-5">
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
