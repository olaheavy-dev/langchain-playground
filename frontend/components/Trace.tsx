"use client";

import { cx } from "./ui";

export interface TraceSegment {
  /** What happened during this stretch of time. */
  label: string;
  /** Milliseconds this stretch took. */
  ms: number;
  /** Work the model did on its own, drawn hollow rather than filled. */
  hollow?: boolean;
}

function format(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/**
 * The arrival trace: how an answer actually came back, drawn to scale from
 * measured timings.
 *
 * This is the one element the three patterns can be compared across. The
 * tool-calling agent draws several segments because it made several round
 * trips; the chat model draws one solid block because nothing was visible until
 * everything was; the stream draws a rail that fills while tokens land. Same
 * rail, three different shapes -- which is the difference the whole project is
 * about.
 */
export function Trace({
  segments,
  live = false,
  className,
}: {
  segments: TraceSegment[];
  /** Still arriving, so the rail pulses and the total is provisional. */
  live?: boolean;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.ms, 0);
  if (total <= 0) return null;

  return (
    <figure className={cx("mt-6", className)}>
      <figcaption className="flex items-baseline justify-between font-mono text-xs tracking-wide text-text-faint">
        <span className="uppercase">{live ? "Arriving" : "Arrival"}</span>
        <span className={cx("tabular-nums", live && "text-signal")}>
          {live ? "…" : format(total)}
        </span>
      </figcaption>

      <div
        className="mt-2 flex h-1.5 w-full gap-px overflow-hidden rounded-sm bg-surface-subtle"
        role="img"
        aria-label={`Arrival trace: ${segments
          .map((segment) => `${segment.label}, ${format(segment.ms)}`)
          .join("; ")}`}
      >
        {segments.map((segment, index) => (
          <span
            key={`${segment.label}-${index}`}
            style={{ width: `${(segment.ms / total) * 100}%` }}
            className={cx(
              "trace-draw h-full",
              live && index === segments.length - 1
                ? "bg-signal caret-blink"
                : segment.hollow
                  // A tint of the accent rather than the tint token, which was
                  // too close to the surface to read in dark mode.
                  ? "bg-accent/35"
                  : "bg-accent",
            )}
          />
        ))}
      </div>

      <ol className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
        {segments.map((segment, index) => (
          <li
            key={`${segment.label}-${index}`}
            className="flex items-baseline gap-1.5 text-xs text-text-muted"
          >
            <span
              aria-hidden="true"
              className={cx(
                "inline-block size-1.5 translate-y-px rounded-sm",
                live && index === segments.length - 1
                  ? "bg-signal"
                  : segment.hollow
                    ? "border border-accent"
                    : "bg-accent",
              )}
            />
            {segment.label}
            <span className="font-mono tabular-nums text-text-faint">
              {format(segment.ms)}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/**
 * A miniature of the trace, used in the pattern selector so each pattern is
 * labelled by the shape of its arrival rather than by an arbitrary icon.
 */
export function ArrivalGlyph({
  shape,
  active,
}: {
  shape: "segmented" | "block" | "filling" | "searched";
  active: boolean;
}) {
  const tone = active ? "bg-accent" : "bg-border-strong";
  return (
    // Taller and wider than the trace rail it miniaturises, with visible gaps
    // rather than hairlines: at 6px tall the three shapes were indistinguishable
    // from one another and just read as a dash.
    <span aria-hidden="true" className="flex h-2 w-14 gap-0.5 overflow-hidden rounded-sm">
      {shape === "segmented" && (
        <>
          <span className={cx("h-full w-1/6", tone)} />
          <span className={cx("h-full w-1/4", tone)} />
          <span className={cx("h-full flex-1", tone)} />
        </>
      )}
      {shape === "searched" && (
        <>
          {/* Two short searches, then the long stretch of generating. */}
          <span className={cx("h-full w-[8%]", tone)} />
          <span className={cx("h-full w-[8%]", tone)} />
          <span className={cx("h-full flex-1", tone)} />
        </>
      )}
      {shape === "block" && <span className={cx("h-full w-full", tone)} />}
      {shape === "filling" && (
        <>
          <span className={cx("h-full w-1/2", tone)} />
          {/* The unfilled tail is what says "still arriving". */}
          <span
            className={cx(
              "h-full flex-1",
              active ? "bg-signal/40" : "bg-border-subtle",
            )}
          />
        </>
      )}
    </span>
  );
}
