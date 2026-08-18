"use client";

import { useEffect, useState } from "react";

import { API_URL, checkHealth } from "@/lib/api";
import { cx } from "./ui";

export function HealthIndicator() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function poll() {
      const ok = await checkHealth(controller.signal);
      if (!cancelled) setOnline(ok);
    }

    void poll();
    const timer = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const label =
    online === null ? "Checking API" : online ? "API online" : "API offline";

  return (
    <div className="flex items-center gap-2" title={API_URL}>
      <span
        className={cx(
          "size-1.5 rounded-full",
          online === null && "bg-text-faint",
          online === true && "bg-positive",
          online === false && "bg-negative",
        )}
      />
      <span className="text-xs text-text-faint">{label}</span>
    </div>
  );
}
