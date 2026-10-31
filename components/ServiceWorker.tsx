"use client";

import { useEffect } from "react";
import { count } from "@/lib/events";

/**
 * Registers the service worker (public/sw.js) once the page has loaded, in production builds only, so the dev
 * server's reloads never meet a kept file. The release is in its address: a new release replaces the last worker
 * and its caches.
 *
 * A page that a worker already serves on arrival comes from a browser that had MANUS before, so it counts as a
 * return visit (lib/events.ts). Nothing is stored for it, and a reload doesn't count.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const arrival = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigator.serviceWorker.controller && arrival?.type === "navigate" && location.pathname === "/") {
      count("return-visit");
    }
    const register = () => {
      navigator.serviceWorker
        .register(`/sw.js?v=${process.env.NEXT_PUBLIC_MANUS_VERSION}`, { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
