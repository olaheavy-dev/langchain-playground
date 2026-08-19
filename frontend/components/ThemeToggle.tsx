"use client";

import { useSyncExternalStore } from "react";

import { MoonIcon, SunIcon } from "./icons";
import { cx } from "./ui";

type Theme = "light" | "dark";

/**
 * The current theme lives on <html data-theme>, stamped before first paint by
 * the inline script in the root layout. This component reads that attribute as
 * an external store rather than mirroring it into React state, so there is a
 * single source of truth and no setState-in-effect.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** No theme is known while rendering on the server. */
function getServerSnapshot(): Theme | null {
  return null;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  // Hold the space until the client knows which option is active, so the
  // control never flashes the wrong state.
  if (theme === null) return <div className="h-9" />;

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-1"
    >
      {(["light", "dark"] as const).map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={theme === option}
          aria-label={option === "light" ? "Light theme" : "Dark theme"}
          onClick={() => choose(option)}
          className={cx(
            // min-h-11 is the 44px touch minimum, stated outright rather than
            // derived from padding -- py-1.5 previously left the target at 28px.
            "flex min-h-11 items-center justify-center gap-1.5 rounded-sm px-2",
            "font-mono text-xs uppercase tracking-[0.14em] transition-colors duration-150",
            theme === option
              ? "text-text underline decoration-accent decoration-2 underline-offset-4"
              : "text-text-faint hover:text-text-muted",
          )}
        >
          {option === "light" ? <SunIcon /> : <MoonIcon />}
          {option}
        </button>
      ))}
    </div>
  );
}
