"use client";

import { useEffect } from "react";

let lockCount = 0;
let lockedScrollY = 0;
let previousBodyStyles: Record<"position" | "top" | "left" | "right" | "width" | "overflow", string> | undefined;

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const body = document.body;
    if (lockCount === 0) {
      lockedScrollY = window.scrollY;
      previousBodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0 || !previousBodyStyles) return;
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;
      previousBodyStyles = undefined;
      window.scrollTo(0, lockedScrollY);
    };
  }, [locked]);
}
