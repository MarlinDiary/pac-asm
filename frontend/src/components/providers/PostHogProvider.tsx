"use client";

import type { ReactNode } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { nanoid } from "nanoid";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let fingerprintIdentifyPromise: Promise<void> | null = null;

const ensureFingerprintIdentity = () => {
  if (fingerprintIdentifyPromise || typeof window === "undefined" || !POSTHOG_KEY) {
    return fingerprintIdentifyPromise;
  }

  fingerprintIdentifyPromise = FingerprintJS.load()
    .then((agent) => agent.get())
    .then((result) => {
      const visitorId = result.visitorId;

      if (!visitorId || posthog.get_distinct_id() === visitorId) {
        return;
      }

      posthog.identify(visitorId);
    })
    .catch((error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to initialize fingerprint identity", error);
      }

      fingerprintIdentifyPromise = null;
    });

  return fingerprintIdentifyPromise;
};

if (typeof window !== "undefined" && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: '2025-05-24',
    capture_pageview: 'history_change',
    capture_pageleave: true,
  });

  ensureFingerprintIdentity();
}

export const trackRunClicked = (metadata?: Record<string, unknown>) => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const id = nanoid();

  if (POSTHOG_KEY) {
    ensureFingerprintIdentity();

    posthog.capture("run_clicked", {
      ...metadata,
      id,
    });
  }

  return id;
};

export const trackDebugClicked = (metadata?: Record<string, unknown>) => {
  if (typeof window !== "undefined" && POSTHOG_KEY) {
    ensureFingerprintIdentity();

    posthog.capture("debug_clicked", {
      ...metadata,
      id: nanoid(),
    });
  }
};

interface DiagnosticErrorEvent {
  error: string;
  tag?: string;
}

export const trackDiagnosticError = (payload: DiagnosticErrorEvent) => {
  if (typeof window === "undefined" || !POSTHOG_KEY) {
    return;
  }

  const eventPayload: Record<string, unknown> = {
    error: payload.error,
  };

  if (payload.tag) {
    eventPayload.tag = payload.tag;
  }

  ensureFingerprintIdentity();

  posthog.capture("diagnostic_error", eventPayload);
};

export function PostHogProvider({ children }: { children: ReactNode }) {
  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
