"use client";

import { useEffect, useState } from "react";

export function useMotionPresence<T>(value: T | undefined, exitDurationMs = 180): { value: T | undefined; open: boolean } {
  const [renderedValue, setRenderedValue] = useState<T | undefined>(value);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setRenderedValue(value),
      value === undefined ? exitDurationMs : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [exitDurationMs, value]);

  return { value: renderedValue, open: value !== undefined };
}
