"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function browserSnapshot(): boolean {
  return navigator.onLine;
}

function serverSnapshot(): boolean {
  return true;
}

export function useConnectivity(): { online: boolean } {
  return { online: useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot) };
}
