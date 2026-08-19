"use client";

import { cx } from "./ui";

export interface TraceSegment {
  /** What happened during this stretch of time. */
  label: string;
  /** Milliseconds this stretch took. */
  ms: number;
  /** Milliseconds from the start of the request to the start of this stretch. */
  startMs?: number;
  /** Work the model did on its own, drawn hollow rather than filled. */
  hollow?: boolean;
}

function format(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/**
 * Lay segments out in rows so that overlapping work is visible as overlapping.
 *
 * The agent issues tool calls concurrently when the model asks for several at
 * once, so two searches can occupy the same stretch of time. Stacking those end
 * to end would invent an order and overstate how long retrieval took, so each
 * one that would collide with a row already in use starts a new row.
 */
function toRows(segments: TraceSegment[]): TraceSegment[][] {
  const rows: TraceSegment[][] = [];
  for (const segment of [...segments].sort(
    (a, b) => (a.startMs ?? 0) - (b.startMs ?? 0),
  )) {
    const start = segment.startMs ?? 0;
    const row = rows.find((candidate) => {
      const last = candidate[candidate.length - 1];
      return (last.startMs ?? 0) + last.ms <= start + 0.5;
    });
    if (row) row.push(segment);
    else rows.push([segment]);
  }
  return rows;
}

/**
 * The arrival trace: how an answer actually came back, drawn to scale from
 * measured timings.
 *
 * This is the one element the three patterns can be compared across. The
 * tool-calling agent draws a run of alternating model and tool segments because
 * it went round the loop several times; the chat model draws one solid block
 * because nothing was visible until everything was; the stream draws a rail
 * that fills while tokens land. Same axis, different shapes -- which is the
 * difference the whole project is about.
 */
/** Sub-cent costs need more than two decimals to say anything at all. */
function formatCost(usd: number): string {
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
  return "<$0.0001";
}

export function Trace({
  segments,
  totalMs,
  usage,
  live = false,
  className,
}: {
  segments: TraceSegment[];
  /** What the request consumed, when the server reported it. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    modelCalls: number;
    costUsd: number | null;
  };
  /**
   * Wall time for the whole request. Given rather than summed: work overlaps,
   * and the gaps between segments are real time nobody measured directly.
   */
  totalMs?: number;
  /** Still arriving, so the rail pulses and the total is provisional. */
  live?: boolean;
  className?: string;
}) {
  if (segments.length === 0) return null;

  const measured = Math.max(
    ...segments.map((segment) => (segment.startMs ?? 0) + segment.ms),
  );
  const total = Math.max(totalMs ?? 0, measured);
  if (total <= 0) return null;

  const rows = toRows(segments);
  const last = segments[segments.length - 1];

  return (
    <figure className={cx("mt-6", className)}>
      <figcaption className="flex items-baseline justify-between font-mono text-xs tracking-wide text-text-faint">
        <span className="uppercase">{live ? "Arriving" : "Arrival"}</span>
        <span className={cx("tabular-nums", live && "text-signal")}>
          {live ? "…" : format(total)}
        </span>
      </figcaption>

      <div
        className="mt-2 space-y-px"
        role="img"
        aria-label={`Arrival trace: ${segments
          .map((segment) => `${segment.label}, ${format(segment.ms)}`)
          .join("; ")}`}
      >
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="relative h-1.5 w-full rounded-sm bg-surface-subtle">
            {row.map((segment, index) => (
              <span
                key={`${segment.label}-${index}`}
                style={{
                  left: `${((segment.startMs ?? 0) / total) * 100}%`,
                  width: `${Math.max((segment.ms / total) * 100, 0.6)}%`,
                }}
                className={cx(
                  "trace-draw absolute inset-y-0 rounded-sm",
                  live && segment === last
                    ? "bg-signal caret-blink"
                    : segment.hollow
                      ? "bg-accent/35"
                      : "bg-accent",
                )}
              />
            ))}
          </div>
        ))}
      </div>

      {usage && usage.modelCalls > 0 && (
        <p className="mt-2 font-mono text-xs text-text-faint">
          {usage.modelCalls} model {usage.modelCalls === 1 ? "call" : "calls"}
          {" · "}
          <span className="tabular-nums">
            {usage.inputTokens.toLocaleString()} in
          </span>
          {" / "}
          <span className="tabular-nums">
            {usage.outputTokens.toLocaleString()} out
          </span>
          {" · "}
          {/* Unknown rather than free: a model with no price on file would
              otherwise be reported as costing nothing. */}
          <span className="tabular-nums">
            {usage.costUsd === null ? "cost unknown" : formatCost(usage.costUsd)}
          </span>
        </p>
      )}

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
                live && segment === last
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
