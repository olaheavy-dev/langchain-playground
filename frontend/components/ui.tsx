"use client";

import type { ButtonHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export function Button({
  children,
  variant = "primary",
  loading = false,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5",
        "text-base font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" &&
          "bg-accent text-accent-contrast hover:bg-accent-hover",
        variant === "ghost" &&
          "border border-border-strong text-text hover:bg-surface-subtle",
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("size-4 animate-spin", className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-border-subtle bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        // border-interactive, not border-subtle: this border is the only thing
        // that says "input", so it has to clear 3:1.
        "w-full resize-none rounded-md border border-border-interactive bg-surface",
        "px-4 py-3 text-base leading-relaxed text-text",
        "placeholder:text-text-faint",
        "transition-colors duration-150 hover:border-border-strong",
        className,
      )}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
      {children}
    </span>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="fade-rise flex items-start gap-2 text-base text-negative"
    >
      <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6.25h1.5v1.5h-1.5v-1.5Z" />
      </svg>
      {message}
    </p>
  );
}

/** Cmd/Ctrl+Enter submits, matching the convention of most chat interfaces. */
export function isSubmitShortcut(event: React.KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key === "Enter";
}
