"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

// Persist visitor identity locally to avoid regenerating fingerprints.
const FINGERPRINT_STORAGE_KEY = "pacasm_fingerprint_id";
const TRACKED_LEVELS = new Set(["level1", "level2", "level3", "level4"]);

const getTrackedPage = (path: string | null | undefined): string | null => {
  if (!path) {
    return null;
  }

  if (path === "/challenge") {
    return "challenge";
  }

  const match = path.match(/^\/level\/(.+)$/);
  if (!match) {
    return null;
  }

  const levelId = match[1];
  return TRACKED_LEVELS.has(levelId) ? levelId : null;
};

const getNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

if (typeof window !== "undefined" && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
  });
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const startTimeRef = useRef<number>(getNow());
  const currentPathRef = useRef<string>(pathname ?? "/");
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const identifyVisitor = async () => {
      try {
        const cachedId = window.localStorage.getItem(FINGERPRINT_STORAGE_KEY);
        if (cachedId) {
          posthog.identify(cachedId);
          return;
        }

        const fp = await FingerprintJS.load();
        const result = await fp.get();
        if (cancelled) {
          return;
        }

        const visitorId = result.visitorId;
        posthog.identify(visitorId);
        window.localStorage.setItem(FINGERPRINT_STORAGE_KEY, visitorId);
      } catch (error) {
        console.error("Failed to fingerprint visitor", error);
      }
    };

    identifyVisitor();

    return () => {
      cancelled = true;
    };
  }, []);

  const captureDwell = useCallback(
    (options?: { resetTimer?: boolean }) => {
      if (!POSTHOG_KEY) {
        return;
      }

      const start = startTimeRef.current;
      const path = currentPathRef.current;
      if (start == null || !path) {
        return;
      }

      const pageKey = getTrackedPage(path);
      if (!pageKey) {
        if (options?.resetTimer) {
          startTimeRef.current = getNow();
        }
        return;
      }

      const now = getNow();
      const durationMs = Math.max(0, Math.round(now - start));
      if (durationMs <= 0) {
        if (options?.resetTimer) {
          startTimeRef.current = now;
        }
        return;
      }

      posthog.capture("page_dwell", {
        page_key: pageKey,
        duration_ms: durationMs,
        duration_seconds: Number((durationMs / 1000).toFixed(2)),
        path,
      });

      if (options?.resetTimer) {
        startTimeRef.current = now;
      }
    },
    []
  );

  useEffect(() => {
    if (!POSTHOG_KEY) {
      return;
    }

    if (hasInitializedRef.current) {
      captureDwell();
    } else {
      hasInitializedRef.current = true;
    }

    currentPathRef.current = pathname ?? "/";
    startTimeRef.current = getNow();

    posthog.capture("$pageview", { path: pathname ?? "/" });
  }, [pathname, captureDwell]);

  useEffect(() => {
    if (!POSTHOG_KEY) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        captureDwell({ resetTimer: true });
      } else if (document.visibilityState === "visible") {
        startTimeRef.current = getNow();
      }
    };

    const handleBeforeUnload = () => {
      captureDwell();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [captureDwell]);

  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
