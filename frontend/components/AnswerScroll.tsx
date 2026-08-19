"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cx } from "./ui";

/** How close to the bottom still counts as "reading along". */
const STICK_THRESHOLD_PX = 80;

/**
 * A capped, scrollable box for model output.
 *
 * Long answers used to push the question box off screen and turn the whole
 * document into a scroller. Capping the answer keeps the controls, the arrival
 * trace and the footer note in place while only the prose moves.
 */
export function AnswerScroll({
  children,
  revision,
  follow = false,
  className,
}: {
  children: ReactNode;
  /** Changes whenever the content grows, which is what re-runs the follow. */
  revision: unknown;
  /** Stick to the bottom as content lands, for output that is still arriving. */
  follow?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Whether the reader is still riding the bottom of the stream. Tracked from
  // scroll events rather than recomputed at write time: once the content is
  // taller than the box, a fresh distance-from-bottom reading is large simply
  // because nothing has scrolled yet, which would switch following off the
  // moment it started mattering.
  const stick = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    function onScroll() {
      if (!element) return;
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      stick.current = distanceFromBottom < STICK_THRESHOLD_PX;
    }

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  // A new answer starts at the top and is followed again, whatever the reader
  // did during the last one.
  useEffect(() => {
    if (follow) stick.current = true;
  }, [follow]);

  useEffect(() => {
    if (!follow) return;
    const element = ref.current;
    if (!element || !stick.current) return;
    // scrollTop rather than scrollTo: jsdom implements the former, so this
    // stays testable without stubbing anything.
    element.scrollTop = element.scrollHeight;
  }, [revision, follow]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Answer"
      // Without tabIndex a scrolling box is unreachable by keyboard: you can
      // see that there is more text but never get to it without a mouse.
      tabIndex={0}
      className={cx(
        "max-h-[55vh] overflow-y-auto overscroll-contain pr-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
